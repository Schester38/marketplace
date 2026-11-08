import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Seo from "../components/Seo.jsx";
import DigitalDownload from "../components/DigitalDownload.jsx";
import { api } from "../api.js";
import { useAuth } from "../App.jsx";
import { useLang } from "../i18n.jsx";
import { useRefreshOnFocus } from "../useRefreshOnFocus.js";
import { countrySymbol } from "../config.js";
import { firstPhoto } from "../share.js";
import { formatMoney } from "../components/ProductCard.jsx";
import { forgetGuestSale, guestSales } from "../guestSales.js";
import {
  IconBook,
  IconChevronRight,
  IconDownload,
  IconEye,
  IconUsers,
} from "../components/icons.jsx";

function statusOf(purchase, t) {
  if (purchase.status === "cancelled") return { label: t("Annulée"), tone: "muted" };
  if (purchase.shop_confirmed_at || purchase.delivered_at || purchase.status === "delivered")
    return { label: t("Accès ouvert"), tone: "ok" };
  return { label: t("En attente de confirmation"), tone: "pending" };
}

export default function MesFormations() {
  const { t, locale } = useLang();
  const { user } = useAuth();
  const [purchases, setPurchases] = useState(null);
  const [guests, setGuests] = useState(() => guestSales());
  const [error, setError] = useState("");

  const load = useCallback(() => {
    setError("");
    setGuests(guestSales());
    if (!user) {
      setPurchases([]);
      return;
    }
    api
      .purchasesMy()
      .then((data) => {
        const list = Array.isArray(data?.purchases) ? data.purchases : [];
        setPurchases(list.filter((purchase) => purchase.is_digital === true));
      })
      .catch((err) => {
        setError(err?.message || t("Impossible de charger vos formations."));
        setPurchases([]);
      });
  }, [user, t]);

  useEffect(load, [load]);
  useRefreshOnFocus(load);

  const removeGuest = (saleId) => {
    forgetGuestSale(saleId);
    setGuests(guestSales());
  };

  const list = purchases || [];
  const total = list.length + guests.length;
  const spent = list.reduce((sum, purchase) => sum + Number(purchase.total_price || 0), 0);

  const dateLabel = (value) => {
    if (!value) return "—";
    try {
      return new Date(value).toLocaleDateString(locale, {
        day: "numeric",
        month: "long",
        year: "numeric",
      });
    } catch {
      return "—";
    }
  };

  return (
    <>
      <Seo
        title={t("Mes formations — MboppiShop")}
        description={t("Retrouvez toutes les formations que vous avez achetées sur MboppiShop.")}
      />
      <main className="formation-page">
        <section className="formations-hero formations-hero-compact">
          <div className="formations-hero-inner">
            <div className="formations-hero-copy">
              <span className="formations-eyebrow">{t("MboppiShop Formations")}</span>
              <h1>{t("Mes formations")}</h1>
              <p className="formations-hero-sub">
                {t("Retrouvez vos formations achetées, téléchargez vos supports et reprenez votre apprentissage quand vous le souhaitez.")}
              </p>
              <div className="formations-hero-actions">
                <Link to="/formations" className="formation-btn formation-btn-primary">
                  {t("Découvrir les formations")}
                </Link>
                {!user && (
                  <Link to="/login" className="formation-btn formation-btn-ghost">
                    {t("Se connecter")}
                  </Link>
                )}
              </div>
            </div>
            <div className="formations-hero-visual formations-owned-visual" aria-hidden="true">
              <div className="formations-hero-glow" />
              <div className="formations-owned-stat">
                <IconBook size={22} />
                <strong>{purchases === null ? "—" : total}</strong>
                <span>{t("formations")}</span>
              </div>
              <div className="formations-owned-stat formations-owned-stat-b">
                <IconUsers size={22} />
                <strong>{purchases === null ? "—" : spent > 0 ? `${formatMoney(spent)}` : "0"}</strong>
                <span>{t("investis dans votre progression")}</span>
              </div>
            </div>
          </div>
        </section>

        <div className="formations-shell">
          {!user && guests.length === 0 && (
            <section className="formation-section formation-login-prompt">
              <span className="formation-feature-icon"><IconUsers size={20} /></span>
              <h2>{t("Connectez-vous pour retrouver vos formations")}</h2>
              <p>{t("Vos formations achetées sont liées à votre compte MboppiShop et restent accessibles sur tous vos appareils.")}</p>
              <div className="formations-empty-actions">
                <Link to="/login" className="formation-btn formation-btn-primary">
                  {t("Se connecter")}
                </Link>
                <Link to="/register" className="formation-btn formation-btn-ghost">
                  {t("Créer un compte")}
                </Link>
              </div>
            </section>
          )}

          {user && purchases === null && (
            <div className="formations-grid" aria-hidden="true">
              {Array.from({ length: 3 }).map((_, index) => (
                <div key={index} className="formation-card formation-card-skeleton">
                  <div className="formation-skeleton-media" />
                  <div className="formation-card-body">
                    <div className="formation-skeleton-line short" />
                    <div className="formation-skeleton-line" />
                    <div className="formation-skeleton-line short" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {error && (
            <div className="formations-empty">
              <p className="error-msg">{error}</p>
              <button type="button" className="formation-btn formation-btn-ghost" onClick={load}>
                {t("Réessayer")}
              </button>
            </div>
          )}

          {!error && user && purchases !== null && list.length === 0 && guests.length === 0 && (
            <div className="formations-empty">
              <span className="formations-empty-icon"><IconBook size={28} /></span>
              <h2>{t("Aucune formation achetée pour le moment.")}</h2>
              <p>{t("Explorez le catalogue et commencez votre première formation dès aujourd'hui.")}</p>
              <Link to="/formations" className="formation-btn formation-btn-primary">
                {t("Découvrir les formations")}
              </Link>
            </div>
          )}

          {list.length > 0 && (
            <section className="formation-section">
              <div className="formations-section-head">
                <span className="formations-eyebrow">{t("Votre bibliothèque")}</span>
                <h2>{t("Formations achetées")}</h2>
              </div>
              <div className="formation-owned-grid">
                {list.map((purchase) => {
                  const status = statusOf(purchase, t);
                  const photo = firstPhoto(purchase);
                  const isVideo = purchase.digital_kind === "youtube";
                  return (
                    <article key={purchase.id} className="formation-owned-card">
                      <div className="formation-owned-media">
                        {photo ? (
                          <img src={photo} alt={purchase.product_name} loading="lazy" />
                        ) : (
                          <span className="formation-owned-fallback">
                            {isVideo ? <IconEye size={34} /> : <IconDownload size={34} />}
                          </span>
                        )}
                        <span className={`formation-owned-status tone-${status.tone}`}>
                          {status.label}
                        </span>
                      </div>
                      <div className="formation-owned-body">
                        <span className="formation-owned-kind">
                          {isVideo ? t("Vidéo protégée") : t("Support téléchargeable")}
                        </span>
                        <h3>
                          <Link to={`/produit/${purchase.product_id}`}>{purchase.product_name}</Link>
                        </h3>
                        {purchase.shop_name && (
                          <p className="formation-owned-trainer">
                            {t("Par {name}", { name: purchase.shop_name })}
                          </p>
                        )}
                        <div className="formation-owned-meta">
                          <span>{dateLabel(purchase.created_at)}</span>
                          <strong>
                            {formatMoney(purchase.total_price)} {countrySymbol(purchase.shop_country)}
                          </strong>
                        </div>
                        <DigitalDownload sale={purchase} compact label={t("Accéder à ma formation")} />
                        <Link to={`/produit/${purchase.product_id}`} className="formation-owned-link">
                          {t("Voir la fiche")}
                          <IconChevronRight size={14} />
                        </Link>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          )}

          {guests.length > 0 && (
            <section className="formation-section">
              <div className="formations-section-head">
                <span className="formations-eyebrow">{t("Sur cet appareil")}</span>
                <h2>{t("Achats effectués sans compte")}</h2>
                <p>{t("Ces achats sont enregistrés dans ce navigateur. Conservez votre code de confirmation pour y accéder.")}</p>
              </div>
              <div className="formation-owned-grid">
                {guests.map((guest) => {
                  const isVideo = guest.kind === "youtube";
                  const sale = {
                    id: guest.saleId,
                    is_digital: true,
                    digital_kind: guest.kind || "file",
                    digital_name: guest.name,
                    product_name: guest.name,
                  };
                  return (
                    <article key={guest.saleId} className="formation-owned-card">
                      <div className="formation-owned-media">
                        <span className="formation-owned-fallback">
                          {isVideo ? <IconEye size={34} /> : <IconDownload size={34} />}
                        </span>
                        <span className="formation-owned-status tone-pending">
                          {t("Achat invité")}
                        </span>
                      </div>
                      <div className="formation-owned-body">
                        <span className="formation-owned-kind">
                          {isVideo ? t("Vidéo protégée") : t("Support téléchargeable")}
                        </span>
                        <h3>{guest.name || t("Formation achetée")}</h3>
                        <div className="formation-owned-meta">
                          <span>{dateLabel(guest.at)}</span>
                          <strong>{t("Code : {code}", { code: guest.code || "—" })}</strong>
                        </div>
                        <DigitalDownload sale={sale} code={guest.code} compact label={t("Accéder à ma formation")} />
                        <div className="formation-owned-actions">
                          <Link to={`/suivi/${guest.saleId}?code=${encodeURIComponent(guest.code || "")}`} className="formation-owned-link">
                            {t("Voir le suivi")}
                            <IconChevronRight size={14} />
                          </Link>
                          <button type="button" className="formation-owned-remove" onClick={() => removeGuest(guest.saleId)}>
                            {t("Retirer de cet appareil")}
                          </button>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          )}
        </div>
      </main>
    </>
  );
}
