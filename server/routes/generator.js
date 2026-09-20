// Générateur de documents (ebooks, guides, rapports, brochures…) — module
// isolé du reste du marketplace Mboppi. Accessible à l'administration (token
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
    published_product_id: row.published_product_id || null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

const SELECT_DOC = `SELECT * FROM gen_documents WHERE id = $1`;

// `req` (optionnel) active la PORTÉE multi-utilisateur : l'admin voit tous les
// documents, un créateur uniquement les siens (les autres répondent 404 — on
// ne révèle pas leur existence).
async function loadDoc(id, req = null) {
  if (!Number.isInteger(id) || id <= 0) {
    const err = new Error("Identifiant invalide");
    err.statusCode = 400;
    throw err;
  }
  const row = (await q(SELECT_DOC, [id]))[0];
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
      error: "Aucun document Mboppi ne correspond à cette référence. Un document d'origine incertaine ne doit pas être considéré comme authentique.",
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
          `SELECT d.*, (SELECT COUNT(*)::int FROM gen_versions v WHERE v.doc_id = d.id) AS versions
           FROM gen_documents d ORDER BY d.updated_at DESC LIMIT 500`
        )
      : await q(
          `SELECT d.*, (SELECT COUNT(*)::int FROM gen_versions v WHERE v.doc_id = d.id) AS versions
           FROM gen_documents d WHERE d.owner_id = $1 ORDER BY d.updated_at DESC LIMIT 500`,
          [Number(req.user.id)]
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
    const row = await loadDoc(Number(req.params.id), req);
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
    const row = await loadDoc(Number(req.params.id), req);
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
    const row = await loadDoc(Number(req.params.id), req);
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
      `UPDATE gen_documents SET content_hash = $2, updated_at = now() WHERE id = $1 RETURNING *`,
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
  translate: {
    instruction:
      "Traduis fidèlement le passage fourni dans la langue demandée, en conservant le formatage. " +
      "Réponds uniquement par la traduction.",
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
    const text = String(body.text || "").slice(0, AI_MAX_INPUT).trim();
    const docContext = [
      body.title ? `Titre du document : ${String(body.title).slice(0, 200)}` : "",
      body.subtitle ? `Sous-titre : ${String(body.subtitle).slice(0, 300)}` : "",
      body.author ? `Auteur : ${String(body.author).slice(0, 200)}` : "",
      body.instruction ? `Consigne complémentaire de l'utilisateur : ${String(body.instruction).slice(0, 400)}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    const needsText = ["structure", "improve", "correct", "rephrase", "summarize", "expand", "tone", "translate"].includes(action);
    if (needsText && !text) {
      const err = new Error("Sélectionnez d'abord un passage dans le document.");
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
      // Plafonds élargis : sans eux, l'entrée était tronquée à 2000 caractères
      // (le passage fourni perdait sa fin) et la sortie à 800 tokens (réponses
      // coupées au milieu d'une phrase sur traduire/développer/structurer).
      { maxInputChars: 8000, maxOutputTokens: 4096 }
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

// ─── Publication : export PDF → produit digital Mboppi ───────────────────────
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
    // Commission reversée au VENDEUR qui vend le produit avec son code (0-100 %).
    const commission = Number.isFinite(Number(body.commission))
      ? Math.min(100, Math.max(0, Math.round(Number(body.commission))))
      : 0;

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
        WHERE id = $1 RETURNING *`,
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