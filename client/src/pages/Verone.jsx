import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import ShareVitrine from '../components/ShareVitrine.jsx';

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

function compressImage(file, maxDim = 640, quality = 0.65) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = reject;
      img.src = reader.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function Verone() {
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

  const toggleMyOffers = async () => {
    const next = !showMyOffers;
    setShowMyOffers(next);
    if (next) {
      setError('');
      setSuccess('');
      try {
        const d = await api.listOffers();
        setMyOffers(d.offers);
      } catch (e) {
        setError(e.message);
      }
    }
  };

  const confirmDelete = async (e) => {
    e.preventDefault();
    setDeleting(true);
    try {
      await api.deleteOffer(deleteTarget.id);
      setMyOffers(myOffers.filter((o) => o.id !== deleteTarget.id));
      setDeleteTarget(null);
      setSuccess('Offre retirée de la vitrine.');
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
      setError(`Maximum ${MAX_PHOTOS} photos par offre`);
    } else {
      setError('');
    }
    const compressed = [];
    for (const file of toAdd) {
      try {
        compressed.push(await compressImage(file));
      } catch {
        setError('Impossible de lire une des photos');
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
      setError('Les deux prix sont requis');
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
      setSuccess('Offre ajoutée avec succès — elle s\'affiche maintenant sur la page Vitrine d\'offre.');
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="container narrow">
      <section className="card page-center">
        <div className="verone-placeholder">🛍️</div>
        <h1>Verone</h1>
        <p className="hint">
          Ajoutez vos offres promotionnelles : elles s'affichent dans la Vitrine d'offre du site.
        </p>
        <button className="btn btn-primary btn-block" onClick={() => setShowForm(!showForm)}>
          {showForm ? 'Fermer le formulaire' : '+ Ajouter une Offre'}
        </button>
        <div className="row2" style={{ marginTop: 12 }}>
          <button className="btn btn-outline" onClick={toggleMyOffers}>
            {showMyOffers ? 'Masquer mes Offres' : 'Voir mes Offres'}
          </button>
          <button className="btn btn-outline" onClick={() => setShowShare(true)}>Partager ma Vitrine</button>
        </div>
      </section>

      {showShare && <ShareVitrine onClose={() => setShowShare(false)} />}

      {showMyOffers && (
        <section className="card">
          <h2 className="section-title" style={{ marginTop: 0 }}>Mes offres</h2>
          {myOffers.length === 0 ? (
            <p className="empty">Aucune offre ajoutée pour le moment.</p>
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
                  <button className="btn btn-danger" onClick={() => setDeleteTarget(o)}>Rétirer</button>
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
              <h3>Retirer l'offre</h3>
              <button className="drawer-close" onClick={() => setDeleteTarget(null)}>✕</button>
            </div>
            <p className="hint">
              Confirmez le retrait de « <strong>{deleteTarget.name}</strong> » de la vitrine.
            </p>
            <form onSubmit={confirmDelete}>
              <div className="row2" style={{ marginTop: 14 }}>
                <button className="btn btn-danger" disabled={deleting}>
                  {deleting ? 'Retrait…' : 'Rétirer'}
                </button>
                <button type="button" className="btn btn-outline" onClick={() => setDeleteTarget(null)}>
                  Annuler
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showForm && (
        <div className="card form-card">
          <h2>Nouvelle offre</h2>
          <form onSubmit={submit}>
            <label>Photos (maximum {MAX_PHOTOS})</label>
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
                {form.photos.length >= MAX_PHOTOS ? 'Photos complètes' : '📷 Ajouter des photos'}
              </label>
              <div className="photo-previews">
                {form.photos.map((photo, i) => (
                  <div key={i} className="photo-thumb">
                    <img src={photo} alt={`Photo ${i + 1}`} />
                    <button type="button" className="photo-remove" onClick={() => removePhoto(i)}>✕</button>
                  </div>
                ))}
              </div>
            </div>

            <label>Nom de l'Offre *</label>
            <input className="input" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />

            <label>Catégorie</label>
            <input className="input" placeholder="ex : Électronique, Mode, Alimentation…" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />

            <label>Description</label>
            <textarea className="input" rows="3" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />

            <label>Garantie (en lettres ou chiffres)</label>
            <input className="input" placeholder="ex : 6 mois, 1 an, 2 ans" value={form.warranty} onChange={(e) => setForm({ ...form, warranty: e.target.value })} />

            <div className="row2">
              <div>
                <label>Prix de vente (F) *</label>
                <input className="input price-old" type="number" min="0" required value={form.original_price} onChange={(e) => setForm({ ...form, original_price: e.target.value })} />
              </div>
              <div>
                <label>Prix promotionnel (F) *</label>
                <input className="input price-new" type="number" min="0" required value={form.promo_price} onChange={(e) => setForm({ ...form, promo_price: e.target.value })} />
              </div>
            </div>

            <label>Numéro de téléphone</label>
            <input className="input" type="tel" placeholder="ex : 07 00 00 00 00" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />

            <label>Quantité (en chiffres) *</label>
            <input className="input" type="number" min="0" required value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} />

            {error && <p className="error">{error}</p>}
            <button className="btn btn-primary btn-block" disabled={submitting}>
              {submitting ? 'Ajout en cours…' : "Ajouter l'Offre"}
            </button>
          </form>
        </div>
      )}

      {success && <p className="success">{success}</p>}
    </main>
  );
}
