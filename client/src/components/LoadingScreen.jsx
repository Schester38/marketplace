import { useLang } from '../i18n.jsx';

export default function LoadingScreen({ label }) {
  const { t } = useLang();
  return (
    <div className="route-loader">
      <div className="route-loader-logo">🛍️</div>
      <div className="route-loader-spinner" />
      <p>{label || t('Chargement…')}</p>
    </div>
  );
}
