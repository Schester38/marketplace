import React, { useEffect, useRef, useState } from "react";
import { api } from "../api.js";
import { rememberGuestSale } from "../guestSales.js";
import { useLang } from "../i18n.jsx";
import IkeepayCheckout from "./IkeepayCheckout.jsx";

/**
 * Tunnel d'achat DIGITAL (iKeePay) — partagé par toutes les portes d'entrée :
 *   — fiche produit (/produit/:id) ;
 *   — lien d'achat vendeur (/acheter/:id?code=XXX) ;
 *   — panier (/panier — un fichier par produit digital du panier).
 *
 * Flux (identique à l'ancien flux « fiche produit ») :
 *   1. POST /api/payments/digital-payin → vente + URL de checkout iKeePay ;
 *   2. tunnel inline (iframe + postMessage) ;
 *   3. sondage /api/digital/:saleId/wait-online (4 s) — le serveur confirme
 *      dès le webhook iKeePay et répare tout webhook manqué (réconciliation
 *      par les logs, même mécanisme que l'adhésion) ;
 *   4. téléchargement AUTOMATIQUE du fichier (URL signée du bucket privé) ;
 *   5. félicitations.
 *
 * Plusieurs produits (panier) : les tunnels s'enchaînent UN PAR UN — chaque
 * vente est confirmée avant l'ouverture du checkout suivant, puis tous les
 * fichiers sont téléchargés automatiquement (boutons de secours affichés).
 *
 * Props :
 *   items     [{ product_id, name }] — un fichier par produit digital ;
 *   sellerCode  code vendeur facultatif (commission du vendeur) ;
 *   buyer     { name, phone } facultatif (prérempli depuis le compte) ;
 *   onClose   fermeture de la modale (paiement abandonné ou terminé) ;
 *   onDone    TOUTES les ventes sont confirmées (et fichiers téléchargés) —
 *             appelé AVANT la fermeture : le parent vide son panier ici ;
 *   autoCloseMs  > 0 → fermeture automatique après les félicitations.
 */
