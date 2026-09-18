// Générateur de documents (ebooks, guides, rapports, brochures…) — module
// isolé du reste du marketplace Mboppi. Réservé à l'administration (même
// garde que /api/admin : token admin). Toutes les tables sont ADDITIVES
// (préfixe gen_*) : aucune table métier (ventes, produits, paiements) n'est
// modifiée — le module ne peut pas affecter le reste de l'application.
//
// Endpoints (préfixe /api/generator) :
//   GET    /documents               → bibliothèque (sans le contenu lourd)
//   POST   /documents               → création (title, author, template_id, format…)
//   GET    /documents/:id           → document complet + contenu (docModel JSON)
//   PATCH  /documents/:id           → sauvegarde (autosave éditeur, renommage, design…)
//   POST   /documents/:id/duplicate → duplication complète (nouvelle référence)
//   POST   /documents/:id/versions  → instantané du contenu (restauration manuelle)
//   DELETE /documents/:id           → suppression (contenu + versions via CASCADE)
//
// Le contenu (docModel JSON de l'éditeur TipTap) vit dans gen_documents_data,
// séparé de la fiche bibliothèque pour que la liste reste légère. Chaque
// document reçoit une référence unique DOC-<année>-<8 hex> (doc_ref) utilisée
// pour la protection / vérification d'authenticité du PDF généré.

import crypto from "crypto";
import { Router } from "express";
import { q } from "../db.js";
import { authRequired, roleRequired } from "../auth.js";
import { logAudit } from "../security.js";

const router = Router();

const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// Taille max du contenu sérialisé : le corps des fonctions Vercel est limité
// à ~4,5 Mo — on garde une large marge (les images du document sont
// compressées côté client avant insertion).
const MAX_CONTENT_BYTES = 3.5 * 1024 * 1024;

// Garde-fous anti-injection dans le docModel : href uniquement http(s) (jamais
// javascript:), src uniquement data:image/* ou https.
function walkValidate(node) {
  if (node === null || node === undefined) return;
  if (Array.isArray(node)) {
    node.forEach((v) => walkValidate(v));
    return;
  }
  if (typeof node === "object") {
    for (const [k, v] of Object.entries(node)) {
      if ((k === "href" || k === "src") && typeof v === "string") {
        const ok =
          /^https?:\/\//i.test(v) ||
          (k === "src" && /^data:image\/(png|jpe?g|webp|gif);base64,/i.test(v));
        if (!ok) {
          const err = new Error("Valeur d'attribut non autorisée dans le document");
          err.status = 422;
          throw err;
        }
      }
      walkValidate(v);
    }
  }
}

function parseContent(raw) {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== "object" || Array.isArray(raw)) {
    const err = new Error("Contenu de document invalide");
    err.status = 422;
    throw err;
  }
  const size = Buffer.byteLength(JSON.stringify(raw) || "", "utf8");
  if (size > MAX_CONTENT_BYTES) {
    const err = new Error("Document trop volumineux (contenu limité à 3,5 Mo)");
    err.status = 413;
    throw err;
  }
  walkValidate(raw);
  return raw;
}

const FORMATS = new Set(["A4", "A5", "Letter", "ebook", "custom"]);
const ORIENTATIONS = new Set(["portrait", "landscape"]);

// Référence unique DOC-2026-XXXXXXXX (identité du document : vérification
// d'authenticité + QR code du PDF final).
function newDocRef() {
  const year = new Date().getFullYear();
  const rand = crypto.randomBytes(4).toString("hex").toUpperCase();
  return `DOC-${year}-${rand}`;
}

// Empreinte SHA-256 du contenu (intégrité — affichée dans le PDF).
function contentHash(content) {
  if (!content) return "";
  return crypto.createHash("sha256").update(JSON.stringify(content), "utf8").digest("hex");
}

