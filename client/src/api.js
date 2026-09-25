import { storage, sessionStore } from "./storage";
const API = "/api";

// --- Journalisation silencieuse des erreurs serveur (visible dans Admin → Journal) ---
const recentLogKeys = new Map(); // clé -> timestamp du dernier log
function reportServerError(path, status, detail) {
  try {
    const key = `${path}|${status}`;
    const now = Date.now();
    const last = recentLogKeys.get(key) || 0;
    if (now - last < 30_000) return; // max 1 log / 30 s par route+statut
    recentLogKeys.set(key, now);
    if (recentLogKeys.size > 50) {
      const oldest = [...recentLogKeys.entries()].sort((a, b) => a[1] - b[1])[0];
      if (oldest) recentLogKeys.delete(oldest[0]);
    }
    // fetch brut (pas request()) pour éviter toute récursion
    fetch(`${API}/logs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: `[API] ${path} -> ${status}${detail ? ` (${detail})` : ""}`,
        stack: null,
        url: typeof window !== "undefined" ? window.location.pathname : "",
        username: storage.getItem("user_name") || "",
      }),
    }).catch(() => {});
  } catch {
    /* jamais bloquant */
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const RETRYABLE_STATUS = new Set([500, 502, 503, 504]);

// 401 sur une requête portant un jeton = session (JWT 24 h) expirée ou
// fermée par l'admin : on prévient l'app (AuthProvider) qui déconnecte
// l'utilisateur et affiche la page de connexion — au lieu de laisser le
// site « faussement connecté » où chaque action échoue.
// Exclusion : les routes /auth/* en écriture (login, inscription, mot de
// passe, suppression de compte…) renvoient aussi 401 pour un mot de passe
// ERRONÉ — déconnecter l'utilisateur dans ces cas serait une régression.
function notifySessionExpired() {
  try {
    window.dispatchEvent(new Event("auth-expired"));
  } catch {
    /* jamais bloquant */
  }
}

function notifyAdminSessionExpired() {
  try {
    window.dispatchEvent(new Event("admin-auth-expired"));
  } catch {
    /* jamais bloquant */
  }
}

async function request(path, options = {}, retries = 2) {
  const token = storage.getItem("token");
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  const method = (options.method || "GET").toUpperCase();
  let data = {};
  try {
    const res = await fetch(API + path, { ...options, headers });
    data = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (
        res.status === 401 &&
        token &&
        !(method !== "GET" && path.startsWith("/auth/"))
      ) {
        notifySessionExpired();
      }
      const err = new Error(data.error || `Erreur ${res.status}`);
      err.status = res.status;
      err.code = data.code;
      throw err;
    }
    return data;
  } catch (err) {
    const network = err instanceof TypeError;
    const serverError = RETRYABLE_STATUS.has(err.status);
    if (network && typeof navigator !== "undefined" && !navigator.onLine) {
      window.dispatchEvent(new Event("app-offline"));
    }
    // Retry automatique UNIQUEMENT sur les GET (idempotents) : erreur réseau
    // ou 5xx transitoire (cold start, déploiement) -> invisible pour l'utilisateur.
    if ((network || serverError) && method === "GET" && retries > 0) {
      await sleep(network ? 1200 : retries === 2 ? 800 : 2000);
      return request(path, options, retries - 1);
    }
    if (serverError) reportServerError(path, err.status, data?.error || "");
    throw err;
  }
}

async function adminRequest(path, options = {}) {
  options.cache = "no-store";
  const token = storage.getItem("admin_token");
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  const method = (options.method || "GET").toUpperCase();
  for (let attempt = 2; attempt >= 0; attempt--) {
    let res;
    try {
      res = await fetch(API + path, { ...options, headers });
    } catch (err) {
      if (method === "GET" && attempt > 0) {
        await sleep(1200);
        continue;
      }
      throw err;
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.error || `Erreur ${res.status}`);
      err.status = res.status;
      if (RETRYABLE_STATUS.has(res.status) && method === "GET" && attempt > 0) {
        await sleep(attempt === 2 ? 800 : 2000);
        continue;
      }
      // Session admin (JWT 24 h) expirée → retour au portail mot de passe.
      // /admin/pass exclus (401 = mot de passe erroné, pas une expiration).
      if (res.status === 401 && token && path !== "/admin/pass") {
        notifyAdminSessionExpired();
      }
      if (RETRYABLE_STATUS.has(res.status)) reportServerError(path, res.status, data.error || "");
      throw err;
    }
    return data;
  }
  throw new Error("Erreur réseau");
}

// Générateur de documents : la portée est EXPLICITE, posée par le composant
// qui rend le panneau (Admin.jsx → "admin", page /generateur → "creator").
// On ne SNIFFE PAS les jetons : l'admin_token reste dans le navigateur après
// une session panneau, et un créateur ouvrant /generateur dans le même
// navigateur aurait sinon envoyé le jeton ADMIN → accès à tous les documents.
let genScopeAdmin = false;
export function setGeneratorScope(admin) {
  genScopeAdmin = !!admin;
}
function generatorRequest(path, options = {}) {
  return genScopeAdmin && storage.getItem("admin_token")
    ? adminRequest(path, options)
    : request(path, options);
}

export const api = {
  register: (payload) =>
    request("/auth/register", { method: "POST", body: JSON.stringify(payload) }),
  verifyEmail: (token) =>
    request("/auth/verify", { method: "POST", body: JSON.stringify({ token }) }),
  resendVerification: (email) =>
    request("/auth/resend", { method: "POST", body: JSON.stringify({ email }) }),
  login: (payload) => request("/auth/login", { method: "POST", body: JSON.stringify(payload) }),
  mySpaces: () => request("/auth/spaces"),
  switchAccount: () => request("/auth/switch", { method: "POST" }),
  googleChoose: (ct, role) =>
    request("/auth/google-choose", { method: "POST", body: JSON.stringify({ ct, role }) }),
  me: () => request("/auth/me"),
  updateProfile: (payload) => request("/auth/me", { method: "PUT", body: JSON.stringify(payload) }),
  // Photo de profil (tous rôles) : data-URI déjà redimensionnée en WebP par le
  // navigateur ; `avatar: null` retire la photo.
  updateAvatar: (avatar) => request("/auth/avatar", { method: "PUT", body: JSON.stringify({ avatar }) }),
  changePassword: (payload) =>
    request("/auth/password", { method: "PUT", body: JSON.stringify(payload) }),
  deleteAccount: (payload) =>
    request("/auth/me", { method: "DELETE", body: JSON.stringify(payload) }),
  listProducts: (params = {}, options = {}) => {
    const qs = new URLSearchParams(
      Object.fromEntries(
        Object.entries(params).filter(([_, v]) => v !== undefined && v !== null && v !== "")
      )
    ).toString();
    return request("/products" + (qs ? `?${qs}` : ""), options);
  },
  geo: () => request("/geo"),
  listCities: (search = "") =>
    request("/products/cities" + (search ? `?q=${encodeURIComponent(search)}` : "")),
  listShops: (params = {}) => {
    const qs = new URLSearchParams(
      Object.fromEntries(
        Object.entries(params).filter(([_, v]) => v !== undefined && v !== null && v !== "")
      )
    ).toString();
    return request("/shop" + (qs ? `?${qs}` : ""));
  },
  getProduct: (id, options = {}) => request(`/products/${id}`, options),
  myProducts: () => request("/products/mine"),
  createProduct: (payload) =>
    request("/products", { method: "POST", body: JSON.stringify(payload) }),
  updateProduct: (id, payload) =>
    request(`/products/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
  deleteProduct: (id) => request(`/products/${id}`, { method: "DELETE" }),
  duplicateProduct: (id) => request(`/products/${id}/duplicate`, { method: "POST" }),
  recentSales: () => request("/sales/recent"),
  createSale: (payload) => request("/sales", { method: "POST", body: JSON.stringify(payload) }),
  mySales: () => request("/sales/my"),
  deleteSale: (id) => request(`/sales/${id}`, { method: "DELETE" }),
  activity: (params = {}) => {
    const qs = new URLSearchParams(
      Object.fromEntries(
        Object.entries(params).filter(([_, v]) => v !== undefined && v !== null && v !== "")
      )
    ).toString();
    return request("/activity" + (qs ? `?${qs}` : ""));
  },
  activityEvents: (params = {}) => {
    const qs = new URLSearchParams(
      Object.fromEntries(
        Object.entries(params).filter(([_, v]) => v !== undefined && v !== null && v !== "")
      )
    ).toString();
    return request("/activity/events" + (qs ? `?${qs}` : ""));
  },
  shopSales: (shopId) => request(`/sales/shop/${shopId}`),
  updateSaleStatus: (id, status) =>
    request(`/sales/${id}/status`, { method: "PATCH", body: JSON.stringify({ status }) }),
  livreurSales: (shopCode) =>
    request("/sales/livreur" + (shopCode ? `?shop_code=${encodeURIComponent(shopCode)}` : "")),
  deliverSale: (id, payload) =>
    request(`/sales/${id}/deliver`, { method: "POST", body: JSON.stringify(payload) }),
  saleSignature: (id) => request(`/sales/${id}/signature`),
  deleteDeliveredSale: (id) => request(`/sales/${id}/delivered`, { method: "DELETE" }),
  deleteReferralSale: (id) => request(`/sales/${id}/referral`, { method: "DELETE" }),
  saleProof: (id) => request(`/sales/${id}/proof`),
  shopCode: () => request("/shop/code"),
  createShopCode: () => request("/shop/code", { method: "POST" }),
  salePaymentMethods: (id, target) =>
    request(`/sales/${id}/payment-methods${target ? `?target=${encodeURIComponent(target)}` : ""}`),
  paySale: (id, payload) =>
    request(`/sales/${id}/pay`, { method: "POST", body: JSON.stringify(payload) }),
  payReferral: (id, payload) =>
    request(`/sales/${id}/pay-referral`, { method: "POST", body: JSON.stringify(payload) }),
  claimSale: (id) => request(`/sales/${id}/claim`, { method: "POST" }),
  claimReferral: (id) => request(`/sales/${id}/claim-referral`, { method: "POST" }),
  groupedClaim: (kind, shopId) =>
    request("/sales/grouped-claim", {
      method: "POST",
      body: JSON.stringify({ kind, shop_id: shopId }),
    }),
  groupedPay: (kind, sellerId, proof) =>
    request("/sales/grouped-pay", {
      method: "POST",
      body: JSON.stringify({ kind, seller_id: sellerId, proof }),
    }),
  getSellerCode: () => request("/auth/seller-code"),
  createSellerCode: () => request("/auth/seller-code", { method: "POST" }),
  getPaymentMethods: () => request("/seller/payment-methods"),
  updatePaymentMethods: (payload) =>
    request("/seller/payment-methods", { method: "PUT", body: JSON.stringify(payload) }),
  shopPaymentMethods: (id) => request(`/shop/${id}/payment-methods`),
  getShopPaymentMethods: () => request("/shop/payment-methods"),
  updateShopPaymentMethods: (payload) =>
    request("/shop/payment-methods", { method: "PUT", body: JSON.stringify(payload) }),
  getLivreurPaymentMethods: () => request("/livreur/payment-methods"),
  updateLivreurPaymentMethods: (payload) =>
    request("/livreur/payment-methods", { method: "PUT", body: JSON.stringify(payload) }),
  listLivreurs: (params = {}) => {
    const qs = new URLSearchParams();
    if (params.city) qs.set("city", params.city);
    if (params.quartier) qs.set("quartier", params.quartier);
    const s = qs.toString();
    return request("/livreurs" + (s ? `?${s}` : ""));
  },
  livreurOptions: () => request("/livreurs/options"),

  purchaseCreate: (payload) =>
    request("/purchases", { method: "POST", body: JSON.stringify(payload) }),
  purchasesMy: () => request("/purchases/my"),
  // Produits digitaux : le téléchargement passe par une URL SIGNÉE à durée
  // courte délivrée par le serveur (bucket privé). Pour un achat fait sans
  // compte, le code de confirmation de la commande fait office de preuve.
  digitalStatus: (saleId, code) =>
    request(`/digital/${saleId}${code ? `?code=${encodeURIComponent(code)}` : ""}`),
  digitalDownload: (saleId, code) =>
    request(`/digital/${saleId}/download`, {
      method: "POST",
      body: JSON.stringify(code ? { code } : {}),
    }),
  // Vidéo PROTÉGÉE (YouTube non répertoriée) : le serveur vérifie le droit
  // (acheteur / code de confirmation / propriétaire), la révocation et
  // l'expiration avant de renvoyer l'URL d'iframe — jamais d'URL publique.
  digitalVideo: (saleId, code) =>
    request(`/digital/${saleId}/video${code ? `?code=${encodeURIComponent(code)}` : ""}`),
  // Gestion des accès d'une vidéo protégée (créateur propriétaire ou admin) :
  // liste des acheteurs + révocation/rétablissement + prolongation.
  // `data` : true/false (raccourci révocation) ou { revoked } / { extend_days }.
  digitalProductAccesses: (productId) =>
    request(`/digital/product/${productId}/accesses`),
  digitalAccessSet: (productId, saleId, data) =>
    request(`/digital/product/${productId}/accesses/${saleId}`, {
      method: "PATCH",
      body: JSON.stringify(typeof data === "boolean" ? { revoked: data } : data || {}),
    }),
  digitalMine: () => request("/digital/mine"),
  // Upload DIRECT d'un fichier digital : le serveur délivre une URL d'upload
  // signée (valide 1 h, un seul chemin d'objet) et le navigateur téléverse le
  // fichier lui-même vers Supabase (PUT) — jusqu'à 20 Mo, sans passer par l'API.
  digitalUploadUrl: (payload) =>
    request("/digital/upload-url", { method: "POST", body: JSON.stringify(payload) }),
  // Achat en ligne d'un produit digital (checkout iKeePay). Client connecté OU invité.
  digitalPayin: (payload) =>
    request("/payments/digital-payin", { method: "POST", body: JSON.stringify(payload) }),
  // Sondage pendant l'attente du paiement en ligne (toutes les 4 s côté appelant).
  digitalWaitOnline: (saleId, code) =>
    request(`/digital/${saleId}/wait-online${code ? `?code=${encodeURIComponent(code)}` : ""}`),
  // Gains en ligne (créateur / vendeur) + demande de retrait (min 5 000 XAF).
  onlineEarningsMe: () => request("/online-earnings/me"),
  onlineWithdraw: (amount) =>
    request("/online-earnings/withdraw", { method: "POST", body: JSON.stringify({ amount }) }),
  notifications: () => request("/notifications"),
  notificationsRead: () => request("/notifications/read", { method: "POST" }),
  deleteNotification: (id) => request(`/notifications/${id}`, { method: "DELETE" }),
  pushKey: () => request("/push/key"),
  pushStatus: () => request("/push/status"),
  pushPrefs: () => request("/push/prefs"),
  updatePushPrefs: (payload) =>
    request("/push/prefs", { method: "PUT", body: JSON.stringify(payload) }),
  pushSubscribe: (payload) =>
    request("/push/subscribe", { method: "POST", body: JSON.stringify(payload) }),
  pushUnsubscribe: (payload) =>
    request("/push/unsubscribe", { method: "POST", body: JSON.stringify(payload) }),
  pushTest: () => request("/push/test", { method: "POST" }),
  pushRefresh: (payload) =>
    request("/push/refresh", { method: "POST", body: JSON.stringify(payload) }),
  listOffers: () => request("/offers"),
  myOffers: () => request("/offers/mine"),
  getOffer: (id) => request(`/offers/${id}`),
  createOffer: (payload) => request("/offers", { method: "POST", body: JSON.stringify(payload) }),
  deleteOffer: (id, token) =>
    request(
      `/offers/${id}${token ? `?token=${encodeURIComponent(token)}` : ""}`,
      { method: "DELETE" }
    ),
  createOrder: (payload) => request("/orders", { method: "POST", body: JSON.stringify(payload) }),
  myOrders: () => request("/orders/me"),
  productReviews: (id) => request(`/reviews/product/${id}`),
  createReview: (payload) => request("/reviews", { method: "POST", body: JSON.stringify(payload) }),
  shop: (id) => request(`/shop/${id}`),
  trackSale: (id, code) =>
    id
      ? request(`/sales/track/${id}?code=${encodeURIComponent(code)}`)
      : request(`/sales/track?code=${encodeURIComponent(code)}`),
  cancelSale: (id, code) =>
    request(`/sales/${id}/cancel`, { method: "POST", body: JSON.stringify({ code }) }),
  exportSales: () => request("/sales/export"),
  adminPass: (password) =>
    adminRequest("/admin/pass", { method: "POST", body: JSON.stringify({ password }) }),
  adminMigrateEmailShare: () =>
    adminRequest("/admin/migrate/email-share", { method: "POST" }),
  adminCreateAccount: (payload) =>
    adminRequest("/admin/account/register", { method: "POST", body: JSON.stringify(payload) }),
  adminStats: () => adminRequest("/admin/stats"),
  adminTransactions: () => adminRequest("/admin/transactions"),
  adminUsers: (search = "") =>
    adminRequest("/admin/users" + (search ? `?search=${encodeURIComponent(search)}` : "")),
  adminSetAdminApproved: (id, adminApproved) =>
    adminRequest(`/admin/users/${id}/admin-approved`, {
      method: "PATCH",
      body: JSON.stringify({ admin_approved: adminApproved }),
    }),
  adminSetVerified: (id, verified) =>
    adminRequest(`/admin/users/${id}/verify`, {
      method: "PATCH",
      body: JSON.stringify({ verified }),
    }),
  adminDeleteUser: (id) => adminRequest(`/admin/users/${id}`, { method: "DELETE" }),
  adminProducts: () => adminRequest("/admin/products"),
  adminDeleteProduct: (id) => adminRequest(`/admin/products/${id}`, { method: "DELETE" }),
  // Consommation du Storage Supabase (buckets) + purge des fichiers digitaux
  // orphelins — carte « 💾 Stockage Supabase » (Admin ⚙️ Système).
  adminStorageUsage: () => adminRequest("/admin/storage/usage"),
  adminPurgeDigitalOrphans: () =>
    adminRequest("/admin/storage/purge-digital-orphans", {
      method: "POST",
      body: JSON.stringify({}),
    }),
  adminMessages: () => adminRequest("/admin/messages"),
  adminDeleteMessage: (id) => adminRequest(`/admin/messages/${id}`, { method: "DELETE" }),
  adminSendMessage: (payload) =>
    adminRequest("/admin/messages", { method: "POST", body: JSON.stringify(payload) }),
  adminLogs: (limit = 100) => adminRequest(`/logs/list?limit=${limit}`),
  adminVisits: (days = 30, country = "") =>
    adminRequest(
      `/admin/visits?days=${days}${country ? `&country=${encodeURIComponent(country)}` : ""}`
    ),
  adminVisitsReset: () => adminRequest("/admin/visits/reset", { method: "POST" }),
  adminCampaignRecipients: (audience) =>
    adminRequest(`/admin/campaign/recipients?audience=${encodeURIComponent(audience)}`),
  adminCampaignSend: (payload) =>
    adminRequest("/admin/campaign/send", { method: "POST", body: JSON.stringify(payload) }),
  adminScheduledCampaigns: () => adminRequest("/admin/campaigns/scheduled"),
  adminScheduleCampaign: (payload) =>
    adminRequest("/admin/campaigns/schedule", { method: "POST", body: JSON.stringify(payload) }),
  adminDeleteScheduledCampaign: (id) =>
    adminRequest(`/admin/campaigns/scheduled/${id}`, { method: "DELETE" }),
  adminSetCampaignDailyLimit: (limit) =>
    adminRequest("/admin/campaigns/daily-limit", { method: "POST", body: JSON.stringify({ limit }) }),
  popupMessage: () => request("/messages/popup"),
  ackMessage: (id) => request(`/messages/${id}/ack`, { method: "POST" }),
  chat: (payload) => request("/chat", { method: "POST", body: JSON.stringify(payload) }),
  subscribeNewsletter: (email) =>
    request("/newsletter/subscribe", { method: "POST", body: JSON.stringify({ email }) }),
  adminNewsletter: () => adminRequest("/newsletter"),
  adminSendNewsletter: (payload) =>
    adminRequest("/newsletter/send", { method: "POST", body: JSON.stringify(payload) }),
  flashPromotions: () => request("/flash-promotions"),
  createFlashPromotion: (payload) =>
    request("/flash-promotions", { method: "POST", body: JSON.stringify(payload) }),
  trending: () => request("/metrics/trending"),
  publicStats: () => request("/metrics/public"),
  createDonation: (payload) =>
    request("/donations", { method: "POST", body: JSON.stringify(payload) }),
  trackViews: (items) =>
    request("/views", {
      method: "POST",
      headers: {
        "X-Visitor-Id": storage.getItem("mboppi_visitor_id") || "",
      },
      body: JSON.stringify({ items }),
    }),
  // Suivi GPS temps réel d'une livraison
  livreurPosition: (id, payload) =>
    request(`/sales/${id}/livreur-position`, { method: "POST", body: JSON.stringify(payload) }),
  buyerPosition: (id, payload) =>
    request(`/sales/${id}/buyer-position`, { method: "POST", body: JSON.stringify(payload) }),
  saleTrack: (id, code = "") =>
    request(`/sales/${id}/track${code ? `?code=${encodeURIComponent(code)}` : ""}`),
  myPosition: (payload) =>
    request("/auth/position", { method: "POST", body: JSON.stringify(payload) }),
  nearbyUsers: (opts = {}) => {
    const qs = new URLSearchParams();
    if (opts.role) qs.set("role", opts.role);
    if (opts.lat != null) qs.set("lat", String(opts.lat));
    if (opts.lng != null) qs.set("lng", String(opts.lng));
    if (opts.radius_km) qs.set("radius_km", String(opts.radius_km));
    if (opts.fresh != null) qs.set("fresh", opts.fresh ? "1" : "0");
    return request(`/users/nearby?${qs.toString()}`);
  },
  adminTracking: () => adminRequest("/admin/tracking"),
  adminTrackingDelete: (id) =>
    adminRequest("/admin/tracking/delete", { method: "POST", body: JSON.stringify({ id }) }),
  adminTrackingDeleteAll: () => adminRequest("/admin/tracking/delete-all", { method: "POST" }),
  myFlashPromotions: () => request("/flash-promotions/mine"),
  deleteFlashPromotion: (id) => request(`/flash-promotions/${id}`, { method: "DELETE" }),
  activationWithdrawalMe: () => request("/activation-withdrawals/me"),
  createActivationWithdrawal: (payload) =>
    request("/activation-withdrawals", { method: "POST", body: JSON.stringify(payload) }),
  // Paiements en ligne (iKeePay — PAYIN uniquement : adhésion + don)
  paymentSettings: () => request("/payments/settings"),
  membershipStatus: () => request("/payments/membership-status"),
  membershipPayin: () => request("/payments/membership-payin", { method: "POST" }),
  donationPayin: (payload) =>
    request("/payments/donation-payin", { method: "POST", body: JSON.stringify(payload) }),
  adminPaymentSettings: () => adminRequest("/admin/settings/payments"),
  adminWhatsAppSettings: () => adminRequest("/admin/settings/whatsapp"),
  adminUpdateWhatsAppSettings: (payload) =>
    adminRequest("/admin/settings/whatsapp", { method: "POST", body: JSON.stringify(payload) }),
  adminWhatsAppBotSettings: () => adminRequest("/admin/settings/whatsapp-bot"),
  adminUpdateWhatsAppBotSettings: (payload) =>
    adminRequest("/admin/settings/whatsapp-bot", { method: "POST", body: JSON.stringify(payload) }),
  adminTestWhatsApp: () => adminRequest("/admin/settings/whatsapp/test", { method: "POST" }),
  adminUpdatePaymentSettings: (payload) =>
    adminRequest("/admin/settings/payments", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  adminPayments: () => adminRequest("/admin/payments"),
  // Ventes digitales payées en ligne (iKeePay) : chaque vente avec TOUS ses
  // acteurs (créateur, vendeur, parrain) + gains attribués.
  adminDigitalPayments: () => adminRequest("/admin/digital-payments"),
  // Retraits des gains en ligne (créateur / vendeur) : paiement manuel.
  adminOnlineWithdrawals: () => adminRequest("/admin/online-withdrawals"),
  adminPayOnlineWithdrawal: (id, note = "") =>
    adminRequest(`/admin/online-withdrawals/${id}/pay`, {
      method: "POST",
      body: JSON.stringify({ note }),
    }),
  adminWebhooks: () => adminRequest("/admin/payments/webhooks"),
  adminFixImageCache: () =>
    adminRequest("/admin/storage/fix-image-cache", { method: "POST" }),
  adminMigrateInlinePhotos: () =>
    adminRequest("/admin/storage/migrate-inline-photos", { method: "POST" }),
  adminCompleteDonation: (id) =>
    adminRequest(`/admin/payments/donations/${id}/complete`, { method: "POST" }),
  adminDeleteDonation: (id) =>
    adminRequest(`/admin/payments/donations/${id}`, { method: "DELETE" }),
  adminDeleteMembership: (id) =>
    adminRequest(`/admin/payments/memberships/${id}`, { method: "DELETE" }),
  adminCompleteMembership: (id) =>
    adminRequest(`/admin/payments/memberships/${id}/complete`, { method: "POST" }),
  adminReferrals: (search) =>
    adminRequest(`/admin/referrals${search ? `?search=${encodeURIComponent(search)}` : ""}`),
  adminMarkReferralPaid: (id) =>
    adminRequest(`/admin/referrals/${id}/pay`, { method: "POST" }),
  adminWithdrawals: () => adminRequest("/admin/activation-withdrawals"),
  adminPayWithdrawal: (id) =>
    adminRequest(`/admin/activation-withdrawals/${id}/pay`, { method: "POST" }),

  // ─── Générateur de documents (ebooks/PDF) — module admin isolé ──────────
  genDocuments: () => generatorRequest("/generator/documents"),
  genDocument: (id, { includeLayout = false } = {}) =>
    generatorRequest(`/generator/documents/${id}${includeLayout ? "?layout=1" : ""}`),
  // Layout Studio chargé uniquement à l'ouverture de l'onglet Studio.
  genDocumentLayout: (id) => generatorRequest(`/generator/documents/${id}/layout`),
  genCreateDocument: (payload) =>
    generatorRequest("/generator/documents", { method: "POST", body: JSON.stringify(payload) }),
  // Autosave : payload partiel (content, title, cover, design, protection…).
  genSaveDocument: (id, payload) =>
    generatorRequest(`/generator/documents/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
  genDeleteDocument: (id) =>
    generatorRequest(`/generator/documents/${id}`, { method: "DELETE" }),
  genDuplicateDocument: (id) =>
    generatorRequest(`/generator/documents/${id}/duplicate`, { method: "POST" }),
  genSaveVersion: (id, payload) =>
    generatorRequest(`/generator/documents/${id}/versions`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  // Restauration d'une version (instantané complet du contenu).
  genRestoreVersion: (id, versionId) =>
    generatorRequest(`/generator/documents/${id}/versions/${versionId}/restore`, { method: "POST" }),
  // Vue DESIGN — « Modèle de design » … aucun souci.
  // Assistant IA (Gemini) : renvoie du texte relu/inséré par l'utilisateur.
  genAi: (payload) =>
    generatorRequest("/generator/ai", { method: "POST", body: JSON.stringify(payload) }),
  // Publication « Vendre sur MboppiShop » : URL d'upload signée (envoi direct du
  // PDF vers Supabase) puis création/mise à jour du produit digital.
  genUploadUrl: (id, payload) =>
    generatorRequest(`/generator/documents/${id}/upload-url`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  genPublish: (id, payload) =>
    generatorRequest(`/generator/documents/${id}/publish`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  genDeleteVersion: (id, versionId) =>
    generatorRequest(`/generator/documents/${id}/versions/${versionId}`, { method: "DELETE" }),
  // Suppression TOTALE du produit digital publié (base + fichiers) : le
  // document redevient publiable. Ouvert à l'admin et au créateur propriétaire.
  genDeleteProduct: (id) => generatorRequest(`/generator/documents/${id}/product`, { method: "DELETE" }),
  // Vérification PUBLIQUE d'authenticité (page /verifier/<référence>, QR du PDF).
  genVerify: (ref) => request(`/generator/verify/${encodeURIComponent(ref)}`),
};
