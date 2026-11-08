import React, { useEffect, useRef, useState } from "react";
import { useAuth } from "../App.jsx";
import { countrySymbol } from "../config.js";
import { firstPhoto } from "../share.js";
import { useLang } from "../i18n.jsx";
import { formatMoney } from "./ProductCard.jsx";
import DigitalBuyTunnel from "./DigitalBuyTunnel.jsx";
import {
  IconCheck,
  IconClose,
  IconLock,
  IconShieldCheck,
} from "./icons.jsx";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function FormationCheckoutModal({ open, product, onClose, onPurchased }) {
  const { t } = useLang();
  const { user } = useAuth();
  const [form, setForm] = useState({ name: "", email: "", phone: "" });
  const [errors, setErrors] = useState({});
  const [ready, setReady] = useState(false);
  const doneRef = useRef(false);

  useEffect(() => {
    if (!open) return;
    setForm({
      name: (user && user.name) || "",
      email: (user && user.email) || "",
      phone: (user && user.phone) || "",
    });
    setErrors({});
    setReady(false);
    doneRef.current = false;
  }, [open, user]);

  useEffect(() => {
    if (!open) return undefined;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  if (!open || !product) return null;

  const flash = product.flash_promo || null;
  const price = Number(flash ? flash.price : product.price || 0);
  const oldPrice = Number(
    flash
      ? product.price
      : product.old_price === null || product.old_price === undefined
        ? 0
        : product.old_price
  );
  const symbol = countrySymbol(product.shop_country);
  const photo = firstPhoto(product);

  const submit = (event) => {
    event.preventDefault();
    const next = {};
    if (form.name.trim().length < 2) next.name = t("Indiquez votre nom complet.");
    if (!EMAIL_RE.test(form.email.trim())) next.email = t("Adresse e-mail invalide.");
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    setReady(true);
  };

  const close = () => {
    onClose(doneRef.current);
  };

  if (ready) {
    return (
      <DigitalBuyTunnel
        items={[
          {
            product_id: product.id,
            name: product.name,
            digital_kind: product.digital_kind || "file",
          },
        ]}
        buyer={{
          name: form.name.trim(),
          email: form.email.trim(),
          phone: form.phone.trim(),
        }}
        onDone={() => {
          doneRef.current = true;
          if (typeof onPurchased === "function") onPurchased();
        }}
        onClose={close}
      />
    );
  }

  return (
    <div
      className="formation-modal-overlay"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <div className="formation-modal" role="dialog" aria-modal="true" aria-labelledby="formation-checkout-title">
        <button type="button" className="formation-modal-close" aria-label={t("Fermer")} onClick={close}>
          <IconClose size={20} />
        </button>

        <div className="formation-modal-main">
          <span className="formation-modal-eyebrow">
            <IconLock size={14} />
            {t("Paiement sécurisé")}
          </span>
          <h2 id="formation-checkout-title">{t("Finaliser votre inscription")}</h2>
          <p className="formation-modal-sub">
            {t("Renseignez vos informations pour accéder immédiatement à la formation après confirmation du paiement.")}
          </p>

          <form className="formation-form" onSubmit={submit} noValidate>
            <div className="formation-field">
              <label htmlFor="formation-buyer-name">{t("Nom complet")}</label>
              <input
                id="formation-buyer-name"
                className="boost-input"
                type="text"
                autoComplete="name"
                value={form.name}
                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                placeholder={t("Votre nom et prénom")}
              />
              {errors.name && <span className="formation-field-error">{errors.name}</span>}
            </div>

            <div className="formation-field">
              <label htmlFor="formation-buyer-email">{t("Adresse e-mail")}</label>
              <input
                id="formation-buyer-email"
                className="boost-input"
                type="email"
                autoComplete="email"
                value={form.email}
                onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
                placeholder={t("vous@exemple.com")}
              />
              {errors.email && <span className="formation-field-error">{errors.email}</span>}
            </div>

            <div className="formation-field">
              <label htmlFor="formation-buyer-phone">{t("Téléphone (facultatif)")}</label>
              <input
                id="formation-buyer-phone"
                className="boost-input"
                type="tel"
                autoComplete="tel"
                value={form.phone}
                onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))}
                placeholder={t("+237 6 00 00 00 00")}
              />
            </div>

            <button type="submit" className="formation-btn formation-btn-primary formation-btn-block">
              {t("Continuer vers le paiement")}
            </button>

            <p className="formation-form-note">
              <IconShieldCheck size={15} />
              {t("Transaction chiffrée et vérifiée par iKeePay.")}
            </p>
          </form>
        </div>

        <aside className="formation-modal-aside">
          <h3>{t("Récapitulatif")}</h3>
          <div className="formation-summary-product">
            {photo ? (
              <img src={photo} alt={product.name} />
            ) : (
              <span className="formation-summary-placeholder">
                {String(product.name || "?").slice(0, 1)}
              </span>
            )}
            <div>
              <strong>{product.name}</strong>
              {product.shop_name && <span>{t("Par {name}", { name: product.shop_name })}</span>}
            </div>
          </div>

          <ul className="formation-summary-perks">
            <li>
              <IconCheck size={15} />
              {t("Accès immédiat après paiement")}
            </li>
            <li>
              <IconCheck size={15} />
              {product.digital_kind === "youtube" ? t("Vidéo protégée en ligne") : t("Support téléchargeable")}
            </li>
            <li>
              <IconCheck size={15} />
              {t("Retrouvez votre formation dans « Mes formations »")}
            </li>
          </ul>

          <div className="formation-summary-total">
            <span>{t("Total")}</span>
            <strong>
              {formatMoney(price)} <small>{symbol}</small>
            </strong>
          </div>
          {oldPrice > price && (
            <p className="formation-summary-old">
              {t("au lieu de")} {formatMoney(oldPrice)} {symbol}
            </p>
          )}

          <p className="formation-summary-note">
            {t("Le paiement est traité sur une page sécurisée. Vous serez redirigé automatiquement après confirmation.")}
          </p>
        </aside>
      </div>
    </div>
  );
}
