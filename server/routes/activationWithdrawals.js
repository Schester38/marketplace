import { Router } from "express";
import { q, withTransaction } from "../db.js";
import { authRequired, roleRequired } from "../auth.js";
import { sendWhatsAppSafe } from "../services/whatsapp.js";

const router = Router();

const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const UNIT_COMMISSION = 1000;

// Base commune : tous les parrainés dont l'adhésion est payée (même avant la
// création des tables de retrait). Utilisée aussi en fallback si les tables
// `activation_withdrawals` n'existent pas encore en base (bascule progressive).
const BASE_SQL = `SELECT u.id, u.name, u.role, u.reference_number
   FROM users u
   WHERE u.referred_by = $1 AND u.role IN ('seller', 'creator')
     AND u.membership_paid_at IS NOT NULL`;

// Parrainés dont l'adhésion est payée et qui ne font partie d'aucune demande
// PAYÉE. Ils définissent le « solde disponible » affiché : tant que la demande
// est en attente, le montant reste visible et ne disparaît qu'au paiement par
// l'admin. Fallback : si les tables de retrait sont absentes, on affiche tous
// les parrainés payés (aucune demande n'a pu être créée de toute façon).
async function displayMembers(sellerId) {
  try {
    return await q(
      `${BASE_SQL}
         AND u.id NOT IN (
           SELECT wi.member_id FROM activation_withdrawal_items wi
           JOIN activation_withdrawals w ON w.id = wi.withdrawal_id
           WHERE w.seller_id = $1 AND w.status = 'paid'
         )
       ORDER BY u.created_at DESC`,
      [sellerId]
    );
  } catch (err) {
    console.error("[activation-withdrawals/me] tables absentes, fallback :", err.message);
    return q(`${BASE_SQL} ORDER BY u.created_at DESC`, [sellerId]);
  }
}

// Parrainés éligibles pour UNE NOUVELLE demande : exclut ceux déjà verrouillés
// par une demande en attente OU payée (pas de double retrait).
async function lockableMembers(sellerId) {
  try {
    return await q(
      `${BASE_SQL}
         AND u.id NOT IN (
           SELECT wi.member_id FROM activation_withdrawal_items wi
           JOIN activation_withdrawals w ON w.id = wi.withdrawal_id
           WHERE w.seller_id = $1
         )
       ORDER BY u.created_at DESC`,
      [sellerId]
    );
  } catch (err) {
    console.error("[activation-withdrawals/me] tables absentes, fallback lockable :", err.message);
    return q(`${BASE_SQL} ORDER BY u.created_at DESC`, [sellerId]);
  }
}

// Solde disponible + historique des demandes du vendeur courant.
router.get(
  "/me",
  authRequired,
  roleRequired("seller"),
  ah(async (req, res) => {
    let display = [];
    let lockable = [];
    let withdrawals = [];
    try {
      [display, lockable] = await Promise.all([
        displayMembers(req.user.id),
        lockableMembers(req.user.id),
      ]);
    } catch (err) {
      console.error("[activation-withdrawals/me] indisponible :", err.message);
    }
    try {
      withdrawals = await q(
        `SELECT id, amount, status, comment, email, created_at, paid_at
           FROM activation_withdrawals WHERE seller_id = $1
           ORDER BY created_at DESC`,
        [req.user.id]
      );
    } catch (err) {
      console.error("[activation-withdrawals/me] historique indisponible :", err.message);
    }
    res.json({
      available: (display || []).length * UNIT_COMMISSION,
      available_count: (display || []).length,
      min_amount: 5000,
      locked_by_pending: ((display || []).length - (lockable || []).length),
      withdrawals: (withdrawals || []).map((w) => ({
        ...w,
        amount: Number(w.amount),
        created_at: w.created_at,
        paid_at: w.paid_at,
      })),
    });
  })
);

