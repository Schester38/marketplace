import React, { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { GoogleIcon } from '../components/icons.jsx';
import Seo from '../components/Seo.jsx';
import SearchSelect from '../components/SearchSelect.jsx';
import Logo from '../components/Logo.jsx';
import { COUNTRIES } from '../config.js';
import { useLang } from '../i18n.jsx';

const SELLER_WALLETS = ['Orange Money', 'MTN Mobile Money', 'Moov Money', 'Wave', 'Airtel Money', 'M-Pesa', 'T-Money'];

export default function Register() {
  const { t } = useLang();
  const [searchParams] = useSearchParams();
  const refCode = (searchParams.get('ref') || '').trim().toUpperCase();
  const refSeller = (searchParams.get('refs') || '').trim().toUpperCase();
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    role: refCode ? 'client' : 'seller',
    country: '',
    wallet_name: '',
    wallet_phone: '',
  });
  const [error, setError] = useState('');
  const [accepted, setAccepted] = useState(false);
  const [sent, setSent] = useState(false);
  const [resending, setResending] = useState(false);

  const countryOptions = COUNTRIES.map((c) => ({ value: c.name, label: c.name, flag: c.flag }));

  const ensureAccepted = () => {
    if (!accepted) {
      setError(t('Vous devez accepter les Conditions Générales d\'Utilisation pour vous inscrire.'));
      return false;
    }
    return true;
  };

  const resend = async () => {
    setResending(true);
    setError('');
    try {
      await api.resendVerification(form.email);
    } catch (err) {
      setError(err.message);
    } finally {
      setResending(false);
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (!form.country) {
      setError(t('Veuillez remplir tous les champs.'));
      return;
    }
    if (!ensureAccepted()) return;
    try {
      const role = form.role === 'creator' ? 'seller' : form.role;
      await api.register({
        ...form,
        role,
        operator: form.wallet_name,
        phone: form.wallet_phone,
        acceptedTerms: true,
        ref: refCode || undefined,
        ref_seller: refSeller || undefined,
      });
      setSent(true);
    } catch (err) {
      setError(err.message);
    }
  };

  if (sent) {
    return (
      <main className="container narrow">
        <Seo title={t('Vérifiez votre email') + ' — Mboppi'} noindex/>
        <div className="card form-card" style={{ textAlign: 'center' }}>
          <div className="auth-brand">📬</div>
          <h2>{t('Vérifiez votre email')}</h2>
          <p className="hint" style={{ textAlign: 'center' }}>
            {t('Un email de confirmation a été envoyé à')} <strong>{form.email}</strong>.
            <br />
            {t('Cliquez sur le lien qu\'il contient pour activer votre compte, puis connectez-vous.')}
          </p>
          <p className="hint" style={{ textAlign: 'center' }}>
            {t('Vous ne l\'avez pas reçu ? Vérifiez les spams ou')}{' '}
            <button type="button" className="link-button" onClick={resend} disabled={resending}>
              {resending ? t('Envoi…') : t('renvoyer l\'email')}
            </button>
          </p>
          {error && <p className="error">{error}</p>}
          <Link to="/login" className="btn btn-primary btn-block">{t('Aller à la connexion')}</Link>
        </div>
      </main>
    );
  }

  return (
    <main className="container narrow">
      <Seo
        title={t('Créer un compte') + ' — Mboppi'}
        description={t('Inscription') + ' : ' + t('Boutique (shop)') + ', vendeur, client ou créateur.'} noindex/>
      <div className="card form-card">
        <div className="auth-brand"><Logo className="logo-inline" /></div>
        <h2>{t('Créer un compte')}</h2>

        <form onSubmit={submit}>
          <label>{t('Pays *')}</label>
          <SearchSelect
            options={countryOptions}
            value={form.country}
            onChange={(v) => setForm({ ...form, country: v })}
            placeholder={t('Choisir votre pays…')}
            emptyLabel={t('Aucun résultat')}
          />

          {!refCode && !refSeller && (
            <>
              <label>{t('Je veux m\'inscrire en tant que :')}</label>
              <div className="role-picker">
                <label className={`role-option ${form.role === 'shop' ? 'selected' : ''}`}>
                  <input
                    type="radio"
                    name="role"
                    value="shop"
                    checked={form.role === 'shop'}
                    onChange={(e) => setForm({ ...form, role: e.target.value })}
                  />
                  <span>🏪 {t('Boutique')}</span>
                  <small>{t('Je publie mes produits (max 5) et je fixe les commissions')}</small>
                </label>
                <label className={`role-option ${form.role === 'seller' ? 'selected' : ''}`}>
                  <input
                    type="radio"
                    name="role"
                    value="seller"
                    checked={form.role === 'seller'}
                    onChange={(e) => setForm({ ...form, role: e.target.value })}
                  />
                  <span>🛒 {t('Vendeur')}</span>
                  <small>{t('Je vends les produits des boutiques et je gagne des commissions')}</small>
                </label>
                <label className={`role-option ${form.role === 'client' ? 'selected' : ''}`}>
                  <input
                    type="radio"
                    name="role"
                    value="client"
                    checked={form.role === 'client'}
                    onChange={(e) => setForm({ ...form, role: e.target.value })}
                  />
                  <span><Logo className="logo-inline" /> {t('Client')}</span>
                  <small>{t('Je consulte les offres et les produits, je commande facilement')}</small>
                </label>
                <label className={`role-option ${form.role === 'creator' ? 'selected' : ''} ${'role-disabled'}`}>
                  <input
                    type="radio"
                    name="role"
                    value="creator"
                    disabled
                    checked={form.role === 'creator'}
                    onChange={(e) => setForm({ ...form, role: e.target.value })}
                  />
                  <span>🎨 {t('Créateur')} <span className="badge badge-warn" style={{ marginLeft: 4 }}>{t('Bientôt disponible')}</span></span>
                  <small>{t('Je présente et vends mes créations au marché Mboppi')}</small>
                </label>
                <label className={`role-option ${form.role === 'livreur' ? 'selected' : ''}`}>
                  <input
                    type="radio"
                    name="role"
                    value="livreur"
                    checked={form.role === 'livreur'}
                    onChange={(e) => setForm({ ...form, role: e.target.value })}
                  />
                  <span>🛵 {t('Livreur')}</span>
                  <small>{t('Je livre les commandes et je reçois mes frais de livraison directement')}</small>
                </label>
              </div>
            </>
          )}

          {!refCode && form.role === 'seller' && (
            <div className="card wallet-card">
              <label>{t('Votre portefeuille Mobile Money')}</label>
              <select
                className="input"
                value={form.wallet_name}
                onChange={(e) => setForm({ ...form, wallet_name: e.target.value })}
              >
                <option value="">{t('Choisir un opérateur…')}</option>
                {SELLER_WALLETS.map((w) => (
                  <option key={w} value={w}>{w}</option>
                ))}
              </select>
              <label style={{ marginTop: 10 }}>{t('Numéro du portefeuille')}</label>
              <input
                className="input"
                type="tel"
                inputMode="tel"
                value={form.wallet_phone}
                onChange={(e) => setForm({ ...form, wallet_phone: e.target.value })}
                placeholder="ex : 6XXXXXXXX"
              />
              <p className="hint" style={{ marginBottom: 0 }}>
                {t('Ce portefeuille servira à régler vos frais d\'activation et à recevoir vos commissions.')}
              </p>
            </div>
          )}

          <label>{t('Nom complet / Nom de la boutique')}</label>
          <input
            className="input"
            required
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />

          <label>{t('Email')}</label>
          <input
            className="input"
            type="email"
            required
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
          <label>{t('Mot de passe (8 caractères minimum)')}</label>
          <input
            className="input"
            type="password"
            required
            minLength={8}
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />

          {error && <p className="error">{error}</p>}

          <label className="terms-check">
            <input
              type="checkbox"
              checked={accepted}
              onChange={(e) => setAccepted(e.target.checked)}
              required
            />
            <span>
              {t('J\'ai lu et j\'accepte les')}{' '}
              <Link to="/cgu" target="_blank" rel="noopener noreferrer">
                {t('Conditions générales d\'utilisation')}
              </Link>
            </span>
          </label>

          <button className="btn btn-primary btn-block">{t("S'inscrire")}</button>
          <div className="divider"><span>{t('ou')}</span></div>
          <button
            type="button"
            className="btn btn-google btn-block"
            onClick={() => {
              if (!ensureAccepted()) return;
              const params = new URLSearchParams({ role: refCode ? 'client' : form.role, country: form.country || '' });
              if (refCode) params.set('ref', refCode);
              if (refSeller) params.set('ref_seller', refSeller);
              window.location.href = `/api/auth/google?${params.toString()}&accepted=1`;
            }}
          >
            <GoogleIcon />
            {t("S'inscrire avec Google")}
          </button>
        </form>
        <p className="hint">
          {t('Déjà inscrit ?')} <Link to="/login">{t('Se connecter')}</Link>
        </p>
      </div>
    </main>
  );
}
