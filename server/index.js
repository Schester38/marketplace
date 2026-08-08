import app from './app.js';
import { initDb } from './db.js';

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
    console.log(`API Marketplace démarrée sur http://localhost:${PORT}`);
  });
}

main();
