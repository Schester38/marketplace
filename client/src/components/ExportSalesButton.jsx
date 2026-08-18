import React, { useState } from 'react';
import { api } from '../api.js';
import { useLang } from '../i18n.jsx';
import { downloadCsv } from '../utils.js';

export default function ExportSalesButton() {
  const { t } = useLang();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const exportCsv = async () => {
    setBusy(true);
    setError('');
    try {
      const d = await api.exportSales();
      const rows = d.sales.map((s) => [
        s.id,
        s.created_at ? new Date(s.created_at).toLocaleString() : '',
        s.product_name,
        s.shop_name,
        s.seller_name,
        s.buyer_name,
        s.buyer_city,
        s.quantity,
        s.total_price,
        s.commission,
        s.referral_commission ?? '',
        s.referral_paid ? t('Payée') : s.referral_commission > 0 ? t('En attente') : '',
        s.purchase_price ?? '',
        s.delivery_fee,
        s.status,
        s.delivered_at ? new Date(s.delivered_at).toLocaleString() : '',
      ]);
      downloadCsv(
        `mboppi-ventes-${new Date().toISOString().slice(0, 10)}.csv`,
        [
          'ID',
          t('Date'),
          t('Produit'),
          t('Boutique'),
          t('Vendeur'),
          t('Client'),
          t('Ville'),
          t('Quantité'),
          t('Total'),
          t('Commission'),
          t('Commission parrainage'),
          t('Paiement parrainage'),
          t('Prix payé'),
          t('Livraison'),
          t('Statut'),
          t('Livré le'),
        ],
        rows
      );
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <span className="export-wrap">
      <button type="button" className="btn btn-outline btn-small" onClick={exportCsv} disabled={busy}>
        📥 {busy ? t('Export…') : t('Exporter CSV')}
      </button>
      {error && <span className="error export-error">{error}</span>}
    </span>
  );
}
