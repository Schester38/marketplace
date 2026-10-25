import pg from "pg";
const { Pool } = pg;
const url = process.argv[2];
const p = new Pool({ connectionString: url, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 8000 });
p.query("SELECT 1").then((r) => { console.log("OK", r.rows); process.exit(0); }).catch((e) => { console.log("ERRMSG:" + (e && e.message)); process.exit(1); });
