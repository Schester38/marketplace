// Espace FREELANCE — prospection publicitaire Yaoundé & Douala.
// Page dédiée ouverte depuis « 🎨 Mon espace créateur », réservée au compte
// bestrong9124@gmail.com (garde dans App.jsx). Les données à remplacer
// (blocs 1 à 5) se trouvent dans client/src/freelanceData.js.
import React, { useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import Seo from "../components/Seo.jsx";
import { SECTORS, COMPANIES, SCRIPTS_DATA } from "../freelanceData.js";

function firstWaLink(mobileStr) {
  if (!mobileStr) return "";
  const first = String(mobileStr).split("/")[0].replace(/\D/g, "");
  return first.length >= 9 ? "https://wa.me/" + first : "";
}

function firstEmail(emailStr) {
  if (!emailStr) return "";
  return String(emailStr).split("/")[0].trim();
}

function personalize(text, info) {
  let out = text;
  if (info.name) out = out.replace(/\[Votre Prénom\]/g, info.name);
  if (info.agency) out = out.replace(/\[Nom de votre Structure\]/g, info.agency);
  if (info.phone) out = out.replace(/\[Votre Numéro\]/g, info.phone);
  if (info.email) out = out.replace(/\[Votre E-mail\]/g, info.email);
  return out;
}

const EMPTY_PERSONALIZATION = { name: "", agency: "", phone: "", email: "" };

export default function Freelance() {
  const [tab, setTab] = useState("directory");
  const [search, setSearch] = useState("");
  const [city, setCity] = useState("");
  const [sector, setSector] = useState("");
  const [channel, setChannel] = useState("");
  const [info, setInfo] = useState(EMPTY_PERSONALIZATION);
  const [toast, setToast] = useState("");
  const toastTimer = useRef(null);

  const showToast = (message) => {
    setToast(message);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 2200);
  };

  const copyText = async (text) => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const area = document.createElement("textarea");
        area.value = text;
        document.body.appendChild(area);
        area.select();
        document.execCommand("copy");
        document.body.removeChild(area);
      }
      showToast("Copié dans le presse-papiers !");
    } catch {
      showToast("Impossible de copier automatiquement.");
    }
  };

  const stats = useMemo(
    () => ({
      total: COMPANIES.length,
      yaounde: COMPANIES.filter((c) => c[0] === "Yaoundé").length,
      douala: COMPANIES.filter((c) => c[0] === "Douala").length,
      whatsapp: COMPANIES.filter((c) => String(c[5] || "").trim() !== "").length,
    }),
    []
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return COMPANIES.filter((c) => {
      if (city && c[0] !== city) return false;
      if (sector && String(c[1]) !== sector) return false;
      if (channel === "mobile" && !String(c[5] || "").trim()) return false;
      if (channel === "fixe" && String(c[5] || "").trim()) return false;
      if (q) {
        const hay = [c[0], SECTORS[c[1]], c[2], c[3], c[4], c[5], c[6], c[7]]
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [search, city, sector, channel]);

  return (
    <main className="freelance-page">
      <Seo
        title="Prospection Publicitaire — Yaoundé & Douala | MboppiShop"
        description="Répertoire structuré par secteur d'activité, canal de contact et scripts de conversion."
        noindex
      />

      <header className="fr-header">
        <div className="fr-container fr-header-top">
          <div>
            <h1>Prospection Publicitaire — Yaoundé &amp; Douala</h1>
            <p>
              Répertoire structuré par secteur d'activité, canal de contact (WhatsApp / SMS / Fixe /
              E-mail) &amp; scripts de conversion
            </p>
          </div>
          <div className="fr-header-actions">
            <Link to="/creator" className="fr-btn fr-btn-ghost">
              ← Mon espace créateur
            </Link>
            <button type="button" className="fr-btn fr-btn-light" onClick={() => window.print()}>
              Imprimer / Exporter en PDF
            </button>
          </div>
        </div>
      </header>

      <div className="fr-container">
        <section className="fr-stats-grid">
          <div className="fr-stat-card">
            <div className="fr-stat-label">Entreprises chargées</div>
            <div className="fr-stat-value">{stats.total}</div>
            <div className="fr-stat-sub">Base Yaoundé + Douala</div>
          </div>
          <div className="fr-stat-card">
            <div className="fr-stat-label">Yaoundé</div>
            <div className="fr-stat-value">{stats.yaounde}</div>
            <div className="fr-stat-sub">Objectif : 400</div>
          </div>
          <div className="fr-stat-card">
            <div className="fr-stat-label">Douala</div>
            <div className="fr-stat-value">{stats.douala}</div>
            <div className="fr-stat-sub">Objectif : 600</div>
          </div>
          <div className="fr-stat-card">
            <div className="fr-stat-label">WhatsApp / SMS (6xx)</div>
            <div className="fr-stat-value">{stats.whatsapp}</div>
            <div className="fr-stat-sub">Contacts mobiles directs</div>
          </div>
        </section>

        <div className="fr-tabs">
          <button
            type="button"
            className={`fr-tab-btn${tab === "directory" ? " active" : ""}`}
            onClick={() => setTab("directory")}
          >
            1. Annuaire des Entreprises
          </button>
          <button
            type="button"
            className={`fr-tab-btn${tab === "scripts" ? " active" : ""}`}
            onClick={() => setTab("scripts")}
          >
            2. Scripts WhatsApp, SMS, E-mail &amp; Relances
          </button>
        </div>

        <section className={`fr-tab-panel${tab === "directory" ? " active" : ""}`}>
          <div className="fr-filters-bar">
            <input
              className="fr-input"
              type="text"
              placeholder="Rechercher par entreprise, quartier, téléphone, e-mail, activité..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <select className="fr-input" value={city} onChange={(e) => setCity(e.target.value)}>
              <option value="">Toutes les villes</option>
              <option value="Yaoundé">Yaoundé</option>
              <option value="Douala">Douala</option>
            </select>
            <select
              className="fr-input"
              value={sector}
              onChange={(e) => setSector(e.target.value)}
            >
              <option value="">Tous les secteurs (1 à 8)</option>
              {Object.entries(SECTORS).map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
            <select
              className="fr-input"
              value={channel}
              onChange={(e) => setChannel(e.target.value)}
            >
              <option value="">Tous les canaux</option>
              <option value="mobile">Avec WhatsApp / SMS (6xx)</option>
              <option value="fixe">Fixe uniquement (Appel)</option>
            </select>
          </div>

          <div className="fr-table-wrap">
            <div className="fr-results-info">
              <span>
                {filtered.length} entreprise(s) affichée(s) sur {COMPANIES.length}
              </span>
              <span className="fr-muted">
                Astuce : cliquez sur WhatsApp ou E-mail pour contacter directement
              </span>
            </div>
            <table className="fr-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Ville</th>
                  <th>Secteur</th>
                  <th>Entreprise &amp; Offre</th>
                  <th>Localisation</th>
                  <th>WhatsApp / SMS (6xx)</th>
                  <th>Fixe</th>
                  <th>E-mail</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c, idx) => {
                  const waUrl = firstWaLink(c[5]);
                  const mail = firstEmail(c[7]);
                  return (
                    <tr key={`${c[2]}-${c[4]}-${idx}`}>
                      <td>{idx + 1}</td>
                      <td>
                        <span className={`fr-badge ${c[0] === "Yaoundé" ? "fr-badge-yde" : "fr-badge-dla"}`}>
                          {c[0]}
                        </span>
                      </td>
                      <td>
                        <span className="fr-badge fr-badge-sec">S{c[1]}</span>
                      </td>
                      <td>
                        <strong>{c[2]}</strong>
                        <br />
                        <span className="fr-muted">{c[3]}</span>
                      </td>
                      <td>{c[4]}</td>
                      <td>{c[5] ? c[5] : <span className="fr-muted">—</span>}</td>
                      <td>{c[6] ? c[6] : <span className="fr-muted">—</span>}</td>
                      <td>{c[7] ? c[7] : <span className="fr-muted">—</span>}</td>
                      <td>
                        <div className="fr-actions-cell">
                          {waUrl ? (
                            <a
                              className="fr-btn fr-btn-wa"
                              href={waUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              WhatsApp
                            </a>
                          ) : null}
                          {mail ? (
                            <a className="fr-btn fr-btn-mail" href={`mailto:${mail}`}>
                              E-mail
                            </a>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {filtered.length === 0 ? (
              <div className="fr-empty-banner">
                Aucune entreprise trouvée (vérifiez vos filtres ou collez les blocs 1 à 5 dans{" "}
                <code>client/src/freelanceData.js</code>).
              </div>
            ) : null}
          </div>
        </section>

        <section className={`fr-tab-panel${tab === "scripts" ? " active" : ""}`}>
          <div className="fr-customizer">
            <h3>Personnaliser automatiquement tous vos scripts</h3>
            <div className="fr-custom-grid">
              <input
                className="fr-input"
                type="text"
                placeholder="Votre Prénom / Nom (ex: Marc K.)"
                value={info.name}
                onChange={(e) => setInfo((v) => ({ ...v, name: e.target.value }))}
              />
              <input
                className="fr-input"
                type="text"
                placeholder="Nom de votre Structure"
                value={info.agency}
                onChange={(e) => setInfo((v) => ({ ...v, agency: e.target.value }))}
              />
              <input
                className="fr-input"
                type="text"
                placeholder="Votre Numéro / WhatsApp"
                value={info.phone}
                onChange={(e) => setInfo((v) => ({ ...v, phone: e.target.value }))}
              />
              <input
                className="fr-input"
                type="text"
                placeholder="Votre E-mail"
                value={info.email}
                onChange={(e) => setInfo((v) => ({ ...v, email: e.target.value }))}
              />
            </div>
          </div>

          {SCRIPTS_DATA.map((script) => (
            <div className="fr-script-sector-card" key={script.title}>
              <div className="fr-script-sector-header">
                <div>
                  <h2>{script.title}</h2>
                  <div className="fr-script-trigger">{script.trigger}</div>
                </div>
              </div>
              <div className="fr-channels-grid">
                <div className="fr-channel-box">
                  <div>
                    <div className="fr-channel-top">
                      <span className="fr-channel-title">WhatsApp</span>
                      <button
                        type="button"
                        className="fr-btn fr-btn-copy"
                        onClick={() => copyText(personalize(script.whatsapp, info))}
                      >
                        Copier
                      </button>
                    </div>
                    <div className="fr-script-text">{personalize(script.whatsapp, info)}</div>
                  </div>
                </div>
                <div className="fr-channel-box">
                  <div>
                    <div className="fr-channel-top">
                      <span className="fr-channel-title">SMS / Appel</span>
                      <button
                        type="button"
                        className="fr-btn fr-btn-copy"
                        onClick={() => copyText(personalize(script.sms, info))}
                      >
                        Copier
                      </button>
                    </div>
                    <div className="fr-script-text">{personalize(script.sms, info)}</div>
                  </div>
                </div>
                <div className="fr-channel-box">
                  <div>
                    <div className="fr-channel-top">
                      <span className="fr-channel-title">E-mail</span>
                      <button
                        type="button"
                        className="fr-btn fr-btn-copy"
                        onClick={() => copyText(personalize(script.email, info))}
                      >
                        Copier
                      </button>
                    </div>
                    <div className="fr-script-text">{personalize(script.email, info)}</div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </section>
      </div>

      <div className={`fr-toast${toast ? " show" : ""}`}>{toast}</div>
    </main>
  );
}
