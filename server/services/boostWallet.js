import crypto from "crypto";
import { q, withTransaction } from "../db.js";
import { roundMoney, normalizeCurrency, CURRENCY_DECIMALS } from "./fxRates.js";

export const BOOST_WALLET_REF_PREFIX = "MBP-WAL";
export const BOOST_MIN_TOPUP_USD = 1;
export const BOOST_MAX_TOPUP_USD = 5_000;
export const BOOST_MAX_ADMIN_CREDIT_USD = 10_000;

export class BoostWalletError extends Error {
  constructor(message, { statusCode = 400, code = "BOOST_WALLET_ERROR", details } = {}) {
    super(message);
    this.name = "BoostWalletError";
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export function isBoostWalletReference(reference) {
  return new RegExp(`^${BOOST_WALLET_REF_PREFIX}-[A-Z0-9-]+$`, "i").test(String(reference || ""));
}

export function generateBoostWalletReference() {
  const stamp = Date.now().toString(36).toUpperCase();
  const random = crypto.randomBytes(5).toString("hex").toUpperCase();
  return `${BOOST_WALLET_REF_PREFIX}-${stamp}-${random}`;
}

export function amountTolerance(currency) {
  const decimals = CURRENCY_DECIMALS[normalizeCurrency(currency)] ?? 2;
  return decimals === 0 ? 1 : 0.01;
}

export function amountsMatch(expected, received, currency) {
  const a = Number(expected);
  const b = Number(received);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  return Math.abs(a - b) <= amountTolerance(currency);
}

async function ensureWalletTx(tx, userId) {
  await tx.query(
    `INSERT INTO boost_wallets (user_id, balance_usd)
     VALUES ($1, 0)
     ON CONFLICT (user_id) DO NOTHING`,
    [userId]
  );
}

export async function ensureBoostWallet(userId) {
  await q(
    `INSERT INTO boost_wallets (user_id, balance_usd)
     VALUES ($1, 0)
     ON CONFLICT (user_id) DO NOTHING`,
    [userId]
  );
}

export async function getBoostWallet(userId) {
  await ensureBoostWallet(userId);
  const [wallet] = await q(
    `SELECT user_id, balance_usd, created_at, updated_at FROM boost_wallets WHERE user_id = $1`,
    [userId]
  );
  return {
    user_id: wallet.user_id,
    balance_usd: roundMoney(wallet.balance_usd, "USD"),
    created_at: wallet.created_at,
    updated_at: wallet.updated_at,
  };
}

export async function listBoostWalletTransactions(userId, limit = 50) {
  const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 200);
  return q(
    `SELECT id, user_id, amount_usd, balance_after_usd, transaction_type,
            reference_type, reference_id, description, created_by, created_at
       FROM boost_wallet_transactions
      WHERE user_id = $1
      ORDER BY created_at DESC, id DESC
      LIMIT $2`,
    [userId, safeLimit]
  );
}

export async function getBoostWalletSummary(userId, limit = 50) {
  const wallet = await getBoostWallet(userId);
  const transactions = await listBoostWalletTransactions(userId, limit);
  return {
    ...wallet,
    transactions: transactions.map((row) => ({
      ...row,
      amount_usd: roundMoney(row.amount_usd, "USD"),
      balance_after_usd: roundMoney(row.balance_after_usd, "USD"),
    })),
  };
}

export async function creditBoostWalletTx(
  tx,
  { userId, amountUsd, transactionType, referenceType, referenceId, description, createdBy = null }
) {
  const amount = roundMoney(amountUsd, "USD");
  if (!(amount > 0)) {
    throw new BoostWalletError("Le montant du crédit doit être positif.", {
      code: "INVALID_WALLET_AMOUNT",
    });
  }
  await ensureWalletTx(tx, userId);
  const [wallet] = await tx.query(
    `SELECT balance_usd FROM boost_wallets WHERE user_id = $1 FOR UPDATE`,
    [userId]
  );
  if (!wallet) {
    throw new BoostWalletError("Portefeuille introuvable.", {
      statusCode: 404,
      code: "BOOST_WALLET_NOT_FOUND",
    });
  }
  const balanceAfter = roundMoney(Number(wallet.balance_usd) + amount, "USD");
  await tx.query(
    `UPDATE boost_wallets SET balance_usd = $2, updated_at = now() WHERE user_id = $1`,
    [userId, balanceAfter]
  );
  const [transaction] = await tx.query(
    `INSERT INTO boost_wallet_transactions
       (user_id, amount_usd, balance_after_usd, transaction_type,
        reference_type, reference_id, description, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [
      userId,
      amount,
      balanceAfter,
      transactionType,
      referenceType || null,
      referenceId != null ? String(referenceId) : null,
      description || null,
      createdBy || null,
    ]
  );
  return { transaction, balance_usd: balanceAfter };
}

export async function debitBoostWalletTx(
  tx,
  { userId, amountUsd, referenceType, referenceId, description }
) {
  const amount = roundMoney(amountUsd, "USD");
  if (!(amount > 0)) {
    throw new BoostWalletError("Le montant du débit doit être positif.", {
      code: "INVALID_WALLET_AMOUNT",
    });
  }
  await ensureWalletTx(tx, userId);
  const [wallet] = await tx.query(
    `SELECT balance_usd FROM boost_wallets WHERE user_id = $1 FOR UPDATE`,
    [userId]
  );
  const balance = Number(wallet?.balance_usd || 0);
  if (balance + 0.001 < amount) {
    throw new BoostWalletError("Solde Boost insuffisant.", {
      statusCode: 402,
      code: "INSUFFICIENT_BOOST_FUNDS",
      details: { balance_usd: roundMoney(balance, "USD"), required_usd: amount },
    });
  }
  const balanceAfter = roundMoney(balance - amount, "USD");
  await tx.query(
    `UPDATE boost_wallets SET balance_usd = $2, updated_at = now() WHERE user_id = $1`,
    [userId, balanceAfter]
  );
  const [transaction] = await tx.query(
    `INSERT INTO boost_wallet_transactions
       (user_id, amount_usd, balance_after_usd, transaction_type,
        reference_type, reference_id, description)
     VALUES ($1, $2, $3, 'order_payment', $4, $5, $6)
     RETURNING *`,
    [
      userId,
      -amount,
      balanceAfter,
      referenceType || null,
      referenceId != null ? String(referenceId) : null,
      description || null,
    ]
  );
  return { transaction, balance_usd: balanceAfter };
}

export async function createBoostWalletTopup({ userId, amount, currency, fxRate, creditUsd }) {
  const code = normalizeCurrency(currency);
  const reference = generateBoostWalletReference();
  const [row] = await q(
    `INSERT INTO boost_wallet_topups
       (user_id, external_reference, amount, currency, fx_rate, credit_usd, status)
     VALUES ($1, $2, $3, $4, $5, $6, 'pending')
     RETURNING *`,
    [userId, reference, roundMoney(amount, code), code, Number(fxRate), roundMoney(creditUsd, "USD")]
  );
  return row;
}

export async function getBoostWalletTopup(userId, reference) {
  const [row] = await q(
    `SELECT * FROM boost_wallet_topups WHERE external_reference = $1 AND user_id = $2`,
    [reference, userId]
  );
  return row || null;
}

export async function getBoostWalletTopupByReference(reference) {
  const [row] = await q(
    `SELECT * FROM boost_wallet_topups WHERE external_reference = $1`,
    [reference]
  );
  return row || null;
}

export async function confirmBoostWalletTopup({
  reference,
  amount,
  currency,
  providerReference = null,
}) {
  return withTransaction(async (tx) => {
    const [topup] = await tx.query(
      `SELECT * FROM boost_wallet_topups WHERE external_reference = $1 FOR UPDATE`,
      [reference]
    );
    if (!topup) {
      return { ok: false, reason: "not_found", reference };
    }
    if (topup.status === "completed") {
      return {
        ok: true,
        duplicate: true,
        topup,
        balance_usd: null,
      };
    }
    if (topup.status === "failed") {
      return { ok: false, reason: "failed", topup };
    }
    if (amount != null && !amountsMatch(topup.amount, amount, topup.currency)) {
      return {
        ok: false,
        reason: "amount_mismatch",
        topup,
        expected_amount: Number(topup.amount),
        received_amount: Number(amount),
      };
    }
    if (currency && normalizeCurrency(currency) !== normalizeCurrency(topup.currency)) {
      return {
        ok: false,
        reason: "currency_mismatch",
        topup,
        expected_currency: topup.currency,
        received_currency: normalizeCurrency(currency),
      };
    }
    const [completed] = await tx.query(
      `UPDATE boost_wallet_topups
          SET status = 'completed',
              provider_reference = COALESCE($2, provider_reference),
              completed_at = now()
        WHERE id = $1 AND status IN ('pending', 'expired')
        RETURNING *`,
      [topup.id, providerReference || null]
    );
    if (!completed) {
      const [current] = await tx.query(
        `SELECT * FROM boost_wallet_topups WHERE id = $1`,
        [topup.id]
      );
      if (current?.status === "completed") {
        return { ok: true, duplicate: true, topup: current, balance_usd: null };
      }
      return { ok: false, reason: "not_creditable", topup: current || topup };
    }
    const credit = await creditBoostWalletTx(tx, {
      userId: completed.user_id,
      amountUsd: completed.credit_usd,
      transactionType: "topup",
      referenceType: "boost_wallet_topup",
      referenceId: completed.id,
      description: `Recharge ${Number(completed.amount)} ${completed.currency}`,
    });
    return {
      ok: true,
      duplicate: false,
      topup: completed,
      balance_usd: credit.balance_usd,
      transaction: credit.transaction,
    };
  });
}

export async function adminCreditBoostWallet({
  userId,
  amountUsd,
  note,
  createdBy = null,
  transactionType = "admin_credit",
}) {
  const amount = roundMoney(amountUsd, "USD");
  if (!(amount > 0) || amount > BOOST_MAX_ADMIN_CREDIT_USD) {
    throw new BoostWalletError(
      `Le montant doit être compris entre 0,01 et ${BOOST_MAX_ADMIN_CREDIT_USD} USD.`,
      { code: "INVALID_WALLET_AMOUNT" }
    );
  }
  if (!["admin_credit", "refund", "adjustment"].includes(transactionType)) {
    throw new BoostWalletError("Type de crédit administrateur invalide.", {
      code: "INVALID_WALLET_TYPE",
    });
  }
  return withTransaction(async (tx) => {
    const [user] = await tx.query(`SELECT id FROM users WHERE id = $1`, [userId]);
    if (!user) {
      throw new BoostWalletError("Utilisateur introuvable.", {
        statusCode: 404,
        code: "USER_NOT_FOUND",
      });
    }
    return creditBoostWalletTx(tx, {
      userId,
      amountUsd: amount,
      transactionType,
      referenceType: "admin_credit",
      referenceId: `${Date.now()}-${crypto.randomBytes(4).toString("hex")}`,
      description: note || "Crédit administrateur",
      createdBy,
    });
  });
}
