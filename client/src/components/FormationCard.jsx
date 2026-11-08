import React from "react";
import { Link } from "react-router-dom";
import { countrySymbol } from "../config.js";
import { firstPhoto } from "../share.js";
import { useLang } from "../i18n.jsx";
import { formatMoney } from "./ProductCard.jsx";
import {
  IconBook,
  IconEye,
  IconStarFilled,
  IconUsers,
} from "./icons.jsx";

function truncate(text, max) {
  const value = String(text || "").replace(/\s+/g, " ").trim();
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1).trimEnd()}…`;
}

export default function FormationCard({ product }) {
  const { t } = useLang();
  const photo = firstPhoto(product);
  const symbol = countrySymbol(product?.shop_country);
  const flash = product.flash_promo || null;
  const displayPrice = Number(flash ? flash.price : product.price || 0);
  const oldPrice = Number(
    flash
      ? product.price
      : product.old_price === null || product.old_price === undefined
        ? 0
        : product.old_price
  );
  const discount = oldPrice > displayPrice && oldPrice > 0 ? Math.round((1 - displayPrice / oldPrice) * 100) : 0;
  const rating = Number(product.rating_avg || 0);
  const reviews = Number(product.review_count || 0);
  const sold = Number(product.sold || 0);
  const isVideo = product.digital_kind === "youtube";
  const href = `/formations/${product.id}`;

  return (
    <article className="formation-card">
      <Link to={href} className="formation-card-media" aria-label={product.name}>
        {photo ? (
          <img src={photo} alt={product.name} loading="lazy" decoding="async" />
        ) : (
          <span className="formation-card-media-fallback">
            {isVideo ? <IconEye size={42} /> : <IconBook size={42} />}
          </span>
        )}
        <span className="formation-card-badge">{t("Formation")}</span>
        {discount > 0 && <span className="formation-card-promo">-{discount}%</span>}
        <span className="formation-card-format">
          {isVideo ? <IconEye size={14} /> : <IconBook size={14} />}
          {isVideo ? t("Vidéo protégée") : t("Support téléchargeable")}
        </span>
      </Link>

      <div className="formation-card-body">
        <div className="formation-card-meta">
          <span className="formation-card-cat">
            {product.category === "Digital" ? t("Digital") : product.category || t("Digital")}
          </span>
          {reviews > 0 ? (
            <span className="formation-card-rating">
              <IconStarFilled size={13} />
              {rating.toFixed(1)}
              <small>({reviews})</small>
            </span>
          ) : (
            <span className="formation-card-new">{t("Nouveau")}</span>
          )}
        </div>

        <h3>
          <Link to={href}>{product.name}</Link>
        </h3>
        {product.shop_name && (
          <p className="formation-card-trainer">
            {t("Par {name}", { name: product.shop_name })}
          </p>
        )}
        {product.description && (
          <p className="formation-card-desc">{truncate(product.description, 132)}</p>
        )}

        <div className="formation-card-lessons">
          {sold > 0 && (
            <span>
              <IconUsers size={14} />
              {t("{n} apprenant(s)", { n: sold })}
            </span>
          )}
          <span>
            <IconBook size={14} />
            {isVideo ? t("Accès en ligne") : t("Accès immédiat")}
          </span>
        </div>

        <div className="formation-card-footer">
          <div className="formation-card-price">
            <strong>
              {formatMoney(displayPrice)} <small>{symbol}</small>
            </strong>
            {oldPrice > displayPrice && <s>{formatMoney(oldPrice)}</s>}
          </div>
          <span className="formation-card-cta">{t("Voir la formation")}</span>
        </div>
      </div>
    </article>
  );
}
