import app from '../server/app.js';
import { initDb } from '../server/db.js';

let dbInitialized = false;

async function ensureDbInitialized() {
  if (!dbInitialized) {
    try {
      await initDb();
      dbInitialized = true;
    } catch (err) {
      console.error('Database initialization failed:', err);
      // Don't throw - let the request handler handle it
    }
  }
}

// Initialize on first request, not at module load
app.use(async (req, res, next) => {
  await ensureDbInitialized();
  next();
});

export default app;
