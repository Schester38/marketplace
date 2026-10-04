// ============================================================================
// FamiliCash — relais de paiement (licences) + distributeur de clé publique
// ----------------------------------------------------------------------------
// L'application mobile FamiliCash a besoin d'un « comptoir » côté serveur pour
// parler à iKeePay sans jamais embarquer la clé secrète dans l'APK : un APK est
// une archive ZIP lisible par n'importe qui, et une clé extraite permettrait de
// lire les transactions du marchand et de créer des paiements en son nom.
//
// Chemin public : https://www.mboppishop.com/familicash/api/
//   (route ajoutée dans vercel.json, montage dans app.js AVANT originCheck :
//    l'application native n'envoie aucun header Origin.)
//
// Contrat (clés anglaises comme le reste de l'API, messages en français) :
//   GET  ?action=ping    → vitals + catalogue des offres (aucun accès base)
//   GET  ?action=cle     → clé PUBLIQUE Ed25519 (PEM + brut base64url) à graver
//                          dans l'application
//   POST ?action=payer    {id, plan, email?} → commande + URL de checkout
//                          iKeePay. Le MONTANT n'est jamais lu du client : il
//                          vient du catalogue serveur (une application modifiée
//                          qui enverrait « amount: 1 » n'obtient rien).
//   GET  ?action=licence  {id, reference} → état + licence signée dès que le
//                          paiement est confirmé (sondage après redirection)
//   POST ?action=webhook  {k|<x-ikeepay-token>} → outil d'exploitation : rejoue
//                          la confirmation d'un paiement (le vrai webhook
//                          iKeePay arrive sur /api/ikeepay/webhook, qui route
//                          les références MBP-FC vers familicashOrders.js)
//
// Aucune action ne fait confiance au client pour un montant, une devise ou une
// licence : la licence n'est signée qu'après confirmation d'un paiement dont le
// montant correspond EXACTEMENT à la commande enregistrée.
// ============================================================================
import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { timingSafeEqual } from "node:crypto";
import {
  addPublicKey,
  buildInlineCheckoutUrl,
  genExternalRef,
  getIkeepayKeys,
  getWebhookSecret,
} from "../services/ikeepay.js";
import {
  FC_CURRENCY,
  FC_HOUSEHOLD_RE,
  FC_PLANS,
  confirmFcOrderPayment,
  createFcOrder,
  getHouseholdLicense,
  getOrderState,
  planOf,
} from "../services/familicashOrders.js";
import {
  FC_LICENSE_ALGO,
  FC_LICENSE_PREFIX,
  FC_PUBLIC_KEY_URL,
  getLicensePublicInfo,
} from "../services/fcLicense.js";

const router = Router();

// Version du contrat, affichée par « ping » : à incrémenter dès qu'une réponse
// change de forme (l'application s'en sert pour diagnostiquer un décalage).
const FC_API_VERSION = "2026-10-03-v1";

// Le chemin est public : on borne les appels par adresse IP pour qu'un robot ne
// puisse pas marteler l'endpoint (création de commandes en base, checkout…).
router.use(
  rateLimit({
    windowMs: 60 * 1000,
    max: 120,
    standardHeaders: true,
    legacyHeaders: false,
    message: { ok: false, error: "Trop de requêtes, réessayez plus tard" },
  })
);

// Limiteur resserré sur la création de commandes : chaque appel écrit en base.
const limiteurPayer = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: "Trop de tentatives de paiement, réessayez dans une minute" },
});

// « next("route") » (et non un next() simple) est utilisé par les gardes
// d'action : dans une route portant plusieurs gestionnaires, un next() simple
// passe au gestionnaire SUIVANT de la même route — la garde serait contournée.
function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

// Une réponse de relais n'est jamais mise en cache : elle dépend d'un paiement.
router.use((req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});

// Compatibilité : la première version du relais était en PHP et s'appelait
// /familicash/api/index.php?action=… — d'éventuels liens déjà publiés (et les
// guides remis à l'utilisateur) continuent de fonctionner : le chemin est
// ramené à la racine du routeur, où sont servies toutes les actions.
router.use((req, res, next) => {
  const [path, query] = String(req.url || "/").split("?");
  if (path === "/index.php" || path === "/index.php/") {
    req.url = "/" + (query ? "?" + query : "");
  }
  next();
});

