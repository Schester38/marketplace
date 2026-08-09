import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import Seo from '../components/Seo.jsx';
import { api } from '../api.js';
import { formatMoney } from '../components/ProductCard.jsx';
import { countrySymbol, whatsappLink } from '../config.js';
import { useAuth } from '../App.jsx';
import { useCart } from '../store.jsx';
import { useLang } from '../i18n.jsx';

export default function Cart() {
  const { user } = useAuth();
  const { t } = useLang();
  const { cart, setQty, removeFromCart, clearCart, cartCount, cartTotal } = useCart();
  const [buyerName, setBuyerName] = useState(user ? user.name : '');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [error, setError] = useState('');
  const [placing, setPlacing] = useState(false);
  const [order, setOrder] = useState(null);

  const orderMessage = order
    ? [
        t('Bonjour Mboppi, je souhaite confirmer ma commande #{id} :', { id: order.id }),
        '',
        ...order.items.map(
          (i) => `• ${i.name} ×${i.quantity} — ${formatMoney(i.price * i.quantity)} ${countrySymbol(user && user.country)}`
        ),
        '',
        t('Total : {total} F', { total: formatMoney(order.total) }),
        t('Nom : {name}', { name: order.buyer_name }),
        order.buyer_phone ? t('Téléphone : {phone}', { phone: order.buyer_phone }) : null,
        order.buyer_address ? t('Adresse : {address}', { address: order.buyer_address }) : null,
      ]
        .filter(Boolean)
        .join('\n')
    : '';

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (!buyerName.trim()) {
      setError(t('Veuillez remplir tous les champs.'));
      return;
    }
    setPlacing(true);
    try {
      const data = await api.createOrder({
        items: cart.map((i) => ({ product_id: i.id, quantity: i.qty })),
        buyer_name: buyerName.trim(),
        buyer_phone: phone.trim() || null,
        buyer_address: address.trim() || null,
      });
      setOrder(data.order);
      clearCart();
    } catch (err) {
      setError(err.message);
    } finally {
      setPlacing(false);
    }
  };

  if (order) {
    return (
      <main className="container narrow">
        <Seo title={t('Commande enregistrée') + ' — Mboppi'} />
        <div className="card form-card success-card">
          <div className="auth-brand">✅</div>
          <h2>{t('Commande enregistrée !')}</h2>
          <p className="hint">
            {t('Merci {name} ! Votre commande #{id} est bien enregistrée.', {
              name: order.buyer_name,
              id: order.id,
            })}
          </p>
          <p className="hint">{t('Confirmez-la maintenant sur WhatsApp pour la finaliser.')}</p>
          <a
            className="btn btn-success btn-block"
            href={whatsappLink(orderMessage)}
            target="_blank"
            rel="noopener noreferrer"
          >
            💬 {t('Confirmer sur WhatsApp')}
          </a>
          <Link to={user ? '/client' : '/'} className="btn btn-outline btn-block">
            {t('Voir mes commandes')}
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="container narrow">
      <Seo title={t('Mon panier') + ' — Mboppi'} />
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
              <strong>{formatMoney(cartTotal)} F</strong>
            </div>
            <p className="hint">{t('Les frais de livraison sont confirmés avec la boutique.')}</p>

            {!user ? (
              <p className="error" style={{ margin: 0 }}>
                {t('Connectez-vous pour passer commande.')}{' '}
                <Link to="/login">{t('Se connecter')}</Link>
              </p>
            ) : (
              <form onSubmit={submit}>
                <label>{t('Votre nom *')}</label>
                <input className="input" required value={buyerName} onChange={(e) => setBuyerName(e.target.value)} />
                <label>{t('Votre téléphone')}</label>
                <input
                  className="input"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+237 6XX XX XX XX"
                />
                <label>{t('Adresse de livraison')}</label>
                <input
                  className="input"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder={t('Quartier, ville…')}
                />
                {error && <p className="error">{error}</p>}
                <button className="btn btn-primary btn-block" disabled={placing}>
                  {placing ? t('Commande en cours…') : `✅ ${t('Passer la commande')}`}
                </button>
              </form>
            )}
          </div>
        </>
      )}
    </main>
  );
}
