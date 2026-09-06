import app from '../server/app.js';
import { initDb, getPool } from '../server/db.js';

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

// Lance immédiatement (pendant le démarrage à froid) puis à chaque requête
// (no-op si déjà lancé) pour garantir une tentative de (re)initialisation.
startDbInit();
app.use((req, res, next) => {
  startDbInit();
  next();
});

export default app;
