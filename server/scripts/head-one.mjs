// HEAD direct sur quelques images : cache-control réellement servi
const url = process.argv[1];
const h = await fetch(url, { method: "HEAD" });
console.log(JSON.stringify({ status: h.status, cache: h.headers.get("cache-control"), etag: !!h.headers.get("etag") }));