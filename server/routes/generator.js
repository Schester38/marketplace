// Générateur de documents (ebooks, guides, rapports, brochures…) — module
// isolé du reste du marketplace MboppiShop. Accessible à l'administration (token
// admin) ET aux CRÉATEURS (jeton utilisateur) : chacun ne voit alors QUE ses
// propres documents (portée par owner_id), et la publication crée le produit
// digital sous SON compte (resolveOwnerId). Toutes les tables sont ADDITIVES
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
import { askAI } from "./chat.js";
import { defaultCurrencyFor, validCurrency } from "../currency.js";
import {
  createDigitalUploadUrl,
  digitalObjectKey,
  digitalObjectMeta,
  digitalObjectExists,
  deleteDigitalFile,
  collectStorageKeys,
  deleteStorageKeys,
  DIGITAL_MAX_BYTES,
  DIGITAL_EXT_ALLOWED,
  safeFileExt,
  uploadPhoto,
} from "../storage.js";

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
          err.statusCode = 422;
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
    err.statusCode = 422;
    throw err;
  }
  const size = Buffer.byteLength(JSON.stringify(raw) || "", "utf8");
  if (size > MAX_CONTENT_BYTES) {
    const err = new Error("Document trop volumineux (contenu limité à 3,5 Mo)");
    err.statusCode = 413;
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

const DOC_META_FIELDS = [
  "id", "doc_ref", "owner_id", "title", "subtitle", "author", "status",
  "page_format", "page_width", "page_height", "orientation", "margins",
  "template_id", "style_overrides", "cover", "back_cover", "protection",
  "content_hash", "published_product_id", "created_at", "updated_at",
];
const DOC_META_SELECT = DOC_META_FIELDS.join(", ");
const DOC_META_SELECT_D = DOC_META_FIELDS.map((field) => `d.${field}`).join(", ");

function docRow(row, { includeLayout = false } = {}) {
  const out = {
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
    published_product_id: row.published_product_id || null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
  // Le layout peut peser plusieurs mégaoctets. Il n'est chargé que lorsqu'un
  // document est ouvert explicitement, jamais par la bibliothèque ou l'autosave.
  if (includeLayout) out.page_layout = row.page_layout || null;
  return out;
}

const SELECT_DOC = `SELECT ${DOC_META_SELECT}, page_layout FROM gen_documents WHERE id = $1`;
const SELECT_DOC_META = `SELECT ${DOC_META_SELECT} FROM gen_documents WHERE id = $1`;

// `req` (optionnel) active la PORTÉE multi-utilisateur : l'admin voit tous les
// documents, un créateur uniquement les siens (les autres répondent 404 — on
// ne révèle pas leur existence).
async function loadDoc(id, req = null, { includeLayout = false } = {}) {
  if (!Number.isInteger(id) || id <= 0) {
    const err = new Error("Identifiant invalide");
    err.statusCode = 400;
    throw err;
  }
  const row = (await q(includeLayout ? SELECT_DOC : SELECT_DOC_META, [id]))[0];
  const mine = row && Number(row.owner_id) === Number(req?.user?.id);
  if (!row || (req && req.user?.role !== "admin" && !mine)) {
    const err = new Error("Document introuvable");
    err.statusCode = 404;
    throw err;
  }
  return row;
}

const isAdminReq = (req) => req.user?.role === "admin";

// Catégories proposées à la publication d'un produit digital (miroir de
// DIGITAL_CATEGORIES côté client, client/src/config.js) : toute autre valeur
// retombe sur « Digital » — jamais de catégorie arbitraire en base.
const PUBLISH_CATEGORIES = new Set([
  "Digital",
  "IA & Technologies",
  "Éducation & Formation",
  "Développement personnel",
  "Religion & Spiritualité",
  "Business & Entrepreneuriat",
  "Finance & Investissement",
  "Santé & Bien-être",
  "Langues",
  "Cuisine & Recettes",
  "Informatique & Programmation",
  "Art & Culture",
  "Roman & Fiction",
  "Parentalité & Famille",
  "Voyage & Guides pratiques",
]);

// Propriétaire réel d'un produit publié. L'admin « virtuel » (mot de passe
// admin, id 0) n'existe pas dans la table users — or products.shop_id porte
// une clé étrangère vers users(id) : publier avec l'id 0 échouerait en 500.
// On utilise donc le vrai compte d'administration (rôle admin) quand il
// existe ; sinon on explique précisément quoi faire (message clair, pas
// d'erreur technique).
async function resolveOwnerId(req) {
  const uid = Number(req.user?.id);
  if (Number.isInteger(uid) && uid > 0) return uid;
  const admin = (await q(`SELECT id FROM users WHERE role = 'admin' ORDER BY id ASC LIMIT 1`))[0];
  if (admin) return admin.id;
  const err = new Error(
    "La publication nécessite un compte réel : créez d'abord le compte administrateur (Admin → onglet Vue d'ensemble → 👤 Compte administrateur), puis reconnectez-vous avec."
  );
  err.statusCode = 422;
  throw err;
}

// ─── Vérification PUBLIQUE d'authenticité (QR code encodé dans le PDF) ───────
// Montée AVANT la garde admin : le QR de chaque document pointe vers la page
// publique /verifier/<référence> qui interroge cet endpoint. Informations NON
// sensibles uniquement (jamais le contenu) ; empreinte TRONQUÉE.
router.get("/verify/:ref", ah(async (req, res) => {
  const ref = String(req.params.ref || "").trim().toUpperCase().slice(0, 40);
  if (!/^DOC-\d{4}-[0-9A-F]{8}$/.test(ref)) {
    return res.status(400).json({ verified: false, error: "Référence invalide (format attendu : DOC-2026-XXXXXXXX)." });
  }
  const row = (await q(
    `SELECT doc_ref, title, subtitle, author, status, content_hash, created_at, updated_at
       FROM gen_documents WHERE UPPER(doc_ref) = $1`,
    [ref]
  ))[0];
  if (!row) {
    return res.status(404).json({
      verified: false,
      doc_ref: ref,
      error: "Aucun document MboppiShop ne correspond à cette référence. Un document d'origine incertaine ne doit pas être considéré comme authentique.",
    });
  }
  res.set("Cache-Control", "public, max-age=60");
  res.json({
    verified: true,
    doc_ref: row.doc_ref,
    title: row.title,
    subtitle: row.subtitle,
    author: row.author,
    status: row.status,
    created_at: row.created_at,
    updated_at: row.updated_at,
    hash: String(row.content_hash || "").slice(0, 16),
  });
}));

router.use((req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});

// Garde commune : admin (panneau) ou créateur (page /generateur). Le rôle
// `roleRequired` applique aussi le blocage d'adhésion aux créateurs.
router.use(authRequired, roleRequired("admin", "creator"));

// ─── Bibliothèque ────────────────────────────────────────────────────────────
router.get(
  "/documents",
  ah(async (req, res) => {
    // Portée : l'admin voit tout, un créateur uniquement SA bibliothèque.
    const rows = isAdminReq(req)
      ? await q(
          `SELECT ${DOC_META_SELECT_D}, (SELECT COUNT(*)::int FROM gen_versions v WHERE v.doc_id = d.id) AS versions
           FROM gen_documents d ORDER BY d.updated_at DESC LIMIT 500`
        )
      : await q(
          `SELECT ${DOC_META_SELECT_D}, (SELECT COUNT(*)::int FROM gen_versions v WHERE v.doc_id = d.id) AS versions
           FROM gen_documents d WHERE d.owner_id = $1 ORDER BY d.updated_at DESC LIMIT 500`,
          [Number(req.user.id)]
        );
    res.json({ documents: rows.map((r) => ({ ...docRow(r, { includeLayout: false }), versions: r.versions })) });
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
    const row = await loadDoc(Number(req.params.id), req, { includeLayout: true });
    const data = (
      await q(`SELECT content FROM gen_documents_data WHERE doc_id = $1`, [row.id])
    )[0];
    const versions = await q(
      `SELECT id, label, created_at FROM gen_versions WHERE doc_id = $1 ORDER BY created_at DESC LIMIT 50`,
      [row.id]
    );
    res.json({
      document: docRow(row, { includeLayout: true }),
      content: data?.content || { type: "doc", content: [{ type: "paragraph" }] },
      versions,
    });
  })
);

// ─── Sauvegarde (autosave) : champs partiels autorisés ──────────────────────
router.patch(
  "/documents/:id",
  ah(async (req, res) => {
    // L'autosave n'a besoin que des métadonnées pour vérifier la portée. Le
    // layout est déjà détenu par le client et ne doit pas être relu depuis
    // PostgreSQL à chaque frappe (il peut représenter plusieurs mégaoctets).
    const row = await loadDoc(Number(req.params.id), req, { includeLayout: false });
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

    // Modèle du Studio (page par page) : enveloppe { version, pages:[…] }.
    // Garde-fou de taille (le modèle reste un JSON structuré, jamais une image
    // aplatie) : 2 Mo ≈ un document de plusieurs centaines de pages.
    if (body.page_layout !== undefined) {
      const layout = body.page_layout;
      if (layout === null) {
        push("page_layout", null);
      } else if (layout && typeof layout === "object" && Array.isArray(layout.pages)) {
        const raw = JSON.stringify(layout);
        if (raw.length > 2 * 1024 * 1024) {
          const err = new Error("Modèle du Studio trop volumineux (2 Mo maximum)");
          err.statusCode = 413;
          throw err;
        }
        push("page_layout", raw, "::jsonb");
      } else {
        const err = new Error("Modèle du Studio invalide");
        err.statusCode = 422;
        throw err;
      }
    }

    // Contenu : mis à jour dans gen_documents_data + recalcul de l'empreinte.
    if (body.content !== undefined) {
      const content = parseContent(body.content);
      push("content_hash", contentHash(content));
      await q(
        `UPDATE gen_documents_data SET content = $2::jsonb, updated_at = now() WHERE doc_id = $1`,
        [row.id, JSON.stringify(content)]
      );
    }

    if (sets.length === 0) {
      return res.json({ document: docRow(row, { includeLayout: false }), saved: false });
    }

    sets.push(`updated_at = now()`);
    params.push(row.id);
    // RETURNING exclut volontairement page_layout : le client conserve sa copie
    // locale exacte. Evite de faire sortir plusieurs Mo de PostgreSQL à chaque
    // sauvegarde, tout en renvoyant les métadonnées，轻à jour.
    const updated = await q(
      `UPDATE gen_documents SET ${sets.join(", ")} WHERE id = $${params.length}
       RETURNING ${DOC_META_SELECT}`,
      params
    );
    res.json({ document: docRow(updated[0], { includeLayout: false }), saved: true });
  })
);

// ─── Duplication : nouvelle référence, contenu copié tel quel ────────────────
router.post(
  "/documents/:id/duplicate",
  ah(async (req, res) => {
    const row = await loadDoc(Number(req.params.id), req);
    const inserted = await q(
      `INSERT INTO gen_documents (owner_id, doc_ref, title, subtitle, author, status, page_format,
                                  page_width, page_height, orientation, margins, template_id,
                                  style_overrides, cover, back_cover, protection, content_hash)
       SELECT $1, $2, title || ' (copie)', subtitle, author, 'draft', page_format,
              page_width, page_height, orientation, margins, template_id,
              style_overrides, cover, back_cover, protection, content_hash,
              page_layout
       FROM gen_documents WHERE id = $3 RETURNING ${DOC_META_SELECT}`,
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
    const row = await loadDoc(Number(req.params.id), req);
    const label = String(req.body?.label || "").trim().slice(0, 100) || "Instantané";
    let content = parseContent(req.body?.content);
    if (content === null) {
      const data = (await q(`SELECT content FROM gen_documents_data WHERE doc_id = $1`, [row.id]))[0];
      if (!data) {
        const err = new Error("Aucun contenu à archiver");
        err.statusCode = 422;
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
    const row = await loadDoc(Number(req.params.id), req);
    await q(`DELETE FROM gen_documents WHERE id = $1`, [row.id]);
    logAudit(req.user.id, "generator.doc_deleted", row.doc_ref, req.ip);
    res.json({ ok: true });
  })
);

// ─── Versions : restauration et suppression d'un instantané ──────────────────
router.post(
  "/documents/:id/versions/:vid/restore",
  ah(async (req, res) => {
    const row = await loadDoc(Number(req.params.id), req);
    const vid = Number(req.params.vid);
    const version = (
      await q(`SELECT id, label, content FROM gen_versions WHERE id = $1 AND doc_id = $2`, [
        Number.isInteger(vid) && vid > 0 ? vid : 0,
        row.id,
      ])
    )[0];
    if (!version) {
      const err = new Error("Version introuvable");
      err.statusCode = 404;
      throw err;
    }
    // Sécurité : le contenu restauré doit rester conforme (taille + liens).
    const content = parseContent(version.content);
    await q(
      `UPDATE gen_documents_data SET content = $2::jsonb, updated_at = now() WHERE doc_id = $1`,
      [row.id, JSON.stringify(content)]
    );
    const updated = await q(
      `UPDATE gen_documents SET content_hash = $2, updated_at = now()
       WHERE id = $1 RETURNING ${DOC_META_SELECT}`,
      [row.id, contentHash(content)]
    );
    logAudit(req.user.id, "generator.version_restored", `${row.doc_ref} #${version.id}`, req.ip);
    res.json({ document: docRow(updated[0]), content });
  })
);

router.delete(
  "/documents/:id/versions/:vid",
  ah(async (req, res) => {
    const row = await loadDoc(Number(req.params.id), req);
    await q(`DELETE FROM gen_versions WHERE id = $1 AND doc_id = $2`, [
      Number(req.params.vid) || 0,
      row.id,
    ]);
    res.json({ ok: true });
  })
);

// ═════════════════════════════════════════════════════════════════════════════
// ASSISTANT IA (Gemini) — même moteur que le chat 💬 du site (askAI de chat.js).
// L'IA ne modifie JAMAIS le document : elle renvoie du texte que l'utilisateur
// relit, modifie puis insère lui-même (l'utilisateur reste maître du résultat).
// ═════════════════════════════════════════════════════════════════════════════

const AI_MAX_INPUT = 4000; // limite du PASSAGE sélectionné (l'appel askAI
// reçoit maxInputChars: 8000 — instruction + contexte + passage tiennent tous).
const AI_TEMPLATE_IDS = [
  "minimal", "moderne", "elegant", "professionnel", "business", "education",
  "motivation", "finance", "technologie", "luxe", "jeunesse", "magazine",
  // Bibliothèque étendue (doit refléter GEN_TEMPLATES côté client).
  "corporate", "catalogue", "roman", "spirituel",
  "sante", "cuisine", "voyage", "academique",
];

// Chaque action = { instruction } ; le résultat est du TEXTE BRUT (Markdown
// léger pour `structure`/`outline`, relu puis inséré par le client).
const AI_ACTIONS = {
  structure: {
    instruction:
      "Tu es un éditeur professionnel. Structure le texte fourni en document éditable : " +
      "place un titre de chapitre en début de ligne précédé de « # » (un seul par section principale), " +
      "les sous-sections avec « ## », les listes avec « - », les citations avec « > ». " +
      "Ne change AUCUN mot du texte : tu ajoutes seulement les marqueurs de structure. " +
      "Réponds uniquement par le texte structuré, sans commentaire ni bloc de code.",
  },
  outline: {
    instruction:
      "Tu es un éditeur professionnel. Rédige le PLAN détaillé d'un document sur le sujet fourni, " +
      "adapté au public africain francophone. Un titre de chapitre par ligne préfixé de « # », " +
      "des sous-parties préfixées de « ## ». Réponds uniquement par le plan, sans commentaire.",
  },
  improve: {
    instruction:
      "Tu es un éditeur professionnel. Améliore le passage fourni : style, fluidité, richesse du vocabulaire, " +
      "clarté. Conserve le sens, la langue et la longueur approximative. Réponds uniquement par le texte amélioré.",
  },
  correct: {
    instruction:
      "Corrige l'orthographe, la grammaire et la ponctuation du passage fourni, sans en changer le style. " +
      "Réponds uniquement par le texte corrigé.",
  },
  rephrase: {
    instruction:
      "Reformule le passage fourni autrement, avec le même sens et un style naturel. " +
      "Réponds uniquement par le texte reformulé.",
  },
  summarize: {
    instruction:
      "Résume le passage fourni en un paragraphe dense d'une centaine de mots maximum. " +
      "Réponds uniquement par le résumé.",
  },
  expand: {
    instruction:
      "Développe le passage fourni : ajoute des exemples concrets, des explications et des transitions, " +
      "en conservant le ton et la langue. Réponds uniquement par le texte développé.",
  },
  tone: {
    instruction:
      "Réécris le passage fourni dans le ton demandé (simple, professionnel, inspirant ou pédagogique). " +
      "Réponds uniquement par le texte réécrit.",
  },
  titles: {
    instruction:
      "Propose 5 titres accrocheurs pour le document décrit (un par ligne, sans numérotation, sans commentaire).",
  },
  blurb: {
    instruction:
      "Rédige la quatrième de couverture du document décrit : 90 à 130 mots, accrocheur, orienté bénéfice lecteur, " +
      "terminé par un appel à l'action. Réponds uniquement par ce texte.",
  },
  bio: {
    instruction:
      "Rédige une courte biographie d'auteur (60 à 90 mots) au nom de l'auteur indiqué, dans un style sobre et crédible. " +
      "Réponds uniquement par la biographie.",
  },
  description: {
    instruction:
      "Rédige une description courte et captivating pour la fiche catalogue de ce document, en 2 à 4 phrases (35 à 60 mots maximum). " +
      "Présente le sujet, la promesse ou l'intérêt principal pour le lecteur, avec un ton clair, percutant et Professionnel. " +
      "Ne cite pas le titre comme un slogan, n'invente aucun fait absent du texte et n'ajoute ni hashtag ni liste. " +
      "Réponds uniquement par la description, sans commentaire ni bloc de code.",
  },
  translate: {
    instruction:
      "Traduis fidèlement le passage fourni dans la langue demandée, en conservant le formatage. " +
      "Réponds uniquement par la traduction.",
  },
  // Text-to-Book : plan de livre complet généré à partir d'une simple consigne
  // (sujet, audience, longueur). Renvoie du Markdown (« # » = chapitres) que le
  // client convertit en document structuré via le détecteur de structure.
  book_plan: {
    instruction:
      "Tu es un auteur professionnel. À partir de la consigne fournie (sujet, public, longueur approximative), " +
      "rédige le PLAN COMPLET d'un ebook : une introduction, 6 à 12 chapitres avec 2 à 4 sous-sections chacun " +
      "(« # » pour les chapitres, « ## » pour les sous-sections) et une conclusion. " +
      "Chaque sous-section est suivie de 2 ou 3 phrases résumant ce qu'elle contiendra. " +
      "Public : lecteurs africains francophones. Réponds uniquement par le plan, sans commentaire.",
  },
  // Rédaction d'un CHAPITRE entier à partir de son titre (utilisé après un
  // book_plan). Résultat inséré en fin de document par l'utilisateur.
  write_chapter: {
    instruction:
      "Tu es un auteur professionnel. Rédige le CHAPITRE complet correspondant au titre (ou thème) fourni, " +
      "dans le contexte du document décrit. Structure : titre du chapitre en « # », 2 à 4 sous-sections en « ## », " +
      "paragraphes denses et concrets, un exemple pratique par sous-section. Style clair et pédagogique, " +
      "adapté aux lecteurs africains francophones. Réponds uniquement par le chapitre, sans commentaire.",
  },
  // Studio — citation inspirante en rapport avec le passage fourni (§9).
  quote: {
    instruction:
      "Propose UNE citation courte (15 à 25 mots maximum) en rapport direct avec le thème du passage fourni. " +
      "Elle peut être une citation célèbre (avec son auteur après un tiret) ou une phrase originale percutante. " +
      "Réponds uniquement par la citation, sans guillemets ni commentaire.",
  },
  // Studio — réduction du texte pour qu'il tienne sur la page (§9/§20).
  shorten: {
    instruction:
      "Condense le passage fourni en conservant TOUTES les idées essentielles mais avec environ 40 % de mots en moins : " +
      "supprime les répétitions, les formules de politesse et les digressions, garde les faits et exemples clés. " +
      "Réponds uniquement par le texte condensé.",
  },
  // Studio — modification d'UNE page (ou de tout le document) sur consigne libre
  // (§9/§10 du cahier des charges). Le design est appliqué côté client : l'IA ne
  // renvoie ici que le texte éventuellement réécrit, « OK » = aucune réécriture.
  page_edit: {
    instruction:
      "Tu es un éditeur professionnel qui retravaille une page d'un livre déjà mis en page. " +
      "Applique la consigne de l'auteur au passage fourni. IMPORTANT : si la consigne ne demande " +
      "aucune réécriture du texte (mise en page, couleurs, typographie, image, citation à ajouter), " +
      "réponds exactement « OK ». Sinon, réponds uniquement par le texte final de la page, " +
      "sans titre d'exemple, sans commentaire et sans bloc de code.",
  },
  design: {
    json: true,
    instruction:
      "Choisis le modèle de design le plus adapté au document décrit. " +
      `Modèles disponibles (identifiants exacts) : ${AI_TEMPLATE_IDS.join(", ")}. ` +
      "Réponds UNIQUEMENT par un objet JSON valide, sans texte autour, au format : " +
      '{"template_id":"moderne","cover":{"bg":"#1d4ed8","text":"#ffffff"},"reason":"une phrase courte"}. ' +
      "Les couleurs doivent être des codes hexadécimaux contrastés avec un texte lisible.",
  },
};

function aiJson(text) {
  const m = /\{[\s\S]*\}/.exec(String(text || ""));
  if (!m) return null;
  try {
    return JSON.parse(m[0]);
  } catch {
    return null;
  }
}

// POST /api/generator/ai — { action, text?, instruction?, title?, author?, subtitle? }
// Renvoie { action, text } ou { action:"design", design:{template_id, cover, reason} }.
// Le prompt système est celui de l'assistante du site, complété par l'instruction
// de l'action : même qualité de rédaction, aucun accès aux données privées.
router.post(
  "/ai",
  ah(async (req, res) => {
    const body = req.body || {};
    const action = String(body.action || "").trim();
    const def = AI_ACTIONS[action];
    if (!def) {
      const err = new Error("Action IA inconnue");
      err.statusCode = 400;
      throw err;
    }
    // Sans clé Gemini, l'assistant est simplement absent : le générateur reste
    // entièrement utilisable (message clair au lieu d'une réponse incohérente).
    if (!process.env.GEMINI_API_KEY) {
      return res.status(503).json({
        error: "L'assistant IA n'est pas configuré sur cette installation (GEMINI_API_KEY absente). Le reste du Générateur fonctionne normalement.",
        code: "AI_NOT_CONFIGURED",
      });
    }
    // Studio (§9/§10) : le client envoie le texte de la page dans `page_text`.
    const studioMode = action === "page_edit" ? String(body.mode || "design").trim() : "";
    const text = String(body.text || body.page_text || "").slice(0, AI_MAX_INPUT).trim();
    const docContext = [
      body.title ? `Titre du document : ${String(body.title).slice(0, 200)}` : "",
      body.subtitle ? `Sous-titre : ${String(body.subtitle).slice(0, 300)}` : "",
      body.author ? `Auteur : ${String(body.author).slice(0, 200)}` : "",
      body.instruction ? `Consigne de l'utilisateur : ${String(body.instruction).slice(0, 600)}` : "",
      studioMode === "design" ? "Mode demandé : design uniquement — NE RÉÉCRIS PAS le texte (l'auteur applique lui-même la mise en page)." : "",
      studioMode && studioMode !== "design" ? "Mode demandé : contenu + design — la réécriture du texte de la page est autorisée." : "",
      action === "page_edit" && body.page_count ? `Pages concernées : ${Math.max(1, Number(body.page_count) || 1)}.` : "",
    ]
      .filter(Boolean)
      .join("\n");

    const needsText = ["structure", "improve", "correct", "rephrase", "summarize", "expand", "tone", "translate"].includes(action);
    if ((needsText || action === "description") && !text) {
      const err = new Error(
        action === "description"
          ? "Le document doit contenir du texte avant de générer sa description."
          : "Sélectionnez d'abord un passage dans le document."
      );
      err.statusCode = 422;
      throw err;
    }
    // Studio « Contenu + design » : sans le texte de la page, l'IA n'a rien à réécrire.
    if (studioMode && studioMode !== "design" && !text) {
      const err = new Error("Le texte de la page n'a pas pu être transmis à l'assistant.");
      err.statusCode = 422;
      throw err;
    }
    if (!needsText && !text && !docContext) {
      const err = new Error("Renseignez le titre du document pour que l'IA puisse travailler.");
      err.statusCode = 422;
      throw err;
    }

    const message = [def.instruction, docContext, text ? `\n---\n${text}` : ""]
      .filter(Boolean)
      .join("\n\n");
    const reply = await askAI(
      message,
      [],
      "Tu réponds à un auteur qui met en page un document professionnel.",
      "fr",
      // Le Générateur est un appel synchrone court : pas de catalogue produit,
      // pas de longs essais de modèles invalides, budget total sous le timeout
      // Vercel. Une réponse Gemini utile est renvoyée normalement ; sinon le
      // fallback explicite devient une erreur 502 rapide et lisible.
      {
        maxInputChars: 8000,
        maxOutputTokens: 2048,
        includeCatalog: false,
        models: [
          "gemini-3.5-flash-lite",
          process.env.GEMINI_MODEL || "gemini-3.5-flash-lite",
          "gemini-3.1-flash-lite",
        ].filter((m, i, a) => a.indexOf(m) === i),
        perModelMs: 5000,
        totalBudgetMs: 9000,
      }
    );
    const out = String(reply || "").trim();
    if (!out || /je ne peux pas répondre|can't answer|لا أستطيع الإجابة/.test(out)) {
      const err = new Error("L'assistant IA est momentanément indisponible. Réessayez dans un instant.");
      err.statusCode = 502;
      throw err;
    }
    logAudit(req.user.id, `generator.ai_${action}`, String(body.title || "").slice(0, 80), req.ip);

    if (def.json) {
      const parsed = aiJson(out) || {};
      const templateId = AI_TEMPLATE_IDS.includes(parsed.template_id) ? parsed.template_id : null;
      if (!templateId) {
        const err = new Error("L'IA n'a pas pu proposer de design valide. Réessayez.");
        err.statusCode = 502;
        throw err;
      }
      const hex = (v, fallback) => (typeof v === "string" && /^#[0-9a-f]{3,8}$/i.test(v) ? v : fallback);
      return res.json({
        action,
        design: {
          template_id: templateId,
          cover: { bg: hex(parsed.cover?.bg, null), text: hex(parsed.cover?.text, null) },
          reason: String(parsed.reason || "").slice(0, 200),
        },
      });
    }

    if (!out) {
      const err = new Error("L'IA n'a rien renvoyé. Réessayez dans un instant.");
      err.statusCode = 502;
      throw err;
    }
    res.json({ action, text: out });
  })
);

// ─── Publication : export PDF → produit digital MboppiShop ───────────────────────
// Chaîne complète (aucune simulation) :
//   1. POST /documents/:id/upload-url  → le navigateur téléverse le PDF
//      DIRECTEMENT vers Supabase (bucket PRIVÉ `digital-products`) ;
//   2. POST /documents/:id/publish     → le serveur VÉRIFIE l'objet (existence
//      + taille) puis crée (ou met à jour) le produit digital correspondant :
//      il devient achetable sur la marketplace comme n'importe quel fichier.
const PUBLISH_EXT = new Set(["pdf", "epub", "zip"]);

router.post(
  "/documents/:id/upload-url",
  ah(async (req, res) => {
    await loadDoc(Number(req.params.id), req);
    const { name, size, hash } = req.body || {};
    const fileName = String(name || "document.pdf").trim().slice(0, 160);
    const ext = safeFileExt(fileName);
    if (!PUBLISH_EXT.has(ext)) {
      return res.status(400).json({ error: "Formats acceptés pour la publication : PDF, EPUB ou ZIP." });
    }
    const bytes = Number(size || 0);
    if (!Number.isFinite(bytes) || bytes <= 0) {
      return res.status(400).json({ error: "Fichier illisible ou vide." });
    }
    if (bytes > DIGITAL_MAX_BYTES) {
      return res.status(400).json({
        error: `Fichier trop volumineux (${(bytes / 1024 / 1024).toFixed(1)} Mo). Maximum ${Math.round(
          DIGITAL_MAX_BYTES / 1024 / 1024
        )} Mo.`,
      });
    }
    const hex = String(hash || "").toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(hex)) {
      return res.status(400).json({ error: "Empreinte de fichier invalide : réessayez (recalcul du hash)." });
    }
    const ownerId = await resolveOwnerId(req);
    const path = digitalObjectKey(ownerId, hex, fileName);
    try {
      const signed = await createDigitalUploadUrl(path, 3600);
      if (!signed) {
        return res.status(503).json({ error: "Stockage des fichiers indisponible pour le moment." });
      }
      res.json({ path: signed.path, uploadUrl: signed.uploadUrl, token: signed.token });
    } catch (err) {
      console.error("[generator] URL d'upload impossible :", err.message);
      res.status(503).json({ error: "Stockage des fichiers indisponible pour le moment." });
    }
  })
);

router.post(
  "/documents/:id/publish",
  ah(async (req, res) => {
    const row = await loadDoc(Number(req.params.id), req);
    const body = req.body || {};
    const ownerId = await resolveOwnerId(req);
    const key = String(body.key || "").trim();
    // La clé est contrainte au dossier du compte : impossible de publier le
    // fichier d'un autre (même logique que POST /api/digital/upload-url).
    if (!key || !key.startsWith(`users/${ownerId}/`) || key.includes("..")) {
      return res.status(400).json({ error: "Fichier invalide : téléversez-le de nouveau." });
    }
    if (!PUBLISH_EXT.has(safeFileExt(key))) {
      return res.status(400).json({ error: "Formats acceptés pour la publication : PDF, EPUB ou ZIP." });
    }
    const meta = await digitalObjectMeta(key);
    if (!meta.exists || meta.size <= 0) {
      return res.status(400).json({ error: "Le fichier n'a pas été correctement téléversé. Réessayez l'export." });
    }
    const price = Number(body.price);
    if (!Number.isFinite(price) || price < 0) {
      return res.status(400).json({ error: "Prix invalide." });
    }
    // Devise : celle du PAYS du compte (comme products.js) — XAF au Cameroun,
    // XOF au Sénégal/Côte d'Ivoire, etc. Le client envoie countrySymbol(user.country) ;
    // toute devise inconnue retombe sur la devise du pays du compte.
    const currency = validCurrency(body.currency)
      ? String(body.currency).trim().toUpperCase()
      : defaultCurrencyFor(req.user.country);
    const title = String(body.title || row.title || "Document").trim().slice(0, 160);
    const description = String(body.description || "").trim().slice(0, 4000) || null;
    // Catégorie : liste blanche (miroir de DIGITAL_CATEGORIES côté client) —
    // toute autre valeur retombe sur « Digital ».
    const rawCategory = String(body.category || "").trim().slice(0, 60);
    const category = PUBLISH_CATEGORIES.has(rawCategory) ? rawCategory : "Digital";
    // Commission reversée au VENDEUR qui vend le produit avec son code.
    // Deux formats acceptés (même convention que l'espace créateur) :
    //  - `commission_amount` : MONTANT en devise du prix (recommandé — c'est
    //    comme cela que les créateurs saisissent ailleurs) → converti en % ;
    //  - `commission` : pourcentage direct 0-100 (compatibilité).
    // Un montant brut envoyé dans `commission` était auparavant bridé à 100,
    // ce qui donnait une commission ÉGALE au prix de vente (bug signalé).
    let commission = 0;
    if (body.commission_amount != null && body.commission_amount !== "") {
      const amt = Number(body.commission_amount);
      commission =
        Number.isFinite(amt) && amt > 0 && Number(price) > 0
          ? Math.min(100, Math.round((amt / Number(price)) * 1e8) / 1e6)
          : 0;
    } else if (Number.isFinite(Number(body.commission))) {
      commission = Math.min(100, Math.max(0, Math.round(Number(body.commission))));
    }

    // Image de couverture : data-URL compressée côté client → URL publique du
    // bucket `photos` (comme les produits classiques). Un échec n'empêche pas
    // la publication (le produit existe alors sans vignette).
    let image = null;
    const coverData = String(body.cover || "");
    if (coverData.startsWith("data:image/")) {
      try {
        image = await uploadPhoto(coverData, `products/${ownerId}`, "thumb");
      } catch (err) {
        console.warn("[generator] couverture non stockée :", err.message);
      }
    }
    const photos = JSON.stringify(
      image ? [{ thumb: image, medium: image, large: image, full: image }] : []
    );
    const mime = safeFileExt(key) === "pdf" ? "application/pdf" : "application/octet-stream";

    // Republication : on MET À JOUR le produit existant (même lien de partage)
    // au lieu de créer un doublon dans le catalogue.
    const existing = row.published_product_id
      ? (await q(`SELECT id FROM products WHERE id = $1 AND shop_id = $2`, [
          row.published_product_id,
          ownerId,
        ]))[0]
      : null;

    let productId;
    if (existing) {
      productId = existing.id;
      await q(
        `UPDATE products SET name = $2, description = $3, price = $4, currency = $5, category = $6,
            commission_percent = $7, image = COALESCE($8, image),
            photos = CASE WHEN $9::jsonb = '[]'::jsonb THEN photos ELSE $9::jsonb END,
            digital_path = $10, digital_name = $11, digital_mime = $12, digital_size = $13, delivery_fee = 0
          WHERE id = $1`,
        [
          productId, title, description, price, currency, category, commission, image, photos,
          key, `${title}.${safeFileExt(key)}`, mime, meta.size,
        ]
      );
    } else {
      const inserted = await q(
        `INSERT INTO products (shop_id, name, description, price, old_price, commission_percent, image, photos,
            category, warranty, delivery_fee, contact, quantity, currency,
            is_digital, digital_path, digital_name, digital_mime, digital_size, digital_download_limit)
         VALUES ($1, $2, $3, $4, NULL, $5, $6, $7::jsonb, $8, NULL, 0, NULL, 1, $9,
            TRUE, $10, $11, $12, $13, 5) RETURNING id`,
        [
          ownerId, title, description, price, commission, image, photos, category, currency,
          key, `${title}.${safeFileExt(key)}`, mime, meta.size,
        ]
      );
      productId = inserted[0].id;
    }

    const updated = await q(
      `UPDATE gen_documents SET published_product_id = $2, status = 'ready'
        WHERE id = $1 RETURNING ${DOC_META_SELECT}`,
      [row.id, productId]
    );
    logAudit(req.user.id, "generator.doc_published", `${row.doc_ref} → #${productId}`, req.ip);
    res.json({ document: docRow(updated[0]), product_id: productId, size: meta.size, updated: Boolean(existing) });
  })
);

// ─── Suppression du produit publié (admin ET créateur propriétaire) ──────────
// Retire TOTALEMENT de la base le produit digital issu de la publication :
//  - les tables liées partent en cascade (ventes, téléchargements, avis — FK
//    ON DELETE CASCADE) ou sont nettoyées explicitement quand elles n'ont pas
//    de contrainte (vues, promos éclair) ;
//  - les fichiers sont supprimés des buckets (photos publiques + PDF privé),
//    sauf s'ils sont encore référencés par un autre produit ;
//  - le document redevient publiable (`published_product_id = NULL`).
// L'admin (jeton admin) et le créateur propriétaire passent tous les deux par
// ici : la portée est celle du document (loadDoc + owner_id).
router.delete(
  "/documents/:id/product",
  ah(async (req, res) => {
    const row = await loadDoc(Number(req.params.id), req);
    const productId = Number(row.published_product_id);
    if (!Number.isInteger(productId) || productId <= 0) {
      return res.status(404).json({ error: "Aucun produit publié pour ce document." });
    }
    const product = (await q(`SELECT * FROM products WHERE id = $1`, [productId]))[0];
    // Le lien est rompu en premier : même si le nettoyage échoue ensuite, le
    // document peut être republié (aucune référence fantôme).
    await q(`UPDATE gen_documents SET published_product_id = NULL WHERE id = $1`, [row.id]);
    if (!product) {
      logAudit(req.user.id, "generator.product_deleted", `${row.doc_ref} → #${productId} (déjà absent)`, req.ip);
      return res.json({ ok: true, deleted: false, product_id: productId });
    }

    const storageKeys = collectStorageKeys(product.photos);
    await q(`DELETE FROM products WHERE id = $1`, [productId]);

    // Tables métier sans contrainte de clé étrangère : nettoyage « best effort »
    // (absentes sur une base neuve → erreur ignorée).
    for (const sql of [
      `DELETE FROM item_views WHERE product_id = $1`,
      `DELETE FROM flash_promotions WHERE product_id = $1`,
    ]) {
      try {
        await q(sql, [productId]);
      } catch {
        /* table absente : rien à nettoyer */
      }
    }

    // Fichiers : photos du bucket public puis PDF du bucket privé.
    try {
      const removed = await deleteStorageKeys(storageKeys, { excludeProductId: productId });
      if (removed) console.warn(`[generator] ${removed} photo(s) supprimée(s) pour le produit #${productId}`);
    } catch (err) {
      console.error("[generator] nettoyage des photos échoué :", err.message);
    }
    if (product.digital_path) {
      try {
        const [still] = await q(
          `SELECT 1 FROM products WHERE id <> $1 AND digital_path = $2 LIMIT 1`,
          [productId, product.digital_path]
        );
        if (!still) await deleteDigitalFile(product.digital_path);
      } catch (err) {
        console.error("[generator] nettoyage du fichier digital échoué :", err.message);
      }
    }

    logAudit(req.user.id, "generator.product_deleted", `${row.doc_ref} → #${productId}`, req.ip);
    res.json({ ok: true, deleted: true, product_id: productId });
  })
);

export default router;