// Le client peut poster l'action en JSON aussi bien que la passer en query :
// les deux emplacements sont donc lus.
function actionOf(req) {
  const raw = (req.query && req.query.action) || (req.body && req.body.action) || "";
  return String(Array.isArray(raw) ? raw[0] : raw)
    .trim()
    .toLowerCase();
}

function paramOf(req, ...names) {
  for (const name of names) {
    const fromQuery = req.query && req.query[name];
    const fromBody = req.body && req.body[name];
    const value = fromQuery != null && fromQuery !== "" ? fromQuery : fromBody;
    if (value != null && value !== "") {
      return String(Array.isArray(value) ? value[0] : value).trim();
    }
  }
  return "";
}

function refus(res, status, code, message) {
  return res.status(status).json({ ok: false, code, error: message });
}

// Message unique pour un identifiant de foyer refusé (l'alphabet et la forme
// FC-XXXX-XXXX sont la seule validation possible : aucune inscription, aucun
// compte — le foyer existe parce que l'application l'a créé localement).
const MESSAGE_FOYER =
  "Identifiant de foyer invalide : format attendu FC-XXXX-XXXX (8 caractères, sans 0, O, 1, I ni L)";

const CATALOGUE = Object.values(FC_PLANS).map((offer) => ({
  code: offer.code,
  libelle: offer.label,
  montant: offer.amount,
  jours: offer.days,
  devise: FC_CURRENCY,
}));

// Charge utile d'état : sert à la fois à « ?action=ping » et à l'ouverture
// directe de l'URL dans un navigateur (aucune action demandée). AUCUN accès
// base : ce point doit répondre même si PostgreSQL est indisponible.
function pingPayload() {
  return {
    ok: true,
    logiciel: "FamiliCash — relais de paiement",
    etat: "actif",
    version: FC_API_VERSION,
    hote: "https://www.mboppishop.com/familicash/api/",
    action: "ping",
    actions: ["ping", "cle", "payer", "licence"],
    plans: CATALOGUE,
    devises: ["XAF", "XOF"],
    foyer_exemple: "FC-AB2C-DE34",
    licence: {
      format: `${FC_LICENSE_PREFIX}.<charge>.<signature>`,
      algorithme: FC_LICENSE_ALGO,
      cle_publique: FC_PUBLIC_KEY_URL,
      verification: "hors ligne — l'application vérifie la signature, sans réseau",
    },
    horodatage: new Date().toISOString(),
  };
}

// ?action=ping — vitals et catalogue des offres. Lue en GET comme en POST :
// une application native peut légitimement poster son JSON.
router.all("/", (req, res, next) => {
  if (actionOf(req) !== "ping") return next("route");
  res.json(pingPayload());
});

// ?action=cle — clé publique de vérification des licences. Publique par
// nature (elle ne permet AUCUNE signature) : c'est celle à graver dans
// l'application et celle qui permet de vérifier qu'une licence est authentique.
router.all(
  "/",
  asyncHandler(async (req, res, next) => {
    if (actionOf(req) !== "cle") return next("route");
    try {
      const info = await getLicensePublicInfo();
      res.json({
        ok: true,
        action: "cle",
        algorithme: info.algorithme,
        pem: info.pem,
        brut: info.brut,
        empreinte_sha256: info.empreinte_sha256,
        url_publique: FC_PUBLIC_KEY_URL,
        format: `${FC_LICENSE_PREFIX}.<charge>.<signature>`,
      });
    } catch (err) {
      console.error("[familicash] clé publique indisponible :", err.message);
      refus(res, 503, "LICENSE_KEY_UNAVAILABLE", "Clé de signature indisponible pour le moment");
    }
  })
);

// Adresse électronique facultative : elle sert au reçu iKeePay. Une adresse
// douteuse est ignorée (jamais un refus : l'achat ne doit pas dépendre d'un
// détail qui n'est pas nécessaire).
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

