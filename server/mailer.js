import nodemailer from 'nodemailer';

const SMTP_HOST = process.env.SMTP_HOST || '';
const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
const SMTP_SECURE = process.env.SMTP_SECURE === 'true';
const SMTP_USER = process.env.SMTP_USER || '';
const SMTP_PASS = process.env.SMTP_PASS || '';
const EMAIL_FROM = process.env.EMAIL_FROM || (SMTP_USER ? `Mboppi <${SMTP_USER}>` : 'Mboppi <noreply@mboppi.vercel.app>');

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

export async function sendMail({ to, subject, text, html }) {
  const tr = getTransporter();
  if (!tr) {
    console.log(`[mailer:simulé] → ${to}\nSujet: ${subject}\n${text}`);
    return { simulated: true };
  }
  try {
    const info = await tr.sendMail({ from: EMAIL_FROM, to, subject, text, html });
    return info;
  } catch (err) {
    console.error('[mailer] Erreur d\'envoi:', err.message);
    console.error('[mailer] Config:', JSON.stringify({ host: SMTP_HOST, port: SMTP_PORT, secure: SMTP_SECURE, user: SMTP_USER, numPassChars: SMTP_PASS.length }));
    throw err;
  }
}

export function verificationEmailHtml({ name, link }) {
  const safeName = String(name || '').replace(/[<>&]/g, '');
  return `<!DOCTYPE html>
<html lang="fr">
<body style="margin:0;padding:0;background:#f8fafc;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width:520px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e2e8f0;">
          <tr>
            <td style="background:linear-gradient(135deg,#4f46e5,#7c3aed);padding:26px 28px;text-align:center;">
              <img src="https://mboppi-mboppi.vercel.app/navbar-logo.png" alt="Mboppi" width="56" height="56" style="border-radius:12px;background:#fff;display:block;margin:0 auto 10px;"/>
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
              © ${new Date().getFullYear()} Mboppi · mboppi-mboppi.vercel.app
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}