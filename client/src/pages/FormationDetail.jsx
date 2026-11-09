import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import Seo from "../components/Seo.jsx";
import Reviews from "../components/Reviews.jsx";
import FormationCheckoutModal from "../components/FormationCheckoutModal.jsx";
import { api } from "../api.js";
import { useAuth } from "../App.jsx";
import { useLang } from "../i18n.jsx";
import { BASE_URL, countrySymbol, waLink } from "../config.js";
import { firstPhoto, proxyPhotoUrl } from "../share.js";
import { formatMoney } from "../components/ProductCard.jsx";
import { formatBytes } from "../imageKit.js";
import {
  IconBook,
  IconCheck,
  IconChevronRight,
  IconClock,
  IconDownload,
  IconEye,
  IconLock,
  IconShare,
  IconShieldCheck,
  IconStarFilled,
  IconUsers,
  IconWhatsApp,
  IconZoomIn,
} from "../components/icons.jsx";

function truncate(text, max) {
  const value = String(text || "").replace(/\s+/g, " ").trim();
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1).trimEnd()}…`;
}

function sentences(text) {
  const value = String(text || "").replace(/\s+/g, " ").trim();
  if (!value) return [];
  return (value.match(/[^.!?]+[.!?]+/g) || [value])
    .map((part) => part.trim())
    .filter((part) => part.length >= 28 && part.length <= 190);
}

function formationModules(product) {
  const raw = product?.modules;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((m) => ({
      title: String(m?.title || "").trim(),
      subtitle: String(m?.subtitle || "").trim(),
      description: String(m?.description || "").trim(),
      duration: String(m?.duration || "").trim(),
    }))
    .filter((m) => m.title || m.subtitle || m.description);
}

function FormationDetail() {
  const { id } = useParams();
  const { t } = useLang();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [shareMsg, setShareMsg] = useState("");
  const [reload, setReload] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    api
      .getProduct(id)
      .then((payload) => {
        if (cancelled) return;
        const data = payload?.product || payload;
        setProduct(data);
        api.trackFunnel("product_view", { product_id: Number(data.id) }).catch(() => {});
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err?.message || t("Formation introuvable."));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id, reload, t]);

  useEffect(() => {
    setLightboxOpen(false);
  }, [id]);

  useEffect(() => {
    if (!lightboxOpen) return undefined;
    const onKey = (event) => {
      if (event.key === "Escape") setLightboxOpen(false);
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [lightboxOpen]);

  const objectives = useMemo(() => sentences(product?.description).slice(0, 4), [product]);
  const modules = useMemo(() => formationModules(product), [product]);

  const flash = product?.flash_promo || null;
  const displayPrice = Number(flash ? flash.price : product?.price || 0);
  const oldPrice = Number(
    flash
      ? product?.price
      : product?.old_price === null || product?.old_price === undefined
        ? 0
        : product.old_price
  );
  const discount = oldPrice > displayPrice && oldPrice > 0 ? Math.round((1 - displayPrice / oldPrice) * 100) : 0;
  const symbol = countrySymbol(product?.shop_country);
  const photo = product ? firstPhoto(product) : null;
  const isVideo = product?.digital_kind === "youtube";
  const accessDays = Number(product?.access_days || 0);
  const accessLabel = accessDays > 0
    ? t("Accès pendant {n} jours", { n: accessDays })
    : t("Accès illimité");
  const trainerLink = product
    ? product.shop_role === "creator"
      ? `/createur/${product.shop_id}`
      : `/boutique/${product.shop_id}`
    : "/formations";
  const shareUrl = product ? `${BASE_URL}/formations/${product.id}` : BASE_URL;

  const openCheckout = () => {
    api
      .trackFunnel("begin_checkout", { product_id: Number(product.id) })
      .catch(() => {});
    setCheckoutOpen(true);
  };

  const share = async () => {
    try {
      if (navigator.share) {
        await navigator.share({
          title: product.name,
          text: truncate(product.description, 180),
          url: shareUrl,
        });
        return;
      }
      await navigator.clipboard.writeText(shareUrl);
      setShareMsg(t("Lien copié"));
      setTimeout(() => setShareMsg(""), 2500);
    } catch {
      setShareMsg("");
    }
  };

  const closeCheckout = (done) => {
    setCheckoutOpen(false);
    if (done) navigate(user ? "/mes-formations" : "/suivi");
  };

  if (loading) {
    return (
      <main className="formation-page">
        <div className="formations-shell formation-detail-loading">
          <div className="formation-skeleton-detail-media" />
          <div className="formation-skeleton-detail-copy">
            <div className="formation-skeleton-line short" />
            <div className="formation-skeleton-line title" />
            <div className="formation-skeleton-line" />
            <div className="formation-skeleton-line" />
            <div className="formation-skeleton-line short" />
          </div>
        </div>
      </main>
    );
  }

  if (error || !product) {
    return (
      <main className="formation-page">
        <div className="formations-shell formations-empty formation-detail-error">
          <h1>{t("Formation introuvable.")}</h1>
          <p>{error || t("Cette formation n'est plus disponible.")}</p>
          <div className="formations-empty-actions">
            <Link to="/formations" className="formation-btn formation-btn-primary">
              {t("Retour aux formations")}
            </Link>
            <button type="button" className="formation-btn formation-btn-ghost" onClick={() => setReload((value) => value + 1)}>
              {t("Réessayer")}
            </button>
          </div>
        </div>
      </main>
    );
  }

  const includes = [
    {
      icon: isVideo ? IconEye : IconDownload,
      title: isVideo ? t("Vidéo protégée") : t("Support téléchargeable"),
      text: isVideo
        ? t("Lecture sécurisée en ligne, sans téléchargement.")
        : product.digital_name
          ? `${product.digital_name}${product.digital_size ? ` — ${formatBytes(Number(product.digital_size))}` : ""}`
          : t("Fichier disponible après paiement."),
    },
    {
      icon: IconClock,
      title: t("Durée d'accès"),
      text: accessLabel,
    },
    {
      icon: IconLock,
      title: t("Paiement sécurisé"),
      text: t("Mobile Money ou carte bancaire via iKeePay."),
    },
    {
      icon: IconUsers,
      title: t("Formateur"),
      text: product.shop_name
        ? t("Proposé par {name}", { name: product.shop_name })
        : t("Formateur MboppiShop"),
    },
  ];

  return (
    <>
      <Seo
        title={`${product.name} — ${t("Formation")} — MboppiShop`}
        description={product.description || t("Formation en ligne sur MboppiShop.")}
        ogImage={photo && !String(photo).startsWith("data:") ? photo : undefined}
      />
      <main className="formation-page">
        <section className="formation-detail-hero">
          <div className="formations-shell">
            <nav className="formation-breadcrumb" aria-label={t("Fil d'Ariane")}>
              <Link to="/">{t("Accueil")}</Link>
              <IconChevronRight size={13} />
              <Link to="/formations">{t("Formations")}</Link>
              <IconChevronRight size={13} />
              <span>{truncate(product.name, 60)}</span>
            </nav>

            <div className="formation-detail-grid">
              <div className="formation-detail-main">
                <div
                  className={`formation-detail-media${photo ? " is-zoomable" : ""}`}
                  onClick={photo ? () => setLightboxOpen(true) : undefined}
                  onKeyDown={
                    photo
                      ? (event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            setLightboxOpen(true);
                          }
                        }
                      : undefined
                  }
                  role={photo ? "button" : undefined}
                  tabIndex={photo ? 0 : undefined}
                  aria-label={photo ? t("Agrandir l'image") : undefined}
                >
                  {photo ? (
                    <img src={photo} alt={product.name} />
                  ) : (
                    <span className="formation-detail-media-fallback">
                      {isVideo ? <IconEye size={52} /> : <IconBook size={52} />}
                    </span>
                  )}
                  {photo && (
                    <span className="formation-detail-zoom-hint" aria-hidden="true">
                      <IconZoomIn size={16} />
                    </span>
                  )}
                  <span className="formation-detail-badge">{t("Formation digitale")}</span>
                  {discount > 0 && <span className="formation-detail-promo">-{discount}%</span>}
                </div>

                <div className="formation-detail-intro">
                  <div className="formation-detail-tags">
                    <span>
                      {product.category === "Digital" ? t("Digital") : product.category || t("Digital")}
                    </span>
                    <span>
                      {isVideo ? <IconEye size={14} /> : <IconBook size={14} />}
                      {isVideo ? t("Vidéo protégée") : t("Support téléchargeable")}
                    </span>
                  </div>
                  <h1>{product.name}</h1>
                  {product.description && (
                    <p className="formation-detail-sub">{truncate(product.description, 280)}</p>
                  )}

                  <div className="formation-detail-meta">
                    {Number(product.review_count || 0) > 0 ? (
                      <span className="formation-detail-rating">
                        <IconStarFilled size={15} />
                        <strong>{Number(product.rating_avg || 0).toFixed(1)}</strong>
                        <small>{t("{n} avis", { n: product.review_count })}</small>
                      </span>
                    ) : (
                      <span className="formation-detail-rating muted">{t("Nouvelle formation")}</span>
                    )}
                    {Number(product.sold || 0) > 0 && (
                      <span>
                        <IconUsers size={15} />
                        {t("{n} apprenant(s)", { n: product.sold })}
                      </span>
                    )}
                    <span>
                      <IconClock size={15} />
                      {accessLabel}
                    </span>
                  </div>

                  {product.shop_name && (
                    <Link to={trainerLink} className="formation-detail-trainer-inline">
                      {product.shop_avatar ? (
                        <img src={proxyPhotoUrl(product.shop_avatar)} alt="" />
                      ) : (
                        <span className="formation-avatar-fallback">
                          {String(product.shop_name).slice(0, 1)}
                        </span>
                      )}
                      <span>
                        <small>{t("Formateur")}</small>
                        <strong>{product.shop_name}</strong>
                      </span>
                      {product.shop_verified && <IconShieldCheck size={16} />}
                      <IconChevronRight size={15} />
                    </Link>
                  )}
                </div>
              </div>

              <aside className="formation-price-card">
                <span className="formation-price-card-label">{t("Accès à la formation")}</span>
                <div className="formation-price-line">
                  <span className="formation-price">
                    {formatMoney(displayPrice)} <small>{symbol}</small>
                  </span>
                  {oldPrice > displayPrice && (
                    <span className="formation-price-old">{formatMoney(oldPrice)}</span>
                  )}
                </div>
                {discount > 0 && (
                  <span className="formation-price-discount">
                    {t("Économisez {n}% aujourd'hui", { n: discount })}
                  </span>
                )}

                <button type="button" className="formation-btn formation-btn-primary formation-btn-block" onClick={openCheckout}>
                  {t("Acheter la formation")}
                </button>
                <button type="button" className="formation-btn formation-btn-ghost formation-btn-block" onClick={share}>
                  <IconShare size={16} />
                  {t("Partager")}
                </button>
                {shareMsg && <p className="formation-share-msg">{shareMsg}</p>}

                <ul className="formation-perks">
                  <li><IconCheck size={15} />{t("Accès immédiat après paiement")}</li>
                  <li><IconCheck size={15} />{accessLabel}</li>
                  <li><IconCheck size={15} />{isVideo ? t("Vidéo protégée en ligne") : t("Support téléchargeable")}</li>
                  <li><IconCheck size={15} />{t("Paiement en ligne sécurisé")}</li>
                </ul>

                <p className="formation-secure">
                  <IconLock size={14} />
                  {t("Transaction chiffrée et vérifiée par iKeePay.")}
                </p>

                {product.shop_phone && (
                  <a
                    className="formation-contact"
                    href={waLink(product.shop_phone, t("Bonjour, je suis intéressé par « {name} » sur MboppiShop.", { name: product.name }))}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <IconWhatsApp size={16} />
                    {t("Contacter le formateur")}
                  </a>
                )}
              </aside>
            </div>
          </div>
        </section>

        <div className="formations-shell">
          {modules.length > 0 ? (
            <section className="formation-section">
              <h2>{t("Ce que vous allez apprendre")}</h2>
              <div className="formation-modules">
                {modules.map((module, index) => (
                  <article className="formation-module" key={`${index}-${module.title}`}>
                    <span className="formation-module-index">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <div className="formation-module-body">
                      <div className="formation-module-top">
                        <h3>{module.title || t("Module {n}", { n: index + 1 })}</h3>
                        {module.duration && (
                          <span className="formation-module-duration">{module.duration}</span>
                        )}
                      </div>
                      {module.subtitle && (
                        <p className="formation-module-sub">{module.subtitle}</p>
                      )}
                      {module.description && (
                        <p className="formation-module-desc">{module.description}</p>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ) : objectives.length > 0 ? (
            <section className="formation-section">
              <h2>{t("Ce que vous allez apprendre")}</h2>
              <div className="formation-objectives">
                {objectives.map((objective) => (
                  <div key={objective} className="formation-objective">
                    <span><IconCheck size={15} /></span>
                    <p>{objective}</p>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          <section className="formation-section formation-about">
            <div>
              <h2>{t("À propos de cette formation")}</h2>
              <p>{product.description || t("Aucune description disponible.")}</p>
            </div>
            <div className="formation-includes">
              {includes.map(({ icon: Icon, title, text }) => (
                <article key={title} className="formation-include">
                  <span className="formation-include-icon"><Icon size={19} /></span>
                  <div>
                    <h3>{title}</h3>
                    <p>{text}</p>
                  </div>
                </article>
              ))}
            </div>
          </section>

          {product.shop_name && (
            <section className="formation-section">
              <h2>{t("Votre formateur")}</h2>
              <div className="formation-trainer-card">
                {product.shop_avatar ? (
                  <img src={proxyPhotoUrl(product.shop_avatar)} alt={product.shop_name} />
                ) : (
                  <span className="formation-trainer-avatar">
                    {String(product.shop_name).slice(0, 1)}
                  </span>
                )}
                <div className="formation-trainer-copy">
                  <span>{product.shop_role === "creator" ? t("Créateur") : t("Boutique")}</span>
                  <h3>{product.shop_name}</h3>
                  <p>
                    {product.shop_verified
                      ? t("Compte vérifié MboppiShop")
                      : t("Formateur sur MboppiShop")}
                    {product.shop_country ? ` · ${product.shop_country}` : ""}
                  </p>
                </div>
                <Link to={trainerLink} className="formation-btn formation-btn-ghost">
                  {product.shop_role === "creator" ? t("Voir le créateur") : t("Voir la boutique")}
                  <IconChevronRight size={15} />
                </Link>
              </div>
            </section>
          )}

          <section className="formation-section formation-reviews">
            <Reviews product={product} />
          </section>

          <section className="formation-section">
            <h2>{t("Questions fréquentes")}</h2>
            <div className="formation-faq">
              <details>
                <summary>{t("Comment vais-je recevoir ma formation ?")}</summary>
                <p>{t("Après confirmation du paiement, votre formation est disponible dans « Mes formations ». Vous pouvez télécharger votre support ou regarder votre vidéo protégée depuis votre espace.")}</p>
              </details>
              <details>
                <summary>{t("Combien de temps ai-je accès à la formation ?")}</summary>
                <p>{accessLabel}. {t("Vous pouvez revenir sur votre contenu autant de fois que nécessaire pendant cette période.")}</p>
              </details>
              <details>
                <summary>{t("Puis-je payer avec Mobile Money ?")}</summary>
                <p>{t("Oui. Le paiement en ligne iKeePay prend en charge les moyens disponibles dans votre pays, dont le Mobile Money.")}</p>
              </details>
              <details>
                <summary>{t("Que faire si je n'arrive pas à télécharger mon fichier ?")}</summary>
                <p>
                  {t("Vérifiez votre connexion puis réessayez depuis « Mes formations ». Si le problème persiste, contactez le formateur.")}
                </p>
              </details>
              <details>
                <summary>{t("Puis-je demander un remboursement ?")}</summary>
                <p>
                  {t("Les conditions de remboursement sont détaillées dans notre politique dédiée.")}{" "}
                  <Link to="/remboursement">{t("Consulter la politique de remboursement")}</Link>
                </p>
              </details>
            </div>
          </section>

          <section className="formations-cta-band formation-detail-final-cta">
            <div>
              <span className="formations-cta-eyebrow">{t("Prêt à commencer ?")}</span>
              <h2>{t("Faites le premier pas dès aujourd'hui")}</h2>
              <p>{t("Rejoignez la formation et accédez à votre contenu immédiatement après le paiement.")}</p>
            </div>
            <button type="button" className="formation-btn formation-btn-light" onClick={openCheckout}>
              {t("Acheter la formation")}
            </button>
          </section>
        </div>

        <div className="formation-mobile-cta">
          <div>
            <strong>{formatMoney(displayPrice)} {symbol}</strong>
            <span>{t("Accès immédiat")}</span>
          </div>
          <button type="button" className="formation-btn formation-btn-primary" onClick={openCheckout}>
            {t("Acheter")}
          </button>
        </div>

        <FormationCheckoutModal
          open={checkoutOpen}
          product={product}
          onClose={closeCheckout}
        />

        {lightboxOpen && photo && (
          <div
            className="lightbox formation-lightbox"
            role="dialog"
            aria-modal="true"
            aria-label={product.name}
            onClick={() => setLightboxOpen(false)}
          >
            <button
              type="button"
              className="lightbox-close"
              onClick={(event) => {
                event.stopPropagation();
                setLightboxOpen(false);
              }}
              aria-label={t("Fermer")}
            >
              ✕
            </button>
            <img
              className="lightbox-img"
              src={photo}
              alt={product.name}
              onClick={(event) => event.stopPropagation()}
            />
          </div>
        )}
      </main>
    </>
  );
}

export default FormationDetail;