export default function DigitalBuyTunnel({
  items,
  sellerCode,
  buyer,
  onClose,
  onDone,
  autoCloseMs = 0,
}) {
  const { t } = useLang();
  const total = Array.isArray(items) ? items.length : 0;
  const [idx, setIdx] = useState(0); // fichier en cours de paiement
  const [stage, setStage] = useState("creating");
  const [cur, setCur] = useState(null); // { saleId, code, checkoutUrl }
  const [confirmed, setConfirmed] = useState([]); // [{ saleId, code, name }]
  const [err, setErr] = useState("");
  const [dlBusy, setDlBusy] = useState({}); // venteId → true pendant le clic manuel
  const [videoSrc, setVideoSrc] = useState(null); // iframe vidéo protégée déverrouillée
  const videoSaleRef = useRef(null);
  const pollRef = useRef(null);
  const mountedRef = useRef(true);
  const confirmedRef = useRef([]);
  const autoDlRef = useRef(false);

  // Dernières props sans re-déclencher les effets (items/buyer sont recréés
  // à chaque rendu du parent).
  const propsRef = useRef({ items, sellerCode, buyer, onDone, onClose, autoCloseMs });
  propsRef.current = { items, sellerCode, buyer, onDone, onClose, autoCloseMs };

  const stopPoll = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  useEffect(
    () => () => {
      mountedRef.current = false;
      stopPoll();
    },
    []
  );

  // 1. Création de la vente + ouverture du tunnel pour le fichier courant.
  useEffect(() => {
    const run = async () => {
      const { items: its, sellerCode: sc, buyer: b } = propsRef.current;
      const it = (its || [])[idx];
      if (!it) return;
      setErr("");
      setStage("creating");
      try {
        const d = await api.digitalPayin({
          product_id: it.product_id,
          seller_code: sc || undefined,
          buyer_name: b && b.name ? b.name : undefined,
          buyer_phone: b && b.phone ? b.phone : undefined,
          buyer_email: b && b.email ? b.email : undefined,
        });
        if (!mountedRef.current) return;
        // Mémorisation locale (achat SANS compte) : l'acheteur retrouvera son
        // contenu sur /suivi même après fermeture de l'onglet — la preuve
        // reste le code de confirmation (aucune donnée envoyée au serveur).
        rememberGuestSale({
          saleId: d.sale_id,
          code: d.confirm_code,
          name: it.name || "",
          kind: it.digital_kind || "file",
        });
        setCur({
          saleId: d.sale_id,
          code: d.confirm_code,
          checkoutUrl: d.checkout_url,
          digitalKind: it.digital_kind || "file",
        });
        setStage("checkout");
      } catch (e) {
        if (!mountedRef.current) return;
        setErr(e.message);
        setStage("error");
      }
    };
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx]);

  // 2. postMessage « ikeepay-success » → sondage serveur (webhook + réparation).
  const waitConfirmation = () => {
    const sale = cur;
    if (!sale) return;
    setStage("waiting");
    stopPoll();
    const check = async () => {
      try {
        const d = await api.digitalWaitOnline(sale.saleId, sale.code);
        if (d && d.confirmed && mountedRef.current) {
          stopPoll();
          const name = (propsRef.current.items || [])[idx]?.name || "";
          const kind = (propsRef.current.items || [])[idx]?.digital_kind || "file";
          const all = [...confirmedRef.current, { ...sale, name, digitalKind: kind }];
          confirmedRef.current = all;
          setConfirmed(all);
          if (idx + 1 < total) {
            // Fichier suivant : nouveau tunnel (l'effet [idx] s'en charge).
            setIdx(idx + 1);
          } else {
            setStage("ready");
          }
        }
      } catch {
        /* réseau/timeout : on réessaie au prochain tick */
      }
    };
    check();
    pollRef.current = setInterval(check, 4000);
  };

  const downloadOne = async (sale) => {
    // Vidéo protégée : PAS de téléchargement — l'iframe est affichée dans la
    // modale (l'URL de la vidéo n'est jamais exposée comme lien de fichier).
    if (sale.digitalKind === "youtube") {
      const d = await api.digitalVideo(sale.saleId, sale.code);
      videoSaleRef.current = sale;
      setVideoSrc(d.embed_src);
      return sale.name || "";
    }
    const d = await api.digitalDownload(sale.saleId, sale.code);
    const a = document.createElement("a");
    a.href = d.url;
    a.rel = "noopener";
    if (d.file_name) a.download = d.file_name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    return d.file_name || sale.name || "";
  };

  const handleClose = () => {
    stopPoll();
    const cb = propsRef.current.onClose;
    if (typeof cb === "function") cb();
  };

  // Téléchargement MANUEL (secours) : un bouton par fichier confirmé — utile
  // si le navigateur a bloqué le téléchargement automatique.
  const manualDownload = async (sale) => {
    setErr("");
    setDlBusy((b) => ({ ...b, [sale.saleId]: true }));
    try {
      await downloadOne(sale);
    } catch (e) {
      if (mountedRef.current) setErr(e.message);
    } finally {
      if (mountedRef.current) setDlBusy((b) => ({ ...b, [sale.saleId]: false }));
    }
  };

  // 4. Tous les paiements confirmés → TÉLÉCHARGEMENT AUTOMATIQUE des fichiers
  // (un par un), sans aucun formulaire ni clic supplémentaire, puis
  // félicitations et fermeture automatique (autoCloseMs).
  useEffect(() => {
    if (stage !== "ready" || autoDlRef.current) return;
    const list = confirmedRef.current;
    if (!list.length) return;
    autoDlRef.current = true;
    const run = async () => {
      setStage("downloading");
      let failed = false;
      for (const sale of list) {
        try {
          await downloadOne(sale);
        } catch (e) {
          // Un échec ne bloque pas les autres fichiers : le bouton de secours
          // reste affiché pour celui-ci.
          failed = true;
          if (mountedRef.current) setErr(e.message);
        }
      }
      if (!mountedRef.current) return;
      if (failed) {
        setStage("ready");
        return;
      }
      const cb = propsRef.current.onDone;
      if (typeof cb === "function") cb();
      setStage("done");
      const ms = Number(propsRef.current.autoCloseMs) || 0;
      if (ms > 0) setTimeout(() => mountedRef.current && handleClose(), ms);
    };
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage]);

  if (!total) return null;

  const multiple = total > 1;

  // ---------- Tunnel iKeePay (iframe) ----------
  if (stage === "checkout" && cur) {
    return (
      <IkeepayCheckout
        checkoutUrl={cur.checkoutUrl}
        onSuccess={waitConfirmation}
        onClose={handleClose}
      />
    );
  }

  // Aucune vente connue et aucune préparation en cours → rien à afficher.
  if (!cur && stage !== "creating") return null;

  return (
    <TunnelBody
      t={t}
      stage={stage}
      idx={idx}
      total={total}
      multiple={multiple}
      confirmed={confirmed}
      err={err}
      dlBusy={dlBusy}
      onManual={manualDownload}
      onClose={handleClose}
      videoSrc={videoSrc}
    />
  );
}

