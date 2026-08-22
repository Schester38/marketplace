import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import ProductCard, { formatMoney } from '../components/ProductCard.jsx';
import { downloadInvoice } from '../components/Invoice.jsx';
import { BASE_URL, countrySymbol, whatsappLink } from '../config.js';
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

function ActivationCountdown({ expiresAt }) {
  const { t } = useLang();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(id);
  }, []);
  const end = new Date(expiresAt).getTime();
  if (Number.isNaN(end)) return null;
  const days = Math.ceil((end - now) / 86400000);
  const color = days > 3 ? '#16a34a' : days > 1 ? 'var(--warn)' : 'var(--danger)';
  let text;
  if (days >= 2) {
    text = t('Votre abonnement expire dans {days} jours.', { days });
  } else if (days === 1) {
    text = t('Votre abonnement expire demain.');
  } else {
    text = t('Votre abonnement expire aujourd\'hui. Pensez à le renouveler.');
  }
  return (
    <p className="activation-countdown" style={{ color, borderColor: color }}>
      ⏳ {text}
    </p>
  );
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
    const [prodData, saleData, codeData] = await Promise.all([
      api.listProducts().catch((e) => { setError(e.message); return { products: [] }; }),
      api.mySales().catch((e) => { setError(e.message); return { sales: [], stats: {}, referred: [] }; }),
      api.getSellerCode().catch(() => ({ seller_code: null })),
    ]);
    setProducts(prodData.products);
    setSales(saleData.sales);
    setStats(saleData.stats);
    setReferred(saleData.referred || []);
    setSellerCode(codeData.seller_code);
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

  const removeReferral = async (s) => {
    if (!window.confirm(t('Supprimer cette commission de parrainage « {name} » ?', { name: s.product_name }))) return;
    try {
      await api.deleteReferralSale(s.id);
      setSuccess(t('Commission supprimée.'));
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

  const claimGrouped = async (kind, group) => {
    const isSale = kind === 'sale';
    const msg = isSale
      ? t('Réclamer vos commissions ({amount}) chez {shop} ?', { amount: formatMoney(group.pending), shop: group.shop_name })
      : t('Réclamer votre commission de parrainage ({amount}) chez {shop} ?', { amount: formatMoney(group.pending), shop: group.shop_name });
    if (!window.confirm(msg)) return;
    setError('');
    setSuccess('');
    try {
      await api.groupedClaim(kind, group.shop_id);
      setSuccess(t('Paiement réclamé ! La boutique a été notifiée.'));
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const referralLink = sellerCode ? `${BASE_URL}/register?ref=${encodeURIComponent(sellerCode)}` : null;
  const sellerReferralLink = sellerCode ? `${BASE_URL}/register?refs=${encodeURIComponent(sellerCode)}` : null;

  const shareReferralWhatsApp = () => {
    if (!referralLink) return;
    const msg = t('Rejoins Mboppi et parraine tes amis ! Gagne 2% de leurs achats. Inscris-toi avec mon lien : {link}', { link: referralLink });
    window.open(whatsappLink(msg), '_blank', 'noopener,noreferrer');
  };

  const shareSellerReferralWhatsApp = () => {
    if (!sellerReferralLink) return;
    const msg = t('Deviens vendeur sur Mboppi avec mon lien et gagne le 1000 F offerts à chaque vendeur qui s\'inscrit et active son compte via mon lien. Inscris-toi : {link}', { link: sellerReferralLink });
    window.open(whatsappLink(msg), '_blank', 'noopener,noreferrer');
  };

  const openProof = async (s, kind = 'commission') => {
    setError('');
    setProofLoading(true);
    try {
      const d = await api.saleProof(s.id);
      const proof = kind === 'referral' ? d.referral_proof : d.proof;
      if (!proof) {
        setError(
          kind === 'referral'
            ? t('Aucune preuve de paiement du parrainage disponible pour cette vente.')
            : t('Aucune preuve disponible pour cette vente.')
        );
      } else {
        setProofSale({
          sale: s,
          proof,
          title: kind === 'referral' ? t('Preuve de paiement du parrainage') : t('Preuve de paiement'),
        });
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setProofLoading(false);
    }
  };

  return (
    <main className="container">
      <Seo title={t('Mon espace vendeur') + ' — Mboppi'} description={t('Vendez les produits des boutiques et gagnez des commissions.')} noindex/>
      <section className="dash-header">
        <div>
          <h1>{t('Mon espace vendeur')}</h1>
          <p>{t('Sélectionnez un produit des boutiques et enregistrez une vente.')}</p>
        </div>
      </section>

      {user && user.activation_expires_at ? (
        <ActivationCountdown expiresAt={user.activation_expires_at} />
      ) : (
        <p className="hint" style={{ marginBottom: 20 }}>{t('Abonnement à vie : aucun renouvellement requis.')}</p>
      )}

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
          <h2>🎁 {t('Mon lien de parrainage client')}</h2>
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
              {referralLink && (
                <button className="btn btn-whatsapp btn-sm" onClick={shareReferralWhatsApp}>
                  📲 {t('Partager sur WhatsApp')}
                </button>
              )}
            </>
          ) : (
            <p className="hint" style={{ margin: 0 }}>
              {t('Générez d\'abord votre code vendeur ci-dessus pour obtenir votre lien.')}
            </p>
          )}
        </div>
      </section>

      <section className="card seller-code-card">
        <div>
          <h2>🤝 {t('Mon lien de parrainage vendeur')}</h2>
          <p className="hint" style={{ marginTop: 0 }}>
            {t('Partagez ce lien : chaque vendeur qui s\'inscrit via ce lien et active son compte (frais de 1500 F) vous fait gagner 1000 F, versés directement sur votre portefeuille Mobile Money.')}
          </p>
        </div>
        <div className="seller-code-actions">
          {sellerCode ? (
            <>
              <code className="seller-code referral-link">{sellerReferralLink}</code>
              <button className="btn btn-outline btn-sm" onClick={() => copy('refseller', sellerReferralLink)}>
                {copied === 'refseller' ? t('Lien copié !') : t('Copier le lien')}
              </button>
              {sellerReferralLink && (
                <button className="btn btn-whatsapp btn-sm" onClick={shareSellerReferralWhatsApp}>
                  📲 {t('Partager sur WhatsApp')}
                </button>
              )}
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
            {t('Vous pouvez retirer une vente livrée (ou une commission de parrainage) uniquement une fois sa commission payée.')}
          </p>
          <Link to="/seller/paiements" className="btn btn-outline btn-sm" style={{ flexShrink: 0 }}>
            💳 {t('Modifier mon moyen de paiement')}
          </Link>
        </div>
        {(() => {
          const groups = new Map();
          for (const s of sales) {
            if (!s.shop_id) continue;
            const key = String(s.shop_id);
            if (!groups.has(key)) groups.set(key, { shop_id: s.shop_id, shop_name: s.shop_name, items: [], pending: 0, anyClaimed: false });
            const g = groups.get(key);
            g.items.push(s);
            if (s.status === 'delivered' && !s.paid) g.pending += Number(s.commission || 0);
            if (s.commission_claimed_at) g.anyClaimed = true;
          }
          const gs = [...groups.values()].filter((g) => g.pending > 0).sort((a, b) => b.pending - a.pending);
          if (!gs.length) return null;
          return (
            <div className="table-wrap" style={{ margin: '12px 0 20px' }}>
              <h3>💼 {t('Commissions de vente — par boutique')}</h3>
              <table className="table">
                <thead>
                  <tr>
                    <th>{t('Boutique')}</th>
                    <th>{t('Nombre de ventes')}</th>
                    <th>{t('Commission en attente')}</th>
                    <th>{t('Statut')}</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {gs.map((g) => (
                    <tr key={g.shop_id}>
                      <td>{g.shop_name}</td>
                      <td>{g.items.length}</td>
                      <td>{formatMoney(g.pending)} {countrySymbol(user?.country)}</td>
                      <td>{g.anyClaimed && <span className="badge badge-confirmed">{t('Paiement réclamé')}</span>}</td>
                      <td>
                        <button className="btn btn-small btn-primary" onClick={() => claimGrouped('sale', g)}>
                          💰 {t('Réclamer')} ({formatMoney(g.pending)})
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        })()}
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
                const isDirect = Number(s.commission || 0) <= 0 && Number(s.referral_commission || 0) <= 0;
                const isAlsoReferrer = Number(s.referred_by || 0) === Number(user?.id);
                const pendingForMe = (Number(s.commission || 0) > 0 && !s.paid) || (isAlsoReferrer && Number(s.referral_commission || 0) > 0 && !s.referral_paid);
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
                      {isDirect ? (
                        <span className="muted">{t('Sans commission')}</span>
                      ) : (
                        <>
                          <span>{formatMoney(s.commission)} {countrySymbol(s.shop_country)}</span>
                          {Number(s.referral_commission || 0) > 0 && (
                            <span className="muted referral-comm">
                              <br />🎁 {formatMoney(s.referral_commission)} {countrySymbol(s.shop_country)} ({t('parrainage')})
                            </span>
                          )}
                        </>
                      )}
                    </td>
                    <td>
                      {s.status === 'delivered' && isDirect && (
                        <span className="badge badge-pending">{t('Vente directe')}</span>
                      )}
                      {s.status === 'delivered' && !isDirect && !s.paid && (
                        <>
                          <span className="badge badge-warn">{t('Commission en attente')}</span>
                          {s.commission_claimed_at && <span className="badge badge-confirmed">{t('Paiement réclamé')}</span>}
                        </>
                      )}
                      {s.status === 'delivered' && !isDirect && s.paid && (
                        <span className="badge badge-paid">{t('Commission payée')}</span>
                      )}
                      {s.status !== 'delivered' && <span className={`badge ${st.cls}`}>{t(st.key)}</span>}
                    </td>
                    <td>
                      {s.status === 'delivered' && (() => {
                        const canRemove = !pendingForMe || (Number(s.commission || 0) <= 0 && Number(s.referral_commission || 0) <= 0);
                        return (
                        <div className="row2" style={{ justifyContent: 'flex-end', gap: 6 }}>
                          <button className="btn btn-small" disabled={proofLoading} onClick={() => openProof(s)}>
                            📷 {t('Preuve')}
                          </button>
                          <button className="btn btn-small" onClick={() => downloadInvoice(s, t, countrySymbol(s.shop_country))}>
                            🧾 {t('Facture')}
                          </button>
                          {canRemove && (
                            <button className="btn btn-small btn-danger" onClick={() => removeSale(s)}>
                              🗑️ {t('Supprimer')}
                            </button>
                          )}
                        </div>
                        );
                      })()}
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
          {t('Chaque commande passée par un client inscrit avec votre lien vous rapporte 2% du montant. Le versement est automatique : vos commissions s\'accumulent et sont payées sur votre portefeuille dès qu\'elles atteignent 1500 F.')}
        </p>
        {referred.length === 0 ? (
          <p className="empty">{t('Aucune commande de filleul pour le moment.')}</p>
        ) : (
          <>
          {(() => {
            const groups = new Map();
            for (const s of referred) {
              const shopId = s.shop_id ? String(s.shop_id) : '0';
              if (!groups.has(shopId)) groups.set(shopId, { shop_id: s.shop_id, shop_name: s.shop_name, items: [], pending: 0, anyClaimed: false });
              const g = groups.get(shopId);
              g.items.push(s);
              if (s.status === 'delivered' && !s.referral_paid) g.pending += Number(s.referral_commission || 0);
              if (s.referral_claimed_at) g.anyClaimed = true;
            }
            const gs = [...groups.values()].filter((g) => g.pending > 0).sort((a, b) => b.pending - a.pending);
            if (!gs.length) return null;
            return (
              <div className="table-wrap" style={{ marginBottom: 20 }}>
                <h3>🏪 {t('Parrainage (2%) — par boutique')}</h3>
                <table className="table">
                  <thead>
                    <tr>
                      <th>{t('Boutique')}</th>
                      <th>{t('Nombre de ventes')}</th>
                      <th>{t('Commission en attente')}</th>
                      <th>{t('Statut')}</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {gs.map((g) => (
                      <tr key={g.shop_id}>
                        <td>{g.shop_name}</td>
                        <td>{g.items.length}</td>
                        <td>{formatMoney(g.pending)} {countrySymbol(g.items[0]?.shop_country)}</td>
                        <td><span className="badge badge-warn">{t('En attente — versement auto dès 1500 F')}</span></td>
                        <td></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })()}
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
                    {s.status === 'delivered' && !s.referral_paid && (
                      <span className="badge badge-warn">{t('Commission en attente de cumul')}</span>
                    )}
                    {s.referral_paid && <span className="badge badge-paid">{t('Commission payée')}</span>}
                  </td>
                  <td>
                    <div className="row2" style={{ justifyContent: 'flex-end', gap: 6 }}>
                      {s.referral_paid && (
                        <button className="btn btn-small btn-danger" onClick={() => removeReferral(s)}>
                          🗑️ {t('Supprimer')}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
          </>
        )}
      </section>

      {proofSale && (
        <div className="modal-overlay" onClick={() => setProofSale(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>📷 {proofSale.title || t('Preuve de paiement')} — {proofSale.sale.product_name}</h3>
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
