import React, { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { api } from "../api.js";
import {
  countrySymbol,
  categoryEmoji,
  countryPhone,
  BASE_URL,
  OPERATORS_BY_COUNTRY,
  DEFAULT_OPERATORS,
} from "../config.js";
import Seo from "../components/Seo.jsx";
import Logo from "../components/Logo.jsx";
import { formatMoney } from "../components/ProductCard.jsx";
import CopyCode from "../components/CopyCode.jsx";
import DigitalDownload from "../components/DigitalDownload.jsx";
import DigitalBuyTunnel from "../components/DigitalBuyTunnel.jsx";
import PaymentMethodsStrip from "../components/PaymentMethodsStrip.jsx";
import { useAuth } from "../App.jsx";
import { useLang } from "../i18n.jsx";
import { PriceEquivalent } from "../money.jsx";

export default function PurchasePage() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const { user } = useAuth();
  const { t } = useLang();
  const navigate = useNavigate();
  const location = useLocation();
  const linkCode = (params.get("code") || "").trim().toUpperCase();
  const [product, setProduct] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [shopWallets, setShopWallets] = useState(null);
  const [form, setForm] = useState({
    seller_code: linkCode,
    buyer_name: "",
    buyer_city: "",
    buyer_address: "",
    buyer_phone: "",
    quantity: 1,
  });
  const [paymentMethod, setPaymentMethod] = useState("mobile");
  const [copiedWallet, setCopiedWallet] = useState(null);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [purchase, setPurchase] = useState(null);
  const [waUrl, setWaUrl] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  // Produit DIGITAL : aucun formulaire (ni livraison, ni quantité, ni code) —
  // le bouton « Télécharger » ouvre le tunnel de paiement en ligne (iKeePay),
  // puis le fichier se télécharge AUTOMATIQUEMENT après confirmation. Le code
  // vendeur reste transmis (lien /acheter/:id?code=XXX) pour sa commission.
  const [tunnelOpen, setTunnelOpen] = useState(false);
  const [tunnelDone, setTunnelDone] = useState(false);

  useEffect(() => {
    api
      .getProduct(id)
      .then((d) => {
        setProduct(d.product);
        if (d.product && d.product.shop_id) {
          api
            .shopPaymentMethods(d.product.shop_id)
            .then((r) => setShopWallets(r.methods))
            .catch(() => {});
        }
      })
      .catch(() => setNotFound(true));
  }, [id]);

  // Pré-remplissage depuis le compte connecté (nom / téléphone) : rien à
  // ressaisir, en particulier pour un produit digital.
  useEffect(() => {
    if (!user) return;
    setForm((f) => ({
      ...f,
      buyer_name: f.buyer_name || String(user.name || ""),
      buyer_phone: f.buyer_phone || String(user.phone || ""),
    }));
  }, [user]);

  const copyWallet = async (value) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedWallet(value);
      setTimeout(() => setCopiedWallet(null), 1500);
    } catch {}
  };

  /**
   * URL WhatsApp de la boutique avec le récapitulatif de la commande prérempli.
   * `info` porte les coordonnées réellement utilisées (achat digital en un clic
   * depuis le compte, sans formulaire) ; par défaut, celles du formulaire.
   */
  const buildShopWaUrl = (sale, info) => {
    const src = info || form;
    let digits = String(product.shop_phone || "").replace(/[^0-9]/g, "");
    if (!digits) return null;
    if (digits.startsWith("00")) digits = digits.slice(2);
    const dial = countryPhone(product.shop_country).replace("+", "");
    if (!digits.startsWith(dial)) digits = dial + digits.replace(/^0+/, "");
    const isDigital = product.is_digital === true;
    const qty = Number(src.quantity) || 1;
    const code = sale && (sale.confirm_code || sale.buyer_code);
    const pay =
      src.payLabel ||
      (paymentMethod === "espece" ? "En espèces (à la livraison)" : "Mobile Money direct");
    const lines = [
      "🛒 *Nouvelle commande Mboppi*",
      "",
      `📦 Produit : ${product.name}`,
      isDigital ? null : `🔢 Quantité : ${qty}`,
      `💰 Prix : ${formatMoney(displayPrice)} ${symbol}${sale && sale.flash_promo ? " (prix promo)" : ""}`,
      isDigital
        ? "📁 Produit digital — téléchargement après confirmation du paiement"
        : `💳 Paiement : ${pay}`,
      "",
      "— Coordonnées du client —",
      `👤 Nom : ${src.buyer_name}`,
      `📞 Téléphone : ${src.buyer_phone}`,
      isDigital ? null : `🏙️ Ville : ${src.buyer_city}`,
      isDigital ? null : `📍 Adresse : ${src.buyer_address}`,
      code ? `🔑 Code de confirmation : ${code}` : null,
      sale && sale.id
        ? `📦 Suivi de votre commande : ${BASE_URL}/suivi/${sale.id}?code=${encodeURIComponent(
            code || ""
          )}`
        : null,
      "",
      isDigital
        ? `👉 Produit digital à confirmer dans votre espace : ${BASE_URL}/shop`
        : `👉 Gérez cette commande dans votre espace livreur : ${BASE_URL}/livreur`,
    ].filter(Boolean);
    return `https://wa.me/${digits}?text=${encodeURIComponent(lines.join("\n"))}`;
  };

  /**
   * Création de la commande — utilisée par le formulaire complet (produit
   * physique) ET par le bouton « Télécharger » d'un produit digital (un clic,
   * aucune donnée de livraison). Le mécanisme est ensuite identique : la
   * commande est enregistrée, le client règle directement (Mobile Money /
   * WhatsApp) puis télécharge son fichier dès la confirmation de la boutique.
   */
  const createPurchase = async (payload) => {
    setError("");
    setSubmitting(true);
    // Réservation de l'ouverture pendant l'activation utilisateur (anti pop-up blocker) ;
    // la vraie URL WhatsApp y est placée une fois la commande confirmée.
    const popup = window.open("", "_blank");
    try {
      const d = await api.purchaseCreate(payload);
      setPurchase(d.sale || null);
      const url = buildShopWaUrl(d.sale, {
        buyer_name: payload.buyer_name || user?.name || "",
        buyer_phone: payload.buyer_phone || user?.phone || "",
        buyer_city: payload.buyer_city || "",
        buyer_address: payload.buyer_address || "",
        quantity: payload.quantity || 1,
      });
      setWaUrl(url);
      setDone(true);
      if (url && popup && !popup.closed) {
        popup.location.href = url;
      } else if (popup && !popup.closed) {
        popup.close();
      }
    } catch (err) {
      if (popup && !popup.closed) popup.close();
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    await createPurchase({
      product_id: id,
      // Code vendeur facultatif : présent si le client vient d'un lien de
      // partage vendeur, absent pour un achat direct (vente sans vendeur).
      seller_code: (form.seller_code || "").trim() || undefined,
      buyer_name: form.buyer_name,
      buyer_city: form.buyer_city,
      buyer_address: form.buyer_address,
      buyer_phone: form.buyer_phone,
      quantity: Number(form.quantity) || 1,
      payment_method: paymentMethod,
    });
  };

  /**
   * Produit DIGITAL : « Télécharger » ouvre le tunnel de paiement en ligne
   * (iKeePay) — strictement le même flux que la fiche produit : aucun
   * formulaire de livraison, paiement dans le tunnel, puis TÉLÉCHARGEMENT
   * AUTOMATIQUE du fichier dès que le paiement est confirmé.
   * Le code vendeur du lien (/acheter/:id?code=XXX) est transmis pour la
   * commission éventuelle du vendeur.
   */
  const openDigitalTunnel = () => {
    setError("");
    setTunnelOpen(true);
  };

  if (notFound) {
    return (
      <main className="container narrow">
        <div className="card page-center">
          <p className="empty">{t("Produit non trouvé")}</p>
          <Link to="/" className="btn btn-primary">
            {t("Retour à l'accueil")}
          </Link>
        </div>
      </main>
    );
  }

  if (!product) {
    return (
      <main className="container narrow">
        <div className="card page-center">
          <div className="skeleton-block" style={{ height: 220 }}></div>
        </div>
      </main>
    );
  }

  const photo = (product.photos && product.photos[0]) || product.image;
  const symbol = countrySymbol(product.shop_country);
  const flash = product.flash_promo || null;
  const displayPrice = flash ? Number(flash.price) : Number(product.price);

  return (
    <main className="container narrow">
      <Seo
        title={`${t("Acheter")} — ${product.name} — Mboppi`}
        description={t("Confirmez votre commande avec le code du vendeur.")}
        noindex
      />
      <section className="dash-header">
        <div>
          <h1>
            <Logo className="logo-inline" /> {t("Acheter")}
          </h1>
          <p>
            {product?.is_digital
              ? t(
                  "Merci de faire confiance à Mboppi ! 🙏 Chaque création est publiée par un créateur vérifié : payez en toute sécurité, et votre fichier se débloque dès la confirmation du paiement. Notre équipe suit chaque vente pour vous protéger."
                )
              : t(
                  "Merci de faire confiance à Mboppi ! 🙏 Votre commande est transmise immédiatement à la boutique, au créateur et au vendeur, qui vous contactent pour la livraison. Vous recevez un code de confirmation : gardez-le précieusement, c'est votre preuve d'achat le jour de la remise. Notre équipe suit chaque vente du début à la fin."
                )}
          </p>
        </div>
      </section>

      <div className="card purchase-product">
        {photo && <img className="purchase-photo" src={photo} alt={product.name} loading="lazy" />}
        <div className="purchase-info">
          <h2>{product.name}</h2>
          {product.category && (
            <p className="product-cat">
              {categoryEmoji(product.category)} {t(product.category)}
            </p>
          )}
          {product.description && <p className="product-desc">{product.description}</p>}
          <div className="product-meta">
            {product.warranty && (
              <span className="meta-chip">
                🛡️ {t("Garantie : {warranty}", { warranty: product.warranty })}
              </span>
            )}
            {product.contact && <span className="meta-chip">📞 {product.contact}</span>}
          </div>
          <p className="price-line" style={{ marginTop: 10 }}>
            {flash && (
              <span className="old-price">
                {formatMoney(product.price)} {symbol}
              </span>
            )}
            <span className={`price ${flash ? "price-flash" : ""}`}>
              {formatMoney(displayPrice)} {symbol}
            </span>
            <PriceEquivalent
              amount={displayPrice}
              fromCode={product.currency || product.shop_country}
            />
          </p>
          <p className="product-shop" style={{ marginTop: 6 }}>
            {product.is_digital || product.shop_role === "creator"
              ? t("Créateur : {shop}", { shop: product.shop_name })
              : t("Boutique : {shop}", { shop: product.shop_name })}
            {product.shop_location ? (
              <span className="shop-loc"> · 📍 {product.shop_location}</span>
            ) : null}
          </p>
        </div>
      </div>

      {tunnelDone ? (
        <div className="card page-center">
          <h2>🎉 {t("Félicitations !")}</h2>
          <p className="hint">{t("Votre fichier a été téléchargé sur votre appareil.")}</p>
          {user ? (
            <Link className="btn btn-primary" to="/client">
              {t("Voir mes achats")}
            </Link>
          ) : (
            <Link className="btn btn-primary" to="/">
              {t("Continuer mes achats")}
            </Link>
          )}
        </div>
      ) : done ? (
        <div className="card page-center">
          <h2>
            {purchase?.is_digital
              ? `✅ ${t("Commande enregistrée — paiement à confirmer")}`
              : `✅ ${t("Commande confirmée !")}`}
          </h2>
          <p className="hint">
            {purchase?.is_digital
              ? t(
                  "Votre fichier se débloque ici même dès que le créateur a confirmé la réception de votre paiement. Réglez directement avec lui (Mobile Money ou en ligne), puis revenez cliquer sur « Télécharger mon fichier »."
                )
              : t(
                  "Votre article est en attente de vente. La boutique et le vendeur ont été notifiés et vous contacteront pour la livraison."
                )}
          </p>
          {waUrl && (
            <>
              <p className="hint" style={{ marginTop: 8 }}>
                {purchase?.is_digital
                  ? t("Réglez maintenant avec le créateur : la commande est préremplie.")
                  : t("La commande n'a pas été transmise sur WhatsApp ? Envoyez-la en un clic :")}
              </p>
              <a className="btn btn-primary" href={waUrl} target="_blank" rel="noopener noreferrer">
                📲
                {purchase?.is_digital
                  ? ` ${t("Payer et confirmer sur WhatsApp")}`
                  : ` ${t("Envoyer ma commande sur WhatsApp")}`}
              </a>
            </>
          )}
          {purchase && (purchase.confirm_code || purchase.buyer_code) && (
            <div className="buyer-code-box">
              <span className="buyer-code-label">{t("Votre code de confirmation")} :</span>
              <span className="buyer-code-value">
                {purchase.confirm_code || purchase.buyer_code}
              </span>
              <CopyCode code={purchase.confirm_code || purchase.buyer_code} />
            </div>
          )}
          {/* Produit DIGITAL : le fichier se télécharge directement sur
              l'appareil (URL signée du bucket privé). Pour un achat sans
              compte, le code de confirmation sert de preuve d'achat. */}
          {purchase && purchase.is_digital && (
            <>
              <p className="hint" style={{ marginTop: 8 }}>
                📁{" "}
                {t(
                  "Produit digital : le bouton ci-dessous devient actif dès que le créateur a confirmé votre paiement. Conservez votre code : il vous permet de retélécharger à tout moment."
                )}
              </p>
              <DigitalDownload
                sale={purchase}
                code={purchase.confirm_code || purchase.buyer_code}
                label={t("Télécharger mon fichier")}
              />
            </>
          )}
          {purchase && purchase.id && (
            <Link
              className="btn btn-primary"
              to={`/suivi/${purchase.id}?code=${encodeURIComponent(purchase.confirm_code || purchase.buyer_code || "")}`}
            >
              📦 {t("Suivre ma commande")}
            </Link>
          )}
          {user && (
            <Link className="btn btn-outline" style={{ marginTop: 8 }} to="/client">
              {t("Voir mes achats")}
            </Link>
          )}
          <Link className="btn btn-outline" style={{ marginTop: 8 }} to="/">
            {t("Continuer mes achats")}
          </Link>
        </div>
      ) : product.is_digital ? (
        // Produit DIGITAL : AUCUN formulaire ni donnée de livraison — le bouton
        // « Télécharger » ouvre le tunnel iKeePay, et le fichier se télécharge
        // automatiquement dès la confirmation du paiement.
        <div className="card form-card digital-cta-card">
          <h2>⬇️ {t("Télécharger")}</h2>
          <p className="hint">
            {t(
              "Pas de livraison : votre fichier se télécharge sur votre appareil dès que le créateur a confirmé la réception de votre paiement."
            )}
          </p>
          <ul className="pd-assurance" style={{ margin: "10px 0 14px" }}>
            <li>📁 {t("Fichier téléchargeable dès confirmation du paiement")}</li>
            <li>✅ {t("Satisfaction garantie")}</li>
            <li>🔒 {t("Aucun compte requis — paiement direct au créateur")}</li>
          </ul>
          <button type="button" className="btn btn-primary btn-block" onClick={openDigitalTunnel}>
            {`⬇️ ${t("Télécharger")} — ${formatMoney(displayPrice)} ${symbol}`}
          </button>
          {error && <p className="error">{error}</p>}
        </div>
      ) : (
        <div className="card form-card">
          {product.is_digital ? (
            <div
              style={{
                background: "#e8f5e9",
                border: "2px solid #2e7d32",
                borderRadius: 10,
                padding: "12px 14px",
                marginBottom: 14,
                color: "#1b5e20",
              }}
            >
              <strong style={{ display: "block", fontSize: 15, color: "#1b5e20" }}>
                📁 {t("Produit digital — téléchargement après paiement")}
              </strong>
              <p style={{ margin: "6px 0 2px", fontSize: 13, lineHeight: 1.5, color: "#1b5e20" }}>
                {t(
                  "Indiquez juste votre nom et votre numéro : le créateur vous confirme le paiement (Mobile Money direct ou en ligne), puis votre fichier se débloque ici même. Aucune livraison, aucun frais de plateforme."
                )}
              </p>
            </div>
          ) : (
            <div
              style={{
                background: "#fff8e1",
                border: "2px solid #d97706",
                borderRadius: 10,
                padding: "12px 14px",
                marginBottom: 14,
                color: "#78350f",
              }}
            >
              <strong style={{ display: "block", fontSize: 15, color: "#7c2d12" }}>
                🛡️ {t("CHERS CLIENTS, MERCI DE FAIRE CONFIANCE À MBOPPI.")}
              </strong>
              <p style={{ margin: "6px 0 2px", fontSize: 13, lineHeight: 1.5, color: "#78350f" }}>
                {t(
                  "Pour éviter toute fraude lors de la livraison de votre colis, exigez auprès du livreur le formulaire de paiement où vous saisirez votre code de confirmation et signerez, avant de valider votre achat."
                )}
              </p>
              <small
                style={{ display: "block", textAlign: "right", fontWeight: 600, color: "#7c2d12" }}
              >
                — {t("L'Administration Mboppi")}
              </small>
            </div>
          )}

          <h2>{product.is_digital ? t("Vos coordonnées") : t("Commander")}</h2>
          <p className="hint">
            {product.is_digital
              ? t(
                  "Deux champs suffisent : le créateur vous contacte pour le paiement, puis vous téléchargez votre fichier. Aucune livraison, aucune adresse à saisir."
                )
              : t(
                  "Remplissez vos informations pour confirmer votre commande. Aucun compte requis. Le code du vendeur est utile seulement si un vendeur vous a proposé ce produit."
                )}
          </p>
          <form onSubmit={submit}>
            <label>{t("Nom et prénom *")}</label>
            <input
              className="input"
              required
              value={form.buyer_name}
              onChange={(e) => setForm({ ...form, buyer_name: e.target.value })}
            />
            <label>{t("Numéro de téléphone *")}</label>
            <input
              className="input"
              type="tel"
              required
              value={form.buyer_phone}
              onChange={(e) => setForm({ ...form, buyer_phone: e.target.value })}
            />
            {!product.is_digital && (
              <>
                <label>{t("Ville *")}</label>
                <input
                  className="input"
                  required
                  value={form.buyer_city}
                  onChange={(e) => setForm({ ...form, buyer_city: e.target.value })}
                />
                <label>{t("Adresse / Quartier *")}</label>
                <input
                  className="input"
                  required
                  value={form.buyer_address}
                  onChange={(e) => setForm({ ...form, buyer_address: e.target.value })}
                />
                <label>{t("Quantité *")}</label>
                <input
                  className="input"
                  type="number"
                  min={1}
                  required
                  value={form.quantity}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      quantity: Math.max(1, Number(e.target.value) || 1),
                    })
                  }
                />
              </>
            )}
            <label>{t("Code du vendeur (facultatif)")}</label>
            <input
              className="input code-input"
              maxLength="6"
              readOnly={!!linkCode}
              value={form.seller_code}
              onChange={(e) => setForm({ ...form, seller_code: e.target.value.toUpperCase() })}
              placeholder="ABC123"
            />

            {!product.is_digital && (
              <>
                <div className="payment-options">
                  <button
                    type="button"
                    className={`payment-option ${paymentMethod === "espece" ? "active" : ""}`}
                    onClick={() => setPaymentMethod("espece")}
                  >
                    💵 {t("En espèces (à la livraison)")}
                  </button>
                  <button
                    type="button"
                    className={`payment-option ${paymentMethod === "mobile" ? "active" : ""}`}
                    onClick={() => setPaymentMethod("mobile")}
                  >
                    📱 {t("Virement Mobile Money direct")}
                  </button>
                </div>

                {paymentMethod === "mobile" && product && (
                  <p className="hint" style={{ marginTop: 8 }}>
                    {t("Paiement à la Livraison. Aucun frais de plateforme.")}
                  </p>
                )}
              </>
            )}
            {product.is_digital && (
              <p className="hint" style={{ marginTop: 8 }}>
                💳 {t("Paiement direct au créateur (Mobile Money) — aucun frais de plateforme.")}
              </p>
            )}
            {error && <p className="error">{error}</p>}
            <button className="btn btn-primary btn-block" disabled={submitting}>
              {submitting
                ? "…"
                : product.is_digital
                  ? `⬇️ ${t("Payer et télécharger")}`
                  : `✅ ${t("Confirmer la Commande")}`}
            </button>
          </form>
        </div>
      )}
      {/* Moyens de paiement acceptés (iKeepay) : carte bancaire, USDT et
          Mobile Money — affichés sous le formulaire d'achat. */}
      {product && <PaymentMethodsStrip />}

      {/* Tunnel d'achat digital (iKeePay) : paiement en ligne, puis
          TÉLÉCHARGEMENT AUTOMATIQUE du fichier — strictement le même flux que
          la fiche produit. Le code vendeur du lien est transmis pour la
          commission éventuelle du vendeur. */}
      {product && product.is_digital && tunnelOpen && (
        <DigitalBuyTunnel
          items={[{ product_id: product.id, name: product.name }]}
          sellerCode={(form.seller_code || linkCode || "").trim().toUpperCase() || undefined}
          buyer={{
            name: user?.name || form.buyer_name,
            phone: user?.phone || form.buyer_phone,
          }}
          autoCloseMs={4000}
          onDone={() => setTunnelDone(true)}
          onClose={() => setTunnelOpen(false)}
        />
      )}
    </main>
  );
}