function docRow(row) {
  return {
    id: row.id,
    doc_ref: row.doc_ref,
    owner_id: row.owner_id,
    title: row.title,
    subtitle: row.subtitle,
    author: row.author,
    status: row.status,
    page_format: row.page_format,
    page_width: row.page_width,
    page_height: row.page_height,
    orientation: row.orientation,
    margins: row.margins || {},
    template_id: row.template_id,
    style_overrides: row.style_overrides || {},
    cover: row.cover || {},
    back_cover: row.back_cover || {},
    protection: row.protection || {},
    content_hash: row.content_hash,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

const SELECT_DOC = `SELECT * FROM gen_documents WHERE id = $1`;

async function loadDoc(id) {
  if (!Number.isInteger(id) || id <= 0) {
    const err = new Error("Identifiant invalide");
    err.status = 400;
    throw err;
  }
  const row = (await q(SELECT_DOC, [id]))[0];
  if (!row) {
    const err = new Error("Document introuvable");
    err.status = 404;
    throw err;
  }
  return row;
}

router.use((req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});

router.use(authRequired, roleRequired("admin"));

// ─── Bibliothèque ────────────────────────────────────────────────────────────
router.get(
  "/documents",
  ah(async (req, res) => {
    const rows = await q(
      `SELECT d.*, (SELECT COUNT(*)::int FROM gen_versions v WHERE v.doc_id = d.id) AS versions
       FROM gen_documents d ORDER BY d.updated_at DESC LIMIT 500`
    );
    res.json({ documents: rows.map((r) => ({ ...docRow(r), versions: r.versions })) });
  })
);

router.post(
  "/documents",
  ah(async (req, res) => {
    const body = req.body || {};
    const title = String(body.title || "").trim().slice(0, 200) || "Sans titre";
    const subtitle = String(body.subtitle || "").trim().slice(0, 300);
    const author = String(body.author || "").trim().slice(0, 200);
    const templateId = String(body.template_id || "moderne").slice(0, 40);
    const format = FORMATS.has(body.page_format) ? body.page_format : "A4";
    const content = parseContent(body.content) || {
      type: "doc",
      content: [{ type: "paragraph" }],
    };
    const inserted = await q(
      `INSERT INTO gen_documents (owner_id, doc_ref, title, subtitle, author, page_format, template_id, content_hash)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [
        Number(req.user.id) || 0,
        newDocRef(),
        title,
        subtitle,
        author,
        format,
        templateId,
        contentHash(content),
      ]
    );
    await q(`INSERT INTO gen_documents_data (doc_id, content) VALUES ($1, $2::jsonb)`, [
      inserted[0].id,
      JSON.stringify(content),
    ]);
    logAudit(req.user.id, "generator.doc_created", inserted[0].doc_ref, req.ip);
    res.status(201).json({ document: docRow(inserted[0]), content });
  })
);

// ─── Document complet ────────────────────────────────────────────────────────
router.get(
  "/documents/:id",
  ah(async (req, res) => {
    const row = await loadDoc(Number(req.params.id));
    const data = (
      await q(`SELECT content FROM gen_documents_data WHERE doc_id = $1`, [row.id])
    )[0];
    const versions = await q(
      `SELECT id, label, created_at FROM gen_versions WHERE doc_id = $1 ORDER BY created_at DESC LIMIT 50`,
      [row.id]
    );
    res.json({
      document: docRow(row),
      content: data?.content || { type: "doc", content: [{ type: "paragraph" }] },
      versions,
    });
  })
);

// ─── Sauvegarde (autosave) : champs partiels autorisés ──────────────────────
router.patch(
  "/documents/:id",
  ah(async (req, res) => {
    const row = await loadDoc(Number(req.params.id));
    const body = req.body || {};
    const sets = [];
    const params = [];
    const push = (col, value, cast = "") => {
      params.push(value);
      sets.push(`${col} = $${params.length}${cast}`);
    };

    if (body.title !== undefined) push("title", String(body.title).trim().slice(0, 200) || "Sans titre");
    if (body.subtitle !== undefined) push("subtitle", String(body.subtitle).trim().slice(0, 300));
    if (body.author !== undefined) push("author", String(body.author).trim().slice(0, 200));
    if (body.status !== undefined) push("status", body.status === "ready" ? "ready" : "draft");
    if (body.page_format !== undefined && FORMATS.has(body.page_format)) push("page_format", body.page_format);
    if (body.orientation !== undefined && ORIENTATIONS.has(body.orientation)) push("orientation", body.orientation);
    if (body.template_id !== undefined) push("template_id", String(body.template_id).slice(0, 40));
    if (body.page_width !== undefined) {
      const w = Number(body.page_width);
      push("page_width", Number.isFinite(w) && w >= 60 && w <= 600 ? w : null);
    }
    if (body.page_height !== undefined) {
      const h = Number(body.page_height);
      push("page_height", Number.isFinite(h) && h >= 60 && h <= 900 ? h : null);
    }
    if (body.margins !== undefined) push("margins", JSON.stringify(body.margins || {}), "::jsonb");
    if (body.style_overrides !== undefined) push("style_overrides", JSON.stringify(body.style_overrides || {}), "::jsonb");
    if (body.cover !== undefined) push("cover", JSON.stringify(parseContent(body.cover) || {}), "::jsonb");
    if (body.back_cover !== undefined) push("back_cover", JSON.stringify(parseContent(body.back_cover) || {}), "::jsonb");
    if (body.protection !== undefined) push("protection", JSON.stringify(parseContent(body.protection) || {}), "::jsonb");

    // Contenu : mis à jour dans gen_documents_data + recalcul de l'empreinte.
    if (body.content !== undefined) {
      const content = parseContent(body.content);
      push("content_hash", contentHash(content));
      await q(
        `UPDATE gen_documents_data SET content = $2::jsonb, updated_at = now() WHERE doc_id = $1`,
        [row.id, JSON.stringify(content)]
      );
    }

    if (sets.length === 0) return res.json({ document: docRow(row), saved: false });

    sets.push(`updated_at = now()`);
    params.push(row.id);
    const updated = await q(
      `UPDATE gen_documents SET ${sets.join(", ")} WHERE id = $${params.length} RETURNING *`,
      params
    );
    res.json({ document: docRow(updated[0]), saved: true });
  })
);

// ─── Duplication : nouvelle référence, contenu copié tel quel ────────────────
router.post(
  "/documents/:id/duplicate",
  ah(async (req, res) => {
    const row = await loadDoc(Number(req.params.id));
    const inserted = await q(
      `INSERT INTO gen_documents (owner_id, doc_ref, title, subtitle, author, status, page_format,
                                  page_width, page_height, orientation, margins, template_id,
                                  style_overrides, cover, back_cover, protection, content_hash)
       SELECT $1, $2, title || ' (copie)', subtitle, author, 'draft', page_format,
              page_width, page_height, orientation, margins, template_id,
              style_overrides, cover, back_cover, protection, content_hash
       FROM gen_documents WHERE id = $3 RETURNING *`,
      [Number(req.user.id) || 0, newDocRef(), row.id]
    );
    await q(
      `INSERT INTO gen_documents_data (doc_id, content)
       SELECT $1, content FROM gen_documents_data WHERE doc_id = $2`,
      [inserted[0].id, row.id]
    );
    logAudit(req.user.id, "generator.doc_duplicated", inserted[0].doc_ref, req.ip);
    res.status(201).json({ document: docRow(inserted[0]) });
  })
);

// ─── Version (instantané du contenu) ─────────────────────────────────────────
router.post(
  "/documents/:id/versions",
  ah(async (req, res) => {
    const row = await loadDoc(Number(req.params.id));
    const label = String(req.body?.label || "").trim().slice(0, 100) || "Instantané";
    let content = parseContent(req.body?.content);
    if (content === null) {
      const data = (await q(`SELECT content FROM gen_documents_data WHERE doc_id = $1`, [row.id]))[0];
      if (!data) {
        const err = new Error("Aucun contenu à archiver");
        err.status = 422;
        throw err;
      }
      content = data.content;
    }
    await q(`INSERT INTO gen_versions (doc_id, label, content) VALUES ($1, $2, $3::jsonb)`, [
      row.id,
      label,
      JSON.stringify(content),
    ]);
    res.status(201).json({ ok: true });
  })
);

router.delete(
  "/documents/:id",
  ah(async (req, res) => {
    const row = await loadDoc(Number(req.params.id));
    await q(`DELETE FROM gen_documents WHERE id = $1`, [row.id]);
    logAudit(req.user.id, "generator.doc_deleted", row.doc_ref, req.ip);
    res.json({ ok: true });
  })
);

export default router;