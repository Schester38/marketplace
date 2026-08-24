import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import ProductCard from '../components/ProductCard.jsx';
import { formatMoney } from '../components/ProductCard.jsx';
import FlashPromoCard from '../components/FlashPromo.jsx';
import { downloadInvoice } from '../components/Invoice.jsx';
import Seo from '../components/Seo.jsx';
import { useAuth } from '../App.jsx';
import { compressImage, thumbFromDataUrl } from '../utils.js';
import { PRODUCT_CATEGORIES, countryPhone, countrySymbol } from '../config.js';
import { useLang } from '../i18n.jsx';
import { useRefreshOnFocus } from '../useRefreshOnFocus.js';
import ExportSalesButton from '../components/ExportSalesButton.jsx';
import {
  IconCart, IconChartBar, IconTruck, IconBanknote, IconAward, IconStore,
} from '../components/icons.jsx';

const EMPTY_FORM = {
  name: '',
  description: '',
  category: '',
  warranty: '',
  delivery_fee: '',
  contact: '',
  quantity: '',
  price: '',
  old_price: '',
  commission_percent: '',
  photos: [],
};
const MAX_PHOTOS = 3;

const SALE_STATUS = {
  pending: { key: 'En attente de vente', cls: 'badge-pending' },
  bought: { key: 'Acheté', cls: 'badge-bought' },
  confirmed: { key: 'Confirmée', cls: 'badge-confirmed' },
  delivered: { key: 'Livré', cls: 'badge-bought' },
  cancelled: { key: 'Annulée', cls: 'badge-cancelled' },
};

