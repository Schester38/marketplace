// Protection du document : empreinte SHA-256, QR code de vérification,
// référence unique. L'empreinte est calculée ici via crypto.subtle (Web
// Crypto natif, aucune dépendance) et doit correspondre à content_hash
// calculé côté serveur sur le même docModel JSON.

export async function sha256Hex(str) {
  const data = new TextEncoder().encode(str);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

import { BASE_URL } from "../config.js";

// Taille commune de la page de copyright dans tous les rendus.
// Les mentions principales restent lisibles sans augmenter la taille du reste du document.
export const COPYRIGHT_FONT_PT = 12;
export const COPYRIGHT_REFERENCE_FONT_PT = 10.5;

// Payload encodé dans le QR code : référence + auteur + date + empreinte +
// lien PUBLIC de vérification (/verifier/<référence>) : le scan ouvre la page
// d'authenticité MboppiShop. Sert à prouver l'origine du document (identifiant
// vérifiable), il ne rend pas la copie techniquement impossible.
export function verificationPayload(doc, contentHash) {
  const created = doc.created_at ? new Date(doc.created_at).toISOString().slice(0, 10) : "";
  return [
    `DOC ${doc.doc_ref || ""}`,
    doc.author ? `Auteur : ${doc.author}` : "",
    created ? `Créé le ${created}` : "",
    contentHash ? `SHA-256 : ${contentHash.slice(0, 32)}` : "",
    doc.doc_ref ? `Vérification : ${BASE_URL}/verifier/${doc.doc_ref}` : "Vérification : contactez l'auteur avec la référence ci-dessus",
  ]
    .filter(Boolean)
    .join("\n");
}

// QR code réel (lib qrcode, canvas local — aucun service tiers).
export async function makeQrDataUrl(text, size = 320) {
  try {
    const QR = await import("qrcode");
    return await QR.toDataURL(text, {
      width: size,
      margin: 1,
      errorCorrectionLevel: "M",
      color: { dark: "#111111", light: "#ffffff" },
    });
  } catch {
    return null;
  }
}

// Copyright lisible, affiché sur la page de copyright du document.
// La PREMIÈRE ligne porte toujours l'identité de l'œuvre et de son auteur, au
// format demandé « © <année> l'auteur: <nom> » : c'est cette liste qui est
// rendue par l'aperçu, le PDF, l'EPUB ET le Studio (source unique, donc aucun
// risque de divergence entre les rendus).
export function copyrightLines(doc) {
  const year = new Date().getFullYear();
  const author = String(doc.author || "").trim() || "Auteur non renseigné";
  const head = `© ${year} l'auteur: ${author}`;
  const custom = String(doc.protection?.copyrightText || "").trim();
  if (custom) {
    const body = custom
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    // Le texte personnalisé remplace les mentions légales, mais la ligne
    // d'identité reste affichée (sans doublon si elle a déjà été saisie —
    // « l'auteur: », « l’auteur : », « l auteur : » sont reconnus).
    return body.some((l) => /l['’\s]?auteur\s*:/i.test(l)) ? body : [head, "", ...body];
  }
  return [
    head,
    "Tous droits réservés.",
    "",
    "Aucune partie de cette publication ne peut être reproduite, distribuée",
    "ou transmise sans autorisation préalable de l'auteur, sauf dans les",
    "limites prévues par la loi.",
  ];
}

// ─── Bloc de copyright : SOURCE UNIQUE aperçu HTML ↔ PDF ────────────────────
// Aperçu et PDF empilent EXACTEMENT les mêmes entrées, avec les mêmes tailles
// et les mêmes espacements (l'aperçu était auparavant incomplet : le PDF
// ajoutait l'empreinte SHA-256 et la signature de vérification que l'aperçu ne
// montrait pas). « gapMm » = espace AVANT l'entrée, mesuré depuis le bas de la
// ligne précédente (les deux rendus avancent donc identiquement).
export const COPYRIGHT_LINE_HEIGHT = 1.6; // interligne commun (em)
export const BASELINE_EM = 0.89; // ligne de base sous le haut de la boîte (CSS line-height 1.2)

// Première URL `http(s)://…` d'une ligne : la page de copyright s'en sert pour
// rendre le lien du document CLIQUABLE dans l'aperçu (ancre), le PDF
// (annotation de lien réelle), l'EPUB et le Studio — un seul href pour tous.
const URL_RE = /https?:\/\/[^\s<>()"']+/i;
export function firstUrl(text) {
  const m = String(text || "").match(URL_RE);
  return m ? m[0] : null;
}

export function copyrightBlock(doc, { detailPt = 8 } = {}) {
  const items = copyrightLines(doc).map((text) => ({
    text,
    sizePt: COPYRIGHT_FONT_PT,
    gapMm: 0,
    tone: "body",
    href: firstUrl(text),
  }));
  items.push({
    text: `Référence : ${doc?.doc_ref || ""}`,
    sizePt: COPYRIGHT_REFERENCE_FONT_PT,
    gapMm: 6,
    tone: "accent",
    href: null,
  });
  if (doc?.content_hash) {
    items.push({
      text: `Empreinte SHA-256 : ${String(doc.content_hash).slice(0, 32)}…`,
      sizePt: detailPt,
      gapMm: 5,
      tone: "detail",
      href: null,
    });
  }
  if (doc?.doc_ref) {
    const verifyUrl = `${BASE_URL}/verifier/${doc.doc_ref}`;
    items.push({ text: "Authentifié sur MboppiShop", sizePt: detailPt, gapMm: 7, tone: "accent", href: null });
    items.push({
      text: verifyUrl,
      sizePt: detailPt,
      gapMm: 4.5,
      tone: "accent",
      href: verifyUrl,
    });
  }
  return items;
}

// Hauteur totale du bloc (mm) : sert aux DEUX rendus pour le même départ
// vertical (aucun débordement en bas de page, aperçu = PDF).
export function copyrightBlockHeightMm(items) {
  let total = 0;
  items.forEach((it, i) => {
    total += (Number(it.sizePt) * COPYRIGHT_LINE_HEIGHT) / 2.83;
    if (i > 0) total += Number(it.gapMm) || 0;
  });
  // Hauteur de la dernière ligne d'encre : on retire la descente de la ligne
  // (le bloc se mesure jusqu'au bas de l'encre, pas jusqu'au bas de la boîte).
  const last = items[items.length - 1];
  if (last) total -= (Number(last.sizePt) * (COPYRIGHT_LINE_HEIGHT - BASELINE_EM)) / 2.83;
  return Math.max(0, total);
}