import app from '../server/app.js';
import { initDb, getPool } from '../server/db.js';

let dbInitialized = false;

async function ensureDbInitialized() {
  if (!dbInitialized) {
    try {
      await initDb();
      dbInitialized = true;
    } catch (err) {
      console.error('Database initialization failed:', err);
    }
  }
}

// Pre-warm pool on module load (helps with cold starts)
getPool().query('SELECT 1').catch(() => {});

// Initialize on first request
app.use(async (req, res, next) => {
  await ensureDbInitialized();
  next();
});

export default app;
