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
  me: () => request('/auth/me'),
  listProducts: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request('/products' + (qs ? `?${qs}` : ''));
  },
  myProducts: () => request('/products/mine'),
  createProduct: (payload) => request('/products', { method: 'POST', body: JSON.stringify(payload) }),
  deleteProduct: (id) => request(`/products/${id}`, { method: 'DELETE' }),
  createSale: (payload) => request('/sales', { method: 'POST', body: JSON.stringify(payload) }),
  mySales: () => request('/sales/my'),
  shopSales: (shopId) => request(`/sales/shop/${shopId}`),
  updateSaleStatus: (id, status) =>
    request(`/sales/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
  listOffers: () => request('/offers'),
  getOffer: (id) => request(`/offers/${id}`),
  createOffer: (payload) => request('/offers', { method: 'POST', body: JSON.stringify(payload) }),
  deleteOffer: (id) => request(`/offers/${id}`, { method: 'DELETE' }),
};
