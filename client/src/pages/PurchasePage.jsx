import React, { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { countrySymbol, categoryEmoji } from '../config.js';
import Seo from '../components/Seo.jsx';
import Logo from '../components/Logo.jsx';
import { formatMoney } from '../components/ProductCard.jsx';
import CopyCode from '../components/CopyCode.jsx';
import { useAuth } from '../App.jsx';
import { useLang } from '../i18n.jsx';

const IKE_FEE_PERCENT = 6;

// Autres moyens de paiement (espèces, transfert wallet) temporairement masqués :
// passer à true pour les réactiver.
const SHOW_OTHER_PAYMENTS = true;

export default function PurchasePage() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const { user } = useAuth();
  const { t } = useLang();
  const navigate = useNavigate();
  const location = useLocation();
  const linkCode = (params.get('code') || '').trim().toUpperCase();
  const [product, setProduct] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [shopWallets, setShopWallets] = useState(null);
  const [form, setForm] = useState({
    seller_code: linkCode,
    buyer_name: '',
    buyer_city: '',
    buyer_address: '',
    buyer_phone: '',
  });
  const [paymentMethod, setPaymentMethod] = useState('en ligne');
  const [copiedWallet, setCopiedWallet] = useState(null);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [purchase, setPurchase] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api
      .getProduct(id)
      .then((d) => {
        setProduct(d.product);
        if (SHOW_OTHER_PAYMENTS && d.product && d.product.shop_id) {
          api
            .shopPaymentMethods(d.product.shop_id)
            .then((r) => setShopWallets(r.methods))
            .catch(() => {});
        }
      })
      .catch(() => setNotFound(true));
  }, [id]);

  const copyWallet = async (value) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedWallet(value);
      setTimeout(() => setCopiedWallet(null), 1500);
    } catch {}
  };

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (!user) {
      navigate('/login', { state: { from: location.pathname } });
      return;
    }
    setSubmitting(true);
    try {
      const d = await api.purchaseCreate({
        product_id: id,
        seller_code: form.seller_code,
        buyer_name: form.buyer_name,
        buyer_city: form.buyer_city,
        buyer_address: form.buyer_address,
        buyer_phone: form.buyer_phone,
        payment_method: SHOW_OTHER_PAYMENTS ? paymentMethod : 'en ligne',
      });
      setPurchase(d.sale || null);
      setDone(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (notFound) {
    return (
      <main className="container narrow">
        <div className="card page-center">
          <p className="empty">{t('Produit non trouvé')}</p>
          <Link to="/" className="btn btn-primary">{t('Retour à l\'accueil')}</Link>
        </div>
      </main>
    );
  }

  if (!product) {
    return (
      <main className="container narrow">
        <div className="card page-center">
          <div className="skeleton-block" style={{ height: 220 }}></div>
        </div>
      </main>
    );
  }

  const photo = (product.photos && product.photos[0]) || product.image;
  const symbol = countrySymbol(product.shop_country);
  const flash = product.flash_promo || null;
  const displayPrice = flash ? Number(flash.price) : Number(product.price);

  return (
    <main className="container narrow">
      <Seo title={`${t('Acheter')} — ${product.name} — Mboppi`} description={t('Confirmez votre commande avec le code du vendeur.')} noindex/>
      <section className="dash-header">
        <div>
          <h1><Logo className="logo-inline" /> {t('Acheter')}</h1>
          <p>{t('Confirmez votre commande : la boutique et le vendeur seront notifiés.')}</p>
        </div>
      </section>

      <div className="card purchase-product">
        {photo && <img className="purchase-photo" src={photo} alt={product.name} loading="lazy" />}
        <div className="purchase-info">
          <h2>{product.name}</h2>
          {product.category && <p className="product-cat">{categoryEmoji(product.category)} {t(product.category)}</p>}
          {product.description && <p className="product-desc">{product.description}</p>}
          <div className="product-meta">
            {product.warranty && <span className="meta-chip">🛡️ {t('Garantie : {warranty}', { warranty: product.warranty })}</span>}
            {product.contact && <span className="meta-chip">📞 {product.contact}</span>}
          </div>
          <p className="price-line" style={{ marginTop: 10 }}>
            {flash && <span className="old-price">{formatMoney(product.price)} {symbol}</span>}
            <span className={`price ${flash ? 'price-flash' : ''}`}>{formatMoney(displayPrice)} {symbol}</span>
          </p>
          <p className="product-shop" style={{ marginTop: 6 }}>
            {t('Boutique : {shop}', { shop: product.shop_name })}
            {product.shop_location ? <span className="shop-loc"> · 📍 {product.shop_location}</span> : null}
          </p>
        </div>
      </div>

      {done ? (
        <div className="card page-center">
          <h2>✅ {t('Commande confirmée !')}</h2>
          <p className="hint">{t('Votre article est en attente de vente. La boutique et le vendeur ont été notifiés et vous contacteront pour la livraison.')}</p>
          {purchase && (purchase.confirm_code || purchase.buyer_code) && (
            <div className="buyer-code-box">
              <span className="buyer-code-label">{t('Votre code de confirmation')} :</span>
              <span className="buyer-code-value">{purchase.confirm_code || purchase.buyer_code}</span>
              <CopyCode code={purchase.confirm_code || purchase.buyer_code} />
            </div>
          )}
          {purchase && purchase.id && (
            <Link className="btn btn-primary" to={`/suivi/${purchase.id}?code=${encodeURIComponent(purchase.confirm_code || purchase.buyer_code || '')}`}>
              📦 {t('Suivre ma commande')}
            </Link>
          )}
          {user && (
            <Link className="btn btn-outline" style={{ marginTop: 8 }} to="/client">{t('Voir mes achats')}</Link>
          )}
          <Link className="btn btn-outline" style={{ marginTop: 8 }} to="/">{t('Continuer mes achats')}</Link>
        </div>
      ) : (
        <div className="card form-card">
          <h2>{t('Commander')}</h2>
          <p className="hint">
            {t('Ce produit vous est proposé par un vendeur Mboppi. Remplissez vos informations pour confirmer votre commande. Aucun compte requis.')}
          </p>
          <form onSubmit={submit}>
            <label>{t('Nom et prénom *')}</label>
            <input
              className="input"
              required
              value={form.buyer_name}
              onChange={(e) => setForm({ ...form, buyer_name: e.target.value })}
            />
            <label>{t('Ville *')}</label>
            <input
              className="input"
              required
              value={form.buyer_city}
              onChange={(e) => setForm({ ...form, buyer_city: e.target.value })}
            />
            <label>{t('Adresse / Quartier *')}</label>
            <input
              className="input"
              required
              value={form.buyer_address}
              onChange={(e) => setForm({ ...form, buyer_address: e.target.value })}
            />
            <label>{t('Numéro de téléphone *')}</label>
            <input
              className="input"
              type="tel"
              required
              value={form.buyer_phone}
              onChange={(e) => setForm({ ...form, buyer_phone: e.target.value })}
            />
            <label>{t('Code du vendeur *')}</label>
            <input
              className="input code-input"
              required
              maxLength="6"
              readOnly={!!linkCode}
              value={form.seller_code}
              onChange={(e) => setForm({ ...form, seller_code: e.target.value.toUpperCase() })}
              placeholder="ABC123"
            />

            {SHOW_OTHER_PAYMENTS ? (
              <>
                <div className="payment-options">
                  <button
                    type="button"
                    className={`payment-option ${paymentMethod === 'espece' ? 'active' : ''}`}
                    onClick={() => setPaymentMethod('espece')}
                  >
                    💵 {t('En espèces (à la livraison)')}
                  </button>
                  <button
                    type="button"
                    className={`payment-option ${paymentMethod === 'mobile' ? 'active' : ''}`}
                    onClick={() => setPaymentMethod('mobile')}
                  >
                    📱 {t('Portefeuille (Mobile Money)')}
                  </button>
                  <button
                    type="button"
                    className={`payment-option ${paymentMethod === 'en ligne' ? 'active' : ''}`}
                    onClick={() => setPaymentMethod('en ligne')}
                  >
                    💳 {t('Paiement à la livraison (Mobile Money)')}
                  </button>
                </div>

                {paymentMethod === 'mobile' && (
                  <div className="card wallet-card">
                    {shopWallets && shopWallets.wallets.length > 0 ? (
                      <>
                        <p className="hint" style={{ marginTop: 0 }}>
                          {t('Envoyez le paiement à la boutique sur l\'un de ces portefeuilles :')}
                        </p>
                        {shopWallets.full_name && <p className="hint">{t('Titulaire : {name}', { name: shopWallets.full_name })}</p>}
                        <div className="wallet-list">
                          {shopWallets.wallets.map((w) => (
                            <div className="wallet-row" key={w.name}>
                              <span className="wallet-name">{w.name}</span>
                              <span className="wallet-value">{w.value}</span>
                              <button type="button" className="btn btn-outline btn-sm" onClick={() => copyWallet(w.value)}>
                                {copiedWallet === w.value ? t('Copié !') : t('Copier')}
                              </button>
                            </div>
                          ))}
                        </div>
                        <p className="hint">
                          {t('Indiquez votre nom et votre numéro lors du transfert pour faciliter la livraison.')}
                        </p>
                      </>
                    ) : (
                      <p className="hint" style={{ marginTop: 0 }}>
                        {t('La boutique n\'a pas encore configuré ses portefeuilles de paiement. Paiement à la livraison recommandé.')}
                      </p>
                    )}
                  </div>
                )}
                {error && <p className="error">{error}</p>}
                {paymentMethod === 'en ligne' && product && (
                  <IkeFeeNotice
                    amount={Number(displayPrice)}
                    currency={product.currency}
                    title={t('Frais iKeePay {percent} % sur les paiements en ligne', { percent: IKE_FEE_PERCENT })}
                  />
                )}
              </>
            ) : (
              <>
                <div className="payment-options">
                  <div className="payment-option active">
                    💳 {t('Paiement à la livraison (Mobile Money)')}
                  </div>
                </div>
                <p className="hint" style={{ marginTop: 8 }}>
                  {t('Le livreur enverra une demande de paiement sur votre numéro mobile money à la livraison. Aucune carte bancaire n\'est nécessaire.')}
                </p>
                {product && (
                  <p className="hint">
                    {t('Frais de service inclus dans le montant affiché.')}
                  </p>
                )}
                {error && <p className="error">{error}</p>}
              </>
            )}
            <button className="btn btn-primary btn-block" disabled={submitting}>
              {submitting ? '…' : `✅ ${t('Confirmer la Commande')}`}
            </button>
          </form>
        </div>
      )}
    </main>
  );
}