export default function ShopDashboard() {
  const { user } = useAuth();
  const { t, locale } = useLang();
  const [products, setProducts] = useState([]);
  const [sales, setSales] = useState([]);
  const [stats, setStats] = useState(null);
  const [series, setSeries] = useState([]);
  const [topProducts, setTopProducts] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [showDelivered, setShowDelivered] = useState(true);
  const [payForm, setPayForm] = useState(null);
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [picking, setPicking] = useState(false);
  const [shopCode, setShopCode] = useState(null);
  const [codeLoading, setCodeLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [flashPromos, setFlashPromos] = useState([]);
  const [flashForm, setFlashForm] = useState({ productId: '', promoPrice: '', minutes: '180' });
  const [flashLoading, setFlashLoading] = useState(false);
  const symbol = countrySymbol(user?.country);
  const prefix = countryPhone(user?.country);

  useEffect(() => {
    api.shopCode().then((d) => setShopCode(d.shop_code)).catch(() => {});
  }, []);

  const generateShopCode = async () => {
    setCodeLoading(true);
    try {
      const d = await api.createShopCode();
      setShopCode(d.shop_code);
      setSuccess(t('Code livreur généré : {code}', { code: d.shop_code }));
    } catch (err) {
      setError(err.message);
    } finally {
      setCodeLoading(false);
    }
  };

  const copyShopCode = async () => {
    try {
      await navigator.clipboard.writeText(shopCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* silencieux */
    }
  };

  const addPhotos = async (files) => {
    const list = Array.from(files || []);
    if (!list.length) return;
    setPicking(true);
    try {
      const remaining = MAX_PHOTOS - form.photos.length;
      const batch = list.slice(0, remaining);
      const compressed = await Promise.all(
        batch.map(async (f) => {
          const full = await compressImage(f);
          return { thumb: await thumbFromDataUrl(full), full };
        })
      );
      setForm((f) => ({ ...f, photos: [...f.photos, ...compressed].slice(0, MAX_PHOTOS) }));
    } finally {
      setPicking(false);
    }
  };

  const removePhoto = (i) => {
    setForm((f) => ({ ...f, photos: f.photos.filter((_, idx) => idx !== i) }));
  };

  const load = async () => {
    try {
      const [prodData, saleData, flashData] = await Promise.all([
        api.myProducts(),
        api.shopSales(user.id),
        api.flashPromotions(),
      ]);
      setProducts(prodData.products);
      setSales(saleData.sales);
      setStats(saleData.stats);
      setSeries(saleData.series || []);
      setTopProducts(saleData.topProducts || []);
      setFlashPromos(flashData.promotions || []);
    } catch (e) {
      setError(e.message);
    }
  };

  useEffect(() => { load(); }, []);

  useRefreshOnFocus(load);

  const submitProduct = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    const priceNum = form.price === '' ? null : Number(form.price);
    const oldNum = form.old_price === '' ? null : Number(form.old_price);
    if (priceNum === null && oldNum === null) {
      setError(t('Renseignez au moins un prix (normal ou de vente).'));
      return;
    }
    if (priceNum !== null && !Number.isFinite(priceNum) || priceNum !== null && priceNum < 0 || oldNum !== null && !Number.isFinite(oldNum) || oldNum !== null && oldNum < 0) {
      setError(t('Prix invalide'));
      return;
    }
    const payload = {
      ...form,
      price: priceNum !== null ? priceNum : oldNum,
      old_price: priceNum !== null ? oldNum : null,
      commission_percent: Number(form.commission_percent || 0),
      delivery_fee: Number(form.delivery_fee || 0),
      quantity: Number(form.quantity || 1),
      warranty: form.warranty.trim() || null,
      contact: form.contact ? `${prefix}${form.contact.trim()}` : '',
    };
    try {
      if (editingId) {
        await api.updateProduct(editingId, payload);
        setSuccess(t('Produit mis à jour !'));
      } else {
        await api.createProduct(payload);
        setSuccess(t('Produit publié avec succès.'));
      }
      setForm(EMPTY_FORM);
      setEditingId(null);
      setShowForm(false);
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const editProduct = async (p) => {
    const currentPrefix = countryPhone(user?.country);
    const contact = p.contact && p.contact.startsWith(currentPrefix)
      ? p.contact.slice(currentPrefix.length)
      : (p.contact || '');
    let photos = Array.isArray(p.photos) && p.photos.length ? p.photos : p.image ? [p.image] : [];
    try {
      const detail = await api.getProduct(p.id);
      const fulls = detail.product.photos || [];
      if (fulls.length) {
        const thumbs = Array.isArray(p.photos) ? p.photos : [];
        photos = fulls.map((full, i) => ({ thumb: thumbs[i] || full, full }));
      }
    } catch {
      /* silencieux */
    }
    setForm({
      name: p.name || '',
      description: p.description || '',
      category: p.category || '',
      warranty: p.warranty || '',
      delivery_fee: p.delivery_fee != null ? String(p.delivery_fee) : '',
      contact,
      quantity: p.quantity != null ? String(p.quantity) : '',
      price: p.price != null ? String(p.price) : '',
      old_price: p.old_price != null ? String(p.old_price) : '',
      commission_percent: p.commission_percent != null ? String(p.commission_percent) : '',
      photos,
    });
    setEditingId(p.id);
    setShowForm(true);
    setError('');
    setSuccess('');
  };

  const removeProduct = async (id) => {
    if (!window.confirm(t('Supprimer ce produit ?'))) return;
    try {
      await api.deleteProduct(id);
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const duplicateProduct = async (id) => {
    setError('');
    setSuccess('');
    try {
      const { product } = await api.duplicateProduct(id);
      setSuccess(t('Produit « {name} » dupliqué. Pensez à modifier la copie.', { name: product.name }));
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const changeStatus = async (id, status) => {
    try {
      await api.updateSaleStatus(id, status);
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const submitFlash = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setFlashLoading(true);
    try {
      await api.createFlashPromotion({
        product_id: Number(flashForm.productId),
        promo_price: Number(flashForm.promoPrice),
        duration_minutes: Number(flashForm.minutes),
      });
      setSuccess(t('Promotion éclair lancée !'));
      setFlashForm({ productId: '', promoPrice: '', minutes: '180' });
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setFlashLoading(false);
    }
  };

  const removeFlash = async (pr) => {
    if (!window.confirm(t('Rétirer cette promotion éclair ?'))) return;
    setError('');
    setSuccess('');
    try {
      await api.deleteFlashPromotion(pr.id);
      setSuccess(t('Promotion rétirée.'));
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const shareFlashPromo = async (pr) => {
    const url = `${window.location.origin}/produit/${pr.product_id}`;
    const text = t('⚡ Offre éclair chez {shop} : {name} à {price} {symbol} au lieu de {old} {symbol} (-{pct}%) sur Mboppi.', {
      shop: pr.shop_name,
      name: pr.product_name,
      price: formatMoney(pr.promo_price),
      old: formatMoney(pr.price),
      pct: pr.discount_percent || 0,
      symbol: countrySymbol(pr.shop_country),
    });
    try {
      if (navigator.share) {
        await navigator.share({ title: pr.product_name, text, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setSuccess(t('Lien de la promotion copié !'));
    } catch {}
  };

  const removeDelivered = async (s) => {
    if (!window.confirm(t('Supprimer cette livraison « {name} » de mon espace ?', { name: s.product_name }))) return;
    setError('');
    setSuccess('');
    try {
      await api.deleteDeliveredSale(s.id);
      setSales((prev) => prev.filter((x) => x.id !== s.id));
      setSuccess(t('Livraison supprimée de votre espace.'));
    } catch (err) {
      setError(err.message);
    }
  };

  const openPay = async (sale, kind = 'seller') => {
    setError('');
    setSuccess('');
    try {
      const d = await api.salePaymentMethods(sale.id, kind === 'referral' ? 'referral' : null);
      setPayForm({ target: 'single', kind, sale, methods: d.methods, proof: '' });
    } catch (err) {
      setError(err.message);
    }
  };

  const openPayGrouped = async (kind, group) => {
    setError('');
    setSuccess('');
    try {
      const first = group.items[0];
      const d = first ? await api.salePaymentMethods(first.id, kind === 'referral' ? 'referral' : null) : { methods: null };
      setPayForm({ target: 'grouped', kind, group, methods: d.methods, proof: '' });
    } catch (err) {
      setError(err.message);
    }
  };

  const addProof = async (file) => {
    if (!file) return;
    const isVideo = file.type.startsWith('video/');
    if (isVideo) {
      if (file.size > 10 * 1024 * 1024) {
        setError(t('Vidéo trop lourde : limite 10 Mo.'));
        return;
      }
      const reader = new FileReader();
      reader.onload = () => setPayForm((f) => ({ ...f, proof: reader.result }));
      reader.readAsDataURL(file);
    } else {
      const compressed = await compressImage(file);
      setPayForm((f) => ({ ...f, proof: compressed }));
    }
  };

  const submitPay = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setPaying(true);
    try {
      if (payForm.target === 'grouped') {
        const d = await api.groupedPay(payForm.kind, payForm.group.seller_id || payForm.group.parrain_id, payForm.proof);
        setSuccess(payForm.kind === 'referral' ? t('Parrain payé ! La preuve a été enregistrée.') : t('Vendeur payé ! La preuve a été enregistrée.'));
        setPayForm(null);
        load();
        return;
      }
      const d = payForm.kind === 'referral'
        ? await api.payReferral(payForm.sale.id, { proof: payForm.proof })
        : await api.paySale(payForm.sale.id, { proof: payForm.proof });
      setSales((prev) => prev.map((s) => (s.id === d.sale.id ? d.sale : s)));
      setStats((prev) =>
        prev
          ? {
              ...prev,
              paid_commission: (prev.paid_commission || 0) + d.sale.commission + (d.sale.referral_commission || 0),
              owed_commission: Math.max(0, (prev.owed_commission || 0) - d.sale.commission - (d.sale.referral_commission || 0)),
            }
          : prev
      );
      setSuccess(payForm.kind === 'referral' ? t('Parrain payé ! La preuve a été enregistrée.') : t('Vendeur payé ! La preuve a été enregistrée.'));
      setPayForm(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setPaying(false);
    }
  };

  const deliveredSales = sales.filter((s) => s.status === 'delivered');

  const seriesMap = Object.fromEntries((series || []).map((s) => [s.day, s]));
  const now = new Date();
  const bars = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(now);
    d.setDate(now.getDate() - (13 - i));
    const key = d.toISOString().slice(0, 10);
    const s = seriesMap[key];
    return {
      key,
      label: d.toLocaleDateString(locale, { day: '2-digit', month: '2-digit' }),
      cnt: s ? s.cnt : 0,
      rev: s ? s.rev : 0,
    };
  });
  const maxRev = Math.max(1, ...bars.map((b) => b.rev));
  bars.forEach((b) => { b.pct = Math.round((b.rev / maxRev) * 100); });

  const CH_W = 720;
  const CH_H = 210;
  const CH_PAD = 24;
  const chMax = Math.max(1, ...bars.map((b) => b.rev));
  const chX = (i) => CH_PAD + (i * (CH_W - 2 * CH_PAD)) / Math.max(1, bars.length - 1);
  const chY = (v) => CH_H - CH_PAD - ((Number(v) / chMax) * (CH_H - 2 * CH_PAD));
  const chLine = bars.map((b, i) => `${chX(i)},${chY(b.rev)}`).join(' ');
  const chArea = `M${chX(0)},${CH_H - CH_PAD} L${chLine} L${chX(bars.length - 1)},${CH_H - CH_PAD} Z`;

  const remaining = (products?.length ?? 0) < 5;

  const activeSales = (sales || []).filter((s) => s.status !== 'delivered');

  return (
    <main className="container">
      <Seo title={t('Ma boutique') + ' — Mboppi'} description={t('Gérez vos produits et suivez vos ventes.')} noindex/>
      <section className="dash-header">
        <div>
          <h1>{t('Ma boutique')}</h1>
          <p>
            {t('Produits publiés : {n} / 5', { n: products.length })}
            {products.length >= 5 && <span className="badge badge-warn">{t('Limite atteinte')}</span>}
          </p>
        </div>
        <div className="row2 dash-actions">
          <Link className="btn btn-outline btn-sm" to="/shop/paiements" style={{ flexShrink: 0 }}>
            💳 {t('Moyens de paiement')}
          </Link>
          <Link className="btn btn-outline btn-sm" to="/shop/livreurs" style={{ flexShrink: 0 }}>
            🛵 {t('Contacter un livreur')}
          </Link>
          <button
            className={`btn ${showDelivered ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => setShowDelivered(!showDelivered)}
          >
            🚚 {t('Commandes livrées')} {deliveredSales.length > 0 ? `(${deliveredSales.length})` : ''}
          </button>
          <button
            className="btn btn-primary"
            disabled={!remaining && !showForm}
            onClick={() => {
              if (showForm) { setForm(EMPTY_FORM); setEditingId(null); }
              setShowForm(!showForm);
            }}
          >
            {showForm ? t('Annuler') : t('+ Ajouter un produit')}
          </button>
        </div>
      </section>

      <div className="dash-shell">
        <nav className="dash-nav" aria-label={t('Navigation du tableau de bord')}>
          <a href="#dash-code">🔑 {t('Code livreur')}</a>
          <a href="#dash-promos">⚡ {t('Promotions éclair')}</a>
          <a href="#dash-produits">{t('Mes produits')}</a>
          <a href="#dash-stats">📊 {t('Statistiques')}</a>
          <Link to="/shop/paiements">{t('Paiements')}</Link>
          <Link to="/shop/livreurs">{t('Livreurs')}</Link>
        </nav>
        <div className="dash-main">
          {stats && (
            <section className="kpi-grid" aria-label={t('Indicateurs clés')}>
              <div className="kpi-card">
                <span className="kpi-icon ki-blue" aria-hidden="true"><IconCart size={20} /></span>
                <span className="kpi-body"><span className="kpi-value">{stats.total_sales}</span><span className="kpi-label">{t('Ventes enregistrées')}</span></span>
              </div>
              <div className="kpi-card">
                <span className="kpi-icon ki-green" aria-hidden="true"><IconChartBar size={20} /></span>
                <span className="kpi-body"><span className="kpi-value">{formatMoney(stats.revenue)} {symbol}</span><span className="kpi-label">{t("Chiffre d'affaires")}</span></span>
              </div>
              <div className="kpi-card">
                <span className="kpi-icon ki-violet" aria-hidden="true"><IconTruck size={20} /></span>
                <span className="kpi-body"><span className="kpi-value">{formatMoney(stats.delivery_revenue)} {symbol}</span><span className="kpi-label">{t('Livraisons')}</span></span>
              </div>
              <div className={`kpi-card${Number(stats.owed_commission) > 0 ? ' kpi-danger' : ''}`}>
                <span className="kpi-icon ki-orange" aria-hidden="true"><IconBanknote size={20} /></span>
                <span className="kpi-body"><span className="kpi-value">{formatMoney(stats.owed_commission)} {symbol}</span><span className="kpi-label">{t('Commissions à verser')}</span></span>
              </div>
              <div className="kpi-card">
                <span className="kpi-icon ki-green" aria-hidden="true"><IconAward size={20} /></span>
                <span className="kpi-body"><span className="kpi-value">{formatMoney(stats.paid_commission)} {symbol}</span><span className="kpi-label">{t('Commissions versées')}</span></span>
              </div>
              <div className={`kpi-card${products.length >= 5 ? ' kpi-warn' : ''}`}>
                <span className="kpi-icon ki-blue" aria-hidden="true"><IconStore size={20} /></span>
                <span className="kpi-body"><span className="kpi-value">{products.length} / 5</span><span className="kpi-label">{t('Produits en ligne')}</span></span>
              </div>
            </section>
          )}

      <section className="card seller-code-card" id="dash-code">
        <div>
          <h2>🔑 {t('Code livreur')}</h2>
          <p className="hint" style={{ marginTop: 0 }}>
            {t('Communiquez ce code à vos livreurs : en le saisissant sur la page Livraison, ils ne verront que les livraisons (en attente et effectuées) de votre boutique.')}
          </p>
        </div>
        <div className="seller-code-actions">
          {shopCode ? (
            <>
              <span className="seller-code">{shopCode}</span>
              <button className="btn btn-outline btn-sm" onClick={copyShopCode}>
                {copied ? t('Code copié !') : t('Copier')}
              </button>
            </>
          ) : (
            <button className="btn btn-primary" disabled={codeLoading} onClick={generateShopCode}>
              {codeLoading ? '…' : t('Générer mon code livreur')}
            </button>
          )}
        </div>
      </section>

      <section className="card stats" id="dash-promos">
        <h2>⚡ {t('Promotions éclair')}</h2>
        <p className="hint" style={{ marginTop: 0 }}>
          {t('Proposez un produit à durée limitée (24 h maximum, une promotion par semaine). Pendant la promotion, le produit disparaît du catalogue : seul l\'accès à la promotion reste possible. À la fin du temps, la promotion disparaît et le produit réapparaît s\'il reste en stock.')}
        </p>
        <form className="flash-promo-form" onSubmit={submitFlash}>
          <select
            className="input"
            required
            value={flashForm.productId}
            onChange={(e) => { setFlashForm({ ...flashForm, productId: e.target.value }); setError(''); setSuccess(''); }}
          >
            <option value="" disabled>{t('Choisir un produit…')}</option>
            {products.filter((p) => Number(p.quantity) > 0).map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} — {formatMoney(p.price)} {symbol}
              </option>
            ))}
          </select>
          <input
            className="input"
            type="number"
            min="0"
            step="0.01"
            required
            placeholder={t('Prix promo ({symbol})', { symbol })}
            value={flashForm.promoPrice}
            onChange={(e) => setFlashForm({ ...flashForm, promoPrice: e.target.value })}
          />
          <select
            className="input"
            value={flashForm.minutes}
            onChange={(e) => setFlashForm({ ...flashForm, minutes: e.target.value })}
          >
            <option value="30">{t('30 minutes')}</option>
            <option value="60">{t('1 heure')}</option>
            <option value="120">{t('2 heures')}</option>
            <option value="180">{t('3 heures')}</option>
            <option value="360">{t('6 heures')}</option>
            <option value="720">{t('12 heures')}</option>
            <option value="1440">{t('24 heures')}</option>
          </select>
          <button className="btn btn-primary" disabled={flashLoading}>
            {flashLoading ? '…' : t('⚡ Lancer la promotion')}
          </button>
        </form>
        {flashPromos.length > 0 ? (
          <div className="grid">
            {flashPromos.map((pr) => (
              <FlashPromoCard key={pr.id} promo={pr} onDelete={removeFlash} onShare={shareFlashPromo} showShop={false} />
            ))}
          </div>
        ) : (
          <p className="hint">{t('Aucune promotion éclair pour le moment.')}</p>
        )}
      </section>

      {showDelivered && (
        <section className="card stats" id="facture-livree">
          <h2>📦 {t('Mes commandes livrées')}</h2>
          {(() => {
            const sellerGroups = new Map();
            const referralGroups = new Map();
            for (const s of deliveredSales) {
              if (s.seller_id) {
                const key = 's' + s.seller_id;
                if (!sellerGroups.has(key)) sellerGroups.set(key, { seller_id: s.seller_id, seller_name: s.seller_name, seller_code: s.seller_code, items: [], pending: 0, anyClaimed: false });
                const g = sellerGroups.get(key);
                g.items.push(s);
                if (!s.paid) g.pending += Number(s.commission || 0);
                if (s.commission_claimed_at) g.anyClaimed = true;
              }
              if (s.referred_by) {
                const key = 'r' + s.referred_by;
                if (!referralGroups.has(key)) referralGroups.set(key, { parrain_id: s.referred_by, parrain_name: s.parrain_name || '—', items: [], pending: 0, anyClaimed: false });
                const g = referralGroups.get(key);
                g.items.push(s);
                if (!s.referral_paid) g.pending += Number(s.referral_commission || 0);
                if (s.referral_claimed_at) g.anyClaimed = true;
              }
            }
            const sgs = [...sellerGroups.values()].filter((g) => g.pending > 0).sort((a, b) => b.pending - a.pending);
            const rgs = [...referralGroups.values()].filter((g) => g.pending > 0).sort((a, b) => b.pending - a.pending);
            if (!sgs.length && !rgs.length) return null;
            return (
              <div style={{ marginBottom: 16 }}>
                {sgs.length > 0 && (
                  <div className="table-wrap">
                    <h3>💼 {t('Commissions de vente — par vendeur')}</h3>
                    <table className="table">
                      <thead>
                        <tr>
                          <th>{t('Vendeur')}</th>
                          <th>{t('Nombre de ventes')}</th>
                          <th>{t('Commission en attente')}</th>
                          <th>{t('Statut')}</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {sgs.map((g) => (
                          <tr key={g.seller_id}>
                            <td>{g.seller_name} ({g.seller_code || '—'})</td>
                            <td>{g.items.length}</td>
                            <td>{formatMoney(g.pending)} {countrySymbol(g.items[0]?.shop_country)}</td>
                            <td>{g.anyClaimed && <span className="badge badge-confirmed">{t('Paiement réclamé')}</span>}</td>
                            <td>
                              <button className="btn btn-small btn-danger" onClick={() => openPayGrouped('seller', g)}>
                                💰 {t('Payer le Vendeur')} ({formatMoney(g.pending)})
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {rgs.length > 0 && (
                  <div className="table-wrap">
                    <h3>🎁 {t('Parrainage (2%) — par parrain')}</h3>
                    <table className="table">
                      <thead>
                        <tr>
                          <th>{t('Parrain')}</th>
                          <th>{t('Nombre de ventes')}</th>
                          <th>{t('Commission en attente')}</th>
                          <th>{t('Statut')}</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {rgs.map((g) => (
                          <tr key={g.parrain_id}>
                            <td>{g.parrain_name}</td>
                            <td>{g.items.length}</td>
                            <td>{formatMoney(g.pending)} {countrySymbol(g.items[0]?.shop_country)}</td>
                            <td><span className="badge badge-warn">{t('Versement auto dès 1500 F')}</span></td>
                            <td></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })()}
          {deliveredSales.length === 0 ? (
            <p className="empty">{t('Aucune vente livrée pour le moment.')}</p>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>{t('Produit')}</th>
                    <th>{t('Vendeur')}</th>
                    <th>{t('Acheteur')}</th>
                    <th>{t('Total')}</th>
                    <th>{t('Livré le')}</th>
                    <th>{t('Statut')}</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {deliveredSales.map((s) => {
                        const pendingCommission =
                          (s.seller_id && Number(s.commission || 0) > 0 && !s.paid) ||
                          (s.referred_by && Number(s.referral_commission || 0) > 0 && !s.referral_paid);
                        return (
                    <tr key={s.id}>
                      <td>{s.product_name}</td>
                      <td>{s.seller_name || '—'}</td>
                      <td>{s.buyer_name || '—'}</td>
                      <td>{formatMoney(Number(s.total_price || 0) + Number(s.delivery_fee || 0))} {countrySymbol(s.shop_country)}</td>
                      <td>{s.delivered_at ? new Date(s.delivered_at).toLocaleDateString() : '—'}</td>
                      <td>
                        {s.seller_id ? (
                          s.paid ? (
                            <span className="badge badge-paid">{t('Vendeur payé')}</span>
                          ) : (
                            <span className="badge badge-warn">{t('Commission en attente')}</span>
                          )
                        ) : (
                          <span className="badge badge-pending">{t('Vente directe')}</span>
                        )}
                        {s.referral_paid ? (
                          <span className="badge badge-paid">🎁 {t('Parrain payé')}</span>
                        ) : s.referred_by ? (
                          <span className="badge badge-warn">🎁 {t('Commission 2% en attente')}</span>
                        ) : null}
                      </td>
                      <td>
                        <div className="row2" style={{ justifyContent: 'flex-end', gap: 6 }}>
                          <button className="btn btn-small" onClick={() => downloadInvoice(s, t, countrySymbol(s.shop_country))}>
                            🧾 {t('Voir la facture')}
                          </button>
                          <button
                            className="btn btn-small btn-danger"
                            onClick={() => removeDelivered(s)}
                            disabled={pendingCommission}
                            title={pendingCommission ? t('Cette vente ne peut pas être supprimée tant que sa commission n\'est pas payée.') : undefined}
                          >
                            🗑️ {pendingCommission ? t('Commission non payée') : t('Supprimer')}
                          </button>
                        </div>
                      </td>
                    </tr>
                        );
                      })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {showForm && (
        <div className="card form-card">
          <h2>{editingId ? t('Modifier le produit') : t('Nouveau produit')}</h2>
          <form onSubmit={submitProduct}>
            <label>{t('Photos (maximum {n})', { n: MAX_PHOTOS })}</label>
            <div className="photo-input">
              <label className="photo-picker">
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  hidden
                  disabled={picking || form.photos.length >= MAX_PHOTOS}
                  onChange={(e) => addPhotos(e.target.files)}
                />
                {picking ? t('Compression…') : form.photos.length >= MAX_PHOTOS ? t('Photos complètes') : t('📷 Ajouter des photos')}
              </label>
              <div className="photo-previews">
                {form.photos.map((photo, i) => (
                  <div key={i} className="photo-thumb">
                    <img src={photo.thumb || photo} alt={`${t('Photo')} ${i + 1}`} />
                    <button type="button" className="photo-remove" onClick={() => removePhoto(i)}>✕</button>
                  </div>
                ))}
              </div>
            </div>
            <label>{t('Nom du produit *')}</label>
            <input className="input" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />

            <label>{t('Catégorie *')}</label>
            <select
              className="input"
              required
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
            >
              <option value="" disabled>{t('Choisir une catégorie…')}</option>
              {PRODUCT_CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>

            <label>{t('Description')}</label>
            <textarea className="input" rows="2" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />

            <div className="row2">
              <div>
                <label>{t('Garantie (chiffres ou lettres)')}</label>
                <input className="input" placeholder={t('ex : 6 mois, 1 an, 2 ans')} value={form.warranty} onChange={(e) => setForm({ ...form, warranty: e.target.value })} />
              </div>
              <div>
                <label>{t('Quantité en stock *')}</label>
                <input className="input" type="number" min="1" required value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} />
              </div>
            </div>

            <div className="row2">
              <div>
                <label>{t('Frais de livraison ({symbol})', { symbol })}</label>
                <input className="input" type="number" min="0" step="0.01" placeholder="ex : 1000" value={form.delivery_fee} onChange={(e) => setForm({ ...form, delivery_fee: e.target.value })} />
              </div>
              <div>
                <label>{t('Contact de la boutique')}</label>
                <div className="phone-input">
                  <span className="phone-prefix">{prefix}</span>
                  <input
                    className="input"
                    type="tel"
                    placeholder="ex : 6 90 00 00 00"
                    value={form.contact}
                    onChange={(e) => setForm({ ...form, contact: e.target.value.replace(/\D/g, '') })}
                  />
                </div>
              </div>
            </div>

            <div className="row2">
              <div>
                <label>{t('Prix normal ({symbol})', { symbol })}</label>
                <input className="input" type="number" min="0" step="0.01" placeholder={t('ex : 5000 (s\'affiche barré)')} value={form.old_price} onChange={(e) => setForm({ ...form, old_price: e.target.value })} />
              </div>
              <div>
                <label>{t('Prix de vente ({symbol}) *', { symbol })}</label>
                <input className="input" type="number" min="0" step="0.01" placeholder={t('ex : 3500 (s\'affiche en vert)')} value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
              </div>
            </div>
            <div className="row2">
              <div>
                <label>{t('Commission vendeur (%) *')}</label>
                <input className="input" type="number" min="0" max="100" step="0.1" required value={form.commission_percent} onChange={(e) => setForm({ ...form, commission_percent: e.target.value })} />
              </div>
            </div>
            {form.price && form.commission_percent ? (
              <p className="hint">
                {t('Le vendeur affichera : {price} {symbol} et gagnera {commission} {symbol} de commission.', {
                  price: formatMoney(form.price),
                  symbol,
                  commission: formatMoney(form.price * (Number(form.commission_percent) / 100)),
                })}
              </p>
            ) : null}
            {error && <p className="error">{error}</p>}
            <button className="btn btn-primary btn-block">{t('Publier le produit')}</button>
          </form>
        </div>
      )}

      {success && <p className="success">{success}</p>}
      {error && <p className="error">{error}</p>}

      {products.length === 0 ? (
        <p className="empty">{t('Aucun produit pour le moment. Ajoutez votre premier produit (max 5).')}</p>
      ) : (
        <div className="grid" id="dash-produits">
          {products.map((p) => (
            <ProductCard
              key={p.id}
              product={p}
              action="Modifier"
              onAction={() => editProduct(p)}
              secondaryAction="Rétirer"
              onSecondaryAction={() => removeProduct(p.id)}
              extraAction={{ label: t('📋 Dupliquer'), onClick: () => duplicateProduct(p.id) }}
            />
))}
        </div>
      )}

      <section className="card stats">
        <div className="stats-head" id="dash-stats">
          <h2>{t('Statistiques des ventes')}</h2>
          <ExportSalesButton />
        </div>
        {stats ? (
          <div className="stats-row">
            <div><span className="label">{t('Ventes enregistrées')}</span><strong>{stats.total_sales}</strong></div>
            <div><span className="label">{t('Chiffre d\'affaires')}</span><strong>{formatMoney(stats.revenue)} {symbol}</strong></div>
            <div><span className="label">{t('Livraisons')}</span><strong>{formatMoney(stats.delivery_revenue)} {symbol}</strong></div>
            <div><span className="label">{t('Commissions à verser')}</span><strong className={stats.owed_commission > 0 ? 'text-danger' : ''}>{formatMoney(stats.owed_commission)} {symbol}</strong></div>
            <div><span className="label">{t('Commissions versées')}</span><strong>{formatMoney(stats.paid_commission)} {symbol}</strong></div>
          </div>
        ) : null}

        {stats && (series.length > 0 || topProducts.length > 0) && (
          <div className="stats-extra">
            <h3>{t('📈 Ventes des 14 derniers jours')}</h3>
            <div className="chart-wrap">
              <svg
                viewBox={`0 0 ${CH_W} ${CH_H}`}
                className="line-chart"
                role="img"
                aria-label={t('Graphique des ventes des 14 derniers jours')}
              >
                <defs>
                  <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.35" />
                    <stop offset="100%" stopColor="var(--primary)" stopOpacity="0.02" />
                  </linearGradient>
                </defs>
                {[0.25, 0.5, 0.75, 1].map((f) => (
                  <line
                    key={f}
                    className="chart-grid"
                    x1={CH_PAD}
                    y1={chY(chMax * f)}
                    x2={CH_W - CH_PAD}
                    y2={chY(chMax * f)}
                  />
                ))}
                <path d={chArea} fill="url(#revGrad)" />
                <polyline
                  points={chLine}
                  className="chart-line"
                  fill="none"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
                {bars.map((b, i) =>
                  b.rev > 0 || b.cnt > 0 ? (
                    <circle key={b.key} className="chart-dot" cx={chX(i)} cy={chY(b.rev)} r="3.4">
                      <title>{`${b.label} : ${b.cnt} ${t('vente(s)')} — ${formatMoney(b.rev)} ${symbol}`}</title>
                    </circle>
                  ) : null
                )}
              </svg>
              <div className="chart-labels">
                {bars.map((b, i) => (
                  <span key={b.key} className={i % 2 ? 'chart-label-muted' : ''}>{b.label}</span>
                ))}
              </div>
              <p className="chart-caption hint">
                <span className="chart-legend"><i style={{ background: 'var(--primary)' }}></i>{t('Chiffre d\'affaires ({symbol})', { symbol })}</span>
              </p>
            </div>
            {topProducts.length > 0 && (
              <>
                <h3 style={{ marginTop: 16 }}>{t('🏆 Meilleurs produits')}</h3>
                <ul className="top-products">
                  {topProducts.map((p, i) => (
                    <li key={p.name}>
                      <span className="top-rank">{i + 1}</span>
                      <span className="top-name">{p.name}</span>
                      <span className="top-count">{p.cnt} {t('vente(s)')}</span>
                      <strong>{formatMoney(p.rev)} {symbol}</strong>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}

        <h3 style={{ marginTop: 16 }}>📦 {t('Mes commandes')}</h3>
        {activeSales.length === 0 ? (
          <p className="empty">{t('Aucune commande en attente.')}</p>
        ) : (
          <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>{t('Produit')}</th>
                <th>{t('Vendeur')}</th>
                <th>{t('Code vendeur')}</th>
                <th>{t('Acheteur')}</th>
                <th>{t('Qté')}</th>
                <th>{t('Total')}</th>
                <th>{t('Prix payé')}</th>
                <th>{t('Commission')}</th>
                <th>{t('Statut')}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {activeSales.map((s) => {
                const st = SALE_STATUS[s.status] || SALE_STATUS.pending;
                return (
                  <tr key={s.id}>
                    <td>{s.product_name}</td>
                    <td>{s.seller_name || '—'}</td>
                    <td><code className="seller-code-inline">{s.seller_code || '—'}</code></td>
                    <td>{s.buyer_name || '—'}</td>
                    <td>{s.quantity}</td>
                    <td>{formatMoney(s.total_price)} {countrySymbol(s.shop_country)}</td>
                    <td>{s.purchase_price != null ? `${formatMoney(s.purchase_price)} ${countrySymbol(s.shop_country)}` : '—'}</td>
                    <td>{formatMoney(s.commission)} {countrySymbol(s.shop_country)}</td>
                    <td>
                      <span className={`badge ${st.cls}`}>{t(st.key)}</span>
                    </td>
                    <td>
                      {s.status === 'pending' && (
                        <div className="row2">
                          {s.shop_confirmed_at ? (
                            <span className="badge badge-confirmed">✓ {t('Vue')}</span>
                          ) : (
                            <button className="btn btn-small btn-primary" onClick={() => changeStatus(s.id, 'confirmed')}>{t('Confirmer')}</button>
                          )}
                          <button className="btn btn-small btn-danger" onClick={() => changeStatus(s.id, 'cancelled')}>{t('Annuler')}</button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        )}
      </section>

      {payForm && (
        <div className="modal-overlay" onClick={() => setPayForm(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>💸 {payForm.kind === 'referral' ? t('Payer le parrain') : t('Payer le vendeur')}</h3>
              <button className="drawer-close" onClick={() => setPayForm(null)}>✕</button>
            </div>
            {payForm.target === 'grouped' ? (
              <div className="deliver-recap">
                {payForm.kind === 'referral' ? (
                  <>
                    <p><strong>{t('Parrain')} :</strong> {payForm.group.parrain_name}</p>
                    <p><strong>{t('Nombre de ventes')} :</strong> {payForm.group.items.length}</p>
                    <p><strong>🎁 {t('Commission parrainage (2%)')} :</strong> {formatMoney(payForm.group.pending)} {countrySymbol(payForm.group.items[0]?.shop_country)}</p>
                  </>
                ) : (
                  <>
                    <p><strong>{t('Vendeur')} :</strong> {payForm.group.seller_name} ({payForm.group.seller_code || '—'})</p>
                    <p><strong>{t('Nombre de ventes')} :</strong> {payForm.group.items.length}</p>
                    <p><strong>{t('Commission produit')} :</strong> {formatMoney(payForm.group.pending)} {countrySymbol(payForm.group.items[0]?.shop_country)}</p>
                  </>
                )}
                <p><strong>{t('Total à payer')} :</strong> {formatMoney(payForm.group.pending)} {countrySymbol(payForm.group.items[0]?.shop_country)}</p>
              </div>
            ) : (
            <div className="deliver-recap">
              <p><strong>{t('Article')} :</strong> {payForm.sale.product_name}</p>
              {payForm.kind === 'referral' ? (
                <>
                  <p><strong>{t('Parrain')} :</strong> {payForm.sale.parrain_name || '—'}</p>
                  <p><strong>🎁 {t('Commission parrainage (2%)')} :</strong> {formatMoney(payForm.sale.referral_commission)} {countrySymbol(payForm.sale.shop_country)}</p>
                </>
              ) : (
                <>
                  <p><strong>{t('Vendeur')} :</strong> {payForm.sale.seller_name} ({payForm.sale.seller_code || '—'})</p>
                  <p><strong>{t('Commission produit')} :</strong> {formatMoney(payForm.sale.commission)} {countrySymbol(payForm.sale.shop_country)}</p>
                  {Number(payForm.sale.referral_commission || 0) > 0 && (
                    <p><strong>🎁 {t('Commission parrainage (2%)')} :</strong> {formatMoney(payForm.sale.referral_commission)} {countrySymbol(payForm.sale.shop_country)} ({t('à payer séparément au parrain')})</p>
                  )}
                </>
              )}
              <p><strong>{t('Total à payer')} :</strong> {formatMoney(payForm.kind === 'referral' ? Number(payForm.sale.referral_commission || 0) : Number(payForm.sale.commission))} {countrySymbol(payForm.sale.shop_country)}</p>
            </div>
            )}
            {payForm.methods ? (
              <div className="deliver-recap">
                <p><strong>{payForm.kind === 'referral' ? t('Moyens de paiement du parrain') : t('Moyens de paiement du vendeur')}</strong></p>
                {payForm.methods.full_name ? <p>{t('Nom')} : {payForm.methods.full_name}</p> : null}
                {payForm.methods.wallets.length === 0 ? (
                  <p className="hint">{t('Le vendeur n\'a pas encore enregistré de moyen de paiement.')}</p>
                ) : (
                  payForm.methods.wallets.map((w) => (
                    <p key={w.name}>💳 {w.name} : <strong>{w.value}</strong></p>
                  ))
                )}
              </div>
            ) : (
              <div className="deliver-recap">
                <p className="hint">{t('Le vendeur n\'a pas encore enregistré de moyen de paiement.')}</p>
              </div>
            )}
            <form onSubmit={submitPay}>
              <label>{t('Preuve du paiement (photo ou vidéo) *')}</label>
              <div className="photo-input">
                <label className="photo-picker">
                  <input
                    type="file"
                    accept="image/*,video/*"
                    capture="environment"
                    hidden
                    onChange={(e) => addProof(e.target.files[0])}
                  />
                  {payForm.proof ? t('Preuve ajoutée ✓ (cliquez pour changer)') : t('📷 Ajouter une photo ou une vidéo')}
                </label>
              </div>
              {payForm.proof && !payForm.proof.startsWith('data:video/') && (
                <img src={payForm.proof} alt={t('Preuve')} className="proof-preview" />
              )}
              <div className="row2" style={{ marginTop: 14 }}>
                <button className="btn btn-danger btn-block" disabled={paying || !payForm.proof}>
                  {paying ? '…' : `✅ ${t('Confirmer le Paiement')}`}
                </button>
              </div>
              <button type="button" className="btn btn-outline btn-block" style={{ marginTop: 8 }} onClick={() => setPayForm(null)}>{t('Annuler')}</button>
            </form>
          </div>
        </div>
      )}
        </div>
      </div>
    </main>
  );
}
