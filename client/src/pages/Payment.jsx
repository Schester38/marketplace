import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../App.jsx';
import { currencySymbol, IKE_FEE_PERCENT } from '../config.js';
import Seo from '../components/Seo.jsx';
import IkeFeeNotice from '../components/IkeFeeNotice.jsx';
import { useLang } from '../i18n.jsx';

const WALLET_OPTIONS = ['Orange Money', 'MTN Mobile Money', 'Moov Money', 'Wave', 'Airtel Money', 'M-Pesa', 'T-Money'];

function mobileWalletName(name) {
  const n = String(name || '').toLowerCase();
  const match = (keys) => keys.some((k) => n.includes(k));
  if (match(['orange', 'free money', 'yoomee'])) return 'Orange Money';
  if (match(['mtn'])) return 'MTN Mobile Money';
  if (match(['wave'])) return 'Wave';
  if (match(['moov', 'flooz'])) return 'Moov Money';
  if (match(['airtel'])) return 'Airtel Money';
  if (match(['m-pesa', 'tigo', 'vodacom'])) return 'M-Pesa';
  if (match(['t-money', 'mobicash'])) return 'T-Money';
  return null;
}

export default function Payment() {
  const { user, login } = useAuth();
  const { t } = useLang();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [paid, setPaid] = useState(Boolean(user && user.activation_fee_paid));
  const [amount, setAmount] = useState(1500);
  const [currency, setCurrency] = useState('XAF');
  const [activationDays, setActivationDays] = useState(31);
  const [walletName, setWalletName] = useState('');
  const [walletPhone, setWalletPhone] = useState('');
  const [hasWallet, setHasWallet] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showWalletForm, setShowWalletForm] = useState(false);
  const [paying, setPaying] = useState(false);
  const [payFailed, setPayFailed] = useState(false);
  const [payResult, setPayResult] = useState(null);
  const [error, setError] = useState('');
  const polling = useRef(null);

  const refreshMe = useCallback(async () => {
    try {
      const data = await api.me();
      login(data.user, localStorage.getItem('token'));
      return data.user;
    } catch {
      return null;
    }
  }, [login]);

  const finish = useCallback((freshUser) => {
    if (polling.current) {
      clearInterval(polling.current);
      polling.current = null;
    }
    if (freshUser && freshUser.activation_fee_paid) {
      navigate('/seller', { replace: true });
    }
  }, [navigate]);

  const checkStatus = useCallback(async () => {
    try {
      const s = await api.sellerFeeStatus();
      setAmount(s.amount || amount);
      setCurrency(s.currency || 'XAF');
      if (s.activation_period_days) setActivationDays(s.activation_period_days);
      if (s.paid) {
        setPaid(true);
        const fresh = await refreshMe();
        finish(fresh);
        return;
      }
      if (s.attempt && s.attempt.status === 'failed') {
        if (polling.current) {
          clearInterval(polling.current);
          polling.current = null;
        }
        setPayFailed(true);
        setPaying(false);
      }
    } catch {
      /* on continue à interroger le statut */
    }
  }, [amount, refreshMe, finish]);

  useEffect(() => {
    (async () => {
      try {
        const [status, methods] = await Promise.all([api.sellerFeeStatus(), api.getPaymentMethods()]);
        setAmount(status.amount || 1500);
        setCurrency(status.currency || 'XAF');
        if (status.activation_period_days) setActivationDays(status.activation_period_days);
        if (status.paid) {
          setPaid(true);
          const fresh = await refreshMe();
          finish(fresh);
          return;
        }
        const list = (methods.methods && methods.methods.wallets) || [];
        const wallet = list.find((w) => mobileWalletName(w.name));
        if (wallet) {
          setWalletName(mobileWalletName(wallet.name));
          setWalletPhone(wallet.value);
          setHasWallet(true);
        } else {
          setShowWalletForm(true);
        }
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [refreshMe, finish]);

  useEffect(() => {
    if (paying && !polling.current) {
      polling.current = setInterval(checkStatus, 4000);
    }
    return () => {
      if (polling.current) {
        clearInterval(polling.current);
        polling.current = null;
      }
    };
  }, [paying, checkStatus]);

  const saveWallet = async (e) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      if (!walletName) throw new Error(t('Choisissez votre opérateur de paiement.'));
      if (!String(walletPhone || '').trim()) throw new Error(t('Renseignez le numéro de votre portefeuille.'));
      await api.updatePaymentMethods({ full_name: user.name, wallets: [{ name: walletName, value: walletPhone }] });
      setHasWallet(true);
      setShowWalletForm(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const startPayment = async () => {
    setError('');
    setPayResult(null);
    setPayFailed(false);
    setPaying(true);
    try {
      const r = await api.paySellerFee();
      setAmount(r.amount || amount);
      setCurrency(r.currency || 'XAF');
      setPayResult(r);
    } catch (err) {
      setError(err.message);
      setPayFailed(true);
      setPaying(false);
    }
  };

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
            {t('Votre espace vendeur est activé pendant {days} jours à compter du paiement.', { days: activationDays })}
          </p>
        </div>

        <IkeFeeNotice
          amount={amount}
          currency={currency}
          title={t('Frais iKeePay {percent} % sur vos frais d\'activation', { percent: IKE_FEE_PERCENT })}
        />

        {!hasWallet || showWalletForm ? (
          <form onSubmit={saveWallet}>
            <label>{t('Votre portefeuille Mobile Money')}</label>
            <select
              className="input"
              value={walletName}
              onChange={(e) => setWalletName(e.target.value)}
            >
              <option value="">{t('Choisir un opérateur…')}</option>
              {WALLET_OPTIONS.map((w) => (
                <option key={w} value={w}>{w}</option>
              ))}
            </select>
            <label style={{ marginTop: 10 }}>{t('Numéro du portefeuille')}</label>
            <input
              className="input"
              type="tel"
              inputMode="tel"
              required
              value={walletPhone}
              onChange={(e) => setWalletPhone(e.target.value)}
              placeholder="ex : 6XXXXXXXX"
            />
            {error && <p className="error">{error}</p>}
            <button className="btn btn-primary btn-block" disabled={saving}>
              {saving ? '…' : t('Enregistrer mon portefeuille')}
            </button>
          </form>
        ) : (
          <>
            <div className="wallet-card" style={{ marginBottom: 12 }}>
              <p className="hint" style={{ marginTop: 0 }}>
                📱 {t('Paiement depuis votre portefeuille')} : <strong>{walletName}</strong> · {walletPhone}
              </p>
              <button type="button" className="link-button" onClick={() => setShowWalletForm(true)}>
                {t('Changer de portefeuille')}
              </button>
            </div>

            {error && <p className="error">{error}</p>}

            {!paying ? (
              <>
                <button className="btn btn-primary btn-block" onClick={startPayment}>
                  💳 {t('Payer {amount} {symbol}', { amount: amount.toLocaleString('fr-FR'), symbol })}
                </button>
                {payFailed && (
                  <div className="error" style={{ marginTop: 12 }}>
                    <p>{t('Le paiement n\'a pas été effectué. Veuillez essayer à nouveau.')}</p>
                    <button className="btn btn-primary btn-block" style={{ marginTop: 8 }} onClick={startPayment}>
                      🔄 {t('Réessayer le paiement')}
                    </button>
                  </div>
                )}
              </>
            ) : (
              <div className="success" style={{ marginTop: 8 }}>
                {payResult ? (
                  <>
                    <p><strong>{t('Demande de paiement envoyée !')}</strong></p>
                    <p className="hint">{t('Confirmez sur votre téléphone. Nous vous redirigeons vers votre espace dès que le paiement est détecté.')}</p>
                    {payResult.payment_link && (
                      <a className="btn btn-primary btn-block" style={{ marginTop: 8 }} href={payResult.payment_link} target="_blank" rel="noreferrer">
                        🔗 {t('Ouvrir le lien de paiement')}
                      </a>
                    )}
                    <div className="spinner" style={{ margin: '16px auto' }} />
                    <p className="hint">{t('En attente du paiement…')}</p>
                  </>
                ) : (
                  <p className="hint">{t('Demande de paiement en cours d\'envoi…')}</p>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}