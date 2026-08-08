import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import ProductCard, { formatMoney } from '../components/ProductCard.jsx';
import { countrySymbol } from '../config.js';
import Seo from '../components/Seo.jsx';

export default function SellerDashboard() {
  const [products, setProducts] = useState([]);
  const [sales, setSales] = useState([]);
  const [stats, setStats] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [saleForm, setSaleForm] = useState(null);

  const load = async () => {
    try {
      const [prodData, saleData] = await Promise.all([api.listProducts(), api.mySales()]);
      setProducts(prodData.products);
      setSales(saleData.sales);
      setStats(saleData.stats);
    } catch (e) {
      setError(e.message);
    }
  };

  useEffect(() => { load(); }, []);

  const submitSale = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    try {
      await api.createSale({
        product_id: saleForm.product.id,
        buyer_name: saleForm.buyer_name,
        buyer_phone: saleForm.buyer_phone,
        quantity: Number(saleForm.quantity),
      });
      setSaleForm(null);
      setSuccess('Vente enregistrée. Commission créditée sur votre compte.');
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <main className="container">
      <Seo title="Mon espace vendeur — Mboppi" description="Suivez vos ventes et vos commissions sur Mboppi." />
      <section className="dash-header">
        <div>
          <h1>Mon espace vendeur</h1>
          <p>Sélectionnez un produit des boutiques et enregistrez une vente.</p>
        </div>
      </section>

      {stats && (
        <section className="card stats">
          <div className="stats-row">
            <div><span className="label">Ventes réalisées</span><strong>{stats.total_sales}</strong></div>
            <div><span className="label">Commission totale générée</span><strong>{formatMoney(stats.total_commission)} {countrySymbol(user?.country)}</strong></div>
            <div><span className="label">Commission confirmée</span><strong>{formatMoney(stats.earned_commission)} {countrySymbol(user?.country)}</strong></div>
          </div>
        </section>
      )}

      {saleForm && (
        <div className="card form-card">
          <h2>Vendre : {saleForm.product.name}</h2>
          <p className="hint">
            Prix : {formatMoney(saleForm.product.price)} {countrySymbol(saleForm.product.shop_country)} — Votre commission :{' '}
            {formatMoney(saleForm.product.commission)} {countrySymbol(saleForm.product.shop_country)} par unité
          </p>
          <form onSubmit={submitSale}>
            <label>Nom de l'acheteur *</label>
            <input className="input" required value={saleForm.buyer_name || ''} onChange={(e) => setSaleForm({ ...saleForm, buyer_name: e.target.value })} />
            <label>Téléphone (optionnel)</label>
            <input className="input" value={saleForm.buyer_phone || ''} onChange={(e) => setSaleForm({ ...saleForm, buyer_phone: e.target.value })} />
            <label>Quantité</label>
            <input className="input" type="number" min="1" value={saleForm.quantity || 1} onChange={(e) => setSaleForm({ ...saleForm, quantity: e.target.value })} />
            {error && <p className="error">{error}</p>}
            <div className="row2">
              <button className="btn btn-primary">Enregistrer la vente</button>
              <button type="button" className="btn btn-outline" onClick={() => setSaleForm(null)}>Annuler</button>
            </div>
          </form>
        </div>
      )}

      {success && <p className="success">{success}</p>}
      {error && <p className="error">{error}</p>}

      {products.length === 0 ? (
        <p className="empty">Aucun produit disponible à vendre pour le moment.</p>
      ) : (
        <div className="grid">
          {products.map((p) => (
            <ProductCard
              key={p.id}
              product={p}
              showCommission
              action="Vendre ce produit"
              onAction={() => setSaleForm({ product: p, buyer_name: '', buyer_phone: '', quantity: 1 })}
            />
          ))}
        </div>
      )}

      <section className="card stats">
        <h2>Mes ventes et commissions</h2>
        {sales.length === 0 ? (
          <p className="empty">Vous n'avez pas encore enregistré de vente.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Produit</th>
                <th>Boutique</th>
                <th>Acheteur</th>
                <th>Qté</th>
                <th>Total</th>
                <th>Commission</th>
                <th>Statut</th>
              </tr>
            </thead>
            <tbody>
              {sales.map((s) => (
                <tr key={s.id}>
                  <td>{s.product_name}</td>
                  <td>{s.shop_name}</td>
                  <td>{s.buyer_name}</td>
                  <td>{s.quantity}</td>
                  <td>{formatMoney(s.total_price)} {countrySymbol(s.shop_country)}</td>
                  <td>{formatMoney(s.commission)} {countrySymbol(s.shop_country)}</td>
                  <td><span className={`badge badge-${s.status}`}>{s.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}
