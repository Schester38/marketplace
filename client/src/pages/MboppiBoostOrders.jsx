import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import Seo from "../components/Seo.jsx";
import { useLang } from "../i18n.jsx";
import { api } from "../api.js";
import { useAuth } from "../App.jsx";

export default function MboppiBoostOrders() {
  const { t } = useLang();
  const { user } = useAuth();

  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchOrders();
  }, []);

  async function fetchOrders() {
    try {
      const resp = await api.get("/smm/orders");
      setOrders(resp.data?.orders || []);
    } catch (err) {
      setError("Impossible de charger vos commandes.");
    } finally {
      setLoading(false);
    }
  }

  const statusLabels = {
    draft: "Brouillon",
    pending_payment: "Paiement en attente",
    paid: "Payé",
    submitted: "Soumise au prestataire",
    processing: "En cours de traitement",
    completed: "Terminée",
    failed: "Échouée",
    cancelled: "Annulée",
    refund_pending: "Remboursement en attente",
    refunded: "Remboursée",
  };

  if (loading) {
    return (
      <main className="container">
        <Seo title="Mes commandes — MboppiBoost" />
        <p>{t("Chargement…")}</p>
      </main>
    );
  }

  return (
    <main className="container">
      <Seo title="Mes commandes — MboppiBoost" description="Suivez vos commandes MboppiBoost." />
      <section className="section">
        <div className="section-head">
          <h2>{t("Mes commandes MboppiBoost")}</h2>
          <p>{t("Suivez l'état de vos commandes de services marketing digital.")}</p>
        </div>

        {!user && (
          <div className="card">
            <p>{t("Connectez-vous pour accéder à vos commandes.")}</p>
            <Link to="/login" className="btn btn-primary">{t("Se connecter")}</Link>
          </div>
        )}

        {orders.length === 0 && user && (
          <div className="card">
            <p>{t("Aucune commande pour le moment.")}</p>
            <Link to="/mboppi-boost" className="btn btn-primary">{t("Découvrir les services")}</Link>
          </div>
        )}

        {orders.length > 0 && (
          <div className="orders-table">
            <table>
              <thead>
                <tr>
                  <th>{t("N°")}</th>
                  <th>{t("Service")}</th>
                  <th>{t("Total")}</th>
                  <th>{t("Statut")}</th>
                  <th>{t("Date")}</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.id}>
                    <td>#{o.id}</td>
                    <td>{o.service_name}</td>
                    <td>{o.total} {o.currency}</td>
                    <td>
                      <span className={`badge badge-${o.status}`}>{statusLabels[o.status] || o.status}</span>
                    </td>
                    <td>{new Date(o.created_at).toLocaleDateString("fr-FR")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}