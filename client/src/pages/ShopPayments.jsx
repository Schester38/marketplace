import React, { useCallback, useEffect, useState } from "react";
import { api } from "../api.js";
import Seo from "../components/Seo.jsx";
import { useAuth } from "../App.jsx";
import { useLang } from "../i18n.jsx";
import { useRefreshOnFocus } from "../useRefreshOnFocus.js";
import { getCountry } from "../config.js";
import { WALLETS_BY_COUNTRY, DEFAULT_WALLETS } from "./SellerPayments.jsx";

export default function ShopPayments() {
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
      .getShopPaymentMethods()
      .then((d) => {
        const saved = d.methods ? d.methods.wallets : [];
        setFullName(d.methods ? d.methods.full_name || "" : "");
        const country = getCountry(user?.country);
        const suggestions = (country && WALLETS_BY_COUNTRY[country.name]) || DEFAULT_WALLETS;
        const unique = [...suggestions];
        saved.forEach((w) => {
          if (!unique.includes(w.name)) unique.push(w.name);
        });
        // Respecte le moyen principal déjà enregistré ; sinon le premier moyen
        // sauvegardé devient le principal (rétrocompatibilité).
        const anyPrimary = saved.some((w) => w.primary === true);
        const firstSaved = saved[0] ? saved[0].name : null;
        setWallets(
          unique.map((name) => {
            const prev = saved.find((w) => w.name === name);
            const isPrimary = prev
              ? prev.primary === true || (!anyPrimary && name === firstSaved)
              : false;
            return { name, value: prev ? prev.value : "", checked: !!prev, primary: isPrimary };
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
      // Moyen principal : au plus un wallet `primary`.
      let seen = false;
      const safe = list.map((w, i, arr) => {
        const isPrimary = arr.length === 1 || w.primary === true || (!seen && !arr.some((x) => x.primary === true) && i === 0);
        if (w.primary && seen) return { name: w.name, value: w.value.trim(), primary: false };
        if (isPrimary) seen = true;
        return { name: w.name, value: w.value.trim(), primary: isPrimary };
      });
      const d = await api.updateShopPaymentMethods({ full_name: fullName, wallets: safe });
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
          "Enregistrez vos portefeuilles électroniques pour recevoir les paiements de vos clients."
        )}
        noindex
      />
      <section className="dash-header">
        <div>
          <h1>💳 {t("Mes moyens de paiement")}</h1>
          <p>
            {t("Ces informations seront visibles par vos clients sur le formulaire de commande.")}
          </p>
          <p className="hint" style={{ marginTop: 8 }}>
            {t(
              "Les paiements sont manuels : la boutique vous règle directement en espèces ou par Mobile Money, sans frais, avec une preuve enregistrée sur la vente."
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
                  {w.checked && String(w.value || "").trim() && (
                    <button
                      type="button"
                      className={w.primary ? "btn btn-primary btn-small" : "btn btn-outline btn-small"}
                      style={{ marginTop: 6, fontSize: 12 }}
                      onClick={() =>
                        setWallets((prev) =>
                          prev.map((x) => ({ ...x, primary: x.name === w.name }))
                        )
                      }
                    >
                      {w.primary ? "⭐ " + t("Principal") : t("Définir principal")}
                    </button>
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
