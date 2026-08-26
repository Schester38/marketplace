const API = "/api";

async function request(path, options = {}, retries = 1) {
  const token = localStorage.getItem("token");
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  const method = (options.method || "GET").toUpperCase();
  try {
    const res = await fetch(API + path, { ...options, headers });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      // Accès fermé par l'admin (« Fermer ») ou adhésion expirée : signaler
      // globalement pour que AuthProvider redirige vers /adhesion.
      if (res.status === 402 && data.code === "MEMBERSHIP_REQUIRED") {
        window.dispatchEvent(new CustomEvent("membership-required"));
      }
      const err = new Error(data.error || `Erreur ${res.status}`);
      err.status = res.status;
      err.code = data.code;
      throw err;
    }
    return data;
  } catch (err) {
    const network = err instanceof TypeError;
    if (network && typeof navigator !== "undefined" && !navigator.onLine) {
      window.dispatchEvent(new Event("app-offline"));
    }
    if (network && method === "GET" && retries > 0) {
      await new Promise((r) => setTimeout(r, 1200));
      return request(path, options, retries - 1);
    }
    throw err;
  }
}

async function adminRequest(path, options = {}) {
  const token = localStorage.getItem("admin_token");
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(API + path, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `Erreur ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return data;
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
  // Annuaire des livreurs pour les boutiques (/shop/livreurs)
  listLivreurs: (params = {}) => {
    const qs = new URLSearchParams(
      Object.fromEntries(
        Object.entries(params).filter(([_, v]) => v !== undefined && v !== null && v !== "")
      )
    ).toString();
    return request("/livreurs" + (qs ? `?${qs}` : ""));
  },
  livreurOptions: () => request("/livreurs/options"),
  deliverSale: (id, payload) =>
    request(`/sales/${id}/deliver`, { method: "POST", body: JSON.stringify(payload) }),
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
  purchaseCreate: (payload) =>
    request("/purchases", { method: "POST", body: JSON.stringify(payload) }),
  purchasesMy: () => request("/purchases/my"),
  notifications: () => request("/notifications"),
  notificationsRead: () => request("/notifications/read", { method: "POST" }),
  deleteNotification: (id) => request(`/notifications/${id}`, { method: "DELETE" }),
  pushKey: () => request("/push/key"),
  pushSubscribe: (payload) =>
    request("/push/subscribe", { method: "POST", body: JSON.stringify(payload) }),
  pushUnsubscribe: (payload) =>
    request("/push/unsubscribe", { method: "POST", body: JSON.stringify(payload) }),
  listOffers: () => request("/offers"),
  myOffers: () => request("/offers/mine"),
  getOffer: (id) => request(`/offers/${id}`),
  createOffer: (payload) => request("/offers", { method: "POST", body: JSON.stringify(payload) }),
  deleteOffer: (id) => request(`/offers/${id}`, { method: "DELETE" }),
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
  // NB : pas de suppression de comptes utilisateurs (boutons « Supprimer »
  // sans effet sur les utilisateurs) — seule la suppression des produits
  // publiés est réelle.
  adminProducts: () => adminRequest("/admin/products"),
  adminDeleteProduct: (id) => adminRequest(`/admin/products/${id}`, { method: "DELETE" }),
  adminMessages: () => adminRequest("/admin/messages"),
  adminSendMessage: (payload) =>
    adminRequest("/admin/messages", { method: "POST", body: JSON.stringify(payload) }),
  adminDeleteMessage: (id) => adminRequest(`/admin/messages/${id}`, { method: "DELETE" }),
  adminResendMessage: (id) => adminRequest(`/admin/messages/${id}/resend`, { method: "POST" }),
  // Masquages doux (vue admin uniquement, utilisateurs non affectés)
  adminHideSale: (id) => adminRequest(`/admin/sales/${id}`, { method: "DELETE" }),
  adminRestoreSale: (id) => adminRequest(`/admin/sales/${id}/restore`, { method: "POST" }),
  adminHideStatus: (status) =>
    adminRequest(`/admin/statuses/${encodeURIComponent(status)}`, { method: "DELETE" }),
  adminRestoreStatus: (status) =>
    adminRequest(`/admin/statuses/${encodeURIComponent(status)}/restore`, { method: "POST" }),
  adminHideShop: (id) => adminRequest(`/admin/shops/${id}`, { method: "DELETE" }),
  adminRestoreShop: (id) => adminRequest(`/admin/shops/${id}/restore`, { method: "POST" }),
  adminHideSeller: (id) => adminRequest(`/admin/sellers/${id}`, { method: "DELETE" }),
  adminRestoreSeller: (id) => adminRequest(`/admin/sellers/${id}/restore`, { method: "POST" }),
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
  myFlashPromotions: () => request("/flash-promotions/mine"),
  createFlashPromotion: (payload) =>
    request("/flash-promotions", { method: "POST", body: JSON.stringify(payload) }),
  deleteFlashPromotion: (id) =>
    request(`/flash-promotions/${id}`, { method: "DELETE" }),
  trending: () => request("/metrics/trending"),
  createDonation: (payload) =>
    request("/donations", { method: "POST", body: JSON.stringify(payload) }),
  ikeepayDonation: (payload) =>
    request("/donations/ikeepay", { method: "POST", body: JSON.stringify(payload) }),
  ikeepayPayin: (payload) =>
    request("/payments/ikeepay/payin", { method: "POST", body: JSON.stringify(payload) }),
  membershipPayin: (payload) =>
    request("/payments/ikeepay/membership", { method: "POST", body: JSON.stringify(payload) }),
  // Confirmé côté client : le checkout hébergé iKeePay ne déclenche pas de
  // webhook serveur (le plugin officiel confirme par postMessage). Cette
  // méthode remonte la confirmation pour marquer le paiement payé et lancer
  // les reversements (90 %).
  ikeepayConfirm: (payload) =>
    request("/payments/ikeepay/confirm", { method: "POST", body: JSON.stringify(payload) }),
  trackViews: (items) => request("/views", { method: "POST", body: JSON.stringify({ items }) }),
};