// Crée une demande de retrait. Le montant doit être un multiple de 1 000,
// inférieur ou égal au solde disponible, et ≥ 5 000 F. L'email est obligatoire.
// Les parrainés correspondants sont verrouillés ; le montant ne disparaît du
// solde qu'au paiement par l'admin.
router.post(
  "/",
  authRequired,
  roleRequired("seller"),
  ah(async (req, res) => {
    const { amount, comment, email } = req.body || {};
    const cleanEmail = email ? String(email).trim().slice(0, 200) : "";
    if (!cleanEmail) {
      return res.status(400).json({ error: "L'email est obligatoire." });
    }
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) {
      return res.status(400).json({ error: "Montant invalide." });
    }
    // Le parrain doit avoir configuré ses moyens de paiement : l'admin en a
    // besoin pour lui transférer les fonds (l'email de notification les inclut).
    const pm = (
      await q(
        `SELECT wallets FROM seller_payment_methods WHERE seller_id = $1`,
        [req.user.id]
      )
    )[0];
    const hasWallets = Boolean(
      pm && Array.isArray(pm.wallets) && pm.wallets.length > 0
    );
    if (!hasWallets) {
      return res.status(400).json({
        error:
          "Configurez d'abord vos moyens de paiement (💳 Mes moyens de paiement) : l'administration en a besoin pour vous transférer vos fonds.",
        code: "PAYMENT_METHODS_REQUIRED",
      });
    }
    const members = await lockableMembers(req.user.id);
    const maxAvailable = members.length * UNIT_COMMISSION;
    if (maxAvailable < 5000) {
      return res
        .status(400)
        .json({ error: "Le montant minimum de retrait est de 5 000 F." });
    }
    if (value > maxAvailable) {
      return res
        .status(400)
        .json({
          error: "Le montant doit être inférieur ou égal à votre solde disponible.",
        });
    }
    if (value % UNIT_COMMISSION !== 0) {
      return res
        .status(400)
        .json({ error: "Le montant doit être un multiple de 1 000 F." });
    }
    const count = value / UNIT_COMMISSION;
    const toLock = members.slice(0, count);
    if (toLock.length !== count) {
      return res
        .status(400)
        .json({ error: "Solde insuffisant pour ce montant." });
    }
    // Index unique défensif : garantit qu'un parrainé ne peut figurer dans une
// seule demande, même si deux requêtes arrivent en même temps (double-clic,
// double POST) — la seconde transaction échoue et est annulée.
async function ensureUniqueMemberIndex() {
  try {
    await q(
      `CREATE UNIQUE INDEX IF NOT EXISTS uniq_activation_withdrawal_member
       ON activation_withdrawal_items (member_id)`
    );
  } catch (err) {
    // Dédoublonnage défensif si d'anciennes données violent l'unicité, puis
    // nouvelle tentative (l'index est la garantie de sécurité durable).
    if (err && err.code === "23505") {
      await q(
        `DELETE FROM activation_withdrawal_items a
         USING activation_withdrawal_items b
         WHERE a.member_id = b.member_id AND a.id > b.id`
      ).catch(() => {});
      await q(
        `CREATE UNIQUE INDEX IF NOT EXISTS uniq_activation_withdrawal_member
         ON activation_withdrawal_items (member_id)`
      ).catch(() => {});
      return;
    }
    // Table absente (initDb ne la crée pas) : les migrations externes la
    // fournissent — on ne bloque pas la demande, les INSERT la révéleront.
    if (!(err && err.code === "42P01")) {
      console.error("[withdrawals] index unique impossible :", err.message);
    }
  }
}

    const cleanComment = comment ? String(comment).trim().slice(0, 500) : null;
    await ensureUniqueMemberIndex();
    let created;
    try {
      created = await withTransaction(async (tx) => {
      const [w] = await tx.query(
        `INSERT INTO activation_withdrawals (seller_id, amount, comment, email)
         VALUES ($1, $2, $3, $4) RETURNING id`,
        [req.user.id, value, cleanComment, cleanEmail]
      );
      let locked = 0;
      for (const m of toLock) {
        const r = await tx.query(
          `INSERT INTO activation_withdrawal_items (withdrawal_id, member_id)
           VALUES ($1, $2)
           ON CONFLICT (member_id) DO NOTHING
           RETURNING member_id`,
          [w.id, m.id]
        );
        if (tx.queryResults && tx.queryResults(r) === 0) {
          // Le parrainé vient d'être verrouillé par une autre demande → on
          // annule TOUTE la demande (pas de doublon possible).
          throw new Error("MEMBER_ALREADY_LOCKED");
        }
        locked += 1;
      }
      if (locked !== count) {
        throw new Error("LOCK_MISMATCH");
      }
      return w;
      });
    } catch (err) {
      // Course critique : un autre double-clic a verrouillé un parrainé en
      // premier (violation de l'index unique) → la demande est annulée, aucune
      // duplication possible. On informe le vendeur clairement.
      const msg = String(err && err.message || "");
      if (
        msg.includes("MEMBER_ALREADY_LOCKED") ||
        msg.includes("LOCK_MISMATCH") ||
        msg.includes("uniq_activation_withdrawal_member") ||
        (err && err.code === "23505")
      ) {
        return res.status(409).json({
          error:
            "Une demande de retrait est déjà en cours avec ces parrainés. Attendez le traitement par l'administration.",
          code: "WITHDRAWAL_ALREADY_REQUESTED",
        });
      }
      throw err;
    }
    await q(
      `INSERT INTO notifications (user_id, type, amount) VALUES ($1, 'activation_withdrawal_requested', $2)`,
      [req.user.id, value]
    );
    // Notification WhatsApp de l'admin (non bloquante : ne peut jamais faire
    // échouer la demande, et répond avant l'envoi réel).
    const parrainName = req.user.name || "Vendeur";
    const parrainRef = req.user.reference_number || "—";
    // Moyens de paiement enregistrés par le parrain (transfert direct pour
    // payer le retrait) — mêmes données que la liste admin.
    const pmRow = (
      await q(
        `SELECT full_name, wallets FROM seller_payment_methods WHERE seller_id = $1`,
        [req.user.id]
      )
    )[0];
    const wallets = pmRow && Array.isArray(pmRow.wallets) ? pmRow.wallets : [];
    const pmLines = wallets.length
      ? `\nMoyens de paiement du parrain :\n` +
        `Titulaire : ${pmRow.full_name || "—"}\n` +
        wallets
          .map(
            (w, i) =>
              `${i + 1}. ${w && w.name ? w.name : "Wallet"} : ${
                w && w.value ? w.value : "—"
              }${w && w.primary ? " (principal)" : ""}`
          )
          .join("\n") +
        `\n`
      : `\nMoyens de paiement du parrain : aucun enregistré\n`;
    // Paramètres du template Cloud API : mêmes informations que l'email, portées
    // par des variables courtes pour respecter les limites Meta (< 128 car.) :
    //   {{1}} parrain · {{2}} montant · {{3}} parrainés · {{4}} email ·
    //   {{5}} commentaire · {{6}} titulaire · {{7}} wallet 1 · {{8}} wallet 2 ·
    //   {{9}} wallet 3
    const walletLines = wallets.map(
      (w, i) =>
        `${w && w.name ? w.name : "Wallet"} : ${w && w.value ? w.value : "—"}${
          w && w.primary ? " (principal)" : ""
        }`
    );
    const tmplParams = [
      `${parrainName} (${parrainRef})`,
      `${value.toLocaleString("fr-FR")} F`,
      `${count}`,
      cleanEmail,
      cleanComment || "—",
      (pmRow && pmRow.full_name) || "—",
      walletLines[0] || "—",
      walletLines[1] || "—",
      walletLines[2] || "—",
    ];
    sendWhatsAppSafe(
      `🔔 Mboppi — Nouvelle demande de retrait d'activation\n` +
        `👤 Parrain : ${parrainName} (${parrainRef})\n` +
        `💰 Montant : ${value.toLocaleString("fr-FR")} F\n` +
        `👥 Parrainés : ${count}\n` +
        `📧 Email : ${cleanEmail}\n` +
        (cleanComment ? `💬 Commentaire : ${cleanComment}\n` : "") +
        pmLines +
        `➡️ Panneau Admin → Retraits d'activation`,
      tmplParams
    );
    // Notification email de l'admin (non bloquante, parallèle à WhatsApp).
    import("../services/whatsapp.js")
      .then((m) => m.getAdminNotifyEmail())
      .then((notifyEmail) => {
        if (!notifyEmail) return;
        return import("../mailer.js").then(({ sendMail }) =>
          sendMail({
            to: notifyEmail,
            subject: `Mboppi — Demande de retrait d'activation : ${value.toLocaleString("fr-FR")} F`,
            text:
              `Nouvelle demande de retrait d'activation\n\n` +
              `Parrain : ${parrainName} (${parrainRef})\n` +
              `Montant : ${value.toLocaleString("fr-FR")} F\n` +
              `Parrainés payés : ${count}\n` +
              `Email du parrain : ${cleanEmail}\n` +
              (cleanComment ? `Commentaire : ${cleanComment}\n` : "") +
              pmLines +
              `\nPanneau Admin → Retraits d'activation pour marquer la demande « payée ».`,
          })
        );
      })
      .catch((err) => console.error("[withdrawal] notification email impossible :", err.message));
    res.json({ ok: true, id: created.id, amount: value });
  })
);

export default router;