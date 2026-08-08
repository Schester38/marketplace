import app from '../server/app.js';
import { initDb } from '../server/db.js';

await initDb();

export default app;
