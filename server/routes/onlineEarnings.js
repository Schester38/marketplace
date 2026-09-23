// Gains en ligne (produits digitaux payés via iKeePay) — consultation et
// retrait. L'argent est encaissé par la plateforme : le solde de chaque
// bénéficiaire (créateur, vendeur — y compris le parrain client, qui est un
// vendeur) vit dans `online_earnings` ; les demandes de retrait sont payées
// MANUELLEMENT par l'admin (même principe que les retraits d'activation).
import { Router } from "express";
import { q } from "../db.js";
import { authRequired, roleRequired } from "../auth.js";
import { sendWhatsAppSafe } from "../services/whatsapp.js";
import { notifyAdmins } from "../services/adminNotify.js";

const router = Router();

const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const MIN_WITHDRAWAL = 5000;
const UNIT = 1000;

// Solde disponible = total des gains − retraits en attente − retraits payés.
// Un retrait refusé rend automatiquement son montant disponible.
async function balanceOf(userId) {
  const [earn, wd] = await Promise.all([
    q(
      `SELECT COALESCE(SUM(amount), 0)::float AS total
         FROM online_earnings WHERE beneficiary_id = $1`,
      [userId]
    ),
    q(
      `SELECT COALESCE(SUM(amount), 0)::float AS locked
         FROM online_withdrawals
        WHERE user_id = $1 AND status IN ('pending', 'paid')`,
      [userId]
    ),
  ]);
  const total = Number(earn[0]?.total || 0);
  const locked = Number(wd[0]?.locked || 0);
  return {
    total: Math.round(total * 100) / 100,
    locked,
    available: Math.max(0, Math.round((total - locked) * 100) / 100),
  };
}

// POST /api/online-earnings — demande de retrait. Montant multiple de 1 000,
// ≥ 5 000 XAF et ≤ solde disponible. L'admin paie manuellement.
router.post(
  "/",
  authRequired,
  roleRequired("creator", "seller"),
  ah(async (req, res) => {
    const value = Math.round(Number(req.body?.amount));
    if (!Number.isFinite(value) || value < MIN_WITHDRAWAL) {
      return res.status(400).json({
        error: `Le retrait minimum est de ${MIN_WITHDRAWAL} XAF.`,
      });
    }
    if (value % UNIT !== 0) {
      return res.status(400).json({
        error: `Le montant doit être un multiple de ${UNIT} XAF.`,
      });
    }
    const { available } = await balanceOf(req.user.id);
    if (value > available) {
      return res.status(400).json({
        error: `Solde insuffisant : ${available} XAF disponibles.`,
      });
    }
    const pending = (
      await q(
        `SELECT id FROM online_withdrawals
          WHERE user_id = $1 AND status = 'pending' LIMIT 1`,
        [req.user.id]
      )
    )[0];
    if (pending) {
      return res
        .status(409)
        .json({ error: "Une demande de retrait est déjà en attente de paiement par l'administration." });
    }
    const payment_method = String(req.body?.payment_method || "").trim().slice(0, 60) || null;
    const payment_detail = String(req.body?.payment_detail || "").trim().slice(0, 300) || null;
    const user = (
      await q("SELECT name, role FROM users WHERE id = $1", [req.user.id])
    )[0];
    const created = (
      await q(
        `INSERT INTO online_withdrawals (user_id, amount, payment_method, payment_detail)
         VALUES ($1, $2, $3, $4) RETURNING id, amount, status, created_at`,
        [req.user.id, value, payment_method, payment_detail]
      )
    )[0];
    // Libellé adapté au demandeur : créateur = ventes de ses fichiers digitaux ;
    // vendeur = commissions sur ventes digitales.
    const who =
      user?.role === "creator"
        ? "gains sur ventes de fichiers digitaux"
        : "commissions sur ventes digitales";
    const whoLabel = user?.role === "creator" ? "Créateur" : "Vendeur";
    notifyAdmins({
      title: "Demande de retrait en ligne 💸",
      body: `${whoLabel} ${user?.name || ""} demande ${value} XAF (${who}).`,
      amount: value,
    });
    sendWhatsAppSafe(
      `🔔 MboppiShop — Nouvelle demande de retrait (gains en ligne)\n` +
        `👤 ${whoLabel} : ${user?.name || "?"}\n` +
        `💰 Montant : ${value.toLocaleString("fr-FR")} F (${who})\n` +
        (payment_method ? `💳 Moyen : ${payment_method}\n` : "") +
        (payment_detail ? `📱 Détail : ${payment_detail}\n` : "") +
        `➡️ Panneau Admin → Paiements → Retraits en ligne`
    ).catch(() => {});
    // Email de l'admin (non bloquant, même principe que les retraits
    // d'activation) : contenu adapté au demandeur.
    import("../services/whatsapp.js")
      .then((m) => m.getAdminNotifyEmail())
      .then((notifyEmail) => {
        if (!notifyEmail) return;
        return import("../mailer.js").then(({ sendMail }) =>
          sendMail({
            to: notifyEmail,
            subject: `MboppiShop — Demande de retrait en ligne : ${value.toLocaleString("fr-FR")} F`,
            text:
              `Nouvelle demande de retrait (gains en ligne)\n\n` +
              `${whoLabel} : ${user?.name || "?"}\n` +
              `Montant : ${value.toLocaleString("fr-FR")} F (${who})\n` +
              (payment_method ? `Moyen de paiement déclaré : ${payment_method}\n` : "") +
              (payment_detail ? `Détail : ${payment_detail}\n` : "") +
              `\nPanneau Admin → Paiements → Retraits en ligne pour marquer la demande « payée ».`,
          })
        );
      })
      .catch((err) => console.error("[online-earnings] email admin impossible :", err.message));
    res.json({
      ok: true,
      withdrawal: { ...created, amount: Number(created.amount) },
      available: available - value,
    });
  })
);

export default router;

// GET /api/online-earnings/me — solde + détail des gains + historique retraits.
router.get(
  "/me",
  authRequired,
  roleRequired("creator", "seller"),
  ah(async (req, res) => {
    const { total, locked, available } = await balanceOf(req.user.id);
    const [earnings, withdrawals] = await Promise.all([
      q(
        `SELECT e.id, e.sale_id, e.beneficiary_role, e.kind, e.amount, e.created_at,
                p.name AS product_name,
                (SELECT name FROM users b WHERE b.id = s.buyer_id) AS buyer_name,
                s.buyer_name AS buyer_label, s.paid_online_at
           FROM online_earnings e
           JOIN sales s ON s.id = e.sale_id
           JOIN products p ON p.id = s.product_id
          WHERE e.beneficiary_id = $1
          ORDER BY e.created_at DESC
          LIMIT 50`,
        [req.user.id]
      ),
      q(
        `SELECT id, amount, status, payment_method, payment_detail, created_at, paid_at
           FROM online_withdrawals WHERE user_id = $1
          ORDER BY created_at DESC LIMIT 30`,
        [req.user.id]
      ),
    ]);
    res.json({
      total,
      locked,
      available,
      min_amount: MIN_WITHDRAWAL,
      unit: UNIT,
      earnings: earnings.map((e) => ({
        ...e,
        amount: Number(e.amount),
        buyer: e.buyer_name || e.buyer_label || "Client",
      })),
      withdrawals: withdrawals.map((w) => ({ ...w, amount: Number(w.amount) })),
    });
  })
);
