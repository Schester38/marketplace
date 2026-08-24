import React from 'react';
import { useLang } from '../i18n.jsx';
import { IconPercentage, IconBanknote, IconShieldCheck, IconTruck } from './icons.jsx';

/**
 * Rangée de badges de confiance sous le carrousel :
 * 0 % de frais · paiement à la livraison · boutiques vérifiées · livraison suivie.
 */
export default function TrustBadges() {
  const { t } = useLang();
  const badges = [
    { icon: <IconPercentage size={22} />, cls: 'tb-orange', title: t('0 % de frais plateforme'), sub: t('Paiements directs entre parties') },
    { icon: <IconBanknote size={22} />, cls: 'tb-green', title: t('Paiement à la livraison'), sub: t('Espèces ou Mobile Money') },
    { icon: <IconShieldCheck size={22} />, cls: 'tb-blue', title: t('Boutiques vérifiées'), sub: t('Vendeurs identifiés et notés') },
    { icon: <IconTruck size={22} />, cls: 'tb-violet', title: t('Livraison suivie'), sub: t('Code de confirmation à la remise') },
  ];
  return (
    <section className="trust-badges" aria-label={t('Nos garanties')}>
      {badges.map((b) => (
        <div className={`trust-badge ${b.cls}`} key={b.title}>
          <span className="trust-badge-icon" aria-hidden="true">{b.icon}</span>
          <span className="trust-badge-text">
            <strong>{b.title}</strong>
            <small>{b.sub}</small>
          </span>
        </div>
      ))}
    </section>
  );
}
