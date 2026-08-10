import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import ProductCard, { formatMoney } from '../components/ProductCard.jsx';
import { countrySymbol } from '../config.js';
import Seo from '../components/Seo.jsx';
import { useAuth } from '../App.jsx';
import { useLang } from '../i18n.jsx';
import { useRefreshOnFocus } from '../useRefreshOnFocus.js';

const SALE_STATUS = {
  pending: { key: 'Vente en attente', cls: 'badge-pending' },
  bought: { key: 'Acheté', cls: 'badge-bought' },
  confirmed: { key: 'Confirmée', cls: 'badge-confirmed' },
  cancelled: { key: 'Annulée', cls: 'badge-cancelled' },
};

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  }
}

export default function SellerDashboard() {
  const { user } = useAuth();
  const { t } = useLang();
  const [products, setProducts] = useState([]);
  const [sales, setSales] = useState([]);
  const [stats, setStats] = useState(null);
  const [sellerCode, setSellerCode] = useState(null);
  const [codeLoading, setCodeLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [saleForm, setSaleForm] = useState(null);
  const [createdSale, setCreatedSale] = useState(null);
  const [copied, setCopied] = useState('');
  const [sortKey, setSortKey] = useState('commission');
  const [sortDir, setSortDir] = useState('desc');

  const load = async () => {
    try {
      const [prodData, saleData, codeData] = await Promise.all([
        api.listProducts(),
        api.mySales(),
        api.getSellerCode(),
      ]);
      setProducts(prodData.products);
      setSales(saleData.sales);
      setStats(saleData.stats);
      setSellerCode(codeData.seller_code);
    } catch (e) {
      setError(e.message);
    }
  };

  useEffect(() => { load(); }, []);

  useRefreshOnFocus(load);

  const pendingIds = new Set(sales.filter((s) => s.status === 'pending').map((s) => s.product_id));

  const generateCode = async () => {
    setCodeLoading(true);
    setError('');
    try {
      const d = await api.createSellerCode();
      setSellerCode(d.seller_code);
      setSuccess(t('Code vendeur généré : {code}', { code: d.seller_code }));
    } catch (e) {
      setError(e.message);
    } finally {
      setCodeLoading(false);
    }
  };

  const submitSale = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    try {
      const d = await api.createSale({ product_id: saleForm.product.id, quantity: Number(saleForm.quantity) });
      setSales((prev) => [d.sale, ...prev]);
      setStats((prev) =>
        prev
          ? {
              ...prev,
              total_sales: (prev.total_sales || 0) + 1,
              total_commission: (prev.total_commission || 0) + d.sale.commission,
              pending_sales: (prev.pending_sales || 0) + 1,
            }
          : prev
      );
      setCreatedSale(d.sale);
      setSaleForm(null);
    } catch (err) {
      setError(err.message);
    }
  };

  const productLink = (p) => `${window.location.origin}/produit/${p.id}`;
  const saleLink = (p) => `${window.location.origin}/acheter/${p.id}?code=${sellerCode}`;

  const copy = async (kind, text) => {
    const ok = await copyText(text);
    if (ok) {
      setCopied(kind);
      setTimeout(() => setCopied(''), 1800);
    }
  };

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

  return (
    <main className="container">
      <Seo title={t('Mon espace vendeur') + ' — Mboppi'} description={t('Vendez les produits des boutiques et gagnez des commissions.')} />
      <section className="dash-header">
        <div>
          <h1>{t('Mon espace vendeur')}</h1>
          <p>{t('Sélectionnez un produit des boutiques et enregistrez une vente.')}</p>
        </div>
      </section>

      <section className="card seller-code-card">
        <div>
          <h2>{t('Mon code vendeur')}</h2>
          <p className="hint" style={{ marginTop: 0 }}>
            {t('Votre code identifie vos ventes auprès des boutiques. Communiquez-le à vos clients ou partagez votre lien de vente.')}
          </p>
        </div>
        <div className="seller-code-actions">
          {sellerCode ? (
            <>
              <span className="seller-code">{sellerCode}</span>
              <button className="btn btn-outline btn-sm" onClick={() => copy('code', sellerCode)}>
                {copied === 'code' ? t('Code copié !') : t('Copier')}
              </button>
            </>
          ) : (
            <button className="btn btn-primary" disabled={codeLoading} onClick={generateCode}>
              {codeLoading ? '…' : t('Générer mon code')}
            </button>
          )}
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
          <div className="table-wrap">
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
          </div>
        )}
      </section>

      {saleForm && (
        <div className="modal-overlay" onClick={() => setSaleForm(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{t('Vendre : {name}', { name: saleForm.product.name })}</h3>
              <button className="drawer-close" onClick={() => setSaleForm(null)}>✕</button>
            </div>
            <p className="hint">
              {t('Prix unitaire : {price} {symbol} — Votre commission : {commission} {symbol} par unité', {
                price: formatMoney(saleForm.product.price),
                symbol: countrySymbol(saleForm.product.shop_country),
                commission: formatMoney(saleForm.product.commission),
              })}
            </p>
            <form onSubmit={submitSale}>
              <label>{t('Quantité *')}</label>
              <input
                className="input"
                type="number"
                min="1"
                required
                value={saleForm.quantity}
                onChange={(e) => setSaleForm({ ...saleForm, quantity: e.target.value })}
              />
              <div className="row2" style={{ marginTop: 14 }}>
                <button className="btn btn-primary">{t('Vendre')}</button>
                <button type="button" className="btn btn-outline" onClick={() => setSaleForm(null)}>{t('Annuler')}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {createdSale && (
        <div className="modal-overlay" onClick={() => setCreatedSale(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>✅ {t('Vente en attente')}</h3>
              <button className="drawer-close" onClick={() => setCreatedSale(null)}>✕</button>
            </div>
            <p className="hint">
              {t('La boutique va livrer le produit. Partagez le lien de vente à votre client : il confirmera l\'achat avec votre code {code}.', { code: sellerCode })}
            </p>
            <div className="share-links">
              <div className="share-link-row">
                <div>
                  <span className="label">{t('Lien du produit')}</span>
                  <code>{productLink(createdSale)}</code>
                </div>
                <button className="btn btn-outline btn-sm" onClick={() => copy('product', productLink(createdSale))}>
                  {copied === 'product' ? t('Copié !') : t('Copier')}
                </button>
              </div>
              {sellerCode ? (
                <div className="share-link-row">
                  <div>
                    <span className="label">{t('Lien de vente')}</span>
                    <code>{saleLink(createdSale)}</code>
                  </div>
                  <button className="btn btn-primary btn-sm" onClick={() => copy('sale', saleLink(createdSale))}>
                    {copied === 'sale' ? t('Copié !') : t('Copier')}
                  </button>
                </div>
              ) : (
                <p className="hint">{t('Générez votre code vendeur pour obtenir le lien de vente.')}</p>
              )}
            </div>
            <button className="btn btn-outline" style={{ marginTop: 14 }} onClick={() => setCreatedSale(null)}>{t('Fermer')}</button>
          </div>
        </div>
      )}

      {success && <p className="success">{success}</p>}
      {error && <p className="error">{error}</p>}

      {products.length === 0 ? (
        <p className="empty">{t('Aucun produit disponible à vendre pour le moment.')}</p>
      ) : (
        <div className="grid">
          {products.map((p) => {
            const pending = pendingIds.has(p.id);
            return (
              <ProductCard
                key={p.id}
                product={p}
                showCommission
                badge={pending ? { text: '⏳ ' + t('Vente en attente'), cls: 'badge-pending' } : null}
                action={pending ? null : 'Vendre'}
                onAction={() => setSaleForm({ product: p, quantity: 1 })}
                extraAction={{ label: '🔗 ' + (copied === 'product-' + p.id ? t('Copié !') : t('Lien du produit')), onClick: () => copy('product-' + p.id, productLink(p)) }}
              />
            );
          })}
        </div>
      )}

      <section className="card stats">
        <h2>{t('Mes ventes et commissions')}</h2>
        {sales.length === 0 ? (
          <p className="empty">{t('Vous n\'avez pas encore enregistré de vente.')}</p>
        ) : (
          <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>{t('Produit')}</th>
                <th>{t('Boutique')}</th>
                <th>{t('Acheteur')}</th>
                <th>{t('Qté')}</th>
                <th>{t('Total')}</th>
                <th>{t('Prix payé')}</th>
                <th>{t('Commission')}</th>
                <th>{t('Statut')}</th>
              </tr>
            </thead>
            <tbody>
              {sales.map((s) => {
                const st = SALE_STATUS[s.status] || SALE_STATUS.pending;
                return (
                  <tr key={s.id}>
                    <td>{s.product_name}</td>
                    <td>{s.shop_name}</td>
                    <td>{s.buyer_name || '—'}</td>
                    <td>{s.quantity}</td>
                    <td>{formatMoney(s.total_price)} {countrySymbol(s.shop_country)}</td>
                    <td>{s.purchase_price != null ? `${formatMoney(s.purchase_price)} ${countrySymbol(s.shop_country)}` : '—'}</td>
                    <td>{formatMoney(s.commission)} {countrySymbol(s.shop_country)}</td>
                    <td><span className={`badge ${st.cls}`}>{t(st.key)}</span></td>
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