// POST ?action=payer — ouvre une commande de licence et renvoie l'URL de
// checkout iKeePay. Le montant et la durée viennent du CATALOGUE SERVEUR : le
// corps de la requête ne peut choisir qu'un code d'offre (« m » ou « y »).
router.post(
  "/",
  // L'action est filtrée AVANT le limiteur : sonder « ping » en POST ne doit
  // pas consommer le quota de création de commandes.
  (req, res, next) => {
    if (actionOf(req) !== "payer") return next("route");
    return limiteurPayer(req, res, next);
  },
  asyncHandler(async (req, res) => {
    const householdId = paramOf(req, "id", "foyer", "household_id").toUpperCase();
    if (!FC_HOUSEHOLD_RE.test(householdId)) {
      return refus(res, 400, "INVALID_HOUSEHOLD", MESSAGE_FOYER);
    }
    const offer = planOf(paramOf(req, "plan", "offre"));
    if (!offer) {
      return refus(
        res,
        400,
        "INVALID_PLAN",
        `Offre inconnue : attendu ${Object.keys(FC_PLANS).join(" ou ")}`
      );
    }

    // iKeePay doit être configuré (clé publique en base) — sinon rien ne peut
    // être encaissé, autant le dire clairement au lieu de créer une commande
    // fantôme. Le mode « manuel » de la plateforme ne concerne que les
    // adhésions et les dons du site : FamiliCash est un produit distinct qui
    // garde son propre encaissement.
    const { publicKey } = await getIkeepayKeys();
    if (!publicKey) {
      return refus(
        res,
        503,
        "IKEEPAY_NOT_CONFIGURED",
        "Le paiement en ligne n'est pas configuré par l'administration"
      );
    }

    const email = paramOf(req, "email", "courriel").slice(0, 160);
    const reference = genExternalRef("MBP-FC");
    const created = await createFcOrder({
      householdId,
      plan: offer.code,
      reference,
      email: EMAIL_RE.test(email) ? email.toLowerCase() : "",
    });
    if (!created.ok) {
      if (created.reason === "invalid_household") {
        return refus(res, 400, "INVALID_HOUSEHOLD", MESSAGE_FOYER);
      }
      if (created.reason === "invalid_plan") {
        return refus(res, 400, "INVALID_PLAN", "Offre inconnue");
      }
      return refus(res, 400, "ORDER_REFUSED", "Commande refusée");
    }

    const order = created.order;
    const checkout = addPublicKey(
      buildInlineCheckoutUrl({
        amount: order.amount,
        currency: order.currency,
        orderId: order.reference,
        email: EMAIL_RE.test(email) ? email.toLowerCase() : "",
      }),
      publicKey
    );

    res.json({
      ok: true,
      action: "payer",
      reference: order.reference,
      household_id: order.household_id,
      plan: order.plan,
      amount: order.amount,
      currency: order.currency,
      days: offer.days,
      status: order.status,
      // true = la commande en attente existait déjà (l'application revient sur
      // l'écran de paiement) : la même URL de checkout est resservie.
      reused: Boolean(created.reused),
      checkout_url: checkout,
      // Ce que l'application doit faire ensuite : ouvrir l'URL, puis interroger
      // « licence » jusqu'à recevoir le jeton signé.
      suivi: {
        action: "licence",
        methode: "GET",
        parametres: { id: order.household_id, reference: order.reference },
        intervalle_secondes: 3,
      },
      horodatage: new Date().toISOString(),
    });
  })
);

// ?action=licence — état d'une commande et, dès que le paiement est
// confirmé, le jeton signé à conserver dans l'application (vérifiable hors
// ligne). Avec « reference », on suit la commande en cours ; sans, on relit la
// dernière licence du foyer (réinstallation, changement d'appareil).
router.all(
  "/",
  asyncHandler(async (req, res, next) => {
    if (actionOf(req) !== "licence") return next("route");

    const householdId = paramOf(req, "id", "foyer", "household_id").toUpperCase();
    if (!FC_HOUSEHOLD_RE.test(householdId)) {
      return refus(res, 400, "INVALID_HOUSEHOLD", MESSAGE_FOYER);
    }
    const reference = paramOf(req, "reference", "commande", "order_id").toUpperCase();

    if (reference) {
      const state = await getOrderState({ householdId, reference });
      if (!state.ok) {
        if (state.reason === "unknown_order") {
          return refus(res, 404, "UNKNOWN_ORDER", "Commande inconnue pour ce foyer");
        }
        return refus(res, 400, "INVALID_REQUEST", MESSAGE_FOYER);
      }
      const order = state.order;
      return res.json({
        ok: true,
        action: "licence",
        household_id: order.household_id,
        reference: order.reference,
        plan: order.plan,
        // « pending » = continuer d'attendre ; « completed » = licence ci-dessous.
        status: order.status,
        license: order.license,
        expires_at: order.expires_at,
        horodatage: new Date().toISOString(),
      });
    }

    const licence = await getHouseholdLicense(householdId);
    if (!licence.ok) {
      return refus(res, 404, "NO_LICENSE", "Aucune licence enregistrée pour ce foyer");
    }
    res.json({
      ok: true,
      action: "licence",
      household_id: licence.household_id,
      reference: null,
      plan: licence.plan,
      status: "completed",
      license: licence.license,
      expires_at: licence.expires_at,
      horodatage: new Date().toISOString(),
    });
  })
);

