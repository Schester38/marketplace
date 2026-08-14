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
  const [transactions, setTransactions] = useState(null);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [messages, setMessages] = useState(null);
  const [msgText, setMsgText] = useState('');
  const [msgTarget, setMsgTarget] = useState('all');
  const [msgUserId, setMsgUserId] = useState('');
  const [msgBusy, setMsgBusy] = useState(false);
  const [msgOk, setMsgOk] = useState('');
  const [logs, setLogs] = useState(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback((silent) => {
    if (!silent) setLoading(true);
    const onErr = (e) => {
      if (e && (e.status === 401 || e.status === 403)) {
        localStorage.removeItem('admin_token');
        setGate(true);
        setGateError(t('Session expirée ou invalide. Entrez à nouveau le mot de passe administrateur.'));
      } else if (e && e.message) {
        setError(e.message);
      }
      setLoading(false);
    };
    api.adminStats().then((d) => { setStats(d.stats); setLoading(false); }).catch(onErr);
    api.adminUsers().then((d) => setUsers(d.users)).catch(onErr);
    api.adminProducts().then((d) => setProducts(d.products)).catch(onErr);
    api.adminTransactions().then(setTransactions).catch(onErr);
    api.adminMessages().then((d) => setMessages(d.messages)).catch(onErr);
    api.adminLogs(100).then((d) => setLogs(d.logs)).catch(onErr);
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
    setLoading(false);
    setStats(null);
    setUsers(null);
    setProducts(null);
    setTransactions(null);
    setMessages(null);
    setLogs(null);
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

  const sendMessage = async (e) => {
    e.preventDefault();
    setMsgOk('');
    const text = msgText.trim();
    if (!text) return;
    if (msgTarget === 'user' && !msgUserId) return;
    setMsgBusy(true);
    try {
      await api.adminSendMessage({
        message: text,
        target: msgTarget,
        userId: msgTarget === 'user' ? Number(msgUserId) : null,
      });
      setMsgText('');
      setMsgUserId('');
      setMsgOk(t('Message envoyé avec succès.'));
      api.adminMessages().then((d) => setMessages(d.messages)).catch(() => {});
    } catch (err) {
      setError(err.message);
    } finally {
      setMsgBusy(false);
    }
  };

  const card = (label, value) => (
    <div className="card stat-card">
      <span className="stat-label">{label}</span>
      <strong className="stat-value">{value}</strong>
    </div>
  );

  const statusInfo = {
    pending: { label: 'En attente', cls: 'badge-pending' },
    bought: { label: 'Acheté', cls: 'badge-bought' },
    confirmed: { label: 'Confirmée', cls: 'badge-confirmed' },
    delivered: { label: 'Livré', cls: 'badge-bought' },
    cancelled: { label: 'Annulée', cls: 'badge-cancelled' },
  };
  const statusBadge = (s) => {
    const st = statusInfo[s] || { label: s, cls: 'badge' };
    return <span className={`badge ${st.cls}`}>{t(st.label)}</span>;
  };

  if (gate) {
    return (
      <main className="container narrow">
        <Seo title={t('Administration') + ' — Mboppi'} description={t('Administration')} noindex/>
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
      <Seo title={t('Administration') + ' — Mboppi'} description={t('Administration')} noindex/>
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
      {!error && !loading && stats === null && users === null && (
        <p className="hint">{t('Chargement des données…')}</p>
      )}

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

      <h2 className="section-title">✉️ {t('Messages aux utilisateurs')}</h2>
      <form onSubmit={sendMessage} className="card msg-form">
        <p className="hint">
          {t('Envoyez un message qui s\'affichera en popup à la prochaine connexion des utilisateurs (une seule fois).')}
        </p>
        <textarea
          className="msg-textarea"
          rows="4"
          maxLength="2000"
          placeholder={t('Votre message…')}
          value={msgText}
          onChange={(e) => setMsgText(e.target.value)}
        />
        <div className="msg-target-row">
          <label className="msg-radio">
            <input
              type="radio"
              name="msg-target"
              checked={msgTarget === 'all'}
              onChange={() => setMsgTarget('all')}
            />
            <span>{t('À tous les utilisateurs')}</span>
          </label>
          <label className="msg-radio">
            <input
              type="radio"
              name="msg-target"
              checked={msgTarget === 'user'}
              onChange={() => setMsgTarget('user')}
            />
            <span>{t('À un utilisateur')}</span>
          </label>
        </div>
        {msgTarget === 'user' && (
          <select
            className="msg-select"
            value={msgUserId}
            onChange={(e) => setMsgUserId(e.target.value)}
            required
          >
            <option value="">{t('Choisir un utilisateur…')}</option>
            {(users || []).map((u) => (
              <option key={u.id} value={u.id}>
                {u.name} — {u.email} ({u.role})
              </option>
            ))}
          </select>
        )}
        {msgOk && <p className="success" role="status">{msgOk}</p>}
        <button
          type="submit"
          className="btn btn-primary btn-block"
          disabled={msgBusy || !msgText.trim() || (msgTarget === 'user' && !msgUserId)}
        >
          {msgBusy ? t('Envoi…') : t('Envoyer')}
        </button>
      </form>

      <h3>{t('Messages envoyés')}</h3>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>{t('Message')}</th>
              <th>{t('Destinataires')}</th>
              <th>{t('Date')}</th>
            </tr>
          </thead>
          <tbody>
            {messages === null ? (
              <tr><td colSpan="3"><div className="skeleton-block" style={{ height: 30 }}></div></td></tr>
            ) : messages.length === 0 ? (
              <tr><td colSpan="3" className="empty">{t('Aucun message envoyé')}</td></tr>
            ) : (
              messages.map((m) => (
                <tr key={m.id}>
                  <td>{m.message}</td>
                  <td>
                    {m.target === 'all'
                      ? t('Tous les utilisateurs')
                      : `${t('Utilisateur')} : ${m.user_name || '—'}`}
                  </td>
                  <td className="hint">{new Date(m.created_at).toLocaleString()}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <h2 className="section-title">🛠️ {t('Erreurs signalées par les visiteurs')}</h2>
      <p className="hint">
        {t('Erreurs JavaScript remontées automatiquement par le navigateur des clients (une toutes les 5 s maximum par client).')}
      </p>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>{t('Message')}</th>
              <th>{t('Utilisateur')}</th>
              <th>{t('Page')}</th>
              <th>{t('Date')}</th>
            </tr>
          </thead>
          <tbody>
            {logs === null ? (
              <tr><td colSpan="4"><div className="skeleton-block" style={{ height: 30 }}></div></td></tr>
            ) : logs.length === 0 ? (
              <tr><td colSpan="4" className="empty">{t('Aucune erreur signalée 🎉')}</td></tr>
            ) : (
              logs.map((l) => (
                <tr key={l.id} title={l.stack || ''}>
                  <td>{l.message}</td>
                  <td className="hint">{l.username || '—'}</td>
                  <td className="hint">{l.url || '—'}</td>
                  <td className="hint">{new Date(l.created_at).toLocaleString()}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <h2 className="section-title">👥 {t('Utilisateurs')}</h2>
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

      <h2 className="section-title">{t('💸 Toutes les transactions')}</h2>
      <p className="hint">
        {t('Activité regroupée de tous les utilisateurs (boutiques, vendeurs, clients, livreurs, créateurs).')}
      </p>
      {transactions === null ? (
        <div className="card page-center">
          <div className="skeleton-block" style={{ height: 80 }}></div>
        </div>
      ) : (
        <>
          <div className="stats-grid">
            {card(t('Transactions avec vendeur'), transactions.with_seller.count)}
            {card(t('Commandes directes (panier)'), transactions.direct.count)}
            {card(t('Montant commandes directes'), `${formatMoney(transactions.direct.total)} ${countrySymbol('')}`)}
          </div>

          <h3>{t('Par statut')}</h3>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>{t('Statut')}</th>
                  <th>{t('Nombre')}</th>
                  <th>{t('Total')}</th>
                </tr>
              </thead>
              <tbody>
                {transactions.by_status.map((r) => (
                  <tr key={r.status}>
                    <td>{statusBadge(r.status)}</td>
                    <td>{r.count}</td>
                    <td>{formatMoney(r.total)} {countrySymbol('')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h3>{t('Par boutique')}</h3>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>{t('Boutique')}</th>
                  <th>{t('Pays')}</th>
                  <th>{t('Ventes')}</th>
                  <th>{t('Chiffre d\'affaires')}</th>
                  <th>{t('Commissions')}</th>
                </tr>
              </thead>
              <tbody>
                {transactions.by_shop.length === 0 ? (
                  <tr><td colSpan="5" className="empty">{t('Aucune transaction')}</td></tr>
                ) : (
                  transactions.by_shop.map((r) => (
                    <tr key={r.shop_name + r.country}>
                      <td>{r.shop_name}</td>
                      <td>{r.country || '—'}</td>
                      <td>{r.count}</td>
                      <td>{formatMoney(r.revenue)} {countrySymbol('')}</td>
                      <td>{formatMoney(r.commission)} {countrySymbol('')}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <h3>{t('Par vendeur')}</h3>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>{t('Vendeur')}</th>
                  <th>{t('Code')}</th>
                  <th>{t('Ventes')}</th>
                  <th>{t('Commissions')}</th>
                  <th>{t('Payées')}</th>
                </tr>
              </thead>
              <tbody>
                {transactions.by_seller.length === 0 ? (
                  <tr><td colSpan="5" className="empty">{t('Aucune transaction')}</td></tr>
                ) : (
                  transactions.by_seller.map((r) => (
                    <tr key={r.seller_name + (r.seller_code || '')}>
                      <td>{r.seller_name}</td>
                      <td><code className="seller-code-inline">{r.seller_code || '—'}</code></td>
                      <td>{r.count}</td>
                      <td>{formatMoney(r.commission)} {countrySymbol('')}</td>
                      <td>{formatMoney(r.paid)} {countrySymbol('')}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <h3>{t('Dernières transactions')}</h3>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>{t('Produit')}</th>
                  <th>{t('Boutique')}</th>
                  <th>{t('Vendeur')}</th>
                  <th>{t('Parrain')}</th>
                  <th>{t('Client')}</th>
                  <th>{t('Montant')}</th>
                  <th>{t('Commission')}</th>
                  <th>{t('Statut')}</th>
                  <th>{t('Date')}</th>
                </tr>
              </thead>
              <tbody>
                {transactions.rows.length === 0 ? (
                  <tr><td colSpan="9" className="empty">{t('Aucune transaction')}</td></tr>
                ) : (
                  transactions.rows.map((r) => (
                    <tr key={r.id}>
                      <td>{r.product_name}</td>
                      <td>{r.shop_name}</td>
                      <td>{r.seller_name}</td>
                      <td>{r.parrain_name && r.parrain_name !== '—' ? r.parrain_name : '—'}</td>
                      <td>{r.buyer_name || '—'}</td>
                      <td>{formatMoney(r.total_price)} {countrySymbol(r.shop_country)}</td>
                      <td>{formatMoney(r.commission + r.referral_commission)} {countrySymbol(r.shop_country)}</td>
                      <td>{statusBadge(r.status)}</td>
                      <td className="hint">{new Date(r.created_at).toLocaleDateString()}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </main>
  );
}
