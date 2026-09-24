/**
 * imageKit.js — Pipeline d'optimisation intelligente des images produits.
 *
 * Principes :
 *  - Tout le traitement lourd (décodage, redimensionnement, compression WebP)
 *    est fait DANS LE NAVIGATEUR, avant l'envoi au serveur. Vercel ne fait que
 *    stocker : aucune CPU serveur pour les images.
 *  - On ne dégrade jamais inutilement une image déjà excellente :
 *      keep      → image déjà optimisée (WebP/AVIF, ≤ 350 Ko, ≤ 1600 px) :
 *                  les variantes nécessaires sont dérivées, la version max est
 *                  conservée telle quelle (aucun re-encodage dessus).
 *      resize    → image moderne mais trop grande ou trop lourde :
 *                  redimensionnement seul pour la variante max, qualité haute.
 *      optimize  → JPEG/PNG/GIF/etc. : conversion WebP + redimensionnement.
 *  - Le ratio est toujours conservé (jamais de déformation de produit).
 *  - La transparence (PNG avec alpha) est préservée : WebP la supporte, et si
 *    l'encodeur WebP n'existe pas (vieux navigateurs), on retombe sur PNG
 *    (jamais sur JPEG qui noircit l'arrière-plan).
 *  - L'orientation EXIF est respectée automatiquement : le navigateur applique
 *    l'orientation EXIF lors du décodage de l'image (drawImage utilise déjà
 *    l'image orientée sur Chrome/Firefox/Safari modernes).
 *
 * Les seuils ci-dessous sont VOLONTAIREMENT centralisés et modifiables.
 */

export const PAYMENT_PROOF_CONFIG = {
  acceptedTypes: ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"],
  /** Plafond hardware identique aux photos produit (aucun mobile ne l'atteint). */
  maxSourceFileBytes: 15 * 1024 * 1024,
  alreadyOptimized: {
    formats: ["image/webp", "image/jpeg", "image/png"],
    maxBytes: 800 * 1024,
    maxDim: 1800,
  },
  resize: {
    maxDim: 1800,
    quality: 0.82,
  },
  /**
   * Compression « à la photo produit » : une preuve trop lourde n'est plus
   * refusée, elle est compressée jusqu'à passer sous `targetBytes`.
   * `minQuality` / `minDim` sont les planchers garantissant la lisibilité
   * du justificatif (montant, référence de transaction…).
   */
  targetBytes: 800 * 1024,
  minQuality: 0.6,
  minDim: 1000,
};

export const IMAGE_CONFIG = {
  /** Une SEULE variante par photo (le système thumb/medium/large est abandonné). */
  single: { max: 1600, quality: 0.88, targetBytes: 350 * 1024, minOutputLongEdge: 1000, key: "Photo", minSourceLongEdge: 1000 },
  /** Règle « déjà optimisée » : format moderne + poids faible + dimensions ok. */
  alreadyOptimized: {
    formats: ["image/webp", "image/avif"],
    maxBytes: 350 * 1024, // 350 Ko
    maxDim: 1600, // une image ≤ 1600 px peut être conservée telle quelle
  },
  /** Fichier source refusé au-delà de 15 Mo (les mobiles ne remplissent pas ça). */
  maxSourceFileBytes: 15 * 1024 * 1024,
  /** Formats acceptés (HEIC/HEIF = décodage par le navigateur, conversion WebP). */
  acceptedTypes: [
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
    "image/avif",
    "image/heic",
    "image/heif",
  ],
  /** Types « non-modernes » toujours convertis en WebP. */
  legacyFormats: ["image/jpeg", "image/png", "image/gif", "image/heic", "image/heif"],
};
/* ------------------------------------------------------------------ */
/* Utilitaires                                                        */
/* ------------------------------------------------------------------ */

export function formatBytes(n) {
  const v = Number(n || 0);
  if (v >= 1024 * 1024) return `${(v / (1024 * 1024)).toFixed(v >= 10 * 1024 * 1024 ? 0 : 1)} Mo`;
  if (v >= 1024) return `${Math.round(v / 1024)} Ko`;
  return `${Math.round(v)} o`;
}

/** Taille (o) d'une data-URI base64. */
export function dataUrlBytes(dataUrl) {
  if (!dataUrl) return 0;
  const m = /^data:[^;]+;base64,(.*)$/.exec(dataUrl);
  if (!m) return dataUrl.length;
  return Math.max(0, Math.floor((m[1].length * 3) / 4));
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Lecture du fichier impossible"));
    reader.readAsDataURL(blob);
  });
}

