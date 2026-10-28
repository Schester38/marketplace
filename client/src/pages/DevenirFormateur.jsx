import React from "react";
import { Link } from "react-router-dom";
import Seo from "../components/Seo.jsx";

function DevenirFormateur() {
  return (
    <>
      <Seo title="Devenir formateur — MboppiShop" />
      <main className="boost-page">
        <div className="boost-shell">
          <section style={{ padding: "48px 0 24px", textAlign: "center" }}>
            <h1 style={{ fontSize: 36, fontWeight: 800, margin: 0, lineHeight: 1.2 }}>
              Devenez formateur sur MboppiShop
            </h1>
            <p style={{ marginTop: 14, fontSize: 17, color: "var(--text-muted,#666)", maxWidth: 720, margin: "14px auto 0" }}>
              Partagez vos connaissances, créez des formations de qualité et touchez des apprenants à travers toute l'Afrique.
            </p>
            <div style={{ marginTop: 24, display: "flex", justifyContent: "center", gap: 10, flexWrap: "wrap" }}>
              <Link to="/register" className="boost-btn boost-btn-primary">
                Créer un compte créateur
              </Link>
              <Link to="/formations" className="boost-btn boost-btn-secondary">
                Voir les formations
              </Link>
            </div>
          </section>

          <section style={{ marginTop: 32, display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
            {[
              { title: "Créez vos cours", desc: "Vidéos, PDF, quiz et ressources téléchargeables." },
              { title: "Vendez en ligne", desc: "Paiement Mobile Money, accès sécurisé pour vos apprenants." },
              { title: "Suivez vos revenus", desc: "Tableau de bord, statistiques et retraits." },
            ].map((f) => (
              <div key={f.title} style={{ padding: 20, border: "1px solid var(--border,#eee)", borderRadius: 12 }}>
                <h3 style={{ margin: 0, fontSize: 18 }}>{f.title}</h3>
                <p style={{ marginTop: 8, color: "var(--text-muted,#666)", fontSize: 14 }}>{f.desc}</p>
              </div>
            ))}
          </section>
        </div>
      </main>
    </>
  );
}

export default DevenirFormateur;
