import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Seo from '../components/Seo.jsx';
import { api } from '../api.js';
import { useAuth } from '../App.jsx';
import SearchSelect from '../components/SearchSelect.jsx';
import { COUNTRIES } from '../config.js';
import { useLang } from '../i18n.jsx';

export default function MyAccount() {
  const { user, login, logout } = useAuth();
  const { t } = useLang();
  const navigate = useNavigate();

  const [name, setName] = useState(user?.name || '');
  const [email, setEmail] = useState(user?.email || '');
  const [location, setLocation] = useState(user?.location || '');
  const [country, setCountry] = useState(user?.country || '');
  const [profileMsg, setProfileMsg] = useState('');
  const [profileError, setProfileError] = useState('');

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [pwMsg, setPwMsg] = useState('');
  const [pwError, setPwError] = useState('');

  const [delPassword, setDelPassword] = useState('');
  const [delError, setDelError] = useState('');
  const [busy, setBusy] = useState(false);

  const countryOptions = COUNTRIES.map((c) => ({ value: c.name, label: c.name, flag: c.flag }));
  const roleLabel = user?.role === 'shop' ? t('boutique') : user?.role === 'seller' ? t('vendeur') : user?.role === 'client' ? t('client') : t('créateur');

  const saveProfile = async (e) => {
    e.preventDefault();
    setBusy(true);
    setProfileMsg('');
    setProfileError('');
    try {
      const { user: updated } = await api.updateProfile({ name, email, location, country });
      login(updated, localStorage.getItem('token'));
      setProfileMsg(t('Profil mis à jour avec succès.'));
    } catch (err) {
      setProfileError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const changePassword = async (e) => {
    e.preventDefault();
    setBusy(true);
    setPwMsg('');
    setPwError('');
    try {
      await api.changePassword({ currentPassword, newPassword });
      setCurrentPassword('');
      setNewPassword('');
      setPwMsg(t('Mot de passe modifié avec succès.'));
    } catch (err) {
      setPwError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const onDelete = async (e) => {
    e.preventDefault();
    if (!window.confirm(t('Supprimer définitivement votre compte ? Vos produits, ventes et tout votre contenu seront supprimés. Cette action est irréversible.'))) return;
    setBusy(true);
    setDelError('');
    try {
      await api.deleteAccount({ password: delPassword });
      logout();
      navigate('/');
    } catch (err) {
      setDelError(err.message);
      setBusy(false);
    }
  };

  return (
    <main className="container">
      <Seo
        title={t('Mon compte') + ' — Mboppi'}
        description={t('Profil') + ', ' + t('Mot de passe') + ', ' + t('Supprimer mon compte') + '.'}
      />
      <div className="dash-header">
        <div>
          <h1>👤 {t('Mon compte')}</h1>
          <p>
            {t('Connecté en tant que {name} ({role}) — gérez vos informations et votre sécurité.', { name: user?.name, role: roleLabel })}
          </p>
        </div>
      </div>

      <div className="account-grid">
        <div className="card">
          <h2>{t('Profil')}</h2>
          <p className="contact-hint">{t('Votre nom, votre adresse e-mail et votre pays.')}</p>
          <form className="contact-form" onSubmit={saveProfile}>
            <label className="field">
              <span>{t('Nom')}</span>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} required />
            </label>
            <label className="field">
              <span>{t('E-mail')}</span>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </label>
            <label className="field">
              <span>{t('Pays')}</span>
              <SearchSelect
                options={countryOptions}
                value={country}
                onChange={setCountry}
                placeholder={t('Choisir votre pays…')}
                emptyLabel={t('Aucun résultat')}
              />
            </label>
            {user?.role === 'shop' && (
              <label className="field">
                <span>{t('📍 Localisation de la boutique')}</span>
                <input
                  type="text"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="Ex : Yaoundé, Mvog-Mbi, rue 1.123"
                />
              </label>
            )}
            {profileError && <p className="error">{profileError}</p>}
            {profileMsg && <p className="success">{profileMsg}</p>}
            <button className="btn btn-primary" disabled={busy}>{t('Enregistrer')}</button>
          </form>
        </div>

        <div className="card">
          <h2>{t('Sécurité')}</h2>
          <p className="contact-hint">
            {user?.has_password
              ? t('Modifiez votre mot de passe de connexion.')
              : t('Vous vous êtes inscrit(e) avec Google : définissez un mot de passe pour pouvoir vous connecter sans Google.')}
          </p>
          <form className="contact-form" onSubmit={changePassword}>
            {user?.has_password && (
              <label className="field">
                <span>{t('Mot de passe actuel')}</span>
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                />
              </label>
            )}
            <label className="field">
              <span>{t('Nouveau mot de passe')}</span>
              <input
                type="password"
                minLength={6}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoComplete="new-password"
                required
              />
            </label>
            {pwError && <p className="error">{pwError}</p>}
            {pwMsg && <p className="success">{pwMsg}</p>}
            <button className="btn btn-primary" disabled={busy}>{t('Changer le mot de passe')}</button>
          </form>
        </div>

        <div className="card danger-card">
          <h2>{t('Zone dangereuse')}</h2>
          <p className="contact-hint">
            {t('La suppression est définitive : votre compte, vos produits, vos ventes et tout votre contenu seront supprimés de nos serveurs.')}
          </p>
          <form className="contact-form" onSubmit={onDelete}>
            {user?.has_password && (
              <label className="field">
                <span>{t('Votre mot de passe')}</span>
                <input
                  type="password"
                  value={delPassword}
                  onChange={(e) => setDelPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                />
              </label>
            )}
            {delError && <p className="error">{delError}</p>}
            <button className="btn btn-danger" disabled={busy}>{t('Supprimer mon compte')}</button>
          </form>
        </div>
      </div>
    </main>
  );
}
