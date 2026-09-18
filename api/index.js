import app from '../server/app.js';
import { initDb, getPool } from '../server/db.js';
import { runStorageMaintenanceStep } from '../server/services/storageMaintenance.js';

// Pre-warm pool on module load (helps with cold starts)
getPool().query('SELECT 1').catch(() => {});

// La base est déjà initialisée en production : on lance initDb() en arrière-plan
// au lieu de bloquer la première requête (les DDL séquentiels pouvaient ajouter
// plusieurs secondes au démarrage à froid). En cas d'échec, on réessaiera à la
// requête suivante.
let dbInitStarted = false;

function startDbInit() {
  if (dbInitStarted) return;
  dbInitStarted = true;
  initDb().catch((err) => {
    console.error('Database initialization failed:', err);
    dbInitStarted = false;
  });
}

// Lance immédiatement (pendant le démarrage à froid), PUIS au plus toutes les
// 5 minutes par instance : la maintenance Storage (pas à pas, ~3 s max par
// step) progresse jusqu'à la garde `storage_maintenance_done` (no-op ensuite).
// ⚠️ Économie de fonctions Vercel : lancée sur CHAQUE requête, elle ajoutait un
// aller-retour base + (pendant la course) des appels Supabase à la durée de
// quasiment toutes les invocations — un consommateur majeur d'heures de
// fonctions. Le pas-à-pas reste assuré (les requêtes sont fréquentes), mais la
// surcoût par requête tombe à zéro dans 99 % des cas.
let lastMaintenanceRun = 0;
const MAINTENANCE_MIN_INTERVAL_MS = 5 * 60 * 1000;

function maybeRunMaintenance() {
  const now = Date.now();
  if (now - lastMaintenanceRun < MAINTENANCE_MIN_INTERVAL_MS) return;
  lastMaintenanceRun = now;
  runStorageMaintenanceStep().catch(() => {});
}

startDbInit();
maybeRunMaintenance();
app.use((req, res, next) => {
  startDbInit();
  maybeRunMaintenance();
  next();
});

export default app;
