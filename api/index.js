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

// Lance immédiatement (pendant le démarrage à froid) puis à chaque requête :
// la maintenance Storage (pas à pas, ~3 s max par step) progresse à chaque
// requête jusqu'à la garde `storage_maintenance_done` (no-op ensuite).
startDbInit();
runStorageMaintenanceStep().catch(() => {});
app.use((req, res, next) => {
  startDbInit();
  runStorageMaintenanceStep().catch(() => {});
  next();
});

export default app;
