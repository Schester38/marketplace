import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import ProductCard, { formatMoney } from '../components/ProductCard.jsx';
import { downloadInvoice } from '../components/Invoice.jsx';
import { BASE_URL, countrySymbol } from '../config.js';
import Seo from '../components/Seo.jsx';
import { useAuth } from '../App.jsx';
import { useLang } from '../i18n.jsx';
import { useRefreshOnFocus } from '../useRefreshOnFocus.js';
import ExportSalesButton from '../components/ExportSalesButton.jsx';

const SALE_STATUS = {
  pending: { key: 'En attente de vente', cls: 'badge-pending' },
  bought: { key: 'Acheté', cls: 'badge-bought' },
  confirmed: { key: 'Confirmée', cls: 'badge-confirmed' },
  delivered: { key: 'Livré', cls: 'badge-bought' },
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
  const [referred, setReferred] = useState([]);
  const [sellerCode, setSellerCode] = useState(null);
  const [codeLoading, setCodeLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [copied, setCopied] = useState('');
  const [proofSale, setProofSale] = useState(null);
  const [proofLoading, setProofLoading] = useState(false);

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
      setReferred(saleData.referred || []);
      setSellerCode(codeData.seller_code);
    } catch (e) {
      setError(e.message);
    }
  };

  useEffect(() => { load(); }, []);

  useRefreshOnFocus(load);

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

  const productLink = (p) => `${window.location.origin}/p/${p.id}`;
  const saleLink = (p) => `${window.location.origin}/acheter/${p.id}?code=${sellerCode}`;

  const copy = async (kind, text) => {
    const ok = await copyText(text);
    if (ok) {
      setCopied(kind);
      setTimeout(() => setCopied(''), 1800);
    }
  };

  const shareOrCopy = async (kind, url, text) => {
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Mboppi', text, url });
        return;
      } catch (err) {
        if (err.name === 'AbortError') return;
      }
    }
    copy(kind, url);
  };

  const shareProduct = (p) =>
    shareOrCopy('product-' + p.id, productLink(p), t('Découvrez cet article sur Mboppi : {name}', { name: p.name }));

  const shareSale = (p) => {
    if (!sellerCode) {
      setError(t('Générez votre code vendeur pour vendre.'));
      return;
    }
    shareOrCopy('sale-' + p.id, saleLink(p), t('Commandez « {name} » sur Mboppi avec le code vendeur {code}', { name: p.name, code: sellerCode }));
  };

  const removeSale = async (s) => {
    if (!window.confirm(t('Supprimer cette vente « {name} » ?', { name: s.product_name }))) return;
    try {
      await api.deleteSale(s.id);
      setSales((prev) => prev.filter((x) => x.id !== s.id));
      setSuccess(t('Vente supprimée.'));
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const claimPayment = async (s) => {
    if (!window.confirm(t('Réclamer le paiement de vos commissions pour « {name} » à la boutique ?', { name: s.product_name }))) return;
    setError('');
    setSuccess('');
    try {
      await api.claimSale(s.id);
      setSuccess(t('Paiement réclamé ! La boutique a été notifiée.'));
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const claimReferral = async (s) => {
    if (!window.confirm(t('Réclamer le paiement de votre commission de parrainage pour « {name} » à la boutique ?', { name: s.product_name }))) return;
    setError('');
    setSuccess('');
    try {
      await api.claimReferral(s.id);
      setSuccess(t('Paiement réclamé ! La boutique a été notifiée.'));
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const referralLink = sellerCode ? `${BASE_URL}/register?ref=${encodeURIComponent(sellerCode)}` : null;

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
          <Link to="/seller/paiements" className="btn btn-outline btn-sm">
            💳 {t('Mes moyens de paiement')}
          </Link>
        </div>
      </section>

      <section className="card seller-code-card">
        <div>
          <h2>🎁 {t('Mon lien de parrainage')}</h2>
          <p className="hint" style={{ marginTop: 0 }}>
            {t('Partagez ce lien : chaque personne qui s\'inscrit via ce lien devient votre filleul. Vous gagnez 2% du prix de chacun de ses achats (commission payée par la boutique).')}
          </p>
        </div>
        <div className="seller-code-actions">
          {sellerCode ? (
            <>
              <code className="seller-code referral-link">{referralLink}</code>
              <button className="btn btn-outline btn-sm" onClick={() => copy('ref', referralLink)}>
                {copied === 'ref' ? t('Lien copié !') : t('Copier le lien')}
              </button>
            </>
          ) : (
            <p className="hint" style={{ margin: 0 }}>
              {t('Générez d\'abord votre code vendeur ci-dessus pour obtenir votre lien.')}
            </p>
          )}
        </div>
      </section>

      {stats && (
        <section className="card stats">
          <div className="stats-row">
            <div><span className="label">{t('Ventes réalisées')}</span><strong>{stats.total_sales}</strong></div>
            <div><span className="label">{t('Commission en attente')}</span><strong className={stats.pending_commission > 0 ? 'text-warn' : ''}>{formatMoney(stats.pending_commission)} {countrySymbol(user?.country)}</strong></div>
            <div><span className="label">{t('Commission payée')}</span><strong>{formatMoney(stats.earned_commission)} {countrySymbol(user?.country)}</strong></div>
            <div><span className="label">{t('Parrainage en attente')}</span><strong className={stats.referral_pending > 0 ? 'text-warn' : ''}>{formatMoney(stats.referral_pending)} {countrySymbol(user?.country)}</strong></div>
            <div><span className="label">{t('Parrainage payé')}</span><strong>{formatMoney(stats.referral_earned)} {countrySymbol(user?.country)}</strong></div>
          </div>
        </section>
      )}

      {success && <p className="success">{success}</p>}
      {error && <p className="error">{error}</p>}

      <section className="card stats">
        <h2>{t('Produits disponibles à vendre')}</h2>
        <p className="hint">
          {t('Le montant « + » affiché en vert sur chaque produit est la commission que vous gagnez à sa vente.')}
        </p>
        {products.length === 0 ? (
          <p className="empty">{t('Aucun produit disponible à vendre pour le moment.')}</p>
        ) : (
          <div className="grid">
            {products.map((p) => (
              <ProductCard
                key={p.id}
                product={p}
                showCommission
                action={t('Vendre')}
                onAction={() => shareSale(p)}
                extraAction={{ label: '🔗 ' + (copied === 'product-' + p.id ? t('Lien copié !') : t('Partager')), onClick: () => shareProduct(p) }}
              />
            ))}
          </div>
        )}
      </section>

      <section className="card stats">
        <div className="stats-head">
          <h2>{t('Mes ventes et commissions')}</h2>
          <ExportSalesButton />
        </div>
        <div className="row2" style={{ alignItems: 'center' }}>
          <p className="hint" style={{ margin: 0 }}>
            {t('Vous ne voyez que vos propres ventes en attente. Les livrées ne peuvent pas être supprimées.')}
          </p>
          <Link to="/seller/paiements" className="btn btn-outline btn-sm" style={{ flexShrink: 0 }}>
            💳 {t('Modifier mon moyen de paiement')}
          </Link>
        </div>
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
                <th>{t('Localisation')}</th>
                <th>{t('Qté')}</th>
                <th>{t('Total')}</th>
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
                    <td>
                      {s.shop_name}
                      {s.shop_contact ? <span className="muted"> · 📞 {s.shop_contact}</span> : null}
                    </td>
                    <td>{s.buyer_name || '—'}{s.buyer_phone ? <span className="muted"> · {s.buyer_phone}</span> : null}</td>
                    <td>{[s.buyer_city, s.buyer_address].filter(Boolean).join(', ') || '—'}</td>
                    <td>{s.quantity}</td>
                    <td>{formatMoney(s.total_price)} {countrySymbol(s.shop_country)}</td>
                    <td>
                      <span>{formatMoney(s.commission)} {countrySymbol(s.shop_country)}</span>
                      {Number(s.referral_commission || 0) > 0 && (
                        <span className="muted referral-comm">
                          <br />🎁 {formatMoney(s.referral_commission)} {countrySymbol(s.shop_country)} ({t('parrainage')})
                        </span>
                      )}
                    </td>
                    <td>
                      {s.status === 'delivered' && !s.paid && (
                        <>
                          <span className="badge badge-warn">{t('Commission en attente')}</span>
                          {s.commission_claimed_at && <span className="badge badge-confirmed">{t('Paiement réclamé')}</span>}
                        </>
                      )}
                      {s.status === 'delivered' && s.paid && (
                        <span className="badge badge-paid">{t('Commission payée')}</span>
                      )}
                      {s.status !== 'delivered' && <span className={`badge ${st.cls}`}>{t(st.key)}</span>}
                    </td>
                    <td>
                      {s.status === 'delivered' && (
                        <div className="row2" style={{ justifyContent: 'flex-end', gap: 6 }}>
                          {!s.paid && (
                            <button
                              className="btn btn-small btn-primary"
                              disabled={!!s.commission_claimed_at}
                              onClick={() => claimPayment(s)}
                            >
                              {s.commission_claimed_at ? t('Réclamée') : `💰 ${t('Réclamer')}`}
                            </button>
                          )}
                          <button className="btn btn-small" disabled={proofLoading} onClick={() => openProof(s)}>
                            📷 {t('Preuve')}
                          </button>
                          <button className="btn btn-small" onClick={() => downloadInvoice(s, t, countrySymbol(s.shop_country))}>
                            🧾 {t('Facture')}
                          </button>
                        </div>
                      )}
                      {s.status !== 'delivered' && (
                        <button className="btn btn-small btn-danger" onClick={() => removeSale(s)}>
                          🗑️ {t('Supprimer')}
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

      <section className="card stats">
        <div className="stats-head">
          <h2>🎁 {t('Mes filleuls — commissions de parrainage (2%)')}</h2>
        </div>
        <p className="hint" style={{ marginTop: 0 }}>
          {t('Chaque commande passée par un client inscrit avec votre lien vous rapporte 2% du montant, payés par la boutique après livraison.')}
        </p>
        {referred.length === 0 ? (
          <p className="empty">{t('Aucune commande de filleul pour le moment.')}</p>
        ) : (
          <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>{t('Produit')}</th>
                <th>{t('Boutique')}</th>
                <th>{t('Filleul')}</th>
                <th>{t('Date')}</th>
                <th>{t('2% commission')}</th>
                <th>{t('Statut')}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {referred.map((s) => (
                <tr key={s.id}>
                  <td>{s.product_name}</td>
                  <td>{s.shop_name}</td>
                  <td>{s.buyer_name || '—'}</td>
                  <td>{s.created_at ? new Date(s.created_at).toLocaleDateString() : '—'}</td>
                  <td>{formatMoney(s.referral_commission)} {countrySymbol(s.shop_country)}</td>
                  <td>
                    {s.status !== 'delivered' && <span className="badge badge-pending">{t('En attente de livraison')}</span>}
                    {s.status === 'delivered' && s.referral_claimed_at && !s.referral_paid && (
                      <span className="badge badge-confirmed">{t('Paiement réclamé')}</span>
                    )}
                    {s.status === 'delivered' && !s.referral_claimed_at && !s.referral_paid && (
                      <span className="badge badge-warn">{t('Commission en attente')}</span>
                    )}
                    {s.referral_paid && <span className="badge badge-paid">{t('Commission payée')}</span>}
                  </td>
                  <td>
                    {s.status === 'delivered' && s.referral_claimed_at && !s.referral_paid && (
                      <span className="badge badge-confirmed">{t('Réclamée')}</span>
                    )}
                    {s.status === 'delivered' && !s.referral_claimed_at && !s.referral_paid && (
                      <button
                        className="btn btn-small btn-primary"
                        onClick={() => claimReferral(s)}
                      >
                        💰 {t('Réclamer')}
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
              {t('La boutique a confirmé le paiement de cette vente.')}
            </p>
          </div>
        </div>
      )}
    </main>
  );
}
