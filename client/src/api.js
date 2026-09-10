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
      if (RETRYABLE_STATUS.has(res.status)) reportServerError(path, res.status, data.error || "");
      throw err;
    }
    return data;
  }
  throw new Error("Erreur réseau");
}

export const api = {
  register: (payload) =>
    request("/auth/register", { method: "POST", body: JSON.stringify(payload) }),
  verifyEmail: (token) =>
    request("/auth/verify", { method: "POST", body: JSON.stringify({ token }) }),
  resendVerification: (email) =>
    request("/auth/resend", { method: "POST", body: JSON.stringify({ email }) }),
  login: (payload) => request("/auth/login", { method: "POST", body: JSON.stringify(payload) }),
  me: () => request("/auth/me"),
  updateProfile: (payload) => request("/auth/me", { method: "PUT", body: JSON.stringify(payload) }),
  changePassword: (payload) =>
    request("/auth/password", { method: "PUT", body: JSON.stringify(payload) }),
  deleteAccount: (payload) =>
    request("/auth/me", { method: "DELETE", body: JSON.stringify(payload) }),
  listProducts: (params = {}) => {
    const qs = new URLSearchParams(
      Object.fromEntries(
        Object.entries(params).filter(([_, v]) => v !== undefined && v !== null && v !== "")
      )
    ).toString();
    return request("/products" + (qs ? `?${qs}` : ""));
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
  getProduct: (id) => request(`/products/${id}`),
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
  trackSale: (id, code) => request(`/sales/track/${id}?code=${encodeURIComponent(code)}`),
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
  createDonation: (payload) =>
    request("/donations", { method: "POST", body: JSON.stringify(payload) }),
  trackViews: (items) => request("/views", { method: "POST", body: JSON.stringify({ items }) }),
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
  adminTestWhatsApp: () => adminRequest("/admin/settings/whatsapp/test", { method: "POST" }),
  adminUpdatePaymentSettings: (payload) =>
    adminRequest("/admin/settings/payments", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  adminPayments: () => adminRequest("/admin/payments"),
  adminWebhooks: () => adminRequest("/admin/payments/webhooks"),
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
};
