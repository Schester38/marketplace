import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import Seo from '../components/Seo.jsx';
import { formatMoney } from '../components/ProductCard.jsx';
import { downloadInvoice } from '../components/Invoice.jsx';
import { countrySymbol } from '../config.js';
import { useLang } from '../i18n.jsx';
import { useRefreshOnFocus } from '../useRefreshOnFocus.js';

export default function LivreurDashboard() {
  const { t } = useLang();
  const [pending, setPending] = useState([]);
  const [delivered, setDelivered] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [deliverForm, setDeliverForm] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const load = async () => {
    try {
      const d = await api.livreurSales();
      setPending(d.pending);
      setDelivered(d.delivered);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);
  useRefreshOnFocus(load);

  const submitDeliver = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setSubmitting(true);
    try {
      const d = await api.deliverSale(deliverForm.sale.id, {
        delivery_fee: Number(deliverForm.delivery_fee || 0),
        payment_method: deliverForm.payment_method,
      });
      setPending((prev) => prev.filter((s) => s.id !== d.sale.id));
      setDelivered((prev) => [d.sale, ...prev]);
      setSuccess(t('Achat confirmé ! La facture a été téléchargée.'));
      downloadInvoice(d.sale, t, countrySymbol(d.sale.shop_country));
      setDeliverForm(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const symbol = (s) => countrySymbol(s.shop_country);

  return (
    <main className="container">
      <Seo title={t('Livraison') + ' — Mboppi'} description={t('Livrez les articles commandés et confirmez l\'achat.')} />
      <section className="dash-header">
        <div>
          <h1>🛵 {t('Livraison')}</h1>
          <p>{t('Livrez les articles en attente de vente et confirmez l\'achat auprès du client.')}</p>
        </div>
      </section>

      {success && <p className="success">{success}</p>}
      {error && <p className="error">{error}</p>}

      <section className="card stats">
        <h2>📦 {t('Articles en attente de vente')}</h2>
        {loading ? (
          <div className="skeleton-block" style={{ height: 120 }}></div>
        ) : pending.length === 0 ? (
          <p className="empty">{t('Aucun article en attente pour le moment.')}</p>
        ) : (
          <div className="livreur-list">
            {pending.map((s) => (
              <div className="livreur-item" key={s.id}>
                <div className="livreur-item-info">
                  <div className="livreur-item-top">
                    <strong>{s.product_name}</strong>
                    <span className={`badge badge-pending`}>{t('En attente de vente')}</span>
                  </div>
                  <p className="hint">
                    {formatMoney(s.total_price)} {symbol(s)}
                    {s.shop_name ? ` · ${t('Boutique : {shop}', { shop: s.shop_name })}` : ''}
                    {s.seller_name ? ` · ${t('Vendeur : {seller}', { seller: s.seller_name })}` : ''}
                  </p>
                  <p className="livreur-client">
                    🧑 {s.buyer_name || '—'}
                    {s.buyer_phone ? ` · 📞 ${s.buyer_phone}` : ''}
                  </p>
                  {s.buyer_city || s.buyer_address ? (
                    <p className="hint">📍 {[s.buyer_city, s.buyer_address].filter(Boolean).join(', ')}</p>
                  ) : null}
                </div>
                <button className="btn btn-primary" onClick={() => setDeliverForm({ sale: s, delivery_fee: '', payment_method: 'espece' })}>
                  🛵 {t('Livrer')}
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="card stats">
        <h2>✅ {t('Mes livraisons effectuées')}</h2>
        {delivered.length === 0 ? (
          <p className="empty">{t('Aucune livraison effectuée pour le moment.')}</p>
        ) : (
          <div className="livreur-list">
            {delivered.map((s) => (
              <div className="livreur-item" key={s.id}>
                <div className="livreur-item-info">
                  <div className="livreur-item-top">
                    <strong>{s.product_name}</strong>
                    <span className={`badge badge-bought`}>{t('Acheté')}</span>
                  </div>
                  <p className="hint">
                    {formatMoney(Number(s.total_price || 0) + Number(s.delivery_fee || 0))} {symbol(s)}
                    {s.delivered_at ? ` · ${t('Livré le {date}', { date: new Date(s.delivered_at).toLocaleDateString() })}` : ''}
                  </p>
                  <p className="livreur-client">
                    🧑 {s.buyer_name || '—'}
                    {s.buyer_phone ? ` · 📞 ${s.buyer_phone}` : ''}
                  </p>
                </div>
                <button className="btn btn-outline" onClick={() => downloadInvoice(s, t, symbol(s))}>
                  🧾 {t('Voir la facture')}
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {deliverForm && (
        <div className="modal-overlay" onClick={() => setDeliverForm(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>🛵 {t('Livrer : {name}', { name: deliverForm.sale.product_name })}</h3>
              <button className="drawer-close" onClick={() => setDeliverForm(null)}>✕</button>
            </div>
            <div className="deliver-recap">
              <p><strong>{t('Propriétaire')} :</strong> {deliverForm.sale.shop_name || '—'}</p>
              <p><strong>{t('Vendeur')} :</strong> {deliverForm.sale.seller_name || '—'} ({deliverForm.sale.seller_code || '—'})</p>
              <p><strong>{t('Client')} :</strong> {deliverForm.sale.buyer_name || '—'}
                {deliverForm.sale.buyer_phone ? ` · ${deliverForm.sale.buyer_phone}` : ''}
              </p>
              {deliverForm.sale.buyer_city || deliverForm.sale.buyer_address ? (
                <p><strong>{t('Adresse')} :</strong> {[deliverForm.sale.buyer_city, deliverForm.sale.buyer_address].filter(Boolean).join(', ')}</p>
              ) : null}
              <p><strong>{t('Montant article')} :</strong> {formatMoney(deliverForm.sale.total_price)} {symbol(deliverForm.sale)}</p>
            </div>
            <form onSubmit={submitDeliver}>
              <label>{t('Frais de livraison ({symbol}) *', { symbol: symbol(deliverForm.sale) })}</label>
              <input
                className="input"
                type="number"
                min="0"
                step="any"
                required
                value={deliverForm.delivery_fee}
                onChange={(e) => setDeliverForm({ ...deliverForm, delivery_fee: e.target.value })}
              />
              <label style={{ marginTop: 12 }}>{t('Paiement *')}</label>
              <div className="row2">
                <label className={`payment-option ${deliverForm.payment_method === 'espece' ? 'selected' : ''}`}>
                  <input
                    type="radio"
                    name="payment"
                    value="espece"
                    checked={deliverForm.payment_method === 'espece'}
                    onChange={(e) => setDeliverForm({ ...deliverForm, payment_method: e.target.value })}
                  />
                  <span>💵 {t('En Espèce')}</span>
                </label>
                <label className={`payment-option ${deliverForm.payment_method === 'mobile' ? 'selected' : ''}`}>
                  <input
                    type="radio"
                    name="payment"
                    value="mobile"
                    checked={deliverForm.payment_method === 'mobile'}
                    onChange={(e) => setDeliverForm({ ...deliverForm, payment_method: e.target.value })}
                  />
                  <span>📱 {t('Par Mobile')}</span>
                </label>
              </div>
              <div className="row2" style={{ marginTop: 14 }}>
                <button className="btn btn-primary" disabled={submitting}>
                  {submitting ? '…' : `✅ ${t('Confirmer l\'Achat')}`}
                </button>
                <button type="button" className="btn btn-outline" onClick={() => setDeliverForm(null)}>{t('Annuler')}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}
