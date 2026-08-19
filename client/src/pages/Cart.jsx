import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Seo from '../components/Seo.jsx';
import { api } from '../api.js';
import { formatMoney } from '../components/ProductCard.jsx';
import { countrySymbol, BASE_URL } from '../config.js';
import { useAuth } from '../App.jsx';
import { useCart } from '../store.jsx';
import { useLang } from '../i18n.jsx';
import CopyCode from '../components/CopyCode.jsx';

export default function Cart() {
  const { user } = useAuth();
  const { t } = useLang();
  const navigate = useNavigate();
  const { cart, setQty, removeFromCart, clearCart, cartCount, cartTotal } = useCart();
  const [buyerName, setBuyerName] = useState(user ? user.name : '');
  const [phone, setPhone] = useState('');
  const [city, setCity] = useState('');
  const [address, setAddress] = useState('');
  const [error, setError] = useState('');
  const [placing, setPlacing] = useState(false);
  const [sales, setSales] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (!user) {
      navigate('/login', { state: { from: '/panier' } });
      return;
    }
    if (!buyerName.trim() || !phone.trim() || !city.trim() || !address.trim()) {
      setError(t('Veuillez remplir tous les champs.'));
      return;
    }
    setPlacing(true);
    try {
      const data = await api.createOrder({
        items: cart.map((i) => ({ product_id: i.id, quantity: i.qty })),
        buyer_name: buyerName.trim(),
        buyer_phone: phone.trim(),
        buyer_city: city.trim(),
        buyer_address: address.trim(),
      });
      setSales(data.sales);
      clearCart();
    } catch (err) {
      setError(err.message);
    } finally {
      setPlacing(false);
    }
  };

  if (sales && sales.length > 0) {
    return (
      <main className="container narrow">
        <Seo title={t('Commande enregistrée') + ' — Mboppi'} noindex/>
        <div className="card form-card success-card">
          <div className="auth-brand">✅</div>
          <h2>{t('Commande enregistrée !')}</h2>
          <p className="hint">
            {t('Merci {name} ! Vos commandes sont enregistrées et la boutique a été notifiée.', {
              name: sales[0].buyer_name,
            })}
          </p>
          <p className="hint">
            {t('Chaque article a son code de confirmation : communiquez-le à la boutique ou au livreur, ou suivez votre commande avec celui-ci.')}
          </p>
          <div className="order-list" style={{ width: '100%' }}>
            {sales.map((s) => (
              <div className="card order-card" key={s.id}>
                <div className="order-head">
                  <strong>{s.product_name} ×{s.quantity}</strong>
                  <span className={`badge badge-pending`}>{t('En attente')}</span>
                </div>
                <div className="order-total" style={{ flexWrap: 'wrap', gap: 8 }}>
                  <span className="label">{t('Total')}</span>
                  <strong>{formatMoney(s.total_price)} {countrySymbol(s.shop_country)}</strong>
                </div>
                {s.confirm_code && (
                  <div className="buyer-code-box" style={{ margin: '8px 0' }}>
                    <span className="buyer-code-label">{t('Code de confirmation')} :</span>
                    <span className="buyer-code-value">{s.confirm_code}</span>
                    <CopyCode code={s.confirm_code} />
                  </div>
                )}
                {s.confirm_code && (
                  <div className="buyer-code-box" style={{ margin: '8px 0' }}>
                    <span className="buyer-code-label">{t('Lien de suivi')} :</span>
                    <span className="buyer-code-value" style={{ fontSize: 12, wordBreak: 'break-all' }}>{`${BASE_URL}/suivi/${s.id}?code=${s.confirm_code}`}</span>
                    <CopyCode code={`${BASE_URL}/suivi/${s.id}?code=${s.confirm_code}`} label={t('Copier le lien')} />
                  </div>
                )}
                <div className="row2">
                  {s.confirm_code && (
                    <Link className="btn btn-outline btn-small" to={`/suivi/${s.id}?code=${encodeURIComponent(s.confirm_code)}`}>
                      📦 {t('Suivre ma commande')}
                    </Link>
                  )}
                  {s.shop_contact && (
                    <a className="btn btn-outline btn-small" href={`tel:${s.shop_contact}`}>
                      📞 {t('Contacter la boutique')}
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
          <Link to={user ? '/client' : '/'} className="btn btn-outline btn-block">
            {t('Voir mes commandes')}
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="container narrow">
      <Seo title={t('Mon panier') + ' — Mboppi'} noindex/>
      <h1 className="section-title">{t('🛒 Mon panier')}</h1>

      {cart.length === 0 ? (
        <div className="card page-center">
          <p className="empty">{t('Votre panier est vide.')}</p>
          <Link to="/" className="btn btn-primary">{t('Parcourir les produits')}</Link>
        </div>
      ) : (
        <>
          <div className="cart-list">
            {cart.map((i) => {
              const symbol = countrySymbol(i.country);
              return (
                <div className="cart-item" key={i.id}>
                  <div className="cart-item-photo">
                    {i.photo ? <img src={i.photo} alt={i.name} loading="lazy" /> : <span>📦</span>}
                  </div>
                  <div className="cart-item-info">
                    <Link to={`/produit/${i.id}`} className="cart-item-name">{i.name}</Link>
                    <span className="cart-item-price">{formatMoney(i.price)} {symbol}</span>
                    <div className="cart-item-actions">
                      <div className="qty-stepper">
                        <button type="button" onClick={() => setQty(i.id, i.qty - 1)} aria-label="-">−</button>
                        <span>{i.qty}</span>
                        <button type="button" onClick={() => setQty(i.id, i.qty + 1)} aria-label="+">+</button>
                      </div>
                      <button type="button" className="btn btn-outline btn-sm" onClick={() => removeFromCart(i.id)}>
                        🗑️ {t('Retirer')}
                      </button>
                    </div>
                  </div>
                  <div className="cart-item-total">{formatMoney(i.price * i.qty)} {symbol}</div>
                </div>
              );
            })}
          </div>

          <div className="card cart-summary">
            <div className="info-row">
              <span className="label">{t('Articles ({n})', { n: cartCount })}</span>
              <strong>{formatMoney(cartTotal)} {countrySymbol(cart[0] && cart[0].country)}</strong>
            </div>
            <p className="hint">{t('Les frais de livraison sont confirmés avec la boutique.')}</p>

            <form onSubmit={submit}>
              <label>{t('Votre nom *')}</label>
              <input className="input" required value={buyerName} onChange={(e) => setBuyerName(e.target.value)} />
              <label>{t('Votre téléphone *')}</label>
              <input
                className="input"
                type="tel"
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+237 6XX XX XX XX"
              />
              <label>{t('Votre ville *')}</label>
              <input
                className="input"
                required
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder={t('Ville')}
              />
              <label>{t('Adresse de livraison *')}</label>
              <input
                className="input"
                required
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder={t('Quartier, ville…')}
              />
              {error && <p className="error">{error}</p>}
              <button className="btn btn-primary btn-block" disabled={placing}>
                {placing ? t('Commande en cours…') : `✅ ${t('Passer la commande')}`}
              </button>
            </form>
          </div>
        </>
      )}
    </main>
  );
}