// POST ?action=webhook — OUTIL D'EXPLOITATION (et point d'entrée de test) :
// rejoue la confirmation d'un paiement FamiliCash sans attendre iKeePay. Le
// webhook RÉEL arrive sur /api/ikeepay/webhook : une seule URL de notification
// est configurée chez le fournisseur, et elle route déjà les références
// MBP-FC vers services/familicashOrders.js. Ce point-ci sert donc à vérifier
// une installation ou à rattraper un incident, pas au fonctionnement courant.
// Même jeton secret que le webhook de la plateforme (?k= ou x-ikeepay-token).
router.post(
  "/",
  asyncHandler(async (req, res, next) => {
    if (actionOf(req) !== "webhook") return next("route");

    const given = String((req.query && req.query.k) || req.get("x-ikeepay-token") || "");
    // Aucun jeton fourni : refus immédiat, sans interroger la base (la lecture
    // du secret est stricte : elle lèverait une erreur si la base est absente,
    // ce qui transformerait un 403 en 500).
    if (!given) {
      return res.status(403).json({ received: false, error: "invalid_webhook_token" });
    }
    const expected = await getWebhookSecret();
    // Secret indisponible (base momentanément hors service) → 503 : sans ce
    // garde, « '' === '' » accepterait une requête non authentifiée.
    if (!expected) {
      return res.status(503).json({ received: false, error: "webhook_secret_unavailable" });
    }
    const a = Buffer.from(given);
    const b = Buffer.from(String(expected));
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      return res.status(403).json({ received: false, error: "invalid_webhook_token" });
    }

    const reference = paramOf(req, "reference", "order_id", "external_reference").toUpperCase();
    const amount = paramOf(req, "amount", "montant");
    const currency = paramOf(req, "currency", "devise") || FC_CURRENCY;
    const providerRef = paramOf(req, "provider_reference", "ikeepay_ref");
    if (!reference || !amount) {
      return res.status(400).json({ received: false, error: "reference_and_amount_required" });
    }
    const result = await confirmFcOrderPayment({ reference, amount, currency, providerRef });
    res.json({ received: true, action: "webhook", ...result });
  })
);

// Répartition des chemins restants.
const ACTIONS_CONNUES = ["ping", "cle", "payer", "licence", "webhook"];

router.all("*", (req, res) => {
  const action = actionOf(req);
  // Ouverture directe de l'URL dans un navigateur (aucune action demandée) :
  // on renvoie l'état du relais — c'est le test de vie le plus simple.
  if (!action) {
    if (req.method === "GET" || req.method === "HEAD") return res.json(pingPayload());
    return refus(res, 400, "MISSING_ACTION", `Action manquante : ${ACTIONS_CONNUES.join(", ")}`);
  }
  // Action connue mais mauvaise méthode (par exemple GET ?action=payer).
  if (ACTIONS_CONNUES.includes(action)) {
    const attendue = action === "payer" || action === "webhook" ? "POST" : "GET";
    res.set("Allow", attendue);
    return refus(res, 405, "METHOD_NOT_ALLOWED", `Cette action attend une requête ${attendue}`);
  }
  // Jamais de HTML sur ce chemin : une action inconnue répond un JSON
  // exploitable plutôt que la page du site.
  refus(res, 404, "UNKNOWN_ACTION", `Action inconnue : ${ACTIONS_CONNUES.join(", ")}`);
});

export default router;
