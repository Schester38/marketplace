import React, { useCallback, useEffect, useState } from 'react';
import Seo from '../components/Seo.jsx';
import PwaInstallButton from '../components/PwaInstallButton.jsx';
import { api } from '../api.js';
import { useLang } from '../i18n.jsx';
import { useRefreshOnFocus } from '../useRefreshOnFocus.js';
import { formatMoney } from '../components/ProductCard.jsx';
import { countrySymbol } from '../config.js';

export default function Admin() {
  const { t } = useLang();
  const [gate, setGate] = useState(() => !localStorage.getItem('admin_token'));
  const [password, setPassword] = useState('');
  const [gateError, setGateError] = useState('');
  const [busy, setBusy] = useState(false);
  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState(null);
  const [products, setProducts] = useState(null);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(() => {
    api.adminStats().then(setStats).catch(() => {});
    api.adminUsers().then((d) => setUsers(d.users)).catch(() => {});
    api.adminProducts().then((d) => setProducts(d.products)).catch(() => {});
  }, []);

  useEffect(() => {
    if (!gate) load();
  }, [gate, load]);
  useRefreshOnFocus(load);

  const submitGate = async (e) => {
    e.preventDefault();
    setBusy(true);
    setGateError('');
    try {
      const d = await api.adminPass(password);
      localStorage.setItem('admin_token', d.token);
      setGate(false);
      setPassword('');
    } catch (err) {
      setGateError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const logout = () => {
    localStorage.removeItem('admin_token');
    setGate(true);
    setStats(null);
    setUsers(null);
    setProducts(null);
  };

  const searchUsers = async (e) => {
    e.preventDefault();
    try {
      const d = await api.adminUsers(search.trim());
      setUsers(d.users);
    } catch (err) {
      setError(err.message);
    }
  };

  const toggleVerified = async (u) => {
    try {
      await api.adminSetVerified(u.id, !u.verified);
      setUsers((us) => us.map((x) => (x.id === u.id ? { ...x, verified: !x.verified } : x)));
    } catch (err) {
      setError(err.message);
    }
  };

  const removeProduct = async (p) => {
    if (!window.confirm(t('Supprimer « {name} » ?', { name: p.name }))) return;
    try {
      await api.adminDeleteProduct(p.id);
      setProducts((ps) => ps.filter((x) => x.id !== p.id));
    } catch (err) {
      setError(err.message);
    }
  };

  const card = (label, value) => (
    <div className="card stat-card">
      <span className="stat-label">{label}</span>
      <strong className="stat-value">{value}</strong>
    </div>
  );

  if (gate) {
    return (
      <main className="container narrow">
        <Seo title={t('Administration') + ' — Mboppi'} description={t('Administration')} />
        <section className="dash-header">
          <div>
            <h1>🛡️ {t('Administration')}</h1>
            <p>{t('Espace réservé. Entrez le mot de passe administrateur.')}</p>
          </div>
          <PwaInstallButton />
        </section>
        <form onSubmit={submitGate} className="card admin-login">
          <input
            type="password"
            className="admin-login-input"
            placeholder={t('Mot de passe')}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
          />
          {gateError && <p className="error" role="alert">{gateError}</p>}
          <button type="submit" className="btn btn-primary btn-block" disabled={busy || !password}>
            {busy ? t('Vérification…') : t('Entrer')}
          </button>
        </form>
      </main>
    );
  }

  return (
    <main className="container">
      <Seo title={t('Administration') + ' — Mboppi'} description={t('Administration')} />
      <section className="dash-header">
        <div>
          <h1>🛡️ {t('Administration')}</h1>
          <p>{t('Vue globale de la plateforme.')}</p>
        </div>
        <div className="dash-actions">
          <PwaInstallButton />
          <button type="button" className="btn btn-outline btn-small" onClick={logout}>
            {t('Se déconnecter')}
          </button>
        </div>
      </section>

      {error && <p className="error" role="alert">{error}</p>}

      <section className="stats-grid">
        {card(t('Utilisateurs'), stats ? stats.users : '…')}
        {card(t('Boutiques'), stats ? stats.shops : '…')}
        {card(t('Créateurs'), stats ? stats.creators : '…')}
        {card(t('Vendeurs'), stats ? stats.sellers : '…')}
        {card(t('Clients'), stats ? stats.clients : '…')}
        {card(t('Livreurs'), stats ? stats.livreurs : '…')}
        {card(t('Produits'), stats ? stats.products : '…')}
        {card(t('Ventes'), stats ? stats.sales : '…')}
        {card(t('En attente'), stats ? stats.pending_sales : '…')}
        {card(t('Livrées'), stats ? stats.delivered_sales : '…')}
        {card(t('Chiffre d\'affaires'), stats ? `${formatMoney(stats.revenue)}` : '…')}
        {card(t('Avis'), stats ? `${stats.reviews} (${stats.rating_avg}/5)` : '…')}
        {card(t('Inscrits aujourd\'hui'), stats ? stats.users_today : '…')}
      </section>

      <h2 className="section-title">{t('👥 Utilisateurs')}</h2>
      <form onSubmit={searchUsers} className="hero-search" role="search">
        <span className="emoji" aria-hidden="true">🔍</span>
        <input
          type="search"
          placeholder={t('Rechercher un utilisateur (nom ou email)…')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button type="submit" className="btn btn-primary">{t('Rechercher')}</button>
      </form>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>{t('Nom')}</th>
              <th>{t('Email')}</th>
              <th>{t('Rôle')}</th>
              <th>{t('Pays')}</th>
              <th>{t('Inscription')}</th>
              <th>{t('Vérifié')}</th>
            </tr>
          </thead>
          <tbody>
            {users === null ? (
              <tr><td colSpan="6"><div className="skeleton-block" style={{ height: 30 }}></div></td></tr>
            ) : users.length === 0 ? (
              <tr><td colSpan="6" className="empty">{t('Aucun utilisateur')}</td></tr>
            ) : (
              users.map((u) => (
                <tr key={u.id}>
                  <td>{u.name}</td>
                  <td className="hint">{u.email}</td>
                  <td><span className="badge">{t(u.role)}</span></td>
                  <td>{u.country || '—'}</td>
                  <td className="hint">{new Date(u.created_at).toLocaleDateString()}</td>
                  <td>
                    <button
                      type="button"
                      className={`btn btn-small ${u.verified ? 'btn-primary' : 'btn-outline'}`}
                      onClick={() => toggleVerified(u)}
                    >
                      {u.verified ? t('✓ Vérifié') : t('Vérifier')}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <h2 className="section-title">{t('🛍️ Produits')}</h2>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>{t('Produit')}</th>
              <th>{t('Boutique')}</th>
              <th>{t('Prix')}</th>
              <th>{t('Date')}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {products === null ? (
              <tr><td colSpan="5"><div className="skeleton-block" style={{ height: 30 }}></div></td></tr>
            ) : products.length === 0 ? (
              <tr><td colSpan="5" className="empty">{t('Aucun produit')}</td></tr>
            ) : (
              products.map((p) => (
                <tr key={p.id}>
                  <td>{p.name}</td>
                  <td>
                    {p.shop_name}
                    {p.shop_verified && <span className="badge badge-verified">✓</span>}
                  </td>
                  <td>{formatMoney(p.price)} {countrySymbol('')}</td>
                  <td className="hint">{new Date(p.created_at).toLocaleDateString()}</td>
                  <td>
                    <button type="button" className="btn btn-danger btn-small" onClick={() => removeProduct(p)}>
                      {t('Supprimer')}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
