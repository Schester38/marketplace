import React, { useEffect, useState } from "react";
import { api } from "../api.js";
import { useLang } from "../i18n.jsx";

/**
 * Carte « 💰 Gains en ligne » — créateur ET vendeur.
 *
 * Les ventes digitales payées via iKeePay créditent online_earnings pour
 * chaque bénéficiaire (créateur : prix − commissions ; vendeur : sa
 * commission ; parrain : 2 %). Le solde se retire comme un retrait
 * d'activation : demande ici → l'administration paie manuellement
 * (espèces / Mobile Money) avec les moyens de paiement configurés.
 * Seuil : 5 000 XAF, montant multiple de 1 000.
 */
export default function OnlineEarningsCard({ role = "creator" }) {
  const { t } = useLang();
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  const load = () => {
    api
      .onlineEarningsMe()
      .then(setData)
      .catch((e) => setErr(e.message));
  };
  useEffect(load, []);

  const fmt = (n) => `${Number(n || 0).toLocaleString("fr-FR")} XAF`;
  const available = Number(data?.available || 0);
  const min = Number(data?.min_amount || 5000);
  const canWithdraw = available >= min;

  const askWithdraw = async () => {
    setErr("");
    setMsg("");
    const raw = window.prompt(
      t("Montant à retirer (multiple de 1 000 XAF, minimum {min} XAF) :", { min: min.toLocaleString("fr-FR") }),
      String(Math.floor(available / 1000) * 1000 || min)
    );
    if (raw === null) return;
    const amount = Math.round(Number(raw));
    if (!Number.isFinite(amount) || amount < min) {
      setErr(t("Le retrait minimum est de {min} XAF.", { min: min.toLocaleString("fr-FR") }));
      return;
    }
    if (amount % 1000 !== 0) {
      setErr(t("Le montant doit être un multiple de 1 000 XAF."));
      return;
    }
    if (amount > available) {
      setErr(t("Montant supérieur à votre solde disponible."));
      return;
    }
    setBusy(true);
    try {
      const d = await api.onlineWithdraw(amount);
      setMsg(
        t(
          "Demande envoyée ✓ L'administration vous paiera sur vos moyens de paiement configurés, dans un délai maximum de 72 h."
        )
      );
      if (d && typeof d.available === "number") {
        setData((b) => ({ ...b, available: d.available }));
      } else {
        load();
      }
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  const who =
    role === "seller"
      ? t("Vos commissions sur les ventes digitales payées en ligne")
      : t("Vos ventes digitales payées en ligne");
  // Historique réel : « déjà retiré » = demandes PAYÉES ; « en attente » =
  // demandes encore en cours (l'argent reste bloqué jusqu'au paiement admin).
  const wList = Array.isArray(data?.withdrawals) ? data.withdrawals : [];
  const paidSum = wList
    .filter((w) => w.status === "paid")
    .reduce((s, w) => s + Number(w.amount || 0), 0);
  const pendingSum = wList
    .filter((w) => w.status === "pending")
    .reduce((s, w) => s + Number(w.amount || 0), 0);

  return (
    <section className="card online-earnings-card" style={{ marginBottom: 14 }}>
      <h3 style={{ margin: "0 0 4px" }}>💰 {t("Gains en ligne")}</h3>
      <p className="muted-line">{who}</p>
      {err && !data && <p className="error">{err}</p>}
      {data && (
        <>
          <p className="big-amount">{fmt(available)}</p>
          <p className="muted-line">
            {t("Total gagné")} : {fmt(data.total)} · {t("Déjà retiré")} : {fmt(paidSum)}
            {pendingSum > 0 ? ` · ${t("En attente")} : ${fmt(pendingSum)}` : ""}
          </p>
          <button
            type="button"
            className="btn btn-primary"
            onClick={askWithdraw}
            disabled={busy || !canWithdraw}
          >
            {busy ? "⏳ …" : `💸 ${t("Retirer")}`}
          </button>
          <p className="hint" style={{ margin: "8px 0 0" }}>
            {t("Votre paiement vous parvient sous 72 h maximum après validation de votre demande.")}
          </p>
          {!canWithdraw && (
            <p className="hint" style={{ margin: "8px 0 0" }}>
              {t("Retrait disponible à partir de {min} XAF.", { min: min.toLocaleString("fr-FR") })}
            </p>
          )}
          {msg && <p className="hint" style={{ margin: "8px 0 0" }}>{msg}</p>}
          {err && <p className="error" style={{ margin: "8px 0 0" }}>{err}</p>}
        </>
      )}
    </section>
  );
}
