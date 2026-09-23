import nodemailer from "nodemailer";

const SMTP_HOST = process.env.SMTP_HOST || "";
const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
const SMTP_SECURE = process.env.SMTP_SECURE === "true";
const SMTP_USER = process.env.SMTP_USER || "";
const SMTP_PASS = process.env.SMTP_PASS || "";
const EMAIL_FROM =
  process.env.EMAIL_FROM ||
  (SMTP_USER ? `Mboppi <${SMTP_USER}>` : "Mboppi <noreply@mboppi.vercel.app>");

// Domaine public du site (logo et liens des e-mails) — SITE_URL sur Vercel.
const SITE_URL = String(process.env.SITE_URL || "https://mboppi-mboppi.vercel.app").replace(
  /\/+$/,
  ""
);

// Adresse d'invitation unique Trustpilot (celle du profil revendiqué). Placée
// en BCC (copie cachée) de l'e-mail « commande livrée » au client : Trustpilot
// envoie alors lui-même son invitation à laisser un avis. Pour DÉSACTIVER :
// variable d'environnement TRUSTPILOT_INVITE_EMAIL vide, ou valeur "off".
const TRUSTPILOT_INVITE_EMAIL = (() => {
  const raw = process.env.TRUSTPILOT_INVITE_EMAIL;
  const value = String(raw === undefined ? "mboppishop.com+8f839a5b1c@invite.trustpilot.com" : raw).trim();
  if (!value || ["off", "none", "false", "0"].includes(value.toLowerCase())) return null;
  return value.includes("@") ? value : null;
})();

export function trustpilotInviteEmail() {
  return TRUSTPILOT_INVITE_EMAIL;
}

let transporter = null;

export function mailConfigured() {
  return Boolean(SMTP_HOST && SMTP_USER && SMTP_PASS);
}

function getTransporter() {
  if (!mailConfigured()) return null;
  if (transporter) return transporter;
  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_SECURE,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
  return transporter;
}

export async function sendMail({ to, subject, text, html, bcc }) {
  const tr = getTransporter();
  if (!tr) {
    console.warn(`[mailer:simulé] → ${to}\nSujet: ${subject}\n${text}`);
    return { simulated: true };
  }
  try {
    const info = await tr.sendMail({
      from: EMAIL_FROM,
      to,
      bcc: bcc || undefined,
      subject,
      text,
      html,
    });
    return info;
  } catch (err) {
    console.error("[mailer] Erreur d'envoi:", err.message);
    console.error(
      "[mailer] Config:",
      JSON.stringify({
        host: SMTP_HOST,
        port: SMTP_PORT,
        secure: SMTP_SECURE,
        user: SMTP_USER,
        numPassChars: SMTP_PASS.length,
      })
    );
    throw err;
  }
}

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Email « nouvelle vente » à la boutique/créateur propriétaire du produit et
 * au vendeur (le cas échéant). Non bloquant : ignoré si le SMTP n'est pas
 * configuré, aucun destinataire valide, ou en cas d'échec d'envoi.
 */
export async function sendSaleEmails({
  shopEmail,
  sellerEmail,
  buyerName,
  productName,
  quantity,
  total,
  currency = "F",
  confirmCode,
  digital = false,
}) {
  if (!mailConfigured()) return;
  const to = [shopEmail, sellerEmail].filter((e) => e && String(e).includes("@"));
  if (!to.length) return;
  const subject = "Nouvelle vente sur Mboppi 🛍️";
  const name = esc(productName);
  const client = esc(buyerName);
  const text = [
    "Nouvelle vente enregistrée :",
    `- Produit : ${productName} × ${quantity}`,
    `- Total : ${total} ${currency}`,
    buyerName ? `- Client : ${buyerName}` : "",
    confirmCode ? `- Code de confirmation : ${confirmCode}` : "",
    digital ? "Produit digital : l'acheteur télécharge son fichier après confirmation." : "",
    "",
    `Suivi : ${SITE_URL}/shop`,
  ]
    .filter(Boolean)
    .join("\n");
  const html = `<p>Nouvelle vente sur Mboppi 🛍️</p><ul><li><strong>Produit :</strong> ${name} × ${quantity}</li><li><strong>Total :</strong> ${total} ${esc(
    currency
  )}</li>${buyerName ? `<li><strong>Client :</strong> ${client}</li>` : ""}${
    confirmCode ? `<li><strong>Code de confirmation :</strong> ${esc(confirmCode)}</li>` : ""
  }${
    digital
      ? "<li>Produit digital : l'acheteur télécharge son fichier après confirmation.</li>"
      : ""
  }</ul><p><a href="${SITE_URL}/shop">Ouvrir mon espace</a></p>`;
  for (const email of to) {
    try {
      await sendMail({ to: email, subject, text, html });
    } catch {
      /* jamais bloquant pour la requête métier */
    }
  }
}

