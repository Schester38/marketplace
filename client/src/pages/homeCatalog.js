// Helpers purs du catalogue de l'accueil : le serveur filtre déjà les produits
// avec `type=physical|digital`. Le client normalise les anciennes réponses CDN
// qui précédaient l'exposition publique de `is_digital`.
// Volet affiché par défaut à l'ouverture du site (« Produits digitaux »).
// C'est la SOURCE UNIQUE du défaut : Home.jsx, les liens de catégorie et les
// tests lisent cette constante, plus aucun « physical » codé en dur.
export const DEFAULT_TYPE = "digital";

// Lit le paramètre `?type=` de l'URL. Toute valeur absente ou inconnue retombe
// sur le défaut — sans cela, un lien de catégorie physique (/ ?cat=…) ouvrirait
// le volet digital et afficherait des produits hors de la catégorie demandée.
export function resolveType(raw) {
  if (raw === "digital" || raw === "physical") return raw;
  return DEFAULT_TYPE;
}

// Lien de catégorie qui conserve la famille du lien : la grille et le méga-menu
// listent des catégories PHYSIQUES, ils doivent donc rester sur le volet
// physique même si le défaut du site est désormais le digital.
export function categoryLink(category, type = "physical") {
  return `/?type=${type}&cat=${encodeURIComponent(category)}`;
}

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

// Une réponse (ou un réessai programmé) ne s'applique QUE s'il vise encore la
// famille affichée et qu'aucune requête plus récente n'a été lancée. Sans ce
// garde, une requête « physiques » retardée écrasait le catalogue « digitaux »
// fraîchement chargé — liste du bas vide jusqu'à l'actualisation de la page.
export function isCatalogResponseStale({
  mounted,
  requestId,
  latestRequestId,
  family,
  currentFamily,
}) {
  return !mounted || requestId !== latestRequestId || family !== currentFamily;
}

// Réessai automatique des réponses physiques VIDES (cache Vercel obsolète) :
// deux tentatives maximum, jamais pour une réponse normale — sinon chaque
// réponse non vide en reprogrammait un, en boucle, et invalidait le volet
// digital au passage. Jamais sur un ajout de page (`append`), qui remplacerait
// la liste au lieu de la compléter.
export function shouldRetryPhysicalCatalog({ type, empty, append, unfiltered, retryCount }) {
  return (
    type === "physical" &&
    empty === true &&
    !append &&
    unfiltered === true &&
    retryCount < 2
  );
}

// Catégories du champ « Filtrer par catégorie » : chaque volet affiche
// UNIQUEMENT ses catégories (ebooks/formations pour le digital, produits
// matériels pour le physique). Le menu unique (`PRODUCT_CATEGORIES`, qui
// contient les deux familles) proposait « Téléphones & Tablettes » sur
// l'onglet digital.
export function catalogCategories(type, { digital = [], physical = [] } = {}) {
  return type === "digital" ? digital : physical;
}

// La catégorie sélectionnée appartient-elle encore au volet actif ? Sinon elle
// doit être effacée (bascule d'onglet, lien direct, retour arrière) — le filtre
// serveur ne renverrait sinon aucun produit.
export function keepsCategoryOnType(type, category, lists = {}) {
  if (!category) return true;
  return catalogCategories(type, lists).includes(category);
}
