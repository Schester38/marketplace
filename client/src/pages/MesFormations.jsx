import React from "react";
import { Link } from "react-router-dom";
import Seo from "../components/Seo.jsx";

function MesFormations() {
  return (
    <>
      <Seo title="Mes formations — MboppiShop" />
      <main className="boost-page">
        <div className="boost-shell">
          <h1 style={{ fontSize: 28, fontWeight: 800, margin: 0 }}>Mes formations</h1>
          <p style={{ marginTop: 12, color: "var(--text-muted,#666)" }}>
            Retrouvez ici les formations que vous avez achetées. (Fonctionnalité en cours de développement.)
          </p>
          <div style={{ marginTop: 24, padding: 32, border: "1px dashed var(--border,#ddd)", borderRadius: 12, textAlign: "center" }}>
            <p className="hint">Aucune formation pour le moment.</p>
            <Link to="/formations" className="boost-btn boost-btn-primary" style={{ marginTop: 12 }}>
              Découvrir les formations
            </Link>
          </div>
        </div>
      </main>
    </>
  );
}

export default MesFormations;
