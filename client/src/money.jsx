// Ligne « ≈ équivalent » sous un prix — AFFICHAGE SEUL, jamais persisté.
// Logique pure dans client/src/conversion.js (testée sous Node) ; ce composant
// lit uniquement le pays du visiteur CONNECTÉ (useAuth) : déconnecté → rien,
// devise identique → rien, conversion inconnue → rien.
import { useAuth } from "./App.jsx";
import { equivLabel } from "./conversion.js";

export function PriceEquivalent({ amount, fromCode, className = "price-conv" }) {
  const { user } = useAuth();
  const label = equivLabel(amount, fromCode, user?.country);
  if (!label) return null;
  return <span className={className}>{label}</span>;
}