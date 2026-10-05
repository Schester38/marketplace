// ============================================================================
// FamiliCashDownload — la page de TELECHARGEMENT de l'application
// ----------------------------------------------------------------------------
// ⚠️ LE MONTAGE SUR ANDROID N'EST PAS AUTOMATIQUE, ET LA PAGE LE DIT
// -----------------------------------------------------------
// C'est le point le plus important de ce fichier. Beaucoup d'applications
// telechargees hors magasin promettent « installation en un clic » : c'est
// FAUX depuis Android 8. L'utilisateur doit, une SEULE FOIS, autoriser son
// navigateur a installer des applications inconnues. La page explique donc
// l'etape, sinon les utilisateurs concluent que le site est casse.
//
// ⚠️ LE MANIFESTE EST UN FICHIER PUBLIC, VOLONTAIREMENT
// -------------------------------------------------
// `public/familicash/app/manifest.json` est servi tel quel : il ne contient
// qu'un numero de version et l'adresse de l'APK, aucune donnee personnelle. Il
// n'a donc AUCUNE raison d'etre protege — le proteger obligerait l'app a
// s'authentifier, donc a ajouter un appel reseau au moment de verifier la
// mise a jour.
//
// ⚠️ LA MISE A JOUR EST UN RAPPEL, PAS UNE VAUTE
// ---------------------------------------------
// Le bouton « Mettre a jour » de l'application ouvre cette meme page.
// L'application peut verifier seule ; la page sert l'utilisateur qui prefere
// telecharger a la main, ou qui veut voir ce qu'il installe.
// ============================================================================

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

// Le manifeste publie : version, taille, notes. Un `fetch` suffit — le fichier
// fait quelques centaines d'octets, et le cache navigateur evite la requete.
const MANIFEST_URL = "/familicash/app/manifest.json";

const TELECHARGER = "/familicash/app/familicash.apk";

// Version affichee si le manifeste est injoignable. Elle doit correspondre au
// `version:` de `apps/mobile/pubspec.yaml` : c'est la seule coherence qui
// compte, et elle se verifie a la main lors de chaque publication.
const VERSION_PAR_DEFAUT = "0.1.0";

export default function FamiliCashDownload() {
  const [m, setM] = useState(null);
  const [erreur, setErreur] = useState(false);

  useEffect(() => {
    let vivant = true;
    fetch(MANIFEST_URL, { cache: "no-cache" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((json) => {
        // Le garde `vivant` evite d'ecrire dans l'etat apres le demontage du
        // composant : React leve alors une alerte en developpement, et le
        // message est incomprehensible.
        if (vivant) setM(json);
      })
      .catch(() => {
        // La page reste UTILISABLE sans manifeste : le bouton de telechargement
        // n'en depend pas. Un manifeste illisible ne doit pas la transformer en
        // page blanche.
        if (vivant) setErreur(true);
      });
    return () => {
      vivant = false;
    };
  }, []);

  const version = (m && (m.version_name || m.version)) || VERSION_PAR_DEFAUT;
  const taille = m && m.apk_size ? Math.round(m.apk_size / (1024 * 1024)) : null;
  const notes = m && m.notes;

  return (
    <main className="fc-page">
      <h1>FamiliCash — Budget Familial</h1>
      <p className="fc-lead">
        Le coffre-fort financier de votre foyer. Vos depenses restent sur votre
        telephone : aucun compte, aucun envoi de donnees.
      </p>

      <div className="fc-bloc-telechargement">
        <h2>Version {version}</h2>
        {taille ? <p className="fc-note">Telechargement : {taille} Mo</p> : null}

        {/* Le bouton est TOUJOURS present, meme sans manifeste : un manifeste
            illisible ne doit pas interdire l'installation. */}
        <a className="fc-bouton" href={TELECHARGER} download>
          Telecharger pour Android
        </a>

        {erreur ? (
          <p className="fc-note">
            Version exacte indisponible pour le moment, mais le telechargement
            fonctionne.
          </p>
        ) : null}

        {notes ? (
          <>
            <h3>Ce qui change</h3>
            <p>{notes}</p>
          </>
        ) : null}
      </div>

      {/* ⚠️ CETTE SECTION N'EST PAS UN DETAIL : C'EST LE POINT QUI EVITE
          L'ABANDON. Les utilisateurs qui echouent a l'installation quitent le
          site en croyant a un produit casse. */}
      <div className="fc-bloc-etapes">
        <h2>Comment installer</h2>
        <ol>
          <li>
            <strong>Telechargez le fichier</strong> app.apk. Votre telephone
            va peut-etre demander l'autorisation d'installer depuis le
            navigateur : repondez <em>Autoriser</em>.
          </li>
          <li>Ouvrez le fichier telecharge et appuyez sur <em>Installer</em>.</li>
          <li>
            Android affiche un dernier avertissement de securite : c'est
            normal pour une application absente du Play Store. Appuyez sur
            <em> Installer quand meme</em>.
          </li>
        </ol>
        <p className="fc-note">
          Cette autorisation ne vous sera demandee qu'une seule fois. Ensuite, les
          mises a jour se lancent depuis le bouton « Mise a jour », en bas de
          l'onglet Plus.
        </p>
      </div>

      <div className="fc-bloc-questions">
        <h2>Questions fréquentes</h2>

        <h3>Pourquoi l'installation demande-t-elle une autorisation ?</h3>
        <p>
          Android interdit a toute application d'en installer une autre sans
          votre accord. C'est une protection du systeme, contre les applications
          qui installeraient des choses a votre insu.
        </p>

        <h3>Le telephone va-t-il m'avertir pour chaque version ?</h3>
        <p>
          Oui, la premiere fois seulement pour une meme source. Ensuite Android
          reconnait que c'est toujours la meme application.
        </p>

        <h3>Mes donnees partent-elles quelque part ?</h3>
        <p>
          Non. Tout reste sur votre telephone, dans une base chiffree. Le
          telechargement ne transmet rien de personnel : ni compte, ni numero,
          ni depenses.
        </p>

        <h3>Comment recuperer mes donnees si je change de telephone ?</h3>
        <p>
          Sauvegardez en <em>.bfi</em> avant de changer : ce fichier chiffre vous
          suffit a tout retrouver, y compris hors de l'application. Il reste
          gratuit, quelle que soit la formule.
        </p>
      </div>

      <div className="fc-bloc-pied">
        <Link to="/">Retour a l'accueil</Link>
        <span> · </span>
        <Link to="/donnees">Vie privée</Link>
      </div>
    </main>
  );
}
