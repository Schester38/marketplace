/**
 * imageKit.js — Pipeline d'optimisation intelligente des images produits.
 *
 * Principes :
 *  - Tout le traitement lourd (décodage, redimensionnement, compression WebP)
 *    est fait DANS LE NAVIGATEUR, avant l'envoi au serveur. Vercel ne fait que
 *    stocker : aucune CPU serveur pour les images.
 *  - On ne dégrade jamais inutilement une image déjà excellente :
 *      keep      → image déjà optimisée (WebP/AVIF, ≤ 350 Ko, ≤ 1250 px) :
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
  maxSourceFileBytes: 1 * 1024 * 1024,
  alreadyOptimized: {
    formats: ["image/webp", "image/jpeg", "image/png"],
    maxBytes: 800 * 1024,
    maxDim: 1800,
  },
  resize: {
    maxDim: 1800,
    quality: 0.82,
  },
};

export const IMAGE_CONFIG = {
  /** Variantes générées : dimensions max + qualité d'encodage WebP. */
  variants: {
    thumb: { max: 300, quality: 0.7, key: "Miniature" },
    medium: { max: 800, quality: 0.78, key: "Fiche produit" },
    large: { max: 1200, quality: 0.82, key: "Zoom" },
  },
  /** Règle « déjà optimisée » : format moderne + poids faible + dimensions ok. */
  alreadyOptimized: {
    formats: ["image/webp", "image/avif"],
    maxBytes: 350 * 1024, // 350 Ko
    maxDim: 1250, // ~largeur max (une image 1250 px peut servir de « large »)
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
 *  - entry : { thumb, medium, large, meta } (data-URIs à envoyer au serveur)
 *  - info  : métriques de surveillance prêtes pour l'UI
 */
export async function smartProcessImageFile(file) {
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

  const strategy = pickImageStrategy({
    format: file.type || "image/jpeg",
    bytes: file.size,
    width,
    height,
  });

  const V = IMAGE_CONFIG.variants;
  const needThumb = true; // listes + vignettes
  const needMedium = true; // affichage principal de la fiche
  const needLarge = Math.max(width, height) > V.medium.max; // zoom seulement si utile
  const srcFits = (max) => Math.max(width, height) <= max;

  let thumb = null;
  let medium = null;
  let large = null;

  if (needThumb) {
    if (strategy.action === "keep" && srcFits(V.thumb.max)) {
      thumb = sourceDataUrl; // identique → le serveur dédupliquera par hachage
    } else {
      thumb = renderVariant(img, V.thumb.max, V.thumb.quality).dataUrl;
    }
  }
  if (needMedium) {
    if (strategy.action === "keep" && srcFits(V.medium.max)) {
      medium = sourceDataUrl;
    } else {
      medium = renderVariant(img, V.medium.max, V.medium.quality).dataUrl;
    }
  }
  if (needLarge) {
    if (strategy.action === "keep" && srcFits(V.large.max)) {
      large = sourceDataUrl;
    } else {
      large = renderVariant(img, V.large.max, V.large.quality).dataUrl;
    }
  }
  // Image trop petite pour un zoom dédié : le zoom utilisera le medium.
  if (!needLarge) large = null;

  const ref = medium || large || thumb;
  const refFormat = (ref.match(/^data:(image\/[a-z+]+)/) || [])[1] || "image/webp";
  const totalBytes = dataUrlBytes(thumb) + dataUrlBytes(medium) + dataUrlBytes(large);

  const meta = {
    width: Math.min(width, V.medium.max),
    height: Math.min(height, V.medium.max),
    bytes: dataUrlBytes(ref),
    format: refFormat,
    original_width: width,
    original_height: height,
    original_bytes: file.size,
    original_format: file.type || refFormat,
    strategy: strategy.action,
  };

  const entry = { thumb, medium };
  if (large) entry.large = large;
  entry.meta = meta;

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

  const { canvas } = renderCanvas(img, PAYMENT_PROOF_CONFIG.resize.maxDim);
  const targetType = file.type === "image/png" ? "image/png" : "image/jpeg";
  const quality = targetType === "image/png" ? 0.95 : PAYMENT_PROOF_CONFIG.resize.quality;

  return canvas.toDataURL(targetType, quality);
}