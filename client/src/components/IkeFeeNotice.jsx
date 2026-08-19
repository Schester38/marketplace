import React from 'react';
import { useLang } from '../i18n.jsx';
import { IKE_FEE_PERCENT, ikePayFee, currencySymbol } from '../config.js';
import { formatMoney } from './ProductCard.jsx';

export default function IkeFeeNotice({ amount, currency, title, children }) {
  const { t } = useLang();
  const hasAmount = amount !== undefined && amount !== null && Number.isFinite(Number(amount));
  const fee = hasAmount ? ikePayFee(amount) : null;
  const symbol = currencySymbol(currency);

  return (
    <div className="ike-fee-notice" role="note">
      <p className="ike-fee-notice-title">
        💳 {title || t('Frais iKeePay {percent} %', { percent: IKE_FEE_PERCENT })}
      </p>
      <p className="ike-fee-notice-text">
        {t(
          'iKeePay, notre partenaire de paiement, prélève {percent} % sur chaque transaction (paiement en ligne ou versement).',
          { percent: IKE_FEE_PERCENT }
        )}
      </p>
      {fee !== null && (
        <p className="ike-fee-notice-amount">
          {t('Prélèvement sur ce montant : {fee} {symbol}', { fee: formatMoney(fee), symbol })}
        </p>
      )}
      {children}
    </div>
  );
}
