import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useLang } from '../i18n.jsx';
import { useAuth } from '../App.jsx';

function Stars({ value, size = 16, onChange }) {
  const [hover, setHover] = useState(0);
  const active = onChange ? (hover || value) : Math.round(value);
  return (
    <span className={`stars stars-${size}`} role={onChange ? 'radiogroup' : 'img'} aria-label={`${active}/5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <button
          key={i}
          type="button"
          className={`star ${i <= active ? 'on' : ''}`}
          disabled={!onChange}
          onClick={() => onChange && onChange(i)}
          onMouseEnter={() => onChange && setHover(i)}
          onMouseLeave={() => onChange && setHover(0)}
          aria-label={`${i}/5`}
        >
          ★
        </button>
      ))}
    </span>
  );
}

export default function Reviews({ product }) {
  const { t } = useLang();
  const { user } = useAuth();
  const [summary, setSummary] = useState(null);
  const [reviews, setReviews] = useState(null);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const load = () => {
    api
      .productReviews(product.id)
      .then((d) => {
        setSummary(d.summary);
        setReviews(d.reviews);
      })
      .catch(() => {});
  };

  useEffect(load, [product.id]);

  const isOwner = user && Number(user.id) === Number(product.shop_id);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (!rating) {
      setError(t('Choisissez une note de 1 à 5 étoiles.'));
      return;
    }
    setSending(true);
    try {
      await api.createReview({ product_id: product.id, rating, comment });
      setDone(true);
      setRating(0);
      setComment('');
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <section className="reviews-section">
      <h2 className="section-title">⭐ {t('Avis clients')}</h2>
      {summary && summary.count > 0 && (
        <div className="reviews-summary">
          <strong>{summary.avg} / 5</strong>
          <Stars value={summary.avg} />
          <span>{t('{n} avis', { n: summary.count })}</span>
        </div>
      )}

      {!isOwner && (
        <div className="card review-form">
          <h3>{t('Laisser un avis')}</h3>
          {!user ? (
            <p className="hint">
              <Link to="/login">{t('Connectez-vous')}</Link> {t('pour laisser un avis.')}
            </p>
          ) : done ? (
            <p className="success">{t('Merci pour votre avis !')}</p>
          ) : (
            <form onSubmit={submit}>
              <label>{t('Votre note')}</label>
              <Stars value={rating} onChange={setRating} size={22} />
              <label>{t('Votre commentaire (facultatif)')}</label>
              <textarea
                className="input"
                rows="3"
                maxLength="500"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder={t('Partagez votre expérience avec ce produit…')}
              />
              {error && <p className="error" role="alert">{error}</p>}
              <button className="btn btn-primary" disabled={sending}>
                {sending ? t('Envoi…') : t('Publier mon avis')}
              </button>
            </form>
          )}
        </div>
      )}

      {reviews === null ? (
        <div className="card page-center">
          <div className="skeleton-block" style={{ height: 60 }}></div>
        </div>
      ) : reviews.length === 0 ? (
        <div className="card page-center">
          <p className="empty">{t('Aucun avis pour le moment. Soyez le premier !')}</p>
        </div>
      ) : (
        <div className="reviews-list">
          {reviews.map((r) => (
            <div className="card review-card" key={r.id}>
              <div className="review-head">
                <strong>{r.user_name || r.buyer_name || t('Client')}</strong>
                <Stars value={r.rating} />
                <span className="review-date">
                  {new Date(r.created_at).toLocaleDateString(undefined, { dateStyle: 'medium' })}
                </span>
              </div>
              {r.comment && <p className="review-comment">{r.comment}</p>}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
