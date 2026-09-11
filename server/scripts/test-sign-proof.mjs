// Test signedProofUrl avec une vraie URL de preuve (forme /public/ en base).
import { signedProofUrl } from "../storage.js";
const url =
  "https://kovbfxuxyshheumlzhmd.supabase.co/storage/v1/object/public/payment-proofs/payments/ca91405b157b/proof.webp";
const out = await signedProofUrl(url, 600);
console.log("entrée  :", url.slice(0, 90) + "…");
console.log("sortie  :", out ? out.slice(0, 110) + "…" : "null");
console.log("signée  :", out ? out.includes("/object/sign/payment-proofs/") : false);