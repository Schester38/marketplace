// Signature des licences FamiliCash — Ed25519 (paire de clés détenue par le
// SERVEUR uniquement, jamais par l'application).
// ----------------------------------------------------------------------------
// Une licence FamiliCash est un jeton AUTOPORTEUR, vérifiable hors ligne :
//
//     FC1.<charge utile en base64url>.<signature Ed25519 en base64url>
//
// La charge utile est un JSON compact { v, id, plan, exp, iat, ref } :
//   v    version du format (1)
//   id   identifiant local du foyer (FC-XXXX-XXXX), généré par l'application
//   plan plan payé (« m » mensuel, « y » annuel)
//   exp  fin de validité, en ISO 8601 UTC
//   iat  date de délivrance, en ISO 8601 UTC
//   ref  référence de la commande iKeePay (MBP-FC-…)
//
// La clé PRIVÉE signe et ne quitte jamais ce module ; la clé PUBLIQUE est
// livrée à l'application (action « cle » du relais) qui vérifie la signature
// sans réseau. Conséquences voulues :
//   — l'application n'a aucun secret : un APK est une archive ZIP lisible par
//     n'importe qui, donc tout secret embarqué serait extrait ;
//   — une licence reste valable indéfiniment hors ligne : la vérification est
//     une simple opération cryptographique locale, sans appel serveur ;
//   — seule la base peut produire de nouvelles licences : voler l'APK ne
//     permet pas d'en fabriquer une.
//
// La paire est générée UNE SEULE FOIS puis conservée dans platform_settings :
// un redéploiement, une nouvelle instance Vercel ou un redémarrage ne
// régénèrent jamais la clé (une régénération invaliderait toutes les licences
// déjà délivrées). Pour une sauvegarde ou une rotation maîtrisée, la variable
// d'environnement FC_LICENSE_PRIVATE_KEY (PEM) est prioritaire si elle est
// définie — les « \n » littéraux y sont acceptés pour tenir sur une ligne.
//
// Aucune dépendance à services/ikeepay.js : évite un import circulaire
// (ikeepay → familicashOrders → fcLicense). La lecture d'un réglage se limite
// donc ici à une requête sur platform_settings.
import {
  createPrivateKey,
  createPublicKey,
  createHash,
  generateKeyPairSync,
  sign as cryptoSign,
  verify as cryptoVerify,
} from "node:crypto";
import { q } from "../db.js";

export const FC_LICENSE_PREFIX = "FC1";
export const FC_LICENSE_ALGO = "Ed25519";
// URL publique à graver dans l'application (ou à consulter pour vérifier que
// la clé livrée est bien celle du serveur).
export const FC_PUBLIC_KEY_URL = "https://www.mboppishop.com/familicash/api/?action=cle";

const PRIVATE_KEY_SETTING = "familicash_license_private_key";
const PUBLIC_KEY_SETTING = "familicash_license_public_key";

const SETTINGS_TABLE_SQL = `CREATE TABLE IF NOT EXISTS platform_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
)`;

async function readSetting(key) {
  try {
    const row = (await q("SELECT value FROM platform_settings WHERE key = $1", [key]))[0];
    return row && row.value != null ? String(row.value) : "";
  } catch (err) {
    // Table absente (initDb pas encore abouti sur cette instance) → on la crée.
    if (err && err.code === "42P01") {
      await q(SETTINGS_TABLE_SQL);
      const row = (await q("SELECT value FROM platform_settings WHERE key = $1", [key]))[0];
      return row && row.value != null ? String(row.value) : "";
    }
    throw err;
  }
}

// Écrit la clé SEULEMENT si elle est absente : « ON CONFLICT DO NOTHING » rend
// la première instance gagnante, les autres relisent la valeur du vainqueur.
// Sans cela, deux démarrages simultanés (deux fonctions Vercel froides)
// publieraient deux clés différentes et l'une des deux signerait des licences
// que l'application ne pourrait pas vérifier.
async function writeSettingIfAbsent(key, value) {
  await q(SETTINGS_TABLE_SQL);
  await q(
    `INSERT INTO platform_settings (key, value, updated_at)
     VALUES ($1, $2, now()) ON CONFLICT (key) DO NOTHING`,
    [key, String(value)]
  );
  return readSetting(key);
}

function normalizePem(raw) {
  const text = String(raw || "").trim();
  if (!text) return "";
  // Variable d'environnement sur une seule ligne : « \n » écrits en clair.
  return text.includes("\\n") ? text.replace(/\\n/g, "\n") : text;
}

function keyFromEnv() {
  const pem = normalizePem(process.env.FC_LICENSE_PRIVATE_KEY);
  if (!pem) return null;
  try {
    return createPrivateKey(pem);
  } catch (err) {
    console.error("[familicash] FC_LICENSE_PRIVATE_KEY illisible :", err.message);
    return null;
  }
}

function generatePair() {
  return generateKeyPairSync("ed25519", {
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
    publicKeyEncoding: { type: "spki", format: "pem" },
  });
}

