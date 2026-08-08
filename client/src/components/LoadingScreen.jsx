export default function LoadingScreen({ label }) {
  return (
    <div className="route-loader">
      <div className="route-loader-logo">🛍️</div>
      <div className="route-loader-spinner" />
      <p>{label || 'Chargement…'}</p>
    </div>
  );
}
