import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import ProductCard from '../components/ProductCard.jsx';
import { formatMoney } from '../components/ProductCard.jsx';
import { downloadInvoice } from '../components/Invoice.jsx';
import Seo from '../components/Seo.jsx';
import { useAuth } from '../App.jsx';
import { compressImage } from '../utils.js';
import { PRODUCT_CATEGORIES, countryPhone, countrySymbol } from '../config.js';
import { useLang } from '../i18n.jsx';
import { useRefreshOnFocus } from '../useRefreshOnFocus.js';

const EMPTY_FORM = {
  name: '',
  description: '',
  category: '',
  warranty: '',
  delivery_fee: '',
  contact: '',
  quantity: '',
  price: '',
  old_price: '',
  commission_percent: '',
  photos: [],
};
const MAX_PHOTOS = 3;

const SALE_STATUS = {
  pending: { key: 'En attente de vente', cls: 'badge-pending' },
  bought: { key: 'Acheté', cls: 'badge-bought' },
  confirmed: { key: 'Confirmée', cls: 'badge-confirmed' },
  delivered: { key: 'Livré', cls: 'badge-bought' },
  cancelled: { key: 'Annulée', cls: 'badge-cancelled' },
};

export default function ShopDashboard() {
  const { user } = useAuth();
  const { t } = useLang();
  const [products, setProducts] = useState([]);
  const [sales, setSales] = useState([]);
  const [stats, setStats] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [showDelivered, setShowDelivered] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [picking, setPicking] = useState(false);
  const symbol = countrySymbol(user?.country);
  const prefix = countryPhone(user?.country);

  const addPhotos = async (files) => {
    const list = Array.from(files || []);
    if (!list.length) return;
    setPicking(true);
    try {
      const remaining = MAX_PHOTOS - form.photos.length;
      const batch = list.slice(0, remaining);
      const compressed = await Promise.all(batch.map((f) => compressImage(f)));
      setForm((f) => ({ ...f, photos: [...f.photos, ...compressed].slice(0, MAX_PHOTOS) }));
    } finally {
      setPicking(false);
    }
  };

  const removePhoto = (i) => {
    setForm((f) => ({ ...f, photos: f.photos.filter((_, idx) => idx !== i) }));
  };

  const load = async () => {
    try {
      const [prodData, saleData] = await Promise.all([
        api.myProducts(),
        api.shopSales(user.id),
      ]);
      setProducts(prodData.products);
      setSales(saleData.sales);
      setStats(saleData.stats);
    } catch (e) {
      setError(e.message);
    }
  };

  useEffect(() => { load(); }, []);

  useRefreshOnFocus(load);

  const submitProduct = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    const priceNum = form.price === '' ? null : Number(form.price);
    const oldNum = form.old_price === '' ? null : Number(form.old_price);
    if (priceNum === null && oldNum === null) {
      setError(t('Renseignez au moins un prix (normal ou de vente).'));
      return;
    }
    if (priceNum !== null && !Number.isFinite(priceNum) || priceNum !== null && priceNum < 0 || oldNum !== null && !Number.isFinite(oldNum) || oldNum !== null && oldNum < 0) {
      setError(t('Prix invalide'));
      return;
    }
    const payload = {
      ...form,
      price: priceNum !== null ? priceNum : oldNum,
      old_price: priceNum !== null ? oldNum : null,
      commission_percent: Number(form.commission_percent || 0),
      delivery_fee: Number(form.delivery_fee || 0),
      quantity: Number(form.quantity || 1),
      warranty: form.warranty.trim() || null,
      contact: form.contact ? `${prefix}${form.contact.trim()}` : '',
    };
    try {
      if (editingId) {
        await api.updateProduct(editingId, payload);
        setSuccess(t('Produit mis à jour !'));
      } else {
        await api.createProduct(payload);
        setSuccess(t('Produit publié avec succès.'));
      }
      setForm(EMPTY_FORM);
      setEditingId(null);
      setShowForm(false);
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const editProduct = (p) => {
    const currentPrefix = countryPhone(user?.country);
    const contact = p.contact && p.contact.startsWith(currentPrefix)
      ? p.contact.slice(currentPrefix.length)
      : (p.contact || '');
    setForm({
      name: p.name || '',
      description: p.description || '',
      category: p.category || '',
      warranty: p.warranty || '',
      delivery_fee: p.delivery_fee != null ? String(p.delivery_fee) : '',
      contact,
      quantity: p.quantity != null ? String(p.quantity) : '',
      price: p.price != null ? String(p.price) : '',
      old_price: p.old_price != null ? String(p.old_price) : '',
      commission_percent: p.commission_percent != null ? String(p.commission_percent) : '',
      photos: Array.isArray(p.photos) && p.photos.length ? p.photos : p.image ? [p.image] : [],
    });
    setEditingId(p.id);
    setShowForm(true);
    setError('');
    setSuccess('');
  };

  const removeProduct = async (id) => {
    if (!window.confirm(t('Supprimer ce produit ?'))) return;
    try {
      await api.deleteProduct(id);
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const changeStatus = async (id, status) => {
    try {
      await api.updateSaleStatus(id, status);
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const deliveredSales = sales.filter((s) => s.status === 'delivered');

  const remaining = (products?.length ?? 0) < 5;

  return (
    <main className="container">
      <Seo title={t('Ma boutique') + ' — Mboppi'} description={t('Gérez vos produits et suivez vos ventes.')} />
      <section className="dash-header">
        <div>
          <h1>{t('Ma boutique')}</h1>
          <p>
            {t('Produits publiés : {n} / 5', { n: products.length })}
            {products.length >= 5 && <span className="badge badge-warn">{t('Limite atteinte')}</span>}
          </p>
        </div>
        <div className="row2 dash-actions">
          <button
            className={`btn ${showDelivered ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => setShowDelivered(!showDelivered)}
          >
            🛵 {t('Livreur')} {deliveredSales.length > 0 ? `(${deliveredSales.length})` : ''}
          </button>
          <button
            className="btn btn-primary"
            disabled={!remaining && !showForm}
            onClick={() => {
              if (showForm) { setForm(EMPTY_FORM); setEditingId(null); }
              setShowForm(!showForm);
            }}
          >
            {showForm ? t('Annuler') : t('+ Ajouter un produit')}
          </button>
        </div>
      </section>

      {showDelivered && (
        <section className="card stats" id="facture-livree">
          <h2>🧾 {t('Facture livrée')}</h2>
          {deliveredSales.length === 0 ? (
            <p className="empty">{t('Aucune vente livrée pour le moment.')}</p>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>{t('Produit')}</th>
                    <th>{t('Vendeur')}</th>
                    <th>{t('Acheteur')}</th>
                    <th>{t('Total')}</th>
                    <th>{t('Livré le')}</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {deliveredSales.map((s) => (
                    <tr key={s.id}>
                      <td>{s.product_name}</td>
                      <td>{s.seller_name}</td>
                      <td>{s.buyer_name || '—'}</td>
                      <td>{formatMoney(Number(s.total_price || 0) + Number(s.delivery_fee || 0))} {countrySymbol(s.shop_country)}</td>
                      <td>{s.delivered_at ? new Date(s.delivered_at).toLocaleDateString() : '—'}</td>
                      <td>
                        <button className="btn btn-small" onClick={() => downloadInvoice(s, t, countrySymbol(s.shop_country))}>
                          🧾 {t('Voir la facture')}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {showForm && (
        <div className="card form-card">
          <h2>{editingId ? t('Modifier le produit') : t('Nouveau produit')}</h2>
          <form onSubmit={submitProduct}>
            <label>{t('Photos (maximum {n})', { n: MAX_PHOTOS })}</label>
            <div className="photo-input">
              <label className="photo-picker">
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  hidden
                  disabled={picking || form.photos.length >= MAX_PHOTOS}
                  onChange={(e) => addPhotos(e.target.files)}
                />
                {picking ? t('Compression…') : form.photos.length >= MAX_PHOTOS ? t('Photos complètes') : t('📷 Ajouter des photos')}
              </label>
              <div className="photo-previews">
                {form.photos.map((photo, i) => (
                  <div key={i} className="photo-thumb">
                    <img src={photo} alt={`${t('Photo')} ${i + 1}`} />
                    <button type="button" className="photo-remove" onClick={() => removePhoto(i)}>✕</button>
                  </div>
                ))}
              </div>
            </div>
            <label>{t('Nom du produit *')}</label>
            <input className="input" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />

            <label>{t('Catégorie *')}</label>
            <select
              className="input"
              required
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
            >
              <option value="" disabled>{t('Choisir une catégorie…')}</option>
              {PRODUCT_CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>

            <label>{t('Description')}</label>
            <textarea className="input" rows="2" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />

            <div className="row2">
              <div>
                <label>{t('Garantie (chiffres ou lettres)')}</label>
                <input className="input" placeholder={t('ex : 6 mois, 1 an, 2 ans')} value={form.warranty} onChange={(e) => setForm({ ...form, warranty: e.target.value })} />
              </div>
              <div>
                <label>{t('Quantité en stock *')}</label>
                <input className="input" type="number" min="1" required value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} />
              </div>
            </div>

            <div className="row2">
              <div>
                <label>{t('Frais de livraison ({symbol})', { symbol })}</label>
                <input className="input" type="number" min="0" step="0.01" placeholder="ex : 1000" value={form.delivery_fee} onChange={(e) => setForm({ ...form, delivery_fee: e.target.value })} />
              </div>
              <div>
                <label>{t('Contact de la boutique')}</label>
                <div className="phone-input">
                  <span className="phone-prefix">{prefix}</span>
                  <input
                    className="input"
                    type="tel"
                    placeholder="ex : 6 90 00 00 00"
                    value={form.contact}
                    onChange={(e) => setForm({ ...form, contact: e.target.value.replace(/\D/g, '') })}
                  />
                </div>
              </div>
            </div>

            <div className="row2">
              <div>
                <label>{t('Prix normal ({symbol})', { symbol })}</label>
                <input className="input" type="number" min="0" step="0.01" placeholder={t('ex : 5000 (s\'affiche barré)')} value={form.old_price} onChange={(e) => setForm({ ...form, old_price: e.target.value })} />
              </div>
              <div>
                <label>{t('Prix de vente ({symbol}) *', { symbol })}</label>
                <input className="input" type="number" min="0" step="0.01" placeholder={t('ex : 3500 (s\'affiche en vert)')} value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
              </div>
            </div>
            <div className="row2">
              <div>
                <label>{t('Commission vendeur (%) *')}</label>
                <input className="input" type="number" min="0" max="100" step="0.1" required value={form.commission_percent} onChange={(e) => setForm({ ...form, commission_percent: e.target.value })} />
              </div>
            </div>
            {form.price && form.commission_percent ? (
              <p className="hint">
                {t('Le vendeur affichera : {price} {symbol} et gagnera {commission} {symbol} de commission.', {
                  price: formatMoney(form.price),
                  symbol,
                  commission: formatMoney(form.price * (Number(form.commission_percent) / 100)),
                })}
              </p>
            ) : null}
            {error && <p className="error">{error}</p>}
            <button className="btn btn-primary btn-block">{t('Publier le produit')}</button>
          </form>
        </div>
      )}

      {success && <p className="success">{success}</p>}
      {error && <p className="error">{error}</p>}

      {products.length === 0 ? (
        <p className="empty">{t('Aucun produit pour le moment. Ajoutez votre premier produit (max 5).')}</p>
      ) : (
        <div className="grid">
          {products.map((p) => (
            <ProductCard
              key={p.id}
              product={p}
              action="Modifier"
              onAction={() => editProduct(p)}
              secondaryAction="Rétirer"
              onSecondaryAction={() => removeProduct(p.id)}
            />
          ))}
        </div>
      )}

      <section className="card stats">
        <h2>{t('Statistiques des ventes')}</h2>
        {stats ? (
          <div className="stats-row">
            <div><span className="label">{t('Ventes enregistrées')}</span><strong>{stats.total_sales}</strong></div>
            <div><span className="label">{t('Chiffre d\'affaires')}</span><strong>{formatMoney(stats.revenue)} {symbol}</strong></div>
            <div><span className="label">{t('Commissions versées aux vendeurs')}</span><strong>{formatMoney(stats.total_commission)} {symbol}</strong></div>
          </div>
        ) : null}

        {sales.length === 0 ? (
          <p className="empty">{t('Aucune vente enregistrée par les vendeurs.')}</p>
        ) : (
          <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>{t('Produit')}</th>
                <th>{t('Vendeur')}</th>
                <th>{t('Code vendeur')}</th>
                <th>{t('Acheteur')}</th>
                <th>{t('Qté')}</th>
                <th>{t('Total')}</th>
                <th>{t('Prix payé')}</th>
                <th>{t('Commission')}</th>
                <th>{t('Statut')}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {sales.map((s) => {
                const st = SALE_STATUS[s.status] || SALE_STATUS.pending;
                return (
                  <tr key={s.id}>
                    <td>{s.product_name}</td>
                    <td>{s.seller_name}</td>
                    <td><code className="seller-code-inline">{s.seller_code || '—'}</code></td>
                    <td>{s.buyer_name || '—'}</td>
                    <td>{s.quantity}</td>
                    <td>{formatMoney(s.total_price)} {countrySymbol(s.shop_country)}</td>
                    <td>{s.purchase_price != null ? `${formatMoney(s.purchase_price)} ${countrySymbol(s.shop_country)}` : '—'}</td>
                    <td>{formatMoney(s.commission)} {countrySymbol(s.shop_country)}</td>
                    <td>
                      <span className={`badge ${st.cls}`}>{t(st.key)}</span>
                    </td>
                    <td>
                      {s.status === 'pending' && (
                        <button className="btn btn-small btn-danger" onClick={() => changeStatus(s.id, 'cancelled')}>{t('Annuler')}</button>
                      )}
                      {s.status === 'delivered' && (
                        <button className="btn btn-small" onClick={() => downloadInvoice(s, t, countrySymbol(s.shop_country))}>
                          🧾 {t('Facture')}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        )}
      </section>
    </main>
  );
}
