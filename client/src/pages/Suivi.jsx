import React, { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import Seo from "../components/Seo.jsx";
import { api } from "../api.js";
import { useLang } from "../i18n.jsx";
import { useRefreshOnFocus } from "../useRefreshOnFocus.js";
import { waLink, BASE_URL, countrySymbol } from "../config.js";
import { nativeShareWithImage } from "../share.js";
import { formatMoney } from "../components/ProductCard.jsx";
import CopyCode from "../components/CopyCode.jsx";
import TrackMap from "../components/TrackMap.jsx";

export default function Suivi() {
  const { id: idParam } = useParams();
  const [params] = useSearchParams();
  const urlCode = (params.get("code") || "").trim().toUpperCase();
  const { t, locale } = useLang();
  // Sans id dans l'URL (route /suivi), le numéro de commande est saisi dans le formulaire.
  const [orderId, setOrderId] = useState("");
  const id = idParam || orderId.trim();
  const [code, setCode] = useState(urlCode);
  const [sale, setSale] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  // Numéro réellement utilisé pour les actions (annulation, GPS, rafraîchissement) :
  // celui de l'URL / du formulaire, sinon l'id renvoyé par la recherche par code seul.
  const activeId = id || (sale ? sale.id : null);

  useEffect(() => {
    if (!idParam || !urlCode) return;
    setCode(urlCode);
    setError("");
    setLoading(true);
    api
      .trackSale(idParam, urlCode)
      .then((d) => {
        setSale(d.sale || null);
        if (!d.sale) setError(t("Aucune commande trouvée avec ce code."));
      })
      .catch((err) => {
        setSale(null);
        setError(err.message);
      })
      .finally(() => setLoading(false));
  }, [idParam, urlCode, t]);

  const refreshSale = () => {
    if (!sale || !activeId || !code.trim()) return;
    api
      .trackSale(activeId, code.trim())
      .then((d) => d.sale && setSale(d.sale))
      .catch(() => {});
  };

  useRefreshOnFocus(refreshSale);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const d = await api.trackSale(id, code.trim());
      setSale(d.sale);
    } catch (err) {
      setSale(null);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const symbol = sale ? countrySymbol(sale.shop_country) : "";

  const step = sale
    ? sale.status === "cancelled"
      ? -1
      : sale.status === "delivered"
        ? 2
        : sale.shop_confirmed_at || sale.status === "confirmed" || sale.status === "bought"
          ? 1
          : 0
    : -2;
  const cancellable = sale && sale.status !== "delivered" && sale.status !== "cancelled";

  const cancelOrder = async () => {
    if (!window.confirm(t("Annuler cette commande ? Cette action est définitive."))) return;
    setError("");
    setLoading(true);
    try {
      await api.cancelSale(activeId, code.trim());
      setSale((prev) => (prev ? { ...prev, status: "cancelled" } : prev));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };
  const labels = sale
    ? [
        { key: "Commande enregistrée", date: sale.created_at },
        { key: "Commande confirmée", date: sale.shop_confirmed_at || null },
        { key: "Commande livrée", date: sale.delivered_at },
      ]
    : [];

  // --- Suivi GPS temps réel (pendant pending/confirmed, puis figé) ---
  // La carte reste visible APRÈS la livraison : les positions sont figées
  // (dernière position + trace) et servent de preuve du trajet.
  const trackCode = sale ? sale.confirm_code || sale.buyer_code || code.trim() : "";
  const [track, setTrack] = useState(null);
  const [gpsMsg, setGpsMsg] = useState("");

  const loadTrack = () => {
    if (!activeId || !trackCode) return;
    api
      .saleTrack(activeId, trackCode)
      .then((d) => {
        setTrack(d);
        return d;
      })
      .catch(() => {});
  };

  useEffect(() => {
    if (!activeId || !trackCode) {
      setTrack(null);
      return undefined;
    }
    let iv = null;
    const tick = () => {
      api
        .saleTrack(activeId, trackCode)
        .then((d) => {
          setTrack(d);
          // La livraison est terminée : un dernier rafraîchissement suffit,
          // on arrête le polling (les positions restent figées sur la carte).
          if (d && d.tracking_active === false && iv) {
            clearInterval(iv);
            iv = null;
          }
        })
        .catch(() => {});
    };
    tick();
    iv = setInterval(tick, 12000);
    return () => {
      if (iv) clearInterval(iv);
    };
  }, [activeId, trackCode, sale?.status]);

  const shareMyPosition = () => {
    if (!navigator.geolocation) {
      setGpsMsg(t("La géolocalisation n'est pas disponible sur cet appareil."));
      return;
    }
    setGpsMsg(t("Localisation en cours…"));
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        api
          .buyerPosition(activeId, {
            code: trackCode,
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
          })
          .then(() => setGpsMsg(t("Position partagée ✓ — le livreur peut vous localiser.")))
          .catch((e) => setGpsMsg(e.message));
      },
      () => setGpsMsg(t("Position refusée ou indisponible.")),
      { enableHighAccuracy: true, timeout: 12000 }
    );
  };
  // --- fin suivi GPS ---

  return (
    <main className="container narrow">
      <Seo
        title={t("Suivi de commande") + " — Mboppi"}
        description={t("Suivez l'état de votre commande Mboppi en temps réel.")}
        noindex
      />
      <Link to="/" className="btn btn-outline" style={{ marginBottom: 16 }}>
        ← {t("Retour à l'accueil")}
      </Link>
      <div className="card suivi-card">
        <h2>📦 {t("Suivi de commande")}</h2>
        <p className="hint">
          {idParam
            ? t("Entrez votre code de confirmation (reçu avec votre commande) pour suivre son état.")
            : t("Entrez votre code de confirmation (reçu avec votre commande) pour suivre son état. Le numéro de commande est optionnel.")}
        </p>
        <form onSubmit={submit} className="suivi-form">
          {!idParam && (
            <input
              className="input"
              placeholder={t("Numéro de commande (optionnel)")}
              value={orderId}
              onChange={(e) => setOrderId(e.target.value.replace(/[^0-9]/g, ""))}
              inputMode="numeric"
              autoComplete="off"
            />
          )}
          <input
            className="input"
            placeholder={t("Code de confirmation")}
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            autoCapitalize="characters"
          />
          <button className="btn btn-primary" disabled={loading || !code.trim()}>
            {loading ? t("Chargement…") : t("Suivre ma commande")}
          </button>
        </form>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}

        {sale && (
          <div className="suivi-result">
            <div className="suivi-head">
              <strong>
                {sale.product_name} ×{sale.quantity}
              </strong>
              <span>
                {formatMoney(sale.total_price)} {symbol}
              </span>
            </div>
            <p className="hint">
              {t("Boutique : {shop}", { shop: sale.shop_name })}
              {sale.shop_location ? ` · ${sale.shop_location}` : ""}
            </p>
            <p className="hint">{t("Vendeur : {seller}", { seller: sale.seller_name || "—" })}</p>

            {sale.confirm_code && (
              <div className="buyer-code-box" style={{ margin: "10px 0" }}>
                <span className="buyer-code-label">{t("Votre code de confirmation")} :</span>
                <span className="buyer-code-value">{sale.confirm_code}</span>
                <CopyCode code={sale.confirm_code} />
                {step === 0 && (
                  <p className="hint" style={{ marginTop: 6 }}>
                    {t(
                      "Communiquez ce code au livreur lors de la remise pour valider la livraison."
                    )}
                  </p>
                )}
              </div>
            )}

            {step === -1 ? (
              <p className="error">{t("Cette commande a été annulée.")}</p>
            ) : (
              <ol className="suivi-timeline">
                {labels.map((l, i) => {
                  const reached = i <= step;
                  return (
                    <li key={l.key} className={`suivi-step ${reached ? "done" : ""}`}>
                      <span className="suivi-dot">{reached ? "✓" : i + 1}</span>
                      <div>
                        <strong>{t(l.key)}</strong>
                        {i === 0 && l.date && (
                          <span className="hint">
                            {new Date(l.date).toLocaleString(locale, {
                              dateStyle: "medium",
                              timeStyle: "short",
                            })}
                          </span>
                        )}
                        {i === 1 && sale.shop_confirmed_at && (
                          <span className="hint">
                            {new Date(sale.shop_confirmed_at).toLocaleString(locale, {
                              dateStyle: "medium",
                              timeStyle: "short",
                            })}
                          </span>
                        )}
                        {i === 2 && sale.delivered_at && (
                          <span className="hint">
                            {new Date(sale.delivered_at).toLocaleString(locale, {
                              dateStyle: "medium",
                              timeStyle: "short",
                            })}
                          </span>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}

            {/* Suivi GPS : carte livreur/client/boutique (figée après livraison) */}
            {track && (track.tracking_active || track.livreur || track.buyer || track.shop) && (
              <div style={{ marginTop: 14 }}>
                <strong>🛰️ {t("Suivi en temps réel")}</strong>
                {track.tracking_active ? (
                  <p className="hint" style={{ margin: "4px 0 8px" }}>
                    {t("Position du livreur actualisée toutes les 12 secondes pendant la livraison.")}
                  </p>
                ) : (
                  <p className="hint" style={{ margin: "4px 0 8px" }}>
                    {t("Livraison terminée — les positions restent visibles (figées).")}
                  </p>
                )}
                <TrackMap
                  livreur={track?.livreur || null}
                  buyer={track?.buyer || null}
                  shop={track?.shop || null}
                  height={260}
                />
                {track.tracking_active && (
                  <div style={{ marginTop: 8 }}>
                    <button type="button" className="btn btn-outline btn-sm" onClick={shareMyPosition}>
                      📍 {t("Partager ma position au livreur")}
                    </button>
                    {gpsMsg && <p className="hint" style={{ marginTop: 6 }}>{gpsMsg}</p>}
                    {!track.livreur && (
                      <p className="hint" style={{ marginTop: 6 }}>
                        {t("Le livreur n'a pas encore activé le partage de sa position.")}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

            <div className="suivi-actions">
              {(sale.shop_contact || sale.shop_phone || sale.seller_phone) && (
                <a
                  className="btn btn-primary"
                  href={waLink(
                    sale.shop_contact || sale.shop_phone || sale.seller_phone,
                    t(
                      "Bonjour {shop}, je suis {buyer}, je vous contacte à propos de ma commande « {product} » sur Mboppi.",
                      {
                        shop: sale.shop_name || sale.seller_name || t("la boutique"),
                        buyer: sale.buyer_name || t("un client"),
                        product: sale.product_name,
                      }
                    )
                  )}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  💬 {t("Contacter la Boutique")}
                </a>
              )}
              <button
                type="button"
                className="btn btn-outline"
                onClick={async () => {
                  const url = `${BASE_URL}/suivi/${sale.id}?code=${sale.confirm_code || sale.buyer_code || ""}`;
                  const text = t("Suivez ma commande « {product} » sur Mboppi : {url}", {
                    product: sale.product_name,
                    url,
                  });
                  const sharedNative = await nativeShareWithImage({
                    title: t("Suivi de commande"),
                    text,
                    url,
                    useLogo: true, // lien de suivi -> logo Mboppi
                  });
                  try {
                    if (!sharedNative) {
                      await navigator.clipboard.writeText(url);
                    }
                  } catch {
                    /* presse-papiers indisponible */
                  }
                }}
              >
                🔗 {t("Partager le suivi")}
              </button>
              {cancellable && (
                <button
                  type="button"
                  className="btn btn-danger"
                  disabled={loading}
                  onClick={cancelOrder}
                >
                  🗙 {t("Annuler la commande")}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