/** Modale de progression / téléchargement / félicitations. */
function TunnelBody({ t, stage, idx, total, multiple, confirmed, err, dlBusy, onManual, onClose, videoSrc }) {
  return (
    <div
      className="ikeepay-overlay"
      style={{ display: "flex" }}
      role="dialog"
      aria-label={t("Téléchargement")}
    >
      <div className="ikeepay-modal digital-buy-modal">
        <button type="button" className="ikeepay-close" aria-label={t("Fermer")} onClick={onClose}>
          ✕
        </button>
        {videoSrc && (
          <div className="protected-video-frame" style={{ marginBottom: 10 }}>
            <iframe
              src={videoSrc}
              title={t("Vidéo protégée")}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
              referrerPolicy="strict-origin-when-cross-origin"
            />
          </div>
        )}
        {stage === "creating" && (
          <div className="digital-buy-center">
            <span className="ikepay-spinner" role="status" aria-live="polite" />
            <p>{t("Préparation de votre commande…")}</p>
            {multiple && (
              <p className="hint">📁 {t("Fichier {n} sur {total}", { n: idx + 1, total })}</p>
            )}
          </div>
        )}
        {stage === "waiting" && (
          <div className="digital-buy-center">
            <span className="ikepay-spinner" role="status" aria-live="polite" />
            <p>
              ⏳ {t("Paiement reçu — confirmation en cours…")}
              <br />
              <span className="hint">
                {t("La page de téléchargement s'ouvrira automatiquement (quelques secondes).")}
              </span>
            </p>
          </div>
        )}
        {(stage === "ready" || stage === "downloading") && (
          <div className="digital-buy-center">
            <p className="digital-buy-title">
              📁 {multiple ? t("Fichier {n} sur {total}", { n: idx, total }) : confirmed[0]?.name}
            </p>
            {confirmed.map((s, i) => (
              <button
                key={s.saleId}
                type="button"
                className="btn btn-primary btn-block"
                style={i > 0 ? { marginTop: 8 } : undefined}
                onClick={() => onManual(s)}
                disabled={stage === "downloading" || dlBusy[s.saleId]}
              >
                {s.digitalKind === "youtube"
                  ? dlBusy[s.saleId]
                    ? `⏳ ${t("Déverrouillage de la vidéo…")}`
                    : `▶ ${t("Regarder la vidéo")}${s.name ? ` — ${s.name}` : ""}`
                  : stage === "downloading" || dlBusy[s.saleId]
                    ? `⏳ ${t("Téléchargement en cours…")}`
                    : `⬇️ ${t("Télécharger mon fichier")}${s.name ? ` — ${s.name}` : ""}`}
              </button>
            ))}
            {confirmed.some((s) => s.digitalKind !== "youtube") && (
              <p className="hint">{t("Un seul téléchargement est autorisé pour cet achat.")}</p>
            )}
            {err && <p className="error">{err}</p>}
          </div>
        )}
        {stage === "done" && (
          <div className="digital-buy-center">
            <p className="digital-buy-congrats">🎉 {t("Félicitations !")}</p>
            {confirmed.every((s) => s.digitalKind === "youtube") ? (
              <p>
                {videoSrc
                  ? t("Votre vidéo est déverrouillée — elle s'affiche ci-dessus.")
                  : t("Votre vidéo est déverrouillée : cliquez sur « Regarder la vidéo » pour la visionner.")}
              </p>
            ) : (
              <p>
                {t("Votre fichier a été téléchargé sur votre appareil.")}
                {confirmed.length === 1 ? <br /> : null}
                {confirmed.length === 1 && confirmed[0].name && (
                  <span className="hint">📁 {confirmed[0].name}</span>
                )}
              </p>
            )}
            {confirmed.length > 1 && (
              <p className="hint">
                📁{" "}
                {confirmed
                  .map((s) => s.name)
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            )}
            <button type="button" className="btn btn-outline btn-block" onClick={onClose}>
              {t("Fermer")}
            </button>
          </div>
        )}
        {stage === "error" && (
          <div className="digital-buy-center">
            <p className="error">{err || t("Une erreur est survenue.")}</p>
            <button type="button" className="btn btn-outline btn-block" onClick={onClose}>
              {t("Fermer")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
