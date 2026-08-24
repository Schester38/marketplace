import { useLang } from "../i18n.jsx";
import Logo from "./Logo.jsx";

export default function LoadingScreen({ label }) {
  const { t } = useLang();
  return (
    <div className="route-loader">
      <Logo className="route-loader-logo" />
      <div className="route-loader-spinner" />
      <p>{label || t("Chargement…")}</p>
    </div>
  );
}
