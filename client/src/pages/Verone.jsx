import React, { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import ShareVitrine from '../components/ShareVitrine.jsx';
import PwaInstallButton from '../components/PwaInstallButton.jsx';
import Seo from '../components/Seo.jsx';
import { compressImage } from '../utils.js';
import { useLang } from '../i18n.jsx';
import { useRefreshOnFocus } from '../useRefreshOnFocus.js';

const EMPTY_FORM = {
  name: '',
  category: '',
  description: '',
  warranty: '',
  original_price: '',
  promo_price: '',
  phone: '',
  quantity: '',
  photos: [],
};

const MAX_PHOTOS = 3;

export default function Verone() {
  const { t } = useLang();
  const [showForm, setShowForm] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [showMyOffers, setShowMyOffers] = useState(false);
  const [myOffers, setMyOffers] = useState([]);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const loadOffers = useCallback(async () => {
    try {
      const d = await api.myOffers();
      setMyOffers(d.offers);
    } catch (e) {
      setError(e.message);
    }
  }, []);

  const toggleMyOffers = async () => {
    const next = !showMyOffers;
    setShowMyOffers(next);
    if (next) {
      setError('');
      setSuccess('');
      loadOffers();
    }
  };

  useRefreshOnFocus(() => {
    if (showMyOffers) loadOffers();
  });

  const confirmDelete = async (e) => {
    e.preventDefault();
    setDeleting(true);
    try {
      await api.deleteOffer(deleteTarget.id);
      setMyOffers(myOffers.filter((o) => o.id !== deleteTarget.id));
      setDeleteTarget(null);
      setSuccess(t('Offre retirée de la vitrine.'));
    } catch (err) {
      setError(err.message);
    } finally {
      setDeleting(false);
    }
  };

  const addPhotos = async (files) => {
    const remaining = MAX_PHOTOS - form.photos.length;
    const toAdd = Array.from(files).slice(0, remaining);
    if (toAdd.length < Array.from(files).length) {
      setError(t('Maximum {n} photos par offre', { n: MAX_PHOTOS }));
    } else {
      setError('');
    }
    const compressed = [];
    for (const file of toAdd) {
      try {
        compressed.push(await compressImage(file));
      } catch {
        setError(t('Impossible de lire une des photos'));
      }
    }
    setForm({ ...form, photos: [...form.photos, ...compressed] });
  };

  const removePhoto = (index) => {
    setForm({ ...form, photos: form.photos.filter((_, i) => i !== index) });
  };

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    if (!form.original_price || !form.promo_price) {
      setError(t('Les deux prix sont requis'));
      return;
    }
    setSubmitting(true);
    try {
      await api.createOffer({
        ...form,
        original_price: Number(form.original_price),
        promo_price: Number(form.promo_price),
        quantity: Number(form.quantity || 0),
      });
      setForm(EMPTY_FORM);
      setShowForm(false);
      setSuccess(t('Offre ajoutée avec succès — elle s\'affiche maintenant sur la page Vitrine d\'offre.'));
      loadOffers();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="container narrow">
      <Seo title="Verone — Mboppi" description={t('Gestion des offres')} />
      <section className="dash-header">
        <div>
          <div className="hero-badge" style={{ marginBottom: 10 }}>{t('🛍️ Espace Verone')}</div>
          <h1>Verone</h1>
          <p>
            {t('Ajoutez vos offres promotionnelles : elles s\'affichent dans la Vitrine d\'offre du site.')}
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>
          {showForm ? t('Fermer le formulaire') : t('+ Ajouter une Offre')}
        </button>
        <PwaInstallButton />
        <div className="row2" style={{ width: '100%' }}>
          <button className="btn btn-outline" onClick={toggleMyOffers}>
            {showMyOffers ? t('Masquer mes Offres') : t('Voir mes Offres')}
          </button>
          <button className="btn btn-outline" onClick={() => setShowShare(true)}>{t('Partager ma Vitrine')}</button>
        </div>
      </section>

      {showShare && <ShareVitrine onClose={() => setShowShare(false)} />}

      {showMyOffers && (
        <section className="card">
          <h2 className="section-title" style={{ marginTop: 0 }}>{t('Mes offres')}</h2>
          {myOffers.length === 0 ? (
            <p className="empty">{t('Aucune offre ajoutée pour le moment.')}</p>
          ) : (
            <div className="my-offers">
              {myOffers.map((o) => (
                <div key={o.id} className="my-offer-row">
                  <div className="my-offer-thumb">
                    {o.photos && o.photos.length > 0 ? (
                      <img src={o.photos[0]} alt={o.name} loading="lazy" />
                    ) : (
                      <span>🛍️</span>
                    )}
                  </div>
                  <div className="my-offer-info">
                    <strong>{o.name}</strong>
                    <span>
                      <span className="old-price">{o.original_price.toLocaleString('fr-FR')} F</span>{' '}
                      <span className="promo-price">{o.promo_price.toLocaleString('fr-FR')} F</span>
                    </span>
                  </div>
                  <button className="btn btn-danger" onClick={() => setDeleteTarget(o)}>{t('Rétirer')}</button>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {deleteTarget && (
        <div className="modal-overlay" onClick={() => setDeleteTarget(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{t('Retirer l\'offre')}</h3>
              <button className="drawer-close" onClick={() => setDeleteTarget(null)}>✕</button>
            </div>
            <p className="hint">
              {t('Confirmez le retrait de « {name} » de la vitrine.', { name: deleteTarget.name })}
            </p>
            <form onSubmit={confirmDelete}>
              <div className="row2" style={{ marginTop: 14 }}>
                <button className="btn btn-danger" disabled={deleting}>
                  {deleting ? t('Retrait…') : t('Rétirer')}
                </button>
                <button type="button" className="btn btn-outline" onClick={() => setDeleteTarget(null)}>
                  {t('Annuler')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showForm && (
        <div className="card form-card">
          <h2>{t('Nouvelle offre')}</h2>
          <form onSubmit={submit}>
            <label>{t('Photos (maximum {n})', { n: MAX_PHOTOS })}</label>
            <div className="photo-input">
              <label className="photo-picker">
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  hidden
                  disabled={form.photos.length >= MAX_PHOTOS}
                  onChange={(e) => addPhotos(e.target.files)}
                />
                {form.photos.length >= MAX_PHOTOS ? t('Photos complètes') : t('📷 Ajouter des photos')}
              </label>
              <div className="photo-previews">
                {form.photos.map((photo, i) => (
                  <div key={i} className="photo-thumb">
                    <img src={photo} alt={`${t('Photo')} ${i + 1}`} />
                    <button type="button" className="photo-remove" onClick={() => removePhoto(i)}>✕</button>
                  </div>
                ))}
              </div>
            </div>

            <label>{t('Nom de l\'Offre *')}</label>
            <input className="input" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />

            <label>{t('Catégorie')}</label>
            <input className="input" placeholder={t('ex : Électronique, Mode, Alimentation…')} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />

            <label>{t('Description')}</label>
            <textarea className="input" rows="3" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />

            <label>{t('Garantie (en lettres ou chiffres)')}</label>
            <input className="input" placeholder={t('ex : 6 mois, 1 an, 2 ans')} value={form.warranty} onChange={(e) => setForm({ ...form, warranty: e.target.value })} />

            <div className="row2">
              <div>
                <label>{t('Prix de vente ({symbol}) *', { symbol: 'F' })}</label>
                <input className="input price-old" type="number" min="0" required value={form.original_price} onChange={(e) => setForm({ ...form, original_price: e.target.value })} />
              </div>
              <div>
                <label>{t('Prix promotionnel ({symbol}) *', { symbol: 'F' })}</label>
                <input className="input price-new" type="number" min="0" required value={form.promo_price} onChange={(e) => setForm({ ...form, promo_price: e.target.value })} />
              </div>
            </div>

            <label>{t('Numéro de téléphone')}</label>
            <input className="input" type="tel" placeholder="ex : 07 00 00 00 00" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />

            <label>{t('Quantité (en chiffres) *')}</label>
            <input className="input" type="number" min="0" required value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} />

            {error && <p className="error">{error}</p>}
            <button className="btn btn-primary btn-block" disabled={submitting}>
              {submitting ? t('Ajout en cours…') : t("Ajouter l'Offre")}
            </button>
          </form>
        </div>
      )}

      {success && <p className="success">{success}</p>}
    </main>
  );
}
