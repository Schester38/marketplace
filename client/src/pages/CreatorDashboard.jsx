import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import ProductCard, { formatMoney } from '../components/ProductCard.jsx';
import Seo from '../components/Seo.jsx';
import { useAuth } from '../App.jsx';
import { compressImage, thumbFromDataUrl } from '../utils.js';
import { countryPhone, countrySymbol } from '../config.js';
import { useLang } from '../i18n.jsx';
import { useRefreshOnFocus } from '../useRefreshOnFocus.js';

const EMPTY_FORM = {
  name: '',
  description: '',
  warranty: '',
  delivery_fee: '',
  contact: '',
  quantity: '1',
  price: '',
  old_price: '',
  commission_percent: '0',
  photos: [],
};
const MAX_PHOTOS = 3;

export default function CreatorDashboard() {
  const { user } = useAuth();
  const { t } = useLang();
  const [products, setProducts] = useState([]);
  const [sales, setSales] = useState([]);
  const [stats, setStats] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [picking, setPicking] = useState(false);
  const [proofSale, setProofSale] = useState(null);
  const [proofLoading, setProofLoading] = useState(false);
  const symbol = countrySymbol(user?.country);
  const prefix = countryPhone(user?.country);

  const openProof = async (s) => {
    setError('');
    setProofLoading(true);
    try {
      const d = await api.saleProof(s.id);
      if (!d.proof) {
        setError(t('Aucune preuve disponible pour cette vente.'));
      } else {
        setProofSale({ sale: s, proof: d.proof });
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setProofLoading(false);
    }
  };

  const addPhotos = async (files) => {
    const list = Array.from(files || []);
    if (!list.length) return;
    setPicking(true);
    try {
      const remaining = MAX_PHOTOS - form.photos.length;
      const batch = list.slice(0, remaining);
      const compressed = await Promise.all(
        batch.map(async (f) => {
          const full = await compressImage(f);
          return { thumb: await thumbFromDataUrl(full), full };
        })
      );
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
        setSuccess(t('Création mise à jour !'));
      } else {
        await api.createProduct(payload);
        setSuccess(t('Création publiée avec succès.'));
      }
      setForm(EMPTY_FORM);
      setEditingId(null);
      setShowForm(false);
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const editProduct = async (p) => {
    const currentPrefix = countryPhone(user?.country);
    const contact = p.contact && p.contact.startsWith(currentPrefix)
      ? p.contact.slice(currentPrefix.length)
      : (p.contact || '');
    let photos = Array.isArray(p.photos) && p.photos.length ? p.photos : [];
    try {
      const detail = await api.getProduct(p.id);
      const fulls = detail.product.photos || [];
      if (fulls.length) {
        const thumbs = Array.isArray(p.photos) ? p.photos : [];
        photos = fulls.map((full, i) => ({ thumb: thumbs[i] || full, full }));
      }
    } catch {
      /* silencieux */
    }
    setForm({
      name: p.name || '',
      description: p.description || '',
      warranty: p.warranty || '',
      delivery_fee: p.delivery_fee != null ? String(p.delivery_fee) : '',
      contact,
      quantity: p.quantity != null ? String(p.quantity) : '1',
      price: p.price != null ? String(p.price) : '',
      old_price: p.old_price != null ? String(p.old_price) : '',
      commission_percent: p.commission_percent != null ? String(p.commission_percent) : '0',
      photos,
    });
    setEditingId(p.id);
    setShowForm(true);
  };

  const removeProduct = async (p) => {
    if (!window.confirm(t('Retirer cette création ?'))) return;
    try {
      await api.deleteProduct(p.id);
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <main className="container">
      <Seo title={t('Mon espace créateur') + ' — Mboppi'} description={t('Publiez et gérez vos créations.')} />
      <section className="dash-header">
        <div>
          <h1>🎨 {t('Mon espace créateur')}</h1>
          <p>{t('Publiez vos créations : elles rejoignent la catégorie Arts & Artisanat du marché.')}</p>
        </div>
        <button
          className="btn btn-primary"
          onClick={() => {
            if (showForm) { setForm(EMPTY_FORM); setEditingId(null); }
            setShowForm(!showForm);
          }}
        >
          {showForm ? t('Annuler') : t('+ Publier une création')}
        </button>
      </section>

      {showForm && (
        <div className="card form-card">
          <h2>{editingId ? t('Modifier la création') : t('Nouvelle création')}</h2>
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
                    <img src={photo.thumb || photo} alt={`${t('Photo')} ${i + 1}`} />
                    <button type="button" className="photo-remove" onClick={() => removePhoto(i)}>✕</button>
                  </div>
                ))}
              </div>
            </div>
            <label>{t('Nom de la création *')}</label>
            <input className="input" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />

            <label>{t('Description')}</label>
            <textarea className="input" rows="2" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />

            <div className="row2">
              <div>
                <label>{t('Quantité en stock *')}</label>
                <input className="input" type="number" min="1" required value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} />
              </div>
              <div>
                <label>{t('Frais de livraison ({symbol})', { symbol })}</label>
                <input className="input" type="number" min="0" step="0.01" placeholder="ex : 1000" value={form.delivery_fee} onChange={(e) => setForm({ ...form, delivery_fee: e.target.value })} />
              </div>
            </div>

            <div className="row2">
              <div>
                <label>{t('Prix de vente ({symbol}) *', { symbol })}</label>
                <input className="input" type="number" min="0" step="any" placeholder="ex : 5000" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
              </div>
              <div>
                <label>{t('Prix normal (barré, optionnel)')}</label>
                <input className="input" type="number" min="0" step="any" placeholder="ex : 6500" value={form.old_price} onChange={(e) => setForm({ ...form, old_price: e.target.value })} />
              </div>
            </div>

            <div className="row2">
              <div>
                <label>{t('Commission pour les vendeurs (%) *')}</label>
                <input className="input" type="number" min="0" max="100" step="any" value={form.commission_percent} onChange={(e) => setForm({ ...form, commission_percent: e.target.value })} />
              </div>
              <div>
                <label>{t('Contact')}</label>
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

            {error && <p className="error">{error}</p>}
            <button className="btn btn-primary btn-block">{editingId ? t('Enregistrer') : t('Publier')}</button>
          </form>
        </div>
      )}

      {success && <p className="success">{success}</p>}
      {error && <p className="error">{error}</p>}

      <section className="card stats">
        <h2>{t('Mes créations')}</h2>
        {products.length === 0 ? (
          <p className="empty">{t('Aucune création publiée pour le moment. Publiez votre première création !')}</p>
        ) : (
          <div className="grid">
            {products.map((p) => (
              <ProductCard
                key={p.id}
                product={p}
                showCommission
                action={t('Modifier')}
                onAction={() => editProduct(p)}
                secondaryAction={t('Rétirer')}
                onSecondaryAction={() => removeProduct(p)}
              />
            ))}
          </div>
        )}
      </section>

      <section className="card stats">
        <h2>{t('Statistiques de mes créations')}</h2>
        {stats ? (
          <div className="stats-row">
            <div><span className="label">{t('Ventes enregistrées')}</span><strong>{stats.total_sales}</strong></div>
            <div><span className="label">{t('Chiffre d\'affaires')}</span><strong>{formatMoney(stats.revenue)} {symbol}</strong></div>
            <div><span className="label">{t('Commissions pour les vendeurs')}</span><strong>{formatMoney(stats.total_commission)} {symbol}</strong></div>
          </div>
        ) : null}
        {sales.length === 0 ? (
          <p className="empty">{t('Aucune vente enregistrée pour le moment.')}</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>{t('Produit')}</th>
                  <th>{t('Vendeur')}</th>
                  <th>{t('Acheteur')}</th>
                  <th>{t('Qté')}</th>
                  <th>{t('Total')}</th>
                  <th>{t('Statut')}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {sales.map((s) => (
                  <tr key={s.id}>
                    <td>{s.product_name}</td>
                    <td>{s.seller_name}</td>
                    <td>{s.buyer_name || '—'}</td>
                    <td>{s.quantity}</td>
                    <td>{formatMoney(s.total_price)} {countrySymbol(s.shop_country)}</td>
                    <td>
                      {s.status === 'pending' && <span className="badge badge-pending">{t('En attente de vente')}</span>}
                      {s.status === 'delivered' && <span className="badge badge-bought">{t('Livré')}</span>}
                      {!['pending', 'delivered'].includes(s.status) && <span className={`badge badge-${s.status}`}>{t(s.status)}</span>}
                    </td>
                    <td>
                      {s.status === 'delivered' && (
                        <button className="btn btn-small" disabled={proofLoading} onClick={() => openProof(s)}>
                          📷 {t('Preuve')}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {proofSale && (
        <div className="modal-overlay" onClick={() => setProofSale(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>📷 {t('Preuve de paiement')} — {proofSale.sale.product_name}</h3>
              <button className="drawer-close" onClick={() => setProofSale(null)}>✕</button>
            </div>
            {String(proofSale.proof).startsWith('data:video') ? (
              <video src={proofSale.proof} controls style={{ width: '100%', borderRadius: 10, maxHeight: 420 }} />
            ) : (
              <img
                src={proofSale.proof}
                alt={t('Preuve de paiement')}
                style={{ width: '100%', borderRadius: 10, maxHeight: 420, objectFit: 'contain' }}
              />
            )}
            <p className="hint" style={{ marginBottom: 0 }}>
              {t('Preuve fournie par la boutique lors du paiement de la commission.')}
            </p>
          </div>
        </div>
      )}
    </main>
  );
}
