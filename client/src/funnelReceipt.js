// Reçu officiel du tunnel de vente « formation flash » (téléchargé par
// l'acheteur après paiement). Même approche que Invoice.jsx : jsPDF importé
// dynamiquement, logo public chargé puis embarqué, aucune dépendance serveur.
import { BASE_URL } from "./config.js";

const NAVY = [12, 26, 51];
const BLUE = [37, 99, 235];
const GOLD = [234, 179, 8];
const GREEN = [22, 163, 74];
const GRAY = [110, 116, 128];
const LIGHT = [244, 247, 252];

function money(v, currency = "XAF") {
  return `${Number(v || 0).toLocaleString("fr-FR", { maximumFractionDigits: 0 })} ${currency}`;
}

function fmtDate(value) {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString("fr-FR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

async function loadLogo() {
  try {
    const resp = await fetch("/navbar-logo.png");
    if (!resp.ok) return null;
    const blob = await resp.blob();
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

function watermark(doc, W, H) {
  try {
    doc.setGState(new doc.GState({ opacity: 0.07 }));
    doc.setFont("helvetica", "bold");
    doc.setFontSize(30);
    doc.setTextColor(...NAVY);
    for (let y = 40; y < H + 40; y += 58) {
      for (let x = -30; x < W + 30; x += 110) {
        doc.text("@mboppishop", x, y, { angle: 32 });
      }
    }
    doc.setGState(new doc.GState({ opacity: 1 }));
  } catch {
    // GState indisponible : le reçu reste lisible sans filigrane.
  }
}

function label(doc, text, x, y) {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(...GRAY);
  doc.text(String(text).toUpperCase(), x, y);
}

function value(doc, text, x, y, size = 10.5) {
  doc.setFont("helvetica", "normal");
  doc.setFontSize(size);
  doc.setTextColor(30, 38, 52);
  doc.text(String(text ?? "—"), x, y);
}

/**
 * Génère et enregistre le reçu PDF.
 * @param {object} receipt — payload renvoyé par GET /api/formation-funnel/receipt/:id
 */
export async function downloadFunnelReceipt(receipt) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF();
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const logo = await loadLogo();

  // Fond + filigrane
  doc.setFillColor(255, 255, 255);
  doc.rect(0, 0, W, H, "F");
  watermark(doc, W, H);

  // Bandeau supérieur
  doc.setFillColor(...NAVY);
  doc.rect(0, 0, W, 38, "F");
  doc.setFillColor(...GOLD);
  doc.rect(0, 38, W, 2.4, "F");

  doc.setFillColor(255, 255, 255);
  doc.circle(17, 19, 9.5, "F");
  if (logo) {
    try {
      doc.addImage(logo, "PNG", 8, 10, 18, 18);
    } catch {
      // logo non exploitable : le nom reste affiché
    }
  }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(17);
  doc.setTextColor(255, 255, 255);
  doc.text("MboppiShop", 32, 17);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(196, 208, 233);
  doc.text("Marketplace · Formations en ligne", 32, 23.5);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(...GOLD);
  doc.text("REÇU DE PAIEMENT", W - 16, 16, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(220, 228, 245);
  doc.text(`Émis le ${fmtDate(receipt.paid_at || receipt.created_at)}`, W - 16, 23, {
    align: "right",
  });

  // Code du reçu
  doc.setFillColor(...LIGHT);
  doc.roundedRect(16, 47, W - 32, 20, 3, 3, "F");
  label(doc, "Code du reçu", 21, 54.5);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(...BLUE);
  doc.text(String(receipt.receipt_code || "—"), 21, 62.5);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...GRAY);
  doc.text("À conserver : il permet à l'équipe de retrouver votre paiement.", W - 21, 59, {
    align: "right",
  });

  // Montant
  doc.setFont("helvetica", "bold");
  doc.setFontSize(28);
  doc.setTextColor(20, 32, 54);
  doc.text(money(receipt.amount, receipt.currency), 16, 84);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...GREEN);
  doc.text("PAIEMENT CONFIRMÉ", 16, 90);

  // Bloc formation
  let y = 100;
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.4);
  doc.line(16, y, W - 16, y);
  y += 8;
  label(doc, "Formation", 16, y);
  y += 5.5;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(24, 34, 52);
  doc.text(doc.splitTextToSize(String(receipt.product?.name || "Formation"), W - 32), 16, y);
  y += 8;
  label(doc, "Formateur / vendeur", 16, y);
  y += 5.5;
  value(doc, receipt.shop?.name || "MboppiShop", 16, y);

  // Bloc acheteur
  y += 12;
  doc.setFillColor(...LIGHT);
  doc.roundedRect(16, y, W - 32, 52, 3, 3, "F");
  y += 8;
  const col1 = 22;
  const col2 = W / 2 + 4;
  label(doc, "Acheteur", col1, y);
  const fullName =
    [receipt.buyer?.first_name, receipt.buyer?.last_name].filter(Boolean).join(" ") ||
    receipt.buyer?.name ||
    "—";
  value(doc, fullName, col1, y + 6, 11);
  label(doc, "E-mail", col1, y + 15);
  value(doc, receipt.buyer?.email || "—", col1, y + 21);
  label(doc, "WhatsApp", col1, y + 30);
  value(doc, receipt.buyer?.phone || "—", col1, y + 36);

  label(doc, "Ville", col2, y);
  value(doc, receipt.buyer?.city || "—", col2, y + 6, 11);
  label(doc, "Référence de vente", col2, y + 15);
  value(doc, `#${receipt.sale_id}`, col2, y + 21);
  label(doc, "Motif", col2, y + 30);
  value(
    doc,
    doc.splitTextToSize(String(receipt.buyer?.reason || "—"), W / 2 - 24)[0] || "—",
    col2,
    y + 36
  );

  // Bloc récapitulatif
  y += 62;
  doc.setDrawColor(226, 232, 240);
  doc.line(16, y, W - 16, y);
  y += 8;
  label(doc, "Récapitulatif", 16, y);
  y += 8;
  const line = (l, v, bold = false) => {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(bold ? 10.5 : 9.5);
    doc.setTextColor(...(bold ? [22, 32, 52] : GRAY));
    doc.text(l, 16, y);
    doc.setTextColor(...(bold ? [22, 32, 52] : [60, 70, 88]));
    doc.text(v, W - 16, y, { align: "right" });
    y += 7.5;
  };
  line("Formation", receipt.product?.name || "—");
  line("Quantité", String(receipt.quantity || 1));
  line("Mode de paiement", "En ligne (iKeePay)");
  line("Statut", "Payé");
  line("Total réglé", money(receipt.amount, receipt.currency), true);

  // Pied de page
  const footY = H - 26;
  doc.setDrawColor(226, 232, 240);
  doc.line(16, footY - 8, W - 16, footY - 8);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.8);
  doc.setTextColor(...GRAY);
  doc.text(
    "Ce reçu atteste du paiement de la formation ci-dessus sur MboppiShop.",
    16,
    footY - 2
  );
  doc.text(
    `Vérification : ${String(receipt.site_url || BASE_URL).replace(/\/$/, "")}/f/${receipt.product?.id || ""}`,
    16,
    footY + 3
  );
  doc.setTextColor(...NAVY);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("@mboppishop", W - 16, footY + 3, { align: "right" });

  const safeCode = String(receipt.receipt_code || "recu").replace(/[^A-Za-z0-9-]/g, "");
  doc.save(`Recu-MboppiShop-${safeCode}.pdf`);
}
