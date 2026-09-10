import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Seo from "../components/Seo.jsx";
import { api } from "../api.js";
import { formatMoney } from "../components/ProductCard.jsx";
import { countrySymbol, countryPhone, BASE_URL } from "../config.js";
import { useAuth } from "../App.jsx";
import { useCart } from "../store.jsx";
import { useLang } from "../i18n.jsx";
import CopyCode from "../components/CopyCode.jsx";

/** Normalise un numéro de boutique au format international (wa.me). */
function waDigits(raw, country) {
  let digits = String(raw || "").replace(/[^0-9]/g, "");
  if (!digits) return null;
  if (digits.startsWith("00")) digits = digits.slice(2);
  const dial = countryPhone(country).replace("+", "");
  if (!digits.startsWith(dial)) digits = dial + digits.replace(/^0+/, "");
  return digits;
}

export default function Cart() {
  const { user } = useAuth();
  const { t } = useLang();
  const navigate = useNavigate();
  const { cart, setQty, removeFromCart, clearCart, cartCount, cartTotal } = useCart();
  const [buyerName, setBuyerName] = useState(user ? user.name : "");
  // La session est restaurée de façon asynchrone : si l'utilisateur arrive
  // après coup (rafraîchissement de la page), on pré-remplit le nom.
  useEffect(() => {
    if (user && user.name && !buyerName.trim()) setBuyerName(user.name);
  }, [user, buyerName]);
  const [phone, setPhone] = useState("");
  const [city, setCity] = useState("");
  const [address, setAddress] = useState("");
  const [error, setError] = useState("");
  const [placing, setPlacing] = useState(false);
  const [sales, setSales] = useState(null);
  // Groupes WhatsApp (une entrée par boutique concernée par la commande).
  const [waGroups, setWaGroups] = useState([]);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (!user) {
      navigate("/login", { state: { from: "/panier" } });
      return;
    }
    if (!buyerName.trim() || !phone.trim() || !city.trim() || !address.trim()) {
      setError(t("Veuillez remplir tous les champs."));
      return;
    }
    setPlacing(true);
    // Anti pop-up blocker : réservation de l'ouverture pendant le geste
    // utilisateur ; l'URL WhatsApp de la boutique y est injectée une fois la
    // commande confirmée (une seule boutique → ouverture automatique).
    const popup = window.open("", "_blank");
    try {
      const data = await api.createOrder({
        items: cart.map((i) => ({ product_id: i.id, quantity: i.qty })),
        buyer_name: buyerName.trim(),
        buyer_phone: phone.trim(),
        buyer_city: city.trim(),
        buyer_address: address.trim(),
        // Le paiement se règle à la livraison auprès du livreur :
        // le livreur choisit le mode (espèces / mobile) sur son formulaire.
        payment_method: "espece",
      });
      const created = Array.isArray(data && data.sales) ? data.sales : [];
      if (!created.length) {
        throw new Error(t("Aucune commande n'a pu être enregistrée. Veuillez réessayer."));
      }
      setSales(created);
      // Groupement des commandes par boutique (le panier peut toucher
      // plusieurs boutiques) → un message WhatsApp prérempli par boutique.
      const groups = new Map();
      for (const s of created) {
        const key = s.shop_phone || s.shop_contact || s.shop_name || "shop";
        if (!groups.has(key)) {
          groups.set(key, {
            shop_name: s.shop_name || "Boutique",
            phone: s.shop_phone || s.shop_contact || "",
            country: s.shop_country,
            items: [],
          });
        }
        groups.get(key).items.push(s);
      }
      const list = [...groups.values()].map((g) => {
        const digits = waDigits(g.phone, g.country);
        if (!digits) return { ...g, waUrl: null };
        const lines = [
          "🛒 *Nouvelle commande Mboppi*",
          "",
          "📦 Articles :",
          ...g.items.map(
            (s) => [
              `• ${s.product_name} ×${Number(s.quantity)} — ${formatMoney(
                s.total_price
              )} F${s.flash_promo ? " (prix promo)" : ""}${s.confirm_code ? ` (code : ${s.confirm_code})` : ""}`,
              s.id && s.confirm_code
                ? `📦 Suivi : ${BASE_URL}/suivi/${s.id}?code=${encodeURIComponent(s.confirm_code)}`
                : null,
            ].filter(Boolean).join("\n")
          ),
          "",
          "— Coordonnées du client —",
          `👤 Nom : ${buyerName.trim()}`,
          `📞 Téléphone : ${phone.trim()}`,
          `🏙️ Ville : ${city.trim()}`,
          `📍 Adresse : ${address.trim()}`,
          "",
          `👉 Gérez ces commandes dans votre espace livreur : ${BASE_URL}/livreur`,
        ];
        return {
          ...g,
          waUrl: `https://wa.me/${digits}?text=${encodeURIComponent(lines.join("\n"))}`,
        };
      });
      setWaGroups(list);
      clearCart();
      // Une seule boutique concernée → ouverture automatique de son WhatsApp.
      const first = list.find((g) => g.waUrl);
      if (first && popup && !popup.closed) {
        popup.location.href = first.waUrl;
      } else if (popup && !popup.closed) {
        popup.close();
      }
    } catch (err) {
      if (popup && !popup.closed) popup.close();
      setError(err.message);
    } finally {
      setPlacing(false);
    }
  };

  if (sales && sales.length > 0) {
    return (
      <main className="container narrow">
        <Seo title={t("Commande enregistrée") + " — Mboppi"} noindex />
        <div className="card form-card success-card">
          <div className="auth-brand">✅</div>
          <h2>{t("Commande enregistrée !")}</h2>
          <p className="hint">
            {t("Merci {name} ! Vos commandes sont enregistrées et la boutique a été notifiée.", {
              name: sales[0].buyer_name,
            })}
          </p>
          <p className="hint">💰 {t("Paiement à la livraison, auprès du livreur.")}</p>
          <p className="hint">
            {t(
              "Chaque article a son code de confirmation : communiquez-le à la boutique ou au livreur, ou suivez votre commande avec celui-ci."
            )}
          </p>
          {/* WhatsApp de la boutique : message prérempli par boutique concernée
              (la première s'est déjà ouverte automatiquement si possible). */}
          {waGroups.length > 0 && (
            <div style={{ width: "100%", marginTop: 10 }}>
              <p className="hint" style={{ marginBottom: 8 }}>
                {t("Envoyez aussi la commande à la boutique sur WhatsApp :")}
              </p>
              {waGroups.map(
                (g, i) =>
                  g.waUrl && (
                    <a
                      key={i}
                      className="btn btn-primary"
                      style={{ marginBottom: 8, display: "inline-flex", marginRight: 8 }}
                      href={g.waUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      💬 {t("WhatsApp : {shop}", { shop: g.shop_name })}
                    </a>
                  )
              )}
            </div>
          )}
          <div className="order-list" style={{ width: "100%" }}>
            {sales.map((s) => (
              <div className="card order-card" key={s.id}>
                <div className="order-head">
                  <strong>
                    {s.product_name} ×{s.quantity}
                  </strong>
                  <span className={`badge badge-pending`}>{t("En attente")}</span>
                </div>
                <div className="order-total" style={{ flexWrap: "wrap", gap: 8 }}>
                  <span className="label">{t("Total")}</span>
                  <strong>
                    {formatMoney(s.total_price)} {countrySymbol(s.shop_country)}
                  </strong>
                </div>
                {s.confirm_code && (
                  <div className="buyer-code-box" style={{ margin: "8px 0" }}>
                    <span className="buyer-code-label">{t("Code de confirmation")} :</span>
                    <span className="buyer-code-value">{s.confirm_code}</span>
                    <CopyCode code={s.confirm_code} />
                  </div>
                )}
                {s.confirm_code && (
                  <div className="buyer-code-box" style={{ margin: "8px 0" }}>
                    <span className="buyer-code-label">{t("Lien de suivi")} :</span>
                    <span
                      className="buyer-code-value"
                      style={{ fontSize: 12, wordBreak: "break-all" }}
                    >{`${BASE_URL}/suivi/${s.id}?code=${s.confirm_code}`}</span>
                    <CopyCode
                      code={`${BASE_URL}/suivi/${s.id}?code=${s.confirm_code}`}
                      label={t("Copier le lien")}
                    />
                  </div>
                )}
                <div className="row2">
                  {s.confirm_code && (
                    <Link
                      className="btn btn-outline btn-small"
                      to={`/suivi/${s.id}?code=${encodeURIComponent(s.confirm_code)}`}
                    >
                      📦 {t("Suivre ma commande")}
                    </Link>
                  )}
                  {s.shop_contact && (
                    <a className="btn btn-outline btn-small" href={`tel:${s.shop_contact}`}>
                      📞 {t("Contacter la boutique")}
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
          <Link to={user ? "/client" : "/"} className="btn btn-outline btn-block">
            {t("Voir mes commandes")}
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="container narrow">
      <Seo title={t("Mon panier") + " — Mboppi"} noindex />
      <h1 className="section-title">{t("🛒 Mon panier")}</h1>

      {cart.length === 0 ? (
        <div className="card page-center">
          <p className="empty">{t("Votre panier est vide.")}</p>
          <Link to="/" className="btn btn-primary">
            {t("Parcourir les produits")}
          </Link>
        </div>
      ) : (
        <>
          <div className="cart-list">
            {cart.map((i) => {
              const symbol = countrySymbol(i.country);
              return (
                <div className="cart-item" key={i.id}>
                  <div className="cart-item-photo">
                    {i.photo ? <img src={i.photo} alt={i.name} loading="lazy" /> : <span>📦</span>}
                  </div>
                  <div className="cart-item-info">
                    <Link to={`/produit/${i.id}`} className="cart-item-name">
                      {i.name}
                    </Link>
                    <span className="cart-item-price">
                      {formatMoney(i.price)} {symbol}
                      {i.old_price != null && Number(i.old_price) > Number(i.price) && (
                        <span className="old-price" style={{ marginLeft: 6 }}>
                          {formatMoney(i.old_price)} {symbol}
                        </span>
                      )}
                    </span>
                    <div className="cart-item-actions">
                      <div className="qty-stepper">
                        <button
                          type="button"
                          onClick={() => setQty(i.id, i.qty - 1)}
                          aria-label="-"
                        >
                          −
                        </button>
                        <span>{i.qty}</span>
                        <button
                          type="button"
                          onClick={() => setQty(i.id, i.qty + 1)}
                          aria-label="+"
                        >
                          +
                        </button>
                      </div>
                      <button
                        type="button"
                        className="btn btn-outline btn-sm"
                        onClick={() => removeFromCart(i.id)}
                      >
                        🗑️ {t("Retirer")}
                      </button>
                    </div>
                  </div>
                  <div className="cart-item-total">
                    {formatMoney(i.price * i.qty)} {symbol}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="card cart-summary">
            <div className="info-row">
              <span className="label">{t("Articles ({n})", { n: cartCount })}</span>
              <strong>
                {formatMoney(cartTotal)} {countrySymbol(cart[0] ? cart[0].country : null)}
              </strong>
            </div>
            <p className="hint">{t("Les frais de livraison sont confirmés avec la boutique.")}</p>

            <div className="wallet-card">
              <p className="hint" style={{ marginTop: 0 }}>
                💵{" "}
                {t(
                  "Paiement à la livraison : réglez la commande au livreur en espèces ou par Mobile Money, selon ce qui est convenu avec la boutique."
                )}
              </p>
            </div>

            <form onSubmit={submit}>
              {/* Bandeau anti-fraude : rappel d'exiger le formulaire du livreur. */}
              <div
                style={{
                  background: "#fff3cd",
                  border: "2px solid #f0b429",
                  borderRadius: 10,
                  padding: "12px 14px",
                  marginBottom: 14,
                }}
              >
                <strong style={{ display: "block", fontSize: 15 }}>
                  🛡️ {t("CHERS CLIENTS, MERCI DE FAIRE CONFIANCE À MBOPPI.")}
                </strong>
                <p style={{ margin: "6px 0 2px", fontSize: 13 }}>
                  {t(
                    "Pour éviter toute fraude lors de la livraison de votre colis, exigez auprès du livreur le formulaire de paiement où vous saisirez votre code de confirmation et signerez, avant de valider votre achat."
                  )}
                </p>
                <small style={{ display: "block", textAlign: "right", fontWeight: 600 }}>
                  — {t("L'Administration Mboppi")}
                </small>
              </div>
              <label>{t("Votre nom *")}</label>
              <input
                className="input"
                required
                value={buyerName}
                onChange={(e) => setBuyerName(e.target.value)}
              />
              <label>{t("Votre téléphone *")}</label>
              <input
                className="input"
                type="tel"
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+237 6XX XX XX XX"
              />
              <label>{t("Votre ville *")}</label>
              <input
                className="input"
                required
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder={t("Ville")}
              />
              <label>{t("Adresse de livraison *")}</label>
              <input
                className="input"
                required
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder={t("Quartier, ville…")}
              />
              {error && <p className="error">{error}</p>}
              <button className="btn btn-checkout btn-block" disabled={placing}>
                {placing ? t("Commande en cours…") : `✅ ${t("Passer la commande")}`}
              </button>
            </form>
          </div>
        </>
      )}
    </main>
  );
}
