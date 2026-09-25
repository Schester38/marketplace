// Helpers purs du catalogue de l'accueil : le serveur filtre déjà les produits
// avec `type=physical|digital`. Le client normalise les anciennes réponses CDN
// qui précédaient l'exposition publique de `is_digital`.
export function isDigitalProduct(product) {
  return (
    product?.is_digital === true ||
    product?.is_digital === 1 ||
    product?.is_digital === "1" ||
    product?.is_digital === "true"
  );
}

export function productsOfType(type, products) {
  return (Array.isArray(products) ? products : []).filter((product) =>
    type === "digital" ? isDigitalProduct(product) : !isDigitalProduct(product)
  );
}

export function normalizeServerCatalog(type, products) {
  if (!Array.isArray(products)) return [];
  if (type !== "digital") return productsOfType(type, products);
  return products.map((product) => ({ ...product, is_digital: true }));
}

export function nextCatalogRefresh(current, now = Date.now()) {
  return Math.max(Number(now) || 0, (Number(current) || 0) + 1);
}

export function shouldRetryDigitalCatalog({
  type,
  products,
  unfiltered,
  append,
  retryCount,
}) {
  return (
    type === "digital" &&
    unfiltered &&
    !append &&
    retryCount < 1 &&
    normalizeServerCatalog(type, products).length === 0
  );
}
