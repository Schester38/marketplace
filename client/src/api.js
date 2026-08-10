const API = '/api';

async function request(path, options = {}) {
  const token = localStorage.getItem('token');
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(API + path, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Erreur ${res.status}`);
  return data;
}

export const api = {
  register: (payload) => request('/auth/register', { method: 'POST', body: JSON.stringify(payload) }),
  login: (payload) => request('/auth/login', { method: 'POST', body: JSON.stringify(payload) }),
  otpRequest: (payload) => request('/auth/otp/request', { method: 'POST', body: JSON.stringify(payload) }),
  otpVerify: (payload) => request('/auth/otp/verify', { method: 'POST', body: JSON.stringify(payload) }),
  me: () => request('/auth/me'),
  updateProfile: (payload) => request('/auth/me', { method: 'PUT', body: JSON.stringify(payload) }),
  changePassword: (payload) => request('/auth/password', { method: 'PUT', body: JSON.stringify(payload) }),
  deleteAccount: (payload) => request('/auth/me', { method: 'DELETE', body: JSON.stringify(payload) }),
  listProducts: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request('/products' + (qs ? `?${qs}` : ''));
  },
  getProduct: (id) => request(`/products/${id}`),
  myProducts: () => request('/products/mine'),
  createProduct: (payload) => request('/products', { method: 'POST', body: JSON.stringify(payload) }),
  updateProduct: (id, payload) => request(`/products/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  deleteProduct: (id) => request(`/products/${id}`, { method: 'DELETE' }),
  createSale: (payload) => request('/sales', { method: 'POST', body: JSON.stringify(payload) }),
  mySales: () => request('/sales/my'),
  shopSales: (shopId) => request(`/sales/shop/${shopId}`),
  updateSaleStatus: (id, status) =>
    request(`/sales/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
  livreurSales: () => request('/sales/livreur'),
  deliverSale: (id, payload) => request(`/sales/${id}/deliver`, { method: 'POST', body: JSON.stringify(payload) }),
  getSellerCode: () => request('/auth/seller-code'),
  createSellerCode: () => request('/auth/seller-code', { method: 'POST' }),
  getPaymentMethods: () => request('/seller/payment-methods'),
  updatePaymentMethods: (payload) => request('/seller/payment-methods', { method: 'PUT', body: JSON.stringify(payload) }),
  purchaseCreate: (payload) => request('/purchases', { method: 'POST', body: JSON.stringify(payload) }),
  purchasesMy: () => request('/purchases/my'),
  notifications: () => request('/notifications'),
  notificationsRead: () => request('/notifications/read', { method: 'POST' }),
  listOffers: () => request('/offers'),
  getOffer: (id) => request(`/offers/${id}`),
  createOffer: (payload) => request('/offers', { method: 'POST', body: JSON.stringify(payload) }),
  deleteOffer: (id) => request(`/offers/${id}`, { method: 'DELETE' }),
  createOrder: (payload) => request('/orders', { method: 'POST', body: JSON.stringify(payload) }),
  myOrders: () => request('/orders/me'),
};
