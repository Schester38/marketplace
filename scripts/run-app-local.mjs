// Lance serve/app.js localement (SANS initDb) — test du bundle.
// Utilisation : node --env-file=server/.env scripts/run-app-local.mjs
import app from "../server/app.js";
app.listen(Number(process.env.PORT || 4190), () =>
  console.log("[local] mboppi app on " + (process.env.PORT || 4190))
);