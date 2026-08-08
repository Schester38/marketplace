import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import ProductCard from '../components/ProductCard.jsx';
import { formatMoney } from '../components/ProductCard.jsx';
import Seo from '../components/Seo.jsx';
import { useAuth } from '../App.jsx';
import { compressImage } from '../utils.js';
import { PRODUCT_CATEGORIES } from '../config.js';

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
  const [products, setProducts] = useState([]);
  const [sales, setSales] = useState([]);
  const [stats, setStats] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [picking, setPicking] = useState(false);

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
      });
      setForm(EMPTY_FORM);
      setShowForm(false);
      setSuccess('Produit publié avec succès.');
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const removeProduct = async (id) => {
    if (!window.confirm('Supprimer ce produit ?')) return;
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
      <Seo title="Ma boutique — Mboppi" description="Gérez vos produits et suivez vos ventes sur Mboppi." />
      <section className="dash-header">
        <div>
          <h1>Ma boutique</h1>
          <p>
            Produits publiés : <strong>{products.length} / 5</strong>
            {products.length >= 5 && <span className="badge badge-warn">Limite atteinte</span>}
          </p>
        </div>
        <button
          className="btn btn-primary"
          disabled={!remaining}
          onClick={() => setShowForm(!showForm)}
        >
          {showForm ? 'Annuler' : '+ Ajouter un produit'}
        </button>
      </section>

      {showForm && (
        <div className="card form-card">
          <h2>Nouveau produit</h2>
          <form onSubmit={submitProduct}>
            <label>Photos (maximum {MAX_PHOTOS})</label>
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
                {picking ? 'Compression…' : form.photos.length >= MAX_PHOTOS ? 'Photos complètes' : '📷 Ajouter des photos'}
              </label>
              <div className="photo-previews">
                {form.photos.map((photo, i) => (
                  <div key={i} className="photo-thumb">
                    <img src={photo} alt={`Photo ${i + 1}`} />
                    <button type="button" className="photo-remove" onClick={() => removePhoto(i)}>✕</button>
                  </div>
                ))}
              </div>
            </div>
            <label>Nom du produit *</label>
            <input className="input" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />

            <label>Catégorie *</label>
            <select
              className="input"
              required
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
            >
              <option value="" disabled>Choisir une catégorie…</option>
              {PRODUCT_CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>

            <label>Description</label>
            <textarea className="input" rows="2" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />

            <div className="row2">
              <div>
                <label>Garantie (en mois)</label>
                <input className="input" type="number" min="0" placeholder="ex : 6" value={form.warranty} onChange={(e) => setForm({ ...form, warranty: e.target.value })} />
              </div>
              <div>
                <label>Quantité en stock *</label>
                <input className="input" type="number" min="1" required value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} />
              </div>
            </div>

            <div className="row2">
              <div>
                <label>Frais de livraison (F)</label>
                <input className="input" type="number" min="0" step="0.01" placeholder="ex : 1000" value={form.delivery_fee} onChange={(e) => setForm({ ...form, delivery_fee: e.target.value })} />
              </div>
              <div>
                <label>Contact de la boutique</label>
                <input className="input" type="tel" placeholder="ex : 07 00 00 00 00" value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })} />
              </div>
            </div>

            <div className="row2">
              <div>
                <label>Prix de vente (F) *</label>
                <input className="input" type="number" min="0" step="0.01" required value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
              </div>
              <div>
                <label>Commission vendeur (%) *</label>
                <input className="input" type="number" min="0" max="100" step="0.1" required value={form.commission_percent} onChange={(e) => setForm({ ...form, commission_percent: e.target.value })} />
              </div>
            </div>
            {form.price && form.commission_percent ? (
              <p className="hint">
                Le vendeur affichera : <strong>{formatMoney(form.price)} F</strong> et gagnera{' '}
                <strong>{formatMoney(form.price * (Number(form.commission_percent) / 100))} F</strong> de commission.
              </p>
            ) : null}
            {error && <p className="error">{error}</p>}
            <button className="btn btn-primary btn-block">Publier le produit</button>
          </form>
        </div>
      )}

      {success && <p className="success">{success}</p>}
      {error && <p className="error">{error}</p>}

      {products.length === 0 ? (
        <p className="empty">Aucun produit pour le moment. Ajoutez votre premier produit (max 5).</p>
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
        <h2>Statistiques des ventes</h2>
        {stats ? (
          <div className="stats-row">
            <div><span className="label">Ventes enregistrées</span><strong>{stats.total_sales}</strong></div>
            <div><span className="label">Chiffre d'affaires</span><strong>{formatMoney(stats.revenue)} F</strong></div>
            <div><span className="label">Commissions versées aux vendeurs</span><strong>{formatMoney(stats.total_commission)} F</strong></div>
          </div>
        ) : null}

        {sales.length === 0 ? (
          <p className="empty">Aucune vente enregistrée par les vendeurs.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Produit</th>
                <th>Vendeur</th>
                <th>Acheteur</th>
                <th>Qté</th>
                <th>Total</th>
                <th>Commission</th>
                <th>Statut</th>
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
                  <td>{formatMoney(s.total_price)} F</td>
                  <td>{formatMoney(s.commission)} F</td>
                  <td>
                    <span className={`badge badge-${s.status}`}>{s.status}</span>
                  </td>
                  <td>
                    {s.status === 'pending' && (
                      <>
                        <button className="btn btn-small" onClick={() => changeStatus(s.id, 'confirmed')}>Confirmer</button>{' '}
                        <button className="btn btn-small btn-danger" onClick={() => changeStatus(s.id, 'cancelled')}>Annuler</button>
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
