import { useState } from "react";
import { useLang } from "../i18n.jsx";

const BIO = `Ndjoum Jean Arthur est un entrepreneur et visionnaire passionné par l'innovation, le commerce et la transformation digitale. Convaincu que le numérique représente une formidable opportunité de développement économique, il s'est donné pour ambition de faciliter les échanges commerciaux et de créer de nouvelles opportunités d'affaires grâce à la technologie.

Il est le fondateur et créateur de MboppiShop, accessible sur www.mboppishop.com, une plateforme marketplace conçue pour rapprocher acheteurs et vendeurs, simplifier les transactions et rendre le commerce en ligne plus accessible.

À travers MboppiShop, Ndjoum Jean Arthur porte une vision ambitieuse : construire un écosystème commercial numérique dynamique, où chaque entrepreneur, commerçant, particulier ou porteur de projet peut bénéficier des opportunités offertes par Internet pour développer ses activités.

Son engagement repose sur trois valeurs fondamentales : l'innovation, l'accessibilité et l'esprit entrepreneurial.

Au-delà de la création d'une plateforme, son ambition est de participer activement à l'évolution du commerce en Afrique, en encourageant la digitalisation des activités commerciales et en contribuant à l'émergence d'une nouvelle génération d'entrepreneurs connectés.

Sa devise entrepreneuriale résume parfaitement cette vision :
ACHETEZ • VENDEZ • GAGNEZ
MboppiShop
Le commerce autrement. Les opportunités pour tous.`;

export default function FounderBio() {
  const { t } = useLang();
  const [expanded, setExpanded] = useState(false);
  return (
    <section className="section founder-bio-section" aria-labelledby="founder-bio-title">
      <div className="section-head">
        <h2 id="founder-bio-title" className="founder-bio-name">
          Ndjoum Jean Arthur
        </h2>
        <p className="founder-bio-role">{t("ENTREPRENEUR • FONDATEUR • VISIONNAIRE DU DIGITAL")}</p>
      </div>
      <div className="founder-bio">
        <div className="founder-bio-photo-wrap">
          <div className="founder-bio-photo-ring">
            <img
              src="/ndjoum-jean-arthur.png"
              alt="Ndjoum Jean Arthur — Fondateur de MboppiShop"
              className="founder-bio-photo"
              loading="lazy"
            />
          </div>
        </div>
        <div className="founder-bio-text-wrap">
          <div className={`founder-bio-text ${expanded ? "expanded" : "collapsed"}`}>
            {BIO.split("\n\n").map((para, i) => {
              if (para.includes("ACHETEZ • VENDEZ • GAGNEZ")) {
                return (
                  <div key={i}>
                    <p>Sa devise entrepreneuriale résume parfaitement cette vision :</p>
                    <blockquote className="founder-bio-quote">
                      <p className="founder-bio-motto">ACHETEZ • VENDEZ • GAGNEZ</p>
                      <p className="founder-bio-brand">MboppiShop</p>
                      <p className="founder-bio-tagline">
                        Le commerce autrement. Les opportunités pour tous.
                      </p>
                    </blockquote>
                  </div>
                );
              }
              return <p key={i}>{para}</p>;
            })}
          </div>
          <button
            type="button"
            className="founder-bio-toggle"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
          >
            {expanded ? "Voir moins ↑" : "Voir la suite ↓"}
          </button>
        </div>
      </div>
    </section>
  );
}
