import { useLang } from "../i18n.jsx";

// ---------------------------------------------------------------------------
// Bande « moyens de paiement acceptés » (achat iKeepay sécurisé).
// Les badges sont dessinés en SVG inline aux couleurs des marques : aucun
// fichier externe (compatible CSP, PWA et mode hors-ligne), aucune requête
// réseau. Les logos officiels (marques déposées) ne sont pas redistribuables ;
// ce sont des repères visuels fidèles, pas des copies de fichiers.
// ---------------------------------------------------------------------------

const badgeStyle = {
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
  borderRadius: 6,
  padding: "3px 8px",
  fontSize: 10.5,
  fontWeight: 700,
  lineHeight: 1,
  letterSpacing: "0.2px",
  color: "#fff",
  whiteSpace: "nowrap",
};

function Badge({ bg, children, border }) {
  return (
    <span
      style={{
        ...badgeStyle,
        background: bg,
        ...(border ? { border: `1px solid ${border}` } : {}),
      }}
    >
      {children}
    </span>
  );
}

const Visa = () => (
  <Badge bg="#1a1f71">
    <span style={{ fontStyle: "italic", fontSize: 12 }}>VISA</span>
  </Badge>
);

const Mastercard = () => (
  <Badge bg="#16366f" border="#f79e1b33">
    <svg width="20" height="13" viewBox="0 0 24 15" aria-hidden="true">
      <circle cx="8.5" cy="7.5" r="6.5" fill="#eb001b" />
      <circle cx="15.5" cy="7.5" r="6.5" fill="#f79e1b" fillOpacity="0.9" />
    </svg>
    <span style={{ textTransform: "lowercase" }}>mastercard</span>
  </Badge>
);

const Usdt = () => (
  <Badge bg="#26a17b">
    <svg width="12" height="12" viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="8" cy="8" r="8" fill="#ffffff" fillOpacity="0.18" />
      <text x="8" y="12" textAnchor="middle" fontSize="11" fontWeight="700" fill="#fff">
        ₮
      </text>
    </svg>
    <span>USDT</span>
  </Badge>
);

const MtnMomo = () => (
  <Badge bg="#ffcc00" border="#00000022">
    <span style={{ color: "#111", fontStyle: "italic" }}>MTN</span>
    <span style={{ color: "#111" }}>MoMo</span>
  </Badge>
);

const OrangeMoney = () => (
  <Badge bg="#ff7900">
    <span style={{ fontSize: 11 }}>Orange Money</span>
  </Badge>
);

const MoovMoney = () => (
  <Badge bg="#0057b8">
    <span style={{ fontSize: 11 }}>Moov Money</span>
  </Badge>
);

const Wave = () => (
  <Badge bg="#1dc8ff">
    <span style={{ color: "#0b2a4a", fontWeight: 800 }}>🌊 Wave</span>
  </Badge>
);

const MPesa = () => (
  <Badge bg="#e00000">
    <span style={{ fontSize: 11 }}>M-Pesa</span>
  </Badge>
);

const AirtelMoney = () => (
  <Badge bg="#ed1c24">
    <span style={{ fontSize: 11 }}>Airtel Money</span>
  </Badge>
);

export default function PaymentMethodsStrip() {
  const { t } = useLang();
  // Bandeau DÉFILANT (de la droite vers la gauche, une seule ligne) : la piste
  // contient DEUX fois la série de badges — quand la moitié gauche sort de
  // l'écran, la seconde moitié est déjà entrée (boucle sans à-coup).
  const badges = () => (
    <>
      <Visa />
      <Mastercard />
      <Usdt />
      <MtnMomo />
      <OrangeMoney />
      <MoovMoney />
      <Wave />
      <MPesa />
      <AirtelMoney />
    </>
  );
  return (
    <div className="pay-strip" role="note">
      <div className="pay-strip-title">🔐 {t("Paiements acceptés — sécurisés par iKeepay")}</div>
      <div className="pay-strip-marquee">
        <div className="pay-strip-track">
          {badges()}
          <span style={{ display: "contents" }} aria-hidden="true">
            {badges()}
          </span>
        </div>
      </div>
      <p className="pay-strip-hint">
        {t(
          "Carte bancaire (Visa / Mastercard), USDT et Mobile Money — transaction chiffrée et vérifiée."
        )}
      </p>
    </div>
  );
}
