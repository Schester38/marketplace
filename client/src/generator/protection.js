// Protection du document : empreinte SHA-256, QR code de vérification,
// référence unique. L'empreinte est calculée ici via crypto.subtle (Web
// Crypto natif, aucune dépendance) et doit correspondre à content_hash
// calculé côté serveur sur le même docModel JSON.

export async function sha256Hex(str) {
  const data = new TextEncoder().encode(str);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Payload encodé dans le QR code : référence + auteur + date + empreinte.
// Sert à prouver l'origine du document (identifiant vérifiable auprès de
// l'auteur), il ne rend pas la copie techniquement impossible.
export function verificationPayload(doc, contentHash) {
  const created = doc.created_at ? new Date(doc.created_at).toISOString().slice(0, 10) : "";
  return [
    `DOC ${doc.doc_ref || ""}`,
    doc.author ? `Auteur : ${doc.author}` : "",
    created ? `Créé le ${created}` : "",
    contentHash ? `SHA-256 : ${contentHash.slice(0, 32)}` : "",
    "Vérification : contactez l'auteur avec la référence ci-dessus",
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
export function copyrightLines(doc) {
  const year = new Date().getFullYear();
  const author = doc.author || "L'auteur";
  const custom = doc.protection?.copyrightText;
  if (custom && String(custom).trim()) {
    return String(custom).split("\n").filter(Boolean);
  }
  return [
    `© ${year} ${author}`,
    "Tous droits réservés.",
    "",
    "Aucune partie de cette publication ne peut être reproduite, distribuée",
    "ou transmise sans autorisation préalable de l'auteur, sauf dans les",
    "limites prévues par la loi.",
  ];
}