const API = '/api';

async function request(path, options = {}, retries = 1) {
  const token = localStorage.getItem('token');
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  const method = (options.method || 'GET').toUpperCase();
  try {
    const res = await fetch(API + path, { ...options, headers });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Erreur ${res.status}`);
    return data;
  } catch (err) {
    const network = err instanceof TypeError;
    if (network && typeof navigator !== 'undefined' && !navigator.onLine) {
      window.dispatchEvent(new Event('app-offline'));
    }
    if (network && method === 'GET' && retries > 0) {
      await new Promise((r) => setTimeout(r, 1200));
      return request(path, options, retries - 1);
    }
    throw err;
  }
}

async function adminRequest(path, options = {}) {
  const token = localStorage.getItem('admin_token');
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
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
  register: (payload) => request('/auth/register', { method: 'POST', body: JSON.stringify(payload) }),
  login: (payload) => request('/auth/login', { method: 'POST', body: JSON.stringify(payload) }),
  me: () => request('/auth/me'),
  updateProfile: (payload) => request('/auth/me', { method: 'PUT', body: JSON.stringify(payload) }),
  changePassword: (payload) => request('/auth/password', { method: 'PUT', body: JSON.stringify(payload) }),
  deleteAccount: (payload) => request('/auth/me', { method: 'DELETE', body: JSON.stringify(payload) }),
  listProducts: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request('/products' + (qs ? `?${qs}` : ''));
  },
  listCities: (search = '') => request('/products/cities' + (search ? `?q=${encodeURIComponent(search)}` : '')),
  listShops: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request('/shop' + (qs ? `?${qs}` : ''));
  },
  getProduct: (id) => request(`/products/${id}`),
  myProducts: () => request('/products/mine'),
  createProduct: (payload) => request('/products', { method: 'POST', body: JSON.stringify(payload) }),
  updateProduct: (id, payload) => request(`/products/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  deleteProduct: (id) => request(`/products/${id}`, { method: 'DELETE' }),
  duplicateProduct: (id) => request(`/products/${id}/duplicate`, { method: 'POST' }),
  recentSales: () => request('/sales/recent'),
  createSale: (payload) => request('/sales', { method: 'POST', body: JSON.stringify(payload) }),
  mySales: () => request('/sales/my'),
  deleteSale: (id) => request(`/sales/${id}`, { method: 'DELETE' }),
  activity: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request('/activity' + (qs ? `?${qs}` : ''));
  },
  shopSales: (shopId) => request(`/sales/shop/${shopId}`),
  updateSaleStatus: (id, status) =>
    request(`/sales/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
  livreurSales: (shopCode) => request('/sales/livreur' + (shopCode ? `?shop_code=${encodeURIComponent(shopCode)}` : '')),
  deliverSale: (id, payload) => request(`/sales/${id}/deliver`, { method: 'POST', body: JSON.stringify(payload) }),
  deleteDeliveredSale: (id) => request(`/sales/${id}/delivered`, { method: 'DELETE' }),
  deleteReferralSale: (id) => request(`/sales/${id}/referral`, { method: 'DELETE' }),
  saleProof: (id) => request(`/sales/${id}/proof`),
  shopCode: () => request('/shop/code'),
  createShopCode: () => request('/shop/code', { method: 'POST' }),
  salePaymentMethods: (id, target) => request(`/sales/${id}/payment-methods${target ? `?target=${encodeURIComponent(target)}` : ''}`),
  paySale: (id, payload) => request(`/sales/${id}/pay`, { method: 'POST', body: JSON.stringify(payload) }),
  payReferral: (id, payload) => request(`/sales/${id}/pay-referral`, { method: 'POST', body: JSON.stringify(payload) }),
  claimSale: (id) => request(`/sales/${id}/claim`, { method: 'POST' }),
  claimReferral: (id) => request(`/sales/${id}/claim-referral`, { method: 'POST' }),
  groupedClaim: (kind, shopId) => request('/sales/grouped-claim', { method: 'POST', body: JSON.stringify({ kind, shop_id: shopId }) }),
  groupedPay: (kind, sellerId, proof) => request('/sales/grouped-pay', { method: 'POST', body: JSON.stringify({ kind, seller_id: sellerId, proof }) }),
  getSellerCode: () => request('/auth/seller-code'),
  createSellerCode: () => request('/auth/seller-code', { method: 'POST' }),
  getPaymentMethods: () => request('/seller/payment-methods'),
  updatePaymentMethods: (payload) => request('/seller/payment-methods', { method: 'PUT', body: JSON.stringify(payload) }),
  shopPaymentMethods: (id) => request(`/shop/${id}/payment-methods`),
  getShopPaymentMethods: () => request('/shop/payment-methods'),
  updateShopPaymentMethods: (payload) => request('/shop/payment-methods', { method: 'PUT', body: JSON.stringify(payload) }),
  purchaseCreate: (payload) => request('/purchases', { method: 'POST', body: JSON.stringify(payload) }),
  purchasesMy: () => request('/purchases/my'),
  notifications: () => request('/notifications'),
  notificationsRead: () => request('/notifications/read', { method: 'POST' }),
  deleteNotification: (id) => request(`/notifications/${id}`, { method: 'DELETE' }),
  pushKey: () => request('/push/key'),
  pushSubscribe: (payload) => request('/push/subscribe', { method: 'POST', body: JSON.stringify(payload) }),
  pushUnsubscribe: (payload) => request('/push/unsubscribe', { method: 'POST', body: JSON.stringify(payload) }),
  listOffers: () => request('/offers'),
  myOffers: () => request('/offers/mine'),
  getOffer: (id) => request(`/offers/${id}`),
  createOffer: (payload) => request('/offers', { method: 'POST', body: JSON.stringify(payload) }),
  deleteOffer: (id) => request(`/offers/${id}`, { method: 'DELETE' }),
  createOrder: (payload) => request('/orders', { method: 'POST', body: JSON.stringify(payload) }),
  myOrders: () => request('/orders/me'),
  productReviews: (id) => request(`/reviews/product/${id}`),
  createReview: (payload) => request('/reviews', { method: 'POST', body: JSON.stringify(payload) }),
  shop: (id) => request(`/shop/${id}`),
  trackSale: (id, code) => request(`/sales/track/${id}?code=${encodeURIComponent(code)}`),
  cancelSale: (id, code) => request(`/sales/${id}/cancel`, { method: 'POST', body: JSON.stringify({ code }) }),
  exportSales: () => request('/sales/export'),
  adminPass: (password) => adminRequest('/admin/pass', { method: 'POST', body: JSON.stringify({ password }) }),
  adminStats: () => adminRequest('/admin/stats'),
  adminTransactions: () => adminRequest('/admin/transactions'),
  adminUsers: (search = '') => adminRequest('/admin/users' + (search ? `?search=${encodeURIComponent(search)}` : '')),
  adminSetVerified: (id, verified) =>
    adminRequest(`/admin/users/${id}/verified`, { method: 'PATCH', body: JSON.stringify({ verified }) }),
  adminProducts: () => adminRequest('/admin/products'),
  adminDeleteProduct: (id) => adminRequest(`/admin/products/${id}`, { method: 'DELETE' }),
  adminMessages: () => adminRequest('/admin/messages'),
  adminSendMessage: (payload) => adminRequest('/admin/messages', { method: 'POST', body: JSON.stringify(payload) }),
  adminLogs: (limit = 100) => adminRequest(`/logs/list?limit=${limit}`),
  popupMessage: () => request('/messages/popup'),
  ackMessage: (id) => request(`/messages/${id}/ack`, { method: 'POST' }),
  chat: (payload) => request('/chat', { method: 'POST', body: JSON.stringify(payload) }),
};
