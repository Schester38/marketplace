import React from "react";
import { Link } from "react-router-dom";
import Seo from "../components/Seo.jsx";
import CreatorDashboard from "./CreatorDashboard.jsx";

function EspaceFormateur() {
  return (
    <>
      <Seo title="Espace formateur — MboppiShop" />
      <CreatorDashboard />
    </>
  );
}

export default EspaceFormateur;
