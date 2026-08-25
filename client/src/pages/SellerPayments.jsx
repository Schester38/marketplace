import React, { useCallback, useEffect, useState } from "react";
import { api } from "../api.js";
import Seo from "../components/Seo.jsx";
import { useAuth } from "../App.jsx";
import { useLang } from "../i18n.jsx";
import { useRefreshOnFocus } from "../useRefreshOnFocus.js";
import { getCountry } from "../config.js";

export const WALLETS_BY_COUNTRY = {
  Cameroun: ["Orange Money", "MTN Mobile Money", "Yoomee", "Virement bancaire"],
  "Côte d'Ivoire": ["Orange Money", "MTN Mobile Money", "Moov Money", "Wave", "Virement bancaire"],
  Sénégal: ["Orange Money", "Wave", "Free Money", "Virement bancaire"],
  Mali: ["Orange Money", "Moov Money", "Virement bancaire"],
  "Burkina Faso": ["Orange Money", "Moov Money", "Virement bancaire"],
  Niger: ["Orange Money", "Moov Money", "Virement bancaire"],
  Togo: ["T-Money", "Flooz", "Moov Money", "Virement bancaire"],
  Bénin: ["MTN Mobile Money", "Moov Money", "Virement bancaire"],
  Guinée: ["Orange Money", "MTN Mobile Money", "Virement bancaire"],
  Gabon: ["Airtel Money", "Moov Money", "Virement bancaire"],
  "République du Congo": ["Airtel Money", "MTN Mobile Money", "Virement bancaire"],
  "République démocratique du Congo": [
    "Orange Money",
    "Airtel Money",
    "M-Pesa",
    "Virement bancaire",
  ],
  Kenya: ["M-Pesa", "Airtel Money", "Virement bancaire"],
  Ouganda: ["MTN Mobile Money", "Airtel Money", "Virement bancaire"],
  Tanzanie: ["M-Pesa", "Tigo Pesa", "Airtel Money", "Virement bancaire"],
  Rwanda: ["MTN Mobile Money", "Airtel Money", "Virement bancaire"],
  Ghana: ["MTN Mobile Money", "Virement bancaire"],
  Nigeria: ["Virement bancaire", "USSD"],
  "Afrique du Sud": ["Virement bancaire", "SnapScan"],
  Éthiopie: ["M-Pesa", "Virement bancaire"],
  France: ["Virement bancaire", "PayPal", "Carte bancaire"],
  Belgique: ["Virement bancaire", "PayPal", "Carte bancaire"],
  Suisse: ["Virement bancaire", "PayPal", "Carte bancaire"],
  Canada: ["Virement bancaire", "PayPal", "Carte bancaire"],
  "États-Unis": ["Virement bancaire", "PayPal", "Carte bancaire"],
};

export const DEFAULT_WALLETS = [
  "Orange Money",
  "MTN Mobile Money",
  "M-Pesa",
  "Airtel Money",
  "Wave",
  "Moov Money",
  "Virement bancaire",
  "PayPal",
];

export default function SellerPayments() {
  const { user } = useAuth();
  const { t } = useLang();
  const [fullName, setFullName] = useState("");
  const [wallets, setWallets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [savedCount, setSavedCount] = useState(0);

  const loadPaymentMethods = useCallback(() => {
    api
      .getPaymentMethods()
      .then((d) => {
        const saved = d.methods ? d.methods.wallets : [];
        setFullName(d.methods ? d.methods.full_name || "" : "");
        const country = getCountry(user?.country);
        const suggestions = (country && WALLETS_BY_COUNTRY[country.name]) || DEFAULT_WALLETS;
        const unique = [...suggestions];
        saved.forEach((w) => {
          if (!unique.includes(w.name)) unique.push(w.name);
        });
        setWallets(
          unique.map((name) => {
            const prev = saved.find((w) => w.name === name);
            return { name, value: prev ? prev.value : "", checked: !!prev };
          })
        );
        setSavedCount(saved.length);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [user]);

  useEffect(() => {
    loadPaymentMethods();
  }, [loadPaymentMethods]);

  useRefreshOnFocus(loadPaymentMethods);

  const save = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setSaving(true);
    try {
      const list = wallets.filter((w) => w.checked && String(w.value || "").trim());
      if (list.length === 0) {
        setError(t("Ajoutez au moins un portefeuille avec son numéro."));
        setSaving(false);
        return;
      }
      const d = await api.updatePaymentMethods({ full_name: fullName, wallets: list });
      setSavedCount(d.methods.wallets.length);
      setSuccess(t("Moyens de paiement enregistrés !"));
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="container narrow">
      <Seo
        title={t("Mes moyens de paiement") + " — Mboppi"}
        description={t(
          "Enregistrez vos portefeuilles électroniques pour recevoir vos commissions."
        )}
        noindex
      />
      <section className="dash-header">
        <div>
          <h1>💳 {t("Mes moyens de paiement")}</h1>
          <p>
            {t(
              "Ces informations seront visibles par les boutiques pour vous payer vos commissions."
            )}
          </p>
          <p className="hint" style={{ marginTop: 8 }}>
            {t(
              "Les paiements automatiques sont traités via Ikeepay. Les frais de traitement (environ 6%) sont déduits par Ikeepay sur chaque transaction. Les montants que vous recevez correspondent aux commissions calculées par Mboppi, nettes des frais Ikeepay."
            )}
          </p>
        </div>
      </section>

      {loading ? (
        <div className="card page-center">
          <div className="skeleton-block" style={{ height: 160 }}></div>
        </div>
      ) : (
        <div className="card form-card">
          {savedCount > 0 && (
            <p className="success" style={{ marginBottom: 10 }}>
              ✅ {t("{count} moyen(s) de paiement enregistré(s).", { count: savedCount })}
            </p>
          )}
          <form onSubmit={save}>
            <label>{t("Nom complet (tel qu'il apparaît sur le compte)")}</label>
            <input
              className="input"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder={user.name}
            />

            <div style={{ margin: "18px 0 8px" }}>
              <strong>{t("Portefeuilles électroniques")}</strong>
              <p className="hint" style={{ marginTop: 4 }}>
                {t("Cochez vos portefeuilles et entrez le numéro associé.")}
              </p>
            </div>

            <div className="wallet-list">
              {wallets.map((w, i) => (
                <div className="wallet-row" key={w.name}>
                  <label className="wallet-check">
                    <input
                      type="checkbox"
                      checked={w.checked}
                      onChange={(e) =>
                        setWallets((prev) =>
                          prev.map((x, j) => (j === i ? { ...x, checked: e.target.checked } : x))
                        )
                      }
                    />
                    <span>{w.name}</span>
                  </label>
                  {w.checked && (
                    <input
                      className="input wallet-value"
                      value={w.value}
                      placeholder={t("Numéro")}
                      onChange={(e) =>
                        setWallets((prev) =>
                          prev.map((x, j) => (j === i ? { ...x, value: e.target.value } : x))
                        )
                      }
                    />
                  )}
                </div>
              ))}
            </div>

            {error && <p className="error">{error}</p>}
            {success && <p className="success">{success}</p>}
            <button className="btn btn-primary btn-block" disabled={saving}>
              {saving ? "…" : t("Enregistrer mes moyens de paiement")}
            </button>
          </form>
        </div>
      )}
    </main>
  );
}