/** Décode une source (File ou data-URI) en élément Image + mesure. */
function decodeSource(src, sourceLabel) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const w = img.naturalWidth || img.width;
      const h = img.naturalHeight || img.height;
      if (!w || !h) {
        reject(new Error("Impossible de lire les dimensions de l'image"));
        return;
      }
      resolve({ img, width: w, height: h });
    };
    img.onerror = () => reject(new Error(`Impossible de lire une des photos (${sourceLabel})`));
    img.src = src;
  });
}

/** Canvas en data-URI WebP (qualité) — repli PNG si transparence, sinon JPEG. */
function canvasDataUrl(canvas, quality) {
  const withAlpha = hasAlpha(canvas);
  const out = canvas.toDataURL("image/webp", quality);
  if (out.startsWith("data:image/webp")) return out;
  // Encodage WebP non disponible → on préserve l'alpha si présente.
  return withAlpha ? canvas.toDataURL("image/png") : canvas.toDataURL("image/jpeg", quality);
}

/** Détection rapide de transparence (4 coins + centre). */
function hasAlpha(canvas) {
  try {
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    const w = canvas.width;
    const h = canvas.height;
    if (w < 2 || h < 2) return false;
    const points = [
      [0, 0],
      [w - 1, 0],
      [0, h - 1],
      [w - 1, h - 1],
      [Math.floor(w / 2), Math.floor(h / 2)],
    ];
    for (const [x, y] of points) {
      const d = ctx.getImageData(x, y, 1, 1).data;
      if (d[3] < 250) return true;
    }
    return false;
  } catch {
    return false;
  }
}

