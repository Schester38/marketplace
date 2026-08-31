import React, { useState } from "react";
import Seo from "../components/Seo.jsx";
import { useLang } from "../i18n.jsx";

function OrangeLogo() {
  return (
    <svg viewBox="0 0 120 44" className="support-logo" role="img" aria-label="Orange">
      <rect x="2" y="2" width="36" height="36" rx="8" fill="#FF7900" />
      <circle cx="20" cy="20" r="6" fill="none" stroke="#fff" strokeWidth="2.4" />
      <circle cx="20" cy="20" r="2.4" fill="#fff" />
      <text
        x="46"
        y="29"
        fontFamily="Arial, Helvetica, sans-serif"
        fontSize="21"
        fontWeight="700"
        fill="#FF7900"
      >
        orange
      </text>
      <rect x="46" y="32.5" width="56" height="2.6" rx="1.3" fill="#FF7900" />
    </svg>
  );
}

function MtnLogo() {
  return (
    <svg viewBox="0 0 120 44" className="support-logo" role="img" aria-label="MTN">
      <rect x="2" y="2" width="36" height="36" rx="8" fill="#FFCB05" />
      <text
        x="20"
        y="28"
        fontFamily="Arial, Helvetica, sans-serif"
        fontSize="20"
        fontWeight="800"
        fill="#000"
        textAnchor="middle"
      >
        mt
      </text>
      <text
        x="46"
        y="29"
        fontFamily="Arial, Helvetica, sans-serif"
        fontSize="21"
        fontWeight="800"
        fill="#000"
        letterSpacing="2"
      >
        MTN
      </text>
    </svg>
  );
}

function PaypalLogo() {
  return (
    <svg viewBox="0 0 120 44" className="support-logo" role="img" aria-label="PayPal">
      <rect x="2" y="2" width="36" height="36" rx="8" fill="#003087" />
      <text
        x="20"
        y="29"
        fontFamily="Arial, Helvetica, sans-serif"
        fontSize="20"
        fontWeight="800"
        fill="#fff"
        textAnchor="middle"
      >
        P
      </text>
      <text
        x="46"
        y="29"
        fontFamily="Arial, Helvetica, sans-serif"
        fontSize="21"
        fontWeight="700"
        fill="#009cde"
      >
        PayPal
      </text>
    </svg>
  );
}

function UbaLogo() {
  return (
    <svg viewBox="0 0 120 44" className="support-logo" role="img" aria-label="UBA">
      <rect x="2" y="2" width="36" height="36" rx="8" fill="#E60000" />
      <text
        x="20"
        y="29"
        fontFamily="Arial, Helvetica, sans-serif"
        fontSize="20"
        fontWeight="800"
        fill="#fff"
        textAnchor="middle"
      >
        UBA
      </text>
      <text
        x="46"
        y="29"
        fontFamily="Arial, Helvetica, sans-serif"
        fontSize="22"
        fontWeight="800"
        fill="#E60000"
      >
        UBA
      </text>
      <rect x="76" y="32.5" width="34" height="3" rx="1.5" fill="#E60000" />
    </svg>
  );
}

function CopyValue({ value }) {
  const { t } = useLang();
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(String(value || ""));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignoré */
    }
  };
  return (
    <button type="button" className="btn btn-outline btn-small support-copy" onClick={copy}>
      {copied ? `✓ ${t("Copié !")}` : t("Copier")}
    </button>
  );
}

function InfoRow({ label, value, copyable }) {
  return (
    <div className="support-row">
      <span className="support-row-label">{label}</span>
      <span className="support-row-value">{value}</span>
      {copyable && <CopyValue value={value} />}
    </div>
  );
}

export default function Support() {
  const { t } = useLang();

  const methods = [
    {
      logo: <OrangeLogo />,
      name: t("Orange Money"),
      rows: [{ label: t("Numéro"), value: "+237 699 48 61 46", copyable: "+237699486146" }],
    },
    {
      logo: <MtnLogo />,
      name: t("MTN Mobile Money"),
      rows: [{ label: t("Numéro"), value: "+237 672 88 63 48", copyable: "+237672886348" }],
    },
    {
      logo: <PaypalLogo />,
      name: t("PayPal"),
      manual: true,
      rows: [
        {
          label: t("E-mail"),
          value: "ndjoumjeanarthur@gmail.com",
          copyable: "ndjoumjeanarthur@gmail.com",
        },
      ],
    },
    {
      logo: <UbaLogo />,
      name: t("Virement bancaire (UBA)"),
      manual: true,
      rows: [
        { label: "SWIFT", value: "UNAFCMCX", copyable: "UNAFCMCX" },
        {
          label: "IBAN",
          value: "CM21 10033 05207 07002026857 58",
          copyable: "CM2110033052070700202685758",
        },
      ],
    },
  ];

  return (
    <main className="container">
      <Seo
        title={t("Je soutiens Mboppi") + " — Mboppi"}
        description={t(
          "Soutenez Mboppi : Orange Money, MTN Mobile Money, PayPal ou virement bancaire UBA."
        )}
        noindex
      />
      <section className="hero vitrine-hero">
        <span className="hero-badge">💛 {t("Je soutiens Mboppi")}</span>
        <h1>{t("Chaque geste compte pour faire grandir Mboppi")}</h1>
        <p>
          {t(
            "Votre soutien nous aide à payer les frais du site, à améliorer la plateforme et à accompagner nos boutiques et vendeurs. Chaque contribution, même petite, fait avancer le projet."
          )}
        </p>
      </section>

      <section className="section">
        <div className="section-head">
          <h2>{t("Comment pouvez-vous soutenir le projet ?")}</h2>
          <p>{t("Choisissez le moyen qui vous convient.")}</p>
        </div>

        <div className="support-grid">
          {methods.map((m) => (
            <div className="card support-card" key={m.name}>
              <div className="support-card-head">{m.logo}</div>
              <h3>{m.name}</h3>
              {m.manual && <span className="badge badge-muted">{t("Manuel")}</span>}
              {m.rows.map((r) => (
                <InfoRow key={r.label} label={r.label} value={r.value} copyable={!!r.copyable} />
              ))}
            </div>
          ))}
        </div>
      </section>

      <section className="section cta-section">
        <h2>{t("Merci pour votre soutien !")} 💛</h2>
        <p>
          {t(
            "Avec votre aide, Mboppi continue de connecter les boutiques, les vendeurs et les clients de toute la communauté."
          )}
        </p>
      </section>
    </main>
  );
}
