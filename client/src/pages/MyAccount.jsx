import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Seo from '../components/Seo.jsx';
import { api } from '../api.js';
import { useAuth } from '../App.jsx';

export default function MyAccount() {
  const { user, login, logout } = useAuth();
  const navigate = useNavigate();

  const [name, setName] = useState(user?.name || '');
  const [email, setEmail] = useState(user?.email || '');
  const [profileMsg, setProfileMsg] = useState('');
  const [profileError, setProfileError] = useState('');

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [pwMsg, setPwMsg] = useState('');
  const [pwError, setPwError] = useState('');

  const [delPassword, setDelPassword] = useState('');
  const [delError, setDelError] = useState('');
  const [busy, setBusy] = useState(false);

  const roleLabel = user?.role === 'shop' ? 'boutique' : user?.role === 'seller' ? 'vendeur' : user?.role === 'client' ? 'client' : 'créateur';

  const saveProfile = async (e) => {
    e.preventDefault();
    setBusy(true);
    setProfileMsg('');
    setProfileError('');
    try {
      const { user: updated } = await api.updateProfile({ name, email });
      login(updated, localStorage.getItem('token'));
      setProfileMsg('Profil mis à jour avec succès.');
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
      setPwMsg('Mot de passe modifié avec succès.');
    } catch (err) {
      setPwError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const onDelete = async (e) => {
    e.preventDefault();
    if (!window.confirm('Supprimer définitivement votre compte ? Vos produits, ventes et tout votre contenu seront supprimés. Cette action est irréversible.')) return;
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
        title="Mon compte — Mboppi"
        description="Gérez votre profil, votre mot de passe et la suppression de votre compte."
      />
      <div className="dash-header">
        <div>
          <h1>👤 Mon compte</h1>
          <p>
            Connecté en tant que <strong>{user?.name}</strong> ({roleLabel}) — gérez
            vos informations et votre sécurité.
          </p>
        </div>
      </div>

      <div className="account-grid">
        <div className="card">
          <h2>Profil</h2>
          <p className="contact-hint">Votre nom et votre adresse e-mail.</p>
          <form className="contact-form" onSubmit={saveProfile}>
            <label className="field">
              <span>Nom</span>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} required />
            </label>
            <label className="field">
              <span>E-mail</span>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </label>
            {profileError && <p className="error">{profileError}</p>}
            {profileMsg && <p className="success">{profileMsg}</p>}
            <button className="btn btn-primary" disabled={busy}>Enregistrer</button>
          </form>
        </div>

        <div className="card">
          <h2>Mot de passe</h2>
          <p className="contact-hint">
            {user?.has_password
              ? 'Modifiez votre mot de passe de connexion.'
              : 'Vous vous êtes inscrit(e) avec Google : définissez un mot de passe pour pouvoir vous connecter sans Google.'}
          </p>
          <form className="contact-form" onSubmit={changePassword}>
            {user?.has_password && (
              <label className="field">
                <span>Mot de passe actuel</span>
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
              <span>Nouveau mot de passe</span>
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
            <button className="btn btn-primary" disabled={busy}>Changer le mot de passe</button>
          </form>
        </div>

        <div className="card danger-card">
          <h2>Zone dangereuse</h2>
          <p className="contact-hint">
            La suppression est définitive : votre compte, vos produits, vos ventes et
            tout votre contenu seront supprimés de nos serveurs.
          </p>
          <form className="contact-form" onSubmit={onDelete}>
            {user?.has_password && (
              <label className="field">
                <span>Votre mot de passe</span>
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
            <button className="btn btn-danger" disabled={busy}>Supprimer mon compte</button>
          </form>
        </div>
      </div>
    </main>
  );
}
