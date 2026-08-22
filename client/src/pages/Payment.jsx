import React, { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../App.jsx';
import { currencySymbol, IKE_FEE_PERCENT, SELLER_ACTIVATION_FEE, SELLER_ACTIVATION_CURRENCY, SELLER_ACTIVATION_DAYS } from '../config.js';
import Seo from '../components/Seo.jsx';
import IkeFeeNotice from '../components/IkeFeeNotice.jsx';
import { useLang } from '../i18n.jsx';

export default function Payment() {
  const { user, login } = useAuth();
  const { t } = useLang();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [paid, setPaid] = useState(false);
  const [amount, setAmount] = useState(SELLER_ACTIVATION_FEE);
  const [currency, setCurrency] = useState(SELLER_ACTIVATION_CURRENCY);
  const [activationDays, setActivationDays] = useState(SELLER_ACTIVATION_DAYS);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const refreshMe = async () => {
    try {
      const data = await api.me();
      login(data.user, localStorage.getItem('token'));
      return data.user;
    } catch {
      return null;
    }
  };

  const checkPaid = async () => {
    setRefreshing(true);
    try {
      const fresh = await refreshMe();
      if (fresh && fresh.activation_fee_paid) {
        setPaid(true);
        navigate('/seller', { replace: true });
      } else {
        setError(t('Paiement non encore validé. Vérifiez que vous avez bien envoyé la preuve à l\'équipe Mboppi.'));
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    (async () => {
      try {
        const data = await api.me();
        login(data.user, localStorage.getItem('token'));
        if (data.user.activation_fee_paid) {
          setPaid(true);
          navigate('/seller', { replace: true });
          return;
        }
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [login, navigate]);

  if (loading) {
    return (
      <main className="container narrow">
        <Seo title={t('Activation') + ' — Mboppi'} noindex/>
        <div className="card form-card">
          <div className="skeleton-block" style={{ height: 160 }}></div>
        </div>
      </main>
    );
  }

  if (paid) {
    return <Navigate to="/seller" replace />;
  }

  const symbol = currency === 'XAF' || currency === 'XOF' ? 'FCFA' : currencySymbol(currency);

  return (
    <main className="container narrow">
      <Seo title={t('Activation de mon espace vendeur') + ' — Mboppi'} description={t('Réglez vos frais d\'activation pour commencer à vendre sur Mboppi.')} noindex/>
      <section className="dash-header">
        <div>
          <h1>🚀 {t('Activation de mon espace vendeur')}</h1>
          <p>{t('Pour vendre sur Mboppi, réglez vos frais d\'activation de {amount} {symbol}.', { amount: amount.toLocaleString('fr-FR'), symbol })}</p>
        </div>
      </section>

      <div className="card form-card">
        <div className="card page-center" style={{ marginBottom: 16, padding: 24 }}>
          <p className="hint" style={{ marginTop: 0 }}>{t('Frais d\'activation Mensuelle')}</p>
          <p className="price-line" style={{ fontSize: 34, fontWeight: 800 }}>
            {amount.toLocaleString('fr-FR')} {symbol}
          </p>
          <p className="hint">
            {t('Votre espace vendeur est activé pendant {days} jours à compter de la validation du paiement.', { days: activationDays })}
          </p>
        </div>

        <IkeFeeNotice
          amount={amount}
          currency={currency}
          title={t('Frais iKeePay {percent} % inclus dans le montant', { percent: IKE_FEE_PERCENT })}
        />

        <div style={{ marginBottom: 16 }}>
          <h3>{t('Comment payer :')}</h3>
          <ol style={{ paddingLeft: 20, lineHeight: 1.8 }}>
            <li>{t('Effectuez un virement de <strong>{amount} {symbol}</strong> sur le compte Mobile Money Mboppi :', { amount: amount.toLocaleString('fr-FR'), symbol })}</li>
            <li><strong>{t('Orange Money Cameroun : +237 6XX XXX XXX')}</strong></li>
            <li><strong>{t('MTN Mobile Money Cameroun : +237 6XX XXX XXX')}</strong></li>
            <li>{t('Indiquez en motif : <strong>ACTIVATION VENDEUR - {email}</strong>', { email: user?.email })}</li>
            <li>{t('Envoyez la capture d\'écran de la transaction à l\'équipe Mboppi via WhatsApp (+237 6XX XXX XXX) ou email (support@mboppi.app)')}</li>
            <li>{t('Un administrateur validera votre paiement sous 24h. Votre espace sera alors activé automatiquement.')}</li>
          </ol>
        </div>

        <div className="wallet-card" style={{ marginBottom: 12, background: '#f0fdf4', borderColor: '#86efac' }}>
          <p className="hint" style={{ marginTop: 0, color: '#166534' }}>
            ✅ {t('Une fois le paiement validé par l\'équipe, cette page se mettra à jour automatiquement.')}
          </p>
        </div>

        {error && <p className="error">{error}</p>}

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn btn-primary" onClick={checkPaid} disabled={refreshing}>
            {refreshing ? '⟳ ' + t('Vérification…') : '✅ ' + t('J\'ai payé, vérifier')}
          </button>
          <button className="btn btn-outline" onClick={() => navigate('/seller')}>
            ← {t('Retour')}
          </button>
        </div>
      </div>
    </main>
  );
}