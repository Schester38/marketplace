function money(v, symbol = 'F') {
  return `${Number(v || 0).toLocaleString('fr-FR', { maximumFractionDigits: 0 })} ${symbol}`;
}

const BLUE = [37, 99, 235];
const BLUE_DARK = [23, 37, 84];
const GREEN = [22, 163, 74];
const GRAY = [120, 120, 120];
const LIGHT = [243, 246, 251];

function box(doc, x, y, w, h, fill = LIGHT) {
  doc.setFillColor(...fill);
  doc.roundedRect(x, y, w, h, 3, 3, 'F');
}

function row(doc, label, value, y, options = {}) {
  const { bold = false, color = [40, 40, 40], align = 90 } = options;
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...GRAY);
  doc.setFontSize(9.5);
  doc.text(label, 16, y);
  doc.setFont('helvetica', bold ? 'bold' : 'normal');
  doc.setTextColor(...color);
  doc.setFontSize(10);
  doc.text(String(value), align, y);
  return y + 6.5;
}

export async function downloadInvoice(sale, t, symbol = 'F') {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF();
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();

  let logo = null;
  try {
    const resp = await fetch('/navbar-logo.png');
    if (resp.ok) {
      const blob = await resp.blob();
      logo = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(blob);
      });
    }
  } catch {
    logo = null;
  }

  doc.setFillColor(...BLUE_DARK);
  doc.rect(0, 0, W, 34, 'F');
  doc.setFillColor(...BLUE);
  doc.rect(0, 34, W, 3, 'F');

  doc.setFillColor(255, 255, 255);
  doc.circle(14, 17, 9, 'F');
  if (logo) {
    try {
      doc.addImage(logo, 'PNG', 5.5, 8.5, 17, 17);
    } catch {
      logo = null;
    }
  }
  if (!logo) {
    doc.setTextColor(...BLUE_DARK);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text('M', 14, 20.5, { align: 'center' });
  }

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(19);
  doc.text('Mboppi', 27, 17);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(190, 205, 235);
  doc.text(t('Marché en ligne — livraison confirmée'), 27, 24);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(255, 255, 255);
  doc.text(t('FACTURE'), W - 14, 14, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(`${t('N°')} ${sale.id}`, W - 14, 21, { align: 'right' });
  if (sale.delivered_at) {
    doc.text(
      new Date(sale.delivered_at).toLocaleString(),
      W - 14,
      27,
      { align: 'right' }
    );
  }

  doc.setFillColor(...GREEN);
  doc.roundedRect(W - 52, 39, 38, 12, 2, 2, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.text(`✓ ${t('LIVRÉ')}`, W - 33, 47, { align: 'center' });

  let y = 58;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...BLUE_DARK);
  doc.text(t('Boutique'), 16, y);
  y += 6;
  box(doc, 14, y - 4.5, W - 28, 22, LIGHT);
  y = row(doc, t('Nom'), sale.shop_name || '—', y + 1);
  y = row(doc, t('Contact'), sale.shop_contact || '—', y) + 3;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...BLUE_DARK);
  doc.text(t('Vendeur'), 16, y);
  y += 6;
  box(doc, 14, y - 4.5, W - 28, 28, LIGHT);
  y = row(doc, t('Nom'), sale.seller_name || '—', y + 1);
  y = row(doc, t('Code vendeur'), sale.seller_code || '—', y);
  y = row(doc, t('Téléphone'), sale.seller_phone || sale.shop_contact || '—', y) + 3;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...BLUE_DARK);
  doc.text(t('Client'), 16, y);
  y += 6;
  box(doc, 14, y - 4.5, W - 28, 35, LIGHT);
  y = row(doc, t('Nom'), sale.buyer_name || '—', y + 1);
  if (sale.buyer_phone) y = row(doc, t('Téléphone'), sale.buyer_phone, y);
  if (sale.buyer_city) y = row(doc, t('Ville'), sale.buyer_city, y);
  if (sale.buyer_address) y = row(doc, t('Adresse'), sale.buyer_address, y) + 3;

  const unitPrice =
    sale.purchase_price != null
      ? Number(sale.purchase_price)
      : Math.round((Number(sale.total_price || 0) / Number(sale.quantity || 1)) * 100) / 100;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...BLUE_DARK);
  doc.text(t('Article'), 16, y);
  y += 6;
  box(doc, 14, y - 4.5, W - 28, 26, LIGHT);
  y = row(doc, t('Produit'), sale.product_name || '—', y + 1);
  y = row(doc, t('Quantité'), sale.quantity, y);
  y = row(doc, t('Prix unitaire'), money(unitPrice, symbol), y) + 3;

  doc.setDrawColor(190, 200, 220);
  doc.setLineWidth(0.3);
  doc.line(16, y - 3, W - 16, y - 3);
  y += 2;
  y = row(doc, t('Montant article'), money(sale.total_price, symbol), y, { bold: true });
  y = row(doc, t('Frais de livraison'), money(sale.delivery_fee, symbol), y);
  y = row(
    doc,
    t('Total à payer'),
    money(Number(sale.total_price || 0) + Number(sale.delivery_fee || 0), symbol),
    y + 1,
    { bold: true, color: BLUE }
  );
  y = row(doc, t('Paiement'), sale.payment_method === 'mobile' ? t('Par Mobile') : t('En Espèce'), y);

  if (sale.confirm_code) {
    doc.setFillColor(255, 249, 231);
    doc.roundedRect(14, y - 4.5, W - 28, 16, 3, 3, 'F');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...GRAY);
    doc.text(t('Code de confirmation'), 20, y + 1);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(...BLUE_DARK);
    doc.text(String(sale.confirm_code), W - 20, y + 1, { align: 'right' });
    y += 18;
  }

  y += 6;
  doc.setDrawColor(190, 200, 220);
  doc.setLineWidth(0.3);
  doc.line(16, y - 3, W - 16, y - 3);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...GRAY);
  doc.text(t('Facture générée par Mboppi — marchandise livrée.'), 16, y + 2);
  doc.text('https://mboppi-mboppi.vercel.app', 16, y + 7);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.text('✓', W - 16, H - 9, { align: 'right' });

  doc.save(`facture-${sale.id}.pdf`);
}
