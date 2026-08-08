import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import ProductCard from '../components/ProductCard.jsx';
import { formatMoney } from '../components/ProductCard.jsx';
import Seo from '../components/Seo.jsx';
import { useAuth } from '../App.jsx';
import { compressImage } from '../utils.js';
import { PRODUCT_CATEGORIES, countryPhone, countrySymbol } from '../config.js';
import { useLang } from '../i18n.jsx';

const EMPTY_FORM = {
  name: '',
  description: '',
  category: '',
  warranty: '',
  delivery_fee: '',
  contact: '',
  quantity: '',
  price: '',
  commission_percent: '',
  photos: [],
};
const MAX_PHOTOS = 3;

export default function ShopDashboard() {
  const { user } = useAuth();
  const { t } = useLang();
  const [products, setProducts] = useState([]);
  const [sales, setSales] = useState([]);
  const [stats, setStats] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [showForm, setShowForm] = useState(false);
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

  const submitProduct = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    try {
      await api.createProduct({
        ...form,
        price: Number(form.price),
        commission_percent: Number(form.commission_percent || 0),
        delivery_fee: Number(form.delivery_fee || 0),
        quantity: Number(form.quantity || 1),
        warranty: form.warranty === '' ? null : Number(form.warranty),
        contact: form.contact ? `${prefix}${form.contact.trim()}` : '',
      });
      setForm(EMPTY_FORM);
      setShowForm(false);
      setSuccess(t('Produit publié avec succès.'));
      load();
    } catch (err) {
      setError(err.message);
    }
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
        <button
          className="btn btn-primary"
          disabled={!remaining}
          onClick={() => setShowForm(!showForm)}
        >
          {showForm ? t('Annuler') : t('+ Ajouter un produit')}
        </button>
      </section>

      {showForm && (
        <div className="card form-card">
          <h2>{t('Nouveau produit')}</h2>
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
                <label>{t('Garantie (en mois)')}</label>
                <input className="input" type="number" min="0" placeholder="ex : 6" value={form.warranty} onChange={(e) => setForm({ ...form, warranty: e.target.value })} />
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
                <label>{t('Prix de vente ({symbol}) *', { symbol })}</label>
                <input className="input" type="number" min="0" step="0.01" required value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
              </div>
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
              action="Rétirer"
              onAction={() => removeProduct(p.id)}
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
          <table className="table">
            <thead>
              <tr>
                <th>{t('Produit')}</th>
                <th>{t('Vendeur')}</th>
                <th>{t('Acheteur')}</th>
                <th>{t('Qté')}</th>
                <th>{t('Total')}</th>
                <th>{t('Commission')}</th>
                <th>{t('Statut')}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {sales.map((s) => (
                <tr key={s.id}>
                  <td>{s.product_name}</td>
                  <td>{s.seller_name}</td>
                  <td>{s.buyer_name}</td>
                  <td>{s.quantity}</td>
                  <td>{formatMoney(s.total_price)} {countrySymbol(s.shop_country)}</td>
                  <td>{formatMoney(s.commission)} {countrySymbol(s.shop_country)}</td>
                  <td>
                    <span className={`badge badge-${s.status}`}>{s.status}</span>
                  </td>
                  <td>
                    {s.status === 'pending' && (
                      <>
                        <button className="btn btn-small" onClick={() => changeStatus(s.id, 'confirmed')}>{t('Confirmer')}</button>{' '}
                        <button className="btn btn-small btn-danger" onClick={() => changeStatus(s.id, 'cancelled')}>{t('Annuler')}</button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}
