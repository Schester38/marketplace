// Signature Mboppi appliquée aux produits digitaux TÉLÉCHARGÉS (anti-contrefaçon).
//
// Le fichier d'un produit digital vit dans un bucket PRIVÉ et ne transite
// jamais par l'API : la signature ne peut donc être posée qu'au moment du
// téléchargement, dans le navigateur de l'acheteur. Deux stratégies :
//   — PDF : tamponné avec pdf-lib (chargé à la demande) — pied de page
//     « Vérifié sur Mboppi » sur CHAQUE page + bloc d'authenticité complet
//     (vente, produit, créateur, acheteur, date, lien de vérification) en
//     dernière page. La copie non signée reste dans le bucket ; chaque
//     exemplaire téléchargé porte la trace de SA vente.
//   — autres formats (EPUB, MP3, ZIP…) : non modifiables de façon fiable →
//     un CERTIFICAT D'AUTHENTICITÉ Mboppi (PDF, jsPDF) est généré et
//     téléchargeable avec le fichier : produit, créateur, acheteur, vente,
//     date, QR pointant vers la fiche publique du produit.
// Les documents issus du Générateur portent en plus leur propre signature
// intégrée (QR + page de copyright) : les deux se complètent.
import { jsPDF } from "jspdf";
import { BASE_URL } from "./config.js";
import { makeQrDataUrl } from "./generator/protection.js";

export function isPdfFile(fileName, mime) {
  const n = String(fileName || "").toLowerCase();
  return n.endsWith(".pdf") || String(mime || "").toLowerCase() === "application/pdf";
}

/** Métadonnées d'authenticité dérivées de la vente (affichées dans le tampon). */
export function downloadMeta(sale, code) {
  return {
    saleId: sale.id,
    productName: sale.product_name || "Produit digital",
    creatorName: sale.shop_name || "",
    buyerName: sale.buyer_name || "",
    date: new Date().toLocaleString("fr-FR"),
    reference: code ? String(code).toUpperCase() : "",
    verifyUrl: `${BASE_URL}/produit/${sale.product_id || ""}`,
  };
}

export function saveBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/**
 * Tampe un PDF (ArrayBuffer) : pied de page discret sur chaque page + bloc
 * d'authenticité complet sur la dernière page. Renvoie un ArrayBuffer.
 */
export async function stampPdf(arrayBuffer, meta) {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const doc = await PDFDocument.load(arrayBuffer);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const pages = doc.getPages();
  const gray = rgb(0.42, 0.45, 0.5);
  const dark = rgb(0.12, 0.15, 0.2);

  const footer = `Vérifié sur Mboppi — ${meta.verifyUrl} — vente #${meta.saleId}`;
  for (const page of pages) {
    const { width } = page.getSize();
    const fs = Math.min(7.5, Math.max(6, width / 90));
    const tw = font.widthOfTextAtSize(footer, fs);
    page.drawText(footer, {
      x: Math.max(16, (width - tw) / 2),
      y: 14,
      size: fs,
      font,
      color: gray,
    });
  }

  // Bloc d'authenticité sur la dernière page (bas droite, zone de marge).
  const last = pages[pages.length - 1];
  const { width: lw } = last.getSize();
  const boxW = Math.min(190, lw * 0.55);
  const lines = [
    { text: "DOCUMENT DÉLIVRÉ PAR MBOPPI", bold: true, size: 9 },
    { text: `Vente #${meta.saleId} — ${meta.date}`, size: 7.5 },
    { text: `Produit : ${meta.productName}`.slice(0, 70), size: 7.5 },
    meta.creatorName ? { text: `Créateur : ${meta.creatorName}`.slice(0, 70), size: 7.5 } : null,
    meta.buyerName ? { text: `Acheteur : ${meta.buyerName}`.slice(0, 70), size: 7.5 } : null,
    meta.reference ? { text: `Code de confirmation : ${meta.reference}`, size: 7.5 } : null,
    { text: `Vérification : ${meta.verifyUrl}`.slice(0, 80), size: 7 },
  ].filter(Boolean);
  const lineH = 4.4;
  const boxH = 14 + lines.length * lineH;
  const boxX = lw - boxW - 20;
  const boxY = 26;
  last.drawRectangle({
    x: boxX,
    y: boxY,
    width: boxW,
    height: boxH,
    color: rgb(1, 1, 1),
    opacity: 0.88,
    borderColor: gray,
    borderWidth: 0.7,
  });
  let ty = boxY + boxH - 10;
  for (const ln of lines) {
    last.drawText(ln.text, {
      x: boxX + 8,
      y: ty,
      size: ln.size,
      font: ln.bold ? bold : font,
      color: ln.bold ? dark : gray,
    });
    ty -= lineH;
  }
  return doc.save();
}

/** Certificat d'authenticité Mboppi (PDF une page) pour les fichiers non modifiables. */
export async function authenticityCertificate(meta) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const W = 210;
  doc.setDrawColor(37, 99, 235);
  doc.setLineWidth(1);
  doc.rect(14, 14, W - 28, 268);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(17);
  doc.setTextColor(17, 24, 39);
  doc.text("CERTIFICAT D'AUTHENTICITÉ MBOPPI", W / 2, 34, { align: "center" });
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(80, 90, 105);
  doc.text("Ce certificat atteste que le fichier joint à la vente ci-dessous", W / 2, 43, {
    align: "center",
  });
  doc.text("a été délivré via la plateforme Mboppi.", W / 2, 49, { align: "center" });

  const rows = [
    ["Produit", meta.productName],
    ["Créateur / Boutique", meta.creatorName || "—"],
    ["Acheteur", meta.buyerName || "—"],
    ["Référence de vente", `#${meta.saleId}`],
    meta.reference ? ["Code de confirmation", meta.reference] : null,
    ["Date de téléchargement", meta.date],
  ].filter(Boolean);
  let y = 66;
  doc.setFontSize(11);
  for (const [label, value] of rows) {
    doc.setTextColor(110, 118, 132);
    doc.setFont("helvetica", "normal");
    doc.text(`${label} :`, 24, y);
    doc.setTextColor(17, 24, 39);
    doc.setFont("helvetica", "bold");
    doc.text(String(value).slice(0, 60), 84, y);
    y += 10;
  }

  // QR → fiche publique du produit (vérifiable par quiconque scanne).
  try {
    const qr = await makeQrDataUrl(meta.verifyUrl, 320);
    if (qr) {
      doc.addImage(qr, "PNG", W / 2 - 22, y + 6, 44, 44);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      doc.setTextColor(80, 90, 105);
      doc.text("Scannez pour vérifier le produit sur Mboppi", W / 2, y + 58, { align: "center" });
    }
  } catch {
    /* QR indisponible : certificat sans QR */
  }

  doc.setFontSize(9);
  doc.setTextColor(110, 118, 132);
  doc.text(`Vérification : ${meta.verifyUrl}`, W / 2, 262, { align: "center" });
  doc.setFont("helvetica", "bold");
  doc.setTextColor(37, 99, 235);
  doc.text("Authentifié sur Mboppi", W / 2, 272, { align: "center" });
  return new Blob([doc.output("arraybuffer")], { type: "application/pdf" });
}