// Clé publique brute (32 octets) extraite du PEM SPKI : c'est la forme que
// l'application attend (pas de parsing DER à embarquer côté Flutter).
function rawPublicKey(publicKeyObject) {
  const der = publicKeyObject.export({ type: "spki", format: "der" });
  return Buffer.from(der.subarray(der.length - 32));
}

function publicKeyPem(publicKeyObject) {
  return publicKeyObject.export({ type: "spki", format: "pem" }).toString().trim();
}

export function publicKeyInfo(publicKeyObject) {
  const der = publicKeyObject.export({ type: "spki", format: "der" });
  return {
    algorithme: FC_LICENSE_ALGO,
    pem: publicKeyPem(publicKeyObject),
    brut: rawPublicKey(publicKeyObject).toString("base64url"),
    empreinte_sha256: createHash("sha256").update(der).digest("hex"),
  };
}

let cache = null; // { privateKey, publicKey } — mémorisé pour la durée de l'instance

// Renvoie la paire de signature, en la créant au premier appel si nécessaire.
export async function getLicenseKeyPair() {
  if (cache) return cache;

  const envKey = keyFromEnv();
  if (envKey) {
    cache = { privateKey: envKey, publicKey: createPublicKey(envKey) };
    return cache;
  }

  let privatePem = await readSetting(PRIVATE_KEY_SETTING);
  let publicPem = await readSetting(PUBLIC_KEY_SETTING);

  if (!privatePem) {
    const born = generatePair();
    privatePem = await writeSettingIfAbsent(PRIVATE_KEY_SETTING, born.privateKey);
    publicPem = await writeSettingIfAbsent(PUBLIC_KEY_SETTING, born.publicKey);
    if (privatePem.trim() !== String(born.privateKey).trim()) {
      // Une autre instance a gagné la course : on utilise SA clé (la nôtre n'a
      // jamais servi à signer quoi que ce soit).
      console.warn(
        "[familicash] paire de clés déjà créée par une autre instance — clé locale abandonnée"
      );
    }
  }

  let privateKey;
  try {
    privateKey = createPrivateKey(privatePem);
  } catch (err) {
    throw new Error("familicash_license_private_key illisible : " + err.message);
  }
  const publicKey = createPublicKey(privateKey);
  // La clé publique stockée ne correspond pas à la privée (restauration
  // partielle d'une sauvegarde) → on réécrit la publique, jamais la privée.
  if (publicPem !== publicKeyPem(publicKey)) {
    if (publicPem) {
      console.warn("[familicash] clé publique incohérente — réécrite depuis la clé privée");
    }
    await q(
      `INSERT INTO platform_settings (key, value, updated_at)
       VALUES ($1, $2, now())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
      [PUBLIC_KEY_SETTING, publicKeyPem(publicKey)]
    );
  }

  cache = { privateKey, publicKey };
  return cache;
}

// Informations publiques (action « cle ») : rien de secret ici.
export async function getLicensePublicInfo() {
  const { publicKey } = await getLicenseKeyPair();
  return publicKeyInfo(publicKey);
}

export function buildLicensePayload({ householdId, plan, expiresAt, reference, issuedAt }) {
  return {
    v: 1,
    id: String(householdId),
    plan: String(plan),
    exp: new Date(expiresAt).toISOString().replace(/\.\d{3}Z$/, "Z"),
    iat: new Date(issuedAt || Date.now()).toISOString().replace(/\.\d{3}Z$/, "Z"),
    ref: String(reference || ""),
  };
}

// Encode + signe une charge utile déjà construite. Fonction PURE (la clé est
// passée en paramètre) : c'est elle que les tests vérifient.
export function encodeLicenseToken(payload, privateKeyObject) {
  const json = JSON.stringify(payload);
  const body = Buffer.from(json, "utf8").toString("base64url");
  const signature = cryptoSign(null, Buffer.from(json, "utf8"), privateKeyObject);
  return `${FC_LICENSE_PREFIX}.${body}.${signature.toString("base64url")}`;
}

// Découpe un jeton (outils d'exploitation et tests) — aucune vérification.
export function decodeLicenseToken(token) {
  const parts = String(token || "").split(".");
  if (parts.length !== 3 || parts[0] !== FC_LICENSE_PREFIX) return null;
  try {
    const signed = Buffer.from(parts[1], "base64url").toString("utf8");
    return {
      payload: JSON.parse(signed),
      signature: Buffer.from(parts[2], "base64url"),
      signed,
    };
  } catch {
    return null;
  }
}

// Vérification hors ligne (miroir exact de ce que fera l'application Dart).
export function verifyLicenseToken(token, publicKeyPemOrObject) {
  const decoded = decodeLicenseToken(token);
  if (!decoded) return null;
  const ok = cryptoVerify(
    null,
    Buffer.from(decoded.signed, "utf8"),
    publicKeyPemOrObject,
    decoded.signature
  );
  return ok ? decoded.payload : null;
}

// Délivre la licence d'un foyer : c'est le SEUL chemin de signature.
export async function issueLicense({ householdId, plan, expiresAt, reference, issuedAt }) {
  const { privateKey } = await getLicenseKeyPair();
  const payload = buildLicensePayload({ householdId, plan, expiresAt, reference, issuedAt });
  return { token: encodeLicenseToken(payload, privateKey), payload };
}