/**
 * E-mail « commande livrée » envoyé à l'ACHETEUR (uniquement si une adresse
 * e-mail a été fournie à la commande — champ facultatif). L'adresse
 * d'invitation unique Trustpilot est placée en BCC : Trustpilot adresse alors
 * lui-même au client son invitation officielle à laisser un avis, sans widget
 * ni compte supplémentaire. Non bloquant : l'appelant ignore les erreurs.
 */
export async function sendOrderDeliveredEmail({
  to,
  buyerName,
  productName,
  quantity = 1,
  total,
  currency = "F",
  saleId,
  code,
}) {
  const dest = String(to || "").trim();
  if (!mailConfigured() || !dest.includes("@")) return;
  const safeBuyer = String(buyerName || "cher client").replace(/[<>&]/g, "");
  const safeItem = esc(productName || "votre article");
  const safeQty = Number(quantity) || 1;
  const trackUrl = `${SITE_URL}/suivi/${Number(saleId)}?code=${encodeURIComponent(code || "")}`;
  const reviewUrl = "https://fr.trustpilot.com/evaluate/mboppishop.com";
  const subject = "Votre commande est livrée 🎉 — merci pour votre confiance";
  const text = [
    `Bonjour ${buyerName || "cher client"},`,
    "",
    `Votre commande « ${productName} » × ${safeQty} vient d'être livrée. Merci d'avoir choisi Mboppi !`,
    total ? `Montant : ${total} ${currency}` : "",
    "",
    "Suivre ma commande :",
    trackUrl,
    "",
    "Votre avis nous aide énormément 🙏",
    "⭐ Laisser un avis sur Trustpilot :",
    reviewUrl,
    "",
    "L'équipe Mboppi",
  ]
    .filter(Boolean)
    .join("\n");
  const html = `<!DOCTYPE html>
<html lang="fr">
<body style="margin:0;padding:0;background:#f8fafc;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width:520px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e2e8f0;">
          <tr>
            <td style="background:linear-gradient(135deg,#4f46e5,#7c3aed);padding:26px 28px;text-align:center;">
              <img src="${SITE_URL}/navbar-logo.png" alt="Mboppi" width="56" height="56" style="border-radius:12px;background:#fff;display:block;margin:0 auto 10px;"/>
              <div style="color:#fff;font-size:22px;font-weight:800;">Mboppi</div>
              <div style="color:#e0e7ff;font-size:13px;">Le marché de votre quartier en ligne</div>
            </td>
          </tr>
          <tr>
            <td style="padding:30px 28px;">
              <h1 style="margin:0 0 12px;font-size:19px;color:#0f172a;">Votre commande est livrée 🎉</h1>
              <p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#334155;">
                Bonjour ${safeBuyer}, votre commande <strong>${safeItem}</strong> × ${safeQty} vient d'être livrée.
                Merci d'avoir choisi Mboppi !
              </p>
              <p style="text-align:center;margin:22px 0;">
                <a href="${trackUrl}" style="display:inline-block;background:linear-gradient(135deg,#4f46e5,#7c3aed);color:#ffffff;text-decoration:none;font-size:15px;font-weight:700;padding:13px 30px;border-radius:10px;">Suivre ma commande</a>
              </p>
              <p style="margin:0 0 10px;font-size:14px;line-height:1.6;color:#334155;">
                Votre avis nous aide énormément 🙏 Prenez 30 secondes pour partager votre expérience :
              </p>
              <p style="text-align:center;margin:0 0 6px;">
                <a href="${reviewUrl}" style="display:inline-block;background:#00b67a;color:#ffffff;text-decoration:none;font-size:15px;font-weight:700;padding:12px 28px;border-radius:10px;">⭐ Laisser un avis sur Trustpilot</a>
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 28px;background:#f8fafc;font-size:11px;color:#94a3b8;text-align:center;">
              © ${new Date().getFullYear()} Mboppi · ${SITE_URL.replace(/^https?:\/\//, "")}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
  await sendMail({ to: dest, bcc: TRUSTPILOT_INVITE_EMAIL || undefined, subject, text, html });
}

export function verificationEmailHtml({ name, link }) {
  const safeName = String(name || "").replace(/[<>&]/g, "");
  return `<!DOCTYPE html>
<html lang="fr">
<body style="margin:0;padding:0;background:#f8fafc;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width:520px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e2e8f0;">
          <tr>
            <td style="background:linear-gradient(135deg,#4f46e5,#7c3aed);padding:26px 28px;text-align:center;">
              <img src="${SITE_URL}/navbar-logo.png" alt="Mboppi" width="56" height="56" style="border-radius:12px;background:#fff;display:block;margin:0 auto 10px;"/>
              <div style="color:#fff;font-size:22px;font-weight:800;">Mboppi</div>
              <div style="color:#e0e7ff;font-size:13px;">Le marché de votre quartier en ligne</div>
            </td>
          </tr>
          <tr>
            <td style="padding:30px 28px;">
              <h1 style="margin:0 0 12px;font-size:19px;color:#0f172a;">Bonjour ${safeName} 👋</h1>
              <p style="margin:0 0 18px;font-size:14px;line-height:1.6;color:#334155;">
                Bienvenue sur <strong>Mboppi</strong> ! Pour valider votre inscription et activer votre compte,
                confirmez votre adresse email en cliquant sur le bouton ci-dessous.
              </p>
              <p style="text-align:center;margin:24px 0;">
                <a href="${link}" style="display:inline-block;background:linear-gradient(135deg,#4f46e5,#7c3aed);color:#ffffff;text-decoration:none;font-size:15px;font-weight:700;padding:13px 30px;border-radius:10px;">Confirmer mon email</a>
              </p>
              <p style="margin:0 0 14px;font-size:13px;line-height:1.6;color:#64748b;">
                Ce lien est valable <strong>24 heures</strong>. Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur :
              </p>
              <p style="margin:0 0 18px;font-size:12px;word-break:break-all;color:#6366f1;background:#eef2ff;border-radius:8px;padding:10px 12px;">${link}</p>
              <p style="margin:0;font-size:12px;color:#94a3b8;">Si vous n'avez pas créé de compte, ignorez simplement cet email.</p>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 28px;background:#f8fafc;font-size:11px;color:#94a3b8;text-align:center;">
              © ${new Date().getFullYear()} Mboppi · ${SITE_URL.replace(/^https?:\/\//, "")}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function newsletterEmailHtml({ title, body, unsubscribeUrl }) {
  const safeTitle = String(title || "").replace(/[<>&]/g, "");
  const safeBody = String(body || "").replace(/[<>&]/g, "");
  return `<!DOCTYPE html>
<html lang="fr">
<body style="margin:0;padding:0;background:#f8fafc;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width:520px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e2e8f0;">
          <tr>
            <td style="background:linear-gradient(135deg,#4f46e5,#7c3aed);padding:26px 28px;text-align:center;">
              <img src="${SITE_URL}/navbar-logo.png" alt="Mboppi" width="56" height="56" style="border-radius:12px;background:#fff;display:block;margin:0 auto 10px;"/>
              <div style="color:#fff;font-size:22px;font-weight:800;">Mboppi</div>
              <div style="color:#e0e7ff;font-size:13px;">Le marché de votre quartier en ligne</div>
            </td>
          </tr>
          <tr>
            <td style="padding:30px 28px;">
              <h1 style="margin:0 0 16px;font-size:19px;color:#0f172a;">${safeTitle}</h1>
              <div style="margin:0;font-size:14px;line-height:1.7;color:#334155;white-space:pre-wrap;">${safeBody}</div>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 28px;background:#f8fafc;font-size:11px;color:#94a3b8;text-align:center;">
              Vous recevez cet email car vous êtes inscrit(e) à la newsletter Mboppi.<br/>
              <a href="${unsubscribeUrl}" style="color:#6366f1;text-decoration:underline;">Se désabonner</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
