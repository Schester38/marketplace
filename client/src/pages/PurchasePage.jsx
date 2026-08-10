import React, { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { countrySymbol, categoryEmoji } from '../config.js';
import Seo from '../components/Seo.jsx';
import { formatMoney } from '../components/ProductCard.jsx';
import { useAuth } from '../App.jsx';
import { useLang } from '../i18n.jsx';

export default function PurchasePage() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const { user } = useAuth();
  const { t } = useLang();
  const [product, setProduct] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [form, setForm] = useState({
    seller_code: params.get('code') || '',
    buyer_name: '',
    buyer_city: '',
    buyer_address: '',
    buyer_phone: '',
  });
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api
      .getProduct(id)
      .then((d) => setProduct(d.product))
      .catch(() => setNotFound(true));
  }, [id]);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await api.purchaseCreate({
        product_id: id,
        seller_code: form.seller_code,
        buyer_name: form.buyer_name,
        buyer_city: form.buyer_city,
        buyer_address: form.buyer_address,
        buyer_phone: form.buyer_phone,
      });
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

  return (
    <main className="container narrow">
      <Seo title={`${t('Acheter')} — ${product.name} — Mboppi`} description={t('Confirmez votre commande avec le code du vendeur.')} />
      <section className="dash-header">
        <div>
          <h1>🛍️ {t('Acheter')}</h1>
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
            <span className="price">{formatMoney(product.price)} {symbol}</span>
          </p>
          <p className="product-shop" style={{ marginTop: 6 }}>
            {t('Boutique : {shop}', { shop: product.shop_name })}
            {product.shop_location ? <span className="shop-loc"> · 📍 {product.shop_location}</span> : null}
          </p>
        </div>
      </div>

      {!user ? (
        <div className="card page-center">
          <p className="empty">{t('Vous devez être connecté pour confirmer la commande.')}</p>
          <Link className="btn btn-primary" to={`/login?next=/acheter/${id}${params.get('code') ? `?code=${params.get('code')}` : ''}`}>
            {t('Se connecter')}
          </Link>
          <Link className="btn btn-outline" style={{ marginTop: 8 }} to="/register">{t('Créer un compte')}</Link>
        </div>
      ) : done ? (
        <div className="card page-center">
          <h2>✅ {t('Commande confirmée !')}</h2>
          <p className="hint">{t('Votre article est en attente de vente. La boutique et le vendeur ont été notifiés et vous contacteront pour la livraison. Retrouvez cette commande dans votre espace client.')}</p>
          <Link className="btn btn-primary" to="/client">{t('Voir mes achats')}</Link>
          <Link className="btn btn-outline" style={{ marginTop: 8 }} to="/">{t('Continuer mes achats')}</Link>
        </div>
      ) : (
        <div className="card form-card">
          <h2>{t('Commander')}</h2>
          <p className="hint">
            {t('Ce produit vous est proposé par un vendeur Mboppi. Remplissez vos informations pour confirmer votre commande.')}
          </p>
          <form onSubmit={submit}>
            <label>{t('Nom et prénom *')}</label>
            <input
              className="input"
              required
              value={form.buyer_name}
              placeholder={user.name}
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
              value={form.seller_code}
              onChange={(e) => setForm({ ...form, seller_code: e.target.value.toUpperCase() })}
              placeholder="ABC123"
            />
            {error && <p className="error">{error}</p>}
            <button className="btn btn-primary btn-block" disabled={submitting}>
              {submitting ? '…' : `✅ ${t('Confirmer la Commande')}`}
            </button>
          </form>
        </div>
      )}
    </main>
  );
}
