import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Seo from '../components/Seo.jsx';
import { api } from '../api.js';
import { useAuth } from '../App.jsx';
import SearchSelect from '../components/SearchSelect.jsx';
import { COUNTRIES } from '../config.js';
import { CITIES } from '../cities.js';
import { useLang } from '../i18n.jsx';
import { formatMoney } from '../components/ProductCard.jsx';

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function monthAgoStr() {
  const d = new Date();
  d.setDate(d.getDate() - 29);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function fmtDateTime(iso) {
  const d = new Date(iso);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function downloadCsv(filename, header, rows) {
  const esc = (v) => {
    const s = String(v == null ? '' : v);
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const content = [header, ...rows.map((r) => r.map(esc).join(';'))].join('\n');
  const blob = new Blob(['\uFEFF' + content], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

const PERIODS = [
  { value: 'daily', label: 'Journalier' },
  { value: 'weekly', label: 'Hebdomadaire' },
  { value: 'monthly', label: 'Mensuel' },
];

function ActivityJournal() {
  const { t } = useLang();
  const [from, setFrom] = useState(monthAgoStr());
  const [to, setTo] = useState(todayStr());
  const [period, setPeriod] = useState('daily');
  const [rows, setRows] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const TYPE_LABEL = {
    product: t('Publication de produit'),
    sale: t('Vente'),
    payment: t('Commission payée'),
    referral: t('Commission de parrainage'),
    purchase: t('Achat'),
    order: t('Commande'),
  };

  const load = async (download) => {
    if (!from || !to) {
      setError(t('Choisissez une date de début et une date de fin.'));
      return;
    }
    setLoading(true);
    setError('');
    setMessage('');
    try {
      const d = await api.activity({ from, to, period });
      setRows(d.rows);
      if (download) {
        const eventsRes = await api.activityEvents({ from, to });
        if (eventsRes.events.length) {
          const header = [t('Date'), t('Activité'), t('Détails'), t('Montant'), t('Commission'), t('Statut'), t('Référence')];
          downloadCsv(
            `mboppi-activites-${from}-${to}.csv`,
            header,
            eventsRes.events.map((e) => [
              fmtDateTime(e.date),
              TYPE_LABEL[e.type] || e.type,
              e.description,
              e.amount,
              e.commission != null ? e.commission : '',
              e.status,
              e.ref,
            ])
          );
          setMessage(t('Journal téléchargé !'));
        } else {
          setMessage(t('Aucune activité sur cette période.'));
        }
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const allZero = rows && rows.every(
    (r) => !r.sales_count && !r.purchases_count && !r.orders_count && !r.products_count
  );

  return (
    <div className="card">
      <h2>📋 {t('Journal d\'activité')}</h2>
      <p className="contact-hint">
        {t('Téléchargez un inventaire de votre activité entre deux dates, par jour, par semaine ou par mois.')}
      </p>
      <p className="contact-hint">
        {t('Le fichier téléchargé liste chaque activité du compte : publications de produits, ventes, commissions payées, achats et commandes.')}
      </p>
      <div className="activity-filters">
        <label className="field">
          <span>{t('Date de début')}</span>
          <input type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="field">
          <span>{t('Date de fin')}</span>
          <input type="date" className="input" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
        <label className="field">
          <span>{t('Période')}</span>
          <select className="input" value={period} onChange={(e) => setPeriod(e.target.value)}>
            {PERIODS.map((p) => (
              <option key={p.value} value={p.value}>{t(p.label)}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="row2" style={{ marginTop: 12 }}>
        <button className="btn btn-outline" disabled={loading} onClick={() => load(false)}>
          {loading ? '…' : t('Afficher le journal')}
        </button>
        <button className="btn btn-primary" disabled={loading} onClick={() => load(true)}>
          ⬇️ {t('Télécharger le tableau (Excel)')}
        </button>
      </div>
      {error && <p className="error">{error}</p>}
      {message && <p className="success">{message}</p>}
      {rows && rows.length > 0 && (
        <div className="table-wrap" style={{ marginTop: 16 }}>
          <table className="table">
            <thead>
              <tr>
                <th>{t('Période')}</th>
                <th>{t('Ventes')}</th>
                <th>{t('Montant ventes')}</th>
                <th>{t('Commissions')}</th>
                <th>{t('Achats')}</th>
                <th>{t('Commandes')}</th>
                <th>{t('Produits publiés')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.period}>
                  <td>{r.period}</td>
                  <td>{r.sales_count}</td>
                  <td>{formatMoney(r.sales_total)}</td>
                  <td>{formatMoney(r.commission)}</td>
                  <td>{r.purchases_count > 0 ? `${r.purchases_count} (${formatMoney(r.purchases_total)})` : '—'}</td>
                  <td>{r.orders_count > 0 ? `${r.orders_count} (${formatMoney(r.orders_total)})` : '—'}</td>
                  <td>{r.products_count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {rows && rows.length > 0 && allZero && (
        <p className="empty">{t('Aucune activité sur cette période.')}</p>
      )}
    </div>
  );
}

export default function MyAccount() {
  const { user, login, logout } = useAuth();
  const { t } = useLang();
  const navigate = useNavigate();

  const [name, setName] = useState(user?.name || '');
  const [email, setEmail] = useState(user?.email || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [location, setLocation] = useState(user?.location || '');
  const [city, setCity] = useState(user?.city || '');
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
  const roleLabel = user?.role === 'shop' ? t('boutique') : user?.role === 'seller' ? t('vendeur') : user?.role === 'client' ? t('client') : user?.role === 'livreur' ? t('livreur') : t('créateur');

  const saveProfile = async (e) => {
    e.preventDefault();
    setBusy(true);
    setProfileMsg('');
    setProfileError('');
    try {
      const { user: updated } = await api.updateProfile({ name, email, phone, location, city, country });
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
        description={t('Profil') + ', ' + t('Mot de passe') + ', ' + t('Supprimer mon compte') + '.'} noindex/>
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
          <p className="contact-hint">{t('Votre nom, votre adresse e-mail, votre numéro de téléphone et votre pays.')}</p>
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
              <span>{t('Numéro de téléphone')}</span>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder={t('ex : +237 6 00 00 00 00')}
              />
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
              <>
              <label className="field">
                <span>{t('📍 Ville de la boutique')}</span>
                <input
                  type="text"
                  list="mboppi-shop-cities"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="Ex : Douala, Yaoundé…"
                />
              </label>
              <datalist id="mboppi-shop-cities">
                {CITIES.map((c) => (
                  <option key={c.name} value={c.name} />
                ))}
              </datalist>
              <label className="field">
                <span>{t('📍 Localisation de la boutique')}</span>
                <input
                  type="text"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="Ex : Yaoundé, Mvog-Mbi, rue 1.123"
                />
              </label>
              </>
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

      <div style={{ marginTop: 24 }}>
        <ActivityJournal />
      </div>
    </main>
  );
}