/** Redessine l'image dans un canvas de taille max `maxDim`, ratio conservé. */
function renderCanvas(img, maxDim) {
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  const scale = Math.min(1, maxDim / Math.max(iw, ih));
  const w = Math.max(1, Math.round(iw * scale));
  const h = Math.max(1, Math.round(ih * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, w, h);
  return { canvas, width: w, height: h };
}

/** Encode une variante redimensionnée depuis une image décodée. */
function renderVariant(img, maxDim, quality) {
  const { canvas, width, height } = renderCanvas(img, maxDim);
  const dataUrl = canvasDataUrl(canvas, quality);
  const fmt = (dataUrl.match(/^data:(image\/[a-z+]+)/) || [])[1] || "image/webp";
  return { dataUrl, width, height, bytes: dataUrlBytes(dataUrl), format: fmt };
}

/**
 * Rend une image en privilégiant la qualité, tout en respectant un budget
 * de poids. Les dimensions diminuent seulement si la qualité seule ne suffit
 * pas ; une affiche produit ne descend jamais sous `minOutputLongEdge`.
 */
function renderBoundedVariant(img, { max, quality, targetBytes, minOutputLongEdge }) {
  const sourceLongEdge = Math.max(img.naturalWidth || img.width, img.naturalHeight || img.height);
  const startingDim = Math.min(max, sourceLongEdge);
  const dimensions = [];
  let dim = startingDim;
  while (dim >= minOutputLongEdge) {
    if (!dimensions.includes(dim)) dimensions.push(dim);
    if (dim === minOutputLongEdge) break;
    dim = Math.max(minOutputLongEdge, Math.floor(dim * 0.85));
  }
  if (!dimensions.length) dimensions.push(startingDim);
  const qualities = [quality, 0.84, 0.8, 0.76, 0.72, 0.68];
  let best = null;
  for (const dim of dimensions) {
    for (const q of qualities) {
      const candidate = renderVariant(img, dim, q);
      if (!best || candidate.bytes < best.bytes || (candidate.bytes === best.bytes && candidate.width > best.width)) {
        best = candidate;
      }
      if (candidate.bytes <= targetBytes) return candidate;
    }
  }
  return best || renderVariant(img, startingDim, quality);
}
/* ------------------------------------------------------------------ */
/* Décision intelligente                                              */
/* ------------------------------------------------------------------ */

/**
 * Détermine l'action à appliquer à une image source.
 *  - "keep"     : image déjà optimisée (WebP/AVIF léger, dimensions ok) →
 *                 conservée telle quelle pour la variante max, seulement
 *                 redimensionnée pour les tailles inférieures.
 *  - "resize"   : format moderne mais trop grand/lourd → redimensionner
 *                 (et recompresser raisonnablement) pour produire les tailles.
 *  - "optimize" : format ancien (JPEG/PNG/GIF/HEIC) → convertir en WebP.
 */
export function pickImageStrategy({ format, bytes, width, height }) {
  const modern = IMAGE_CONFIG.alreadyOptimized.formats.includes(format);
  const smallEnough =
    Math.max(width, height) <= IMAGE_CONFIG.alreadyOptimized.maxDim &&
    bytes <= IMAGE_CONFIG.alreadyOptimized.maxBytes;
  if (modern && smallEnough) {
    return {
      action: "keep",
      label: "déjà optimisée",
      reason: `${format} · ${formatBytes(bytes)} · ${width}×${height} → conservée telle quelle`,
    };
  }
  if (modern) {
    return {
      action: "resize",
      label: "redimensionnée",
      reason: `${format} · ${formatBytes(bytes)} · ${width}×${height} → dimensions/poids au-dessus de la cible`,
    };
  }
  return {
    action: "optimize",
    label: "convertie en WebP",
    reason: `${format} · ${formatBytes(bytes)} · ${width}×${height} → conversion + compression`,
  };
}

export function pickPaymentProofStrategy({ format, bytes, width, height }) {
  const accepted = PAYMENT_PROOF_CONFIG.acceptedTypes.includes(format);
  const smallEnough =
    Math.max(width, height) <= PAYMENT_PROOF_CONFIG.alreadyOptimized.maxDim &&
    bytes <= PAYMENT_PROOF_CONFIG.alreadyOptimized.maxBytes;

  if (!accepted) {
    return {
      action: "reject",
      label: "format non supporté",
      reason: `${format} · ${formatBytes(bytes)} → format de preuve refusé`,
    };
  }

  if (smallEnough) {
    return {
      action: "keep",
      label: "déjà lisible",
      reason: `${format} · ${formatBytes(bytes)} · ${width}×${height} → conservée sans recompression inutile`,
    };
  }

  return {
    action: "optimize",
    label: "redimensionnement conservateur",
    reason: `${format} · ${formatBytes(bytes)} · ${width}×${height} → réduction ciblée pour garder la lisibilité du justificatif`,
  };
}
/* ------------------------------------------------------------------ */
/* Pipeline principale                                                */
/* ------------------------------------------------------------------ */

/**
 * Analyse + optimise un fichier image sélectionné.
 * Retourne :
 *  - entry : { thumb, meta } — UNE SEULE variante (le système thumb/medium/large
 *    est abandonné : une photo = un fichier, compressé en WebP, affiché partout
 *    par redimensionnement CSS + déduplication serveur).
 *  - info  : métriques de surveillance prêtes pour l'UI
 */
export async function smartProcessImageFile(file, { requireProductResolution = false } = {}) {
  if (!file) throw new Error("Aucun fichier sélectionné");
  const okType = IMAGE_CONFIG.acceptedTypes.includes(file.type) || file.type.startsWith("image/");
  if (!okType) {
    const fallback = /\.(jpe?g|png|webp|gif|avif|heic|heif)$/i.test(file.name || "");
    if (!fallback) {
      throw new Error(
        `Format non supporté : ${file.type || "inconnu"} (JPG, PNG, WebP, AVIF, HEIC acceptés)`
      );
    }
  }
  if (file.size > IMAGE_CONFIG.maxSourceFileBytes) {
    throw new Error(
      `Image trop lourde (${formatBytes(file.size)}) : max ${formatBytes(IMAGE_CONFIG.maxSourceFileBytes)}`
    );
  }

  const sourceDataUrl = await blobToDataUrl(file);
  const { img, width, height } = await decodeSource(sourceDataUrl, file.name || "image");
  const longEdge = Math.max(width, height);
  const V = IMAGE_CONFIG.single;
  const minSourceLongEdge = requireProductResolution ? V.minSourceLongEdge : 0;
  if (minSourceLongEdge && longEdge < minSourceLongEdge) {
    throw new Error(
      `Image trop petite (${width}×${height}px). Utilisez une affiche d’au moins ${minSourceLongEdge}px sur son plus grand côté pour éviter un affichage flou.`
    );
  }

  const strategy = pickImageStrategy({
    format: file.type || "image/jpeg",
    bytes: file.size,
    width,
    height,
  });

  const srcFits = (max) => Math.max(width, height) <= max;

  // Une seule version haute définition : la même ressource est utilisée dans
  // la carte, la fiche produit et le zoom, sans thumbnail 480px sous-échantillonnée.
  // Le budget de 350 Ko évite de faire gonfler le Storage et l'egress.
  let single;
  let rendered = null;
  if (strategy.action === "keep" && srcFits(V.max)) {
    single = sourceDataUrl;
  } else {
    rendered = renderBoundedVariant(img, V);
    single = rendered.dataUrl;
  }

  const refFormat = (single.match(/^data:(image\/[a-z+]+)/) || [])[1] || "image/webp";
  const totalBytes = dataUrlBytes(single);
  if (requireProductResolution && totalBytes > V.targetBytes) {
    throw new Error(
      `L'image reste trop lourde après optimisation (${formatBytes(totalBytes)}). Choisissez une affiche plus simple ou moins détaillée pour rester sous 350 Ko.`
    );
  }

  const meta = {
    width: Math.min(width, V.max),
    height: Math.min(height, V.max),
    bytes: totalBytes,
    format: refFormat,
    original_width: width,
    original_height: height,
    original_bytes: file.size,
    original_format: file.type || refFormat,
    strategy: strategy.action,
  };

  const entry = { thumb: single, meta };

  return {
    entry,
    info: {
      strategy: strategy.action,
      strategyLabel: strategy.label,
      reason: strategy.reason,
      original: { bytes: file.size, width, height, format: file.type },
      totalBytes,
      savedBytes: Math.max(0, file.size - totalBytes),
      savedRatio: file.size > 0 ? Math.min(1, 1 - totalBytes / file.size) : 0,
    },
  };
}
/* ------------------------------------------------------------------ */
/* Compatibilité : anciennes API utilisées par d'autres écrans         */
/* ------------------------------------------------------------------ */

/** Décode une data-URI existante et en produit une miniature (~320 px). */
export function thumbFromDataUrl(dataUrl, maxDim = 320, quality = 0.62) {
  return decodeSource(dataUrl, "photo").then(({ img }) => renderVariant(img, maxDim, quality).dataUrl);
}

/** Compression simple (une seule variante) pour preuves/offres. */
export function compressImage(file, maxDim = 800, quality = 0.72) {
  if (!file) return Promise.reject(new Error("Aucun fichier"));
  return blobToDataUrl(file)
    .then((dataUrl) => decodeSource(dataUrl, file.name || "image"))
    .then(({ img }) => renderVariant(img, maxDim, quality).dataUrl);
}

export async function optimizePaymentProof(file) {
  if (!file) throw new Error("Aucun fichier de preuve sélectionné");

  if (!file.type?.startsWith("image/")) {
    throw new Error(`Seules les images sont acceptées comme preuve de paiement. Format reçu : ${file.type || "inconnu"}`);
  }

  const okType = PAYMENT_PROOF_CONFIG.acceptedTypes.includes(file.type) || file.type.startsWith("image/");
  if (!okType) {
    throw new Error(`Format de preuve non supporté : ${file.type || "inconnu"}`);
  }

  if (file.size > PAYMENT_PROOF_CONFIG.maxSourceFileBytes) {
    throw new Error(
      `Preuve trop lourde (${formatBytes(file.size)}) : max ${formatBytes(PAYMENT_PROOF_CONFIG.maxSourceFileBytes)}`
    );
  }

  const dataUrl = await blobToDataUrl(file);
  const { img, width, height } = await decodeSource(dataUrl, file.name || "preuve");

  const strategy = pickPaymentProofStrategy({
    format: file.type || "image/jpeg",
    bytes: file.size,
    width,
    height,
  });

  if (strategy.action === "keep") return dataUrl;
  if (strategy.action === "reject") {
    throw new Error("Format de preuve non supporté ; choisissez une image JPG/PNG/WebP lisible.");
  }

  // Compression systématique, comme une photo produit : WebP d'abord (repli
  // PNG/JPEG automatique), puis descente progressive de la qualité puis des
  // dimensions jusqu'à passer sous `targetBytes`. Les planchers minQuality /
  // minDim évitent toute dégradation qui rendrait le justificatif illisible.
  const { resize, targetBytes, minQuality, minDim } = PAYMENT_PROOF_CONFIG;
  let maxDim = resize.maxDim;
  let quality = resize.quality;
  let out = canvasDataUrl(renderCanvas(img, maxDim).canvas, quality);

  while (dataUrlBytes(out) > targetBytes && (quality > minQuality || maxDim > minDim)) {
    if (quality > minQuality) {
      quality = Math.max(minQuality, Math.round((quality - 0.1) * 100) / 100);
    } else {
      maxDim = Math.max(minDim, Math.round(maxDim * 0.8));
    }
    out = canvasDataUrl(renderCanvas(img, maxDim).canvas, quality);
  }

  return out;
}
