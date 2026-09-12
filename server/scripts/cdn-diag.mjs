// Diagnostic CDN : le proxy /api/photo est-il caché par l'edge Vercel ?
const base = "https://mboppi-mboppi.vercel.app";
const u = base + "/api/photo?p=products/285/48b8e9040b86/thumb.webp";
for (const i of [1, 2, 3]) {
  const r = await fetch(u, { cache: "reload" });
  await r.arrayBuffer();
  console.log(
    `GET #${i}`,
    r.status,
    "| x-vercel-cache:", r.headers.get("x-vercel-cache") || "—",
    "| age:", r.headers.get("age") || "—",
    "| cache-control:", r.headers.get("cache-control")
  );
}
// Même test sur une URL inexistante (contrôle du comportement 404)
const nf = await fetch(base + "/api/photo?p=products/xxx/inconnu.webp", { cache: "reload" });
console.log("404 test:", nf.status, "| x-vercel-cache:", nf.headers.get("x-vercel-cache") || "—");