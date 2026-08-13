import app from './app.js';
import { initDb, purgeOldTransactions } from './db.js';

const PORT = process.env.PORT || 4000;

async function main() {
  try {
    await initDb();
    console.log('Base de données PostgreSQL connectée');
  } catch (err) {
    console.error('Impossible de se connecter à la base de données :', err.message);
    process.exit(1);
  }
  app.listen(PORT, () => {
    console.log(`API Mboppi démarrée sur http://localhost:${PORT}`);
  });
  setInterval(async () => {
    try {
      await purgeOldTransactions();
    } catch {
      /* purge best-effort */
    }
  }, 60 * 60 * 1000);
}

main();