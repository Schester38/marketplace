import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import ProductCard, { formatMoney } from '../components/ProductCard.jsx';
import { countrySymbol } from '../config.js';
import Seo from '../components/Seo.jsx';
import { useAuth } from '../App.jsx';
import { useLang } from '../i18n.jsx';
import { useRefreshOnFocus } from '../useRefreshOnFocus.js';

export default function SellerDashboard() {
  const { user } = useAuth();
  const { t } = useLang();
  const [products, setProducts] = useState([]);
  const [sales, setSales] = useState([]);
  const [stats, setStats] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [saleForm, setSaleForm] = useState(null);
  const [sortKey, setSortKey] = useState('commission');
  const [sortDir, setSortDir] = useState('desc');

  const toggleSort = (key) => {
    if (sortKey === key) setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const sortedProducts = [...products].sort((a, b) => {
    const va = sortKey === 'name' ? (a.name || '') : Number(a[sortKey] || 0);
    const vb = sortKey === 'name' ? (b.name || '') : Number(b[sortKey] || 0);
    const cmp = typeof va === 'string' ? va.localeCompare(vb) : va - vb;
    return sortDir === 'asc' ? cmp : -cmp;
  });

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

  useRefreshOnFocus(load);

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
      setSuccess(t('Vente enregistrée. Commission créditée sur votre compte.'));
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <main className="container">
      <Seo title={t('Mon espace vendeur') + ' — Mboppi'} description={t('Vendez les produits des boutiques et gagnez des commissions.')} />
      <section className="dash-header">
        <div>
          <h1>{t('Mon espace vendeur')}</h1>
          <p>{t('Sélectionnez un produit des boutiques et enregistrez une vente.')}</p>
        </div>
      </section>

      {stats && (
        <section className="card stats">
          <div className="stats-row">
            <div><span className="label">{t('Ventes réalisées')}</span><strong>{stats.total_sales}</strong></div>
            <div><span className="label">{t('Commission totale générée')}</span><strong>{formatMoney(stats.total_commission)} {countrySymbol(user?.country)}</strong></div>
            <div><span className="label">{t('Commission confirmée')}</span><strong>{formatMoney(stats.earned_commission)} {countrySymbol(user?.country)}</strong></div>
          </div>
        </section>
      )}

      <section className="card stats">
        <h2>{t('Commissions sur les produits')}</h2>
        <p className="hint">{t('Commissions fixées par les boutiques sur chaque produit. Cliquez sur une colonne pour trier.')}</p>
        {products.length === 0 ? (
          <p className="empty">{t('Aucun produit disponible à vendre pour le moment.')}</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th className="sortable" onClick={() => toggleSort('name')}>
                  {t('Produit')}
                  <span className="sort-arrow">{sortKey === 'name' ? (sortDir === 'asc' ? '▴' : '▾') : ''}</span>
                </th>
                <th>{t('Boutique')}</th>
                <th className="sortable" onClick={() => toggleSort('price')}>
                  {t('Prix de vente')}
                  <span className="sort-arrow">{sortKey === 'price' ? (sortDir === 'asc' ? '▴' : '▾') : ''}</span>
                </th>
                <th className="sortable" onClick={() => toggleSort('commission_percent')}>
                  {t('Commission %')}
                  <span className="sort-arrow">{sortKey === 'commission_percent' ? (sortDir === 'asc' ? '▴' : '▾') : ''}</span>
                </th>
                <th className="sortable" onClick={() => toggleSort('commission')}>
                  {t('Montant')}
                  <span className="sort-arrow">{sortKey === 'commission' ? (sortDir === 'asc' ? '▴' : '▾') : ''}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedProducts.map((p) => (
                <tr key={p.id}>
                  <td>{p.name}</td>
                  <td>{p.shop_name}</td>
                  <td>{formatMoney(p.price)} {countrySymbol(p.shop_country)}</td>
                  <td>{Number(p.commission_percent || 0)} %</td>
                  <td><span className="commission">+{formatMoney(p.commission)} {countrySymbol(p.shop_country)}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {saleForm && (
        <div className="card form-card">
          <h2>{t('Vendre : {name}', { name: saleForm.product.name })}</h2>
          <p className="hint">
            {t('Prix : {price} {symbol} — Votre commission : {commission} {symbol} par unité', {
              price: formatMoney(saleForm.product.price),
              symbol: countrySymbol(saleForm.product.shop_country),
              commission: formatMoney(saleForm.product.commission),
            })}
          </p>
          <form onSubmit={submitSale}>
            <label>{t('Nom de l\'acheteur *')}</label>
            <input className="input" required value={saleForm.buyer_name || ''} onChange={(e) => setSaleForm({ ...saleForm, buyer_name: e.target.value })} />
            <label>{t('Téléphone (optionnel)')}</label>
            <input className="input" value={saleForm.buyer_phone || ''} onChange={(e) => setSaleForm({ ...saleForm, buyer_phone: e.target.value })} />
            <label>{t('Quantité')}</label>
            <input className="input" type="number" min="1" value={saleForm.quantity || 1} onChange={(e) => setSaleForm({ ...saleForm, quantity: e.target.value })} />
            {error && <p className="error">{error}</p>}
            <div className="row2">
              <button className="btn btn-primary">{t('Enregistrer la vente')}</button>
              <button type="button" className="btn btn-outline" onClick={() => setSaleForm(null)}>{t('Annuler')}</button>
            </div>
          </form>
        </div>
      )}

      {success && <p className="success">{success}</p>}
      {error && <p className="error">{error}</p>}

      {products.length === 0 ? (
        <p className="empty">{t('Aucun produit disponible à vendre pour le moment.')}</p>
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
        <h2>{t('Mes ventes et commissions')}</h2>
        {sales.length === 0 ? (
          <p className="empty">{t('Vous n\'avez pas encore enregistré de vente.')}</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>{t('Produit')}</th>
                <th>{t('Boutique')}</th>
                <th>{t('Acheteur')}</th>
                <th>{t('Qté')}</th>
                <th>{t('Total')}</th>
                <th>{t('Commission')}</th>
                <th>{t('Statut')}</th>
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
