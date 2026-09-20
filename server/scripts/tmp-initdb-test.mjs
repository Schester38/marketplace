// Test initDb en conditions réelles (équivaut à un cold start Vercel).
import "./_load-env.mjs";
const { initDb } = await import("../db.js");
try {
  await initDb();
  console.log("initDb: OK");
} catch (err) {
  console.error("initDb ÉCHEC :", err.message, "position:", err.position);
  process.exit(1);
}
process.exit(0);
