import { jsPDF } from 'jspdf';

function money(v) {
  return `${Number(v || 0).toLocaleString('fr-FR', { maximumFractionDigits: 0 })} F`;
}

export function downloadInvoice(sale, t, symbol = 'F') {
  const doc = new jsPDF();
  const W = doc.internal.pageSize.getWidth();
  let y = 18;

  doc.setFillColor(13, 110, 253);
  doc.rect(0, 0, W, 30, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text('Mboppi', 14, 15);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(t('Facture'), 14, 22);

  doc.setTextColor(40, 40, 40);
  y = 44;
  const line = (label, value, bold = false) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.text(label, 14, y);
    doc.setFont('helvetica', 'normal');
    doc.text(String(value), 90, y);
    y += 7;
  };

  doc.setFont('helvetica', 'bold');
  doc.text(t('Facture N°') + ' : ' + sale.id, 14, y);
  y += 7;
  doc.setFont('helvetica', 'normal');
  if (sale.delivered_at) {
    line(t('Date de livraison'), new Date(sale.delivered_at).toLocaleString());
  }
  y += 3;

  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('— ' + t('Boutique'), 14, y);
  y += 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  line(t('Nom'), sale.shop_name || '—');
  y += 2;

  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('— ' + t('Vendeur'), 14, y);
  y += 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  line(t('Nom'), sale.seller_name || '—');
  line(t('Code vendeur'), sale.seller_code || '—');
  y += 2;

  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('— ' + t('Client'), 14, y);
  y += 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  line(t('Nom'), sale.buyer_name || '—');
  if (sale.buyer_phone) line(t('Téléphone'), sale.buyer_phone);
  if (sale.buyer_city) line(t('Ville'), sale.buyer_city);
  if (sale.buyer_address) line(t('Adresse'), sale.buyer_address);
  y += 2;

  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('— ' + t('Article'), 14, y);
  y += 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  line(t('Produit'), sale.product_name || '—');
  line(t('Quantité'), sale.quantity);
  line(t('Prix unitaire'), `${money(sale.product_price)} ${symbol}`);
  y += 2;

  doc.setDrawColor(200, 200, 200);
  doc.line(14, y, W - 14, y);
  y += 8;
  line(t('Montant article'), `${money(sale.total_price)} ${symbol}`, true);
  line(t('Frais de livraison'), `${money(sale.delivery_fee)} ${symbol}`);
  line(t('Total à payer'), `${money(Number(sale.total_price || 0) + Number(sale.delivery_fee || 0))} ${symbol}`, true);
  line(t('Paiement'), sale.payment_method === 'mobile' ? t('Par Mobile') : t('En Espèce'));
  y += 6;

  doc.setFontSize(9);
  doc.setTextColor(120, 120, 120);
  doc.text(t('Facture générée par Mboppi — marchandise livrée.'), 14, y);
  doc.text('https://mboppi-mboppi.vercel.app', 14, y + 5);

  doc.save(`facture-${sale.id}.pdf`);
}
