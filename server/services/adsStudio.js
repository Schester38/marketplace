const OBJECTIVES = new Set(["awareness", "engagement", "leads", "sales", "launch"]);

export const DEFAULT_AD_BRAND_PROFILE = {
  brand_name: "MboppiShop",
  tagline: "Le marché de votre quartier en ligne",
  voice: "Chaleureuse, claire, concrète et accessible.",
  approved_claims: [],
  avoid_claims: [],
  default_cta: "Découvrir MboppiShop",
};

function cleanText(value, maxLength) {
  return String(value ?? "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function cleanMultilineText(value, maxLength) {
  return String(value ?? "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, " ")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, maxLength);
}

function cleanLines(value, maxItems, maxLength) {
  const items = Array.isArray(value) ? value : String(value ?? "").split(/\r?\n/);
  return [...new Set(items.map((item) => cleanText(item, maxLength)).filter(Boolean))].slice(
    0,
    maxItems
  );
}

export function normalizeBrandProfile(value = {}) {
  const input = value && typeof value === "object" ? value : {};
  return {
    brand_name: cleanText(input.brand_name, 100) || DEFAULT_AD_BRAND_PROFILE.brand_name,
    tagline: cleanText(input.tagline, 200),
    voice: cleanText(input.voice, 300),
    approved_claims: cleanLines(input.approved_claims, 10, 240),
    avoid_claims: cleanLines(input.avoid_claims, 10, 240),
    default_cta: cleanText(input.default_cta, 160),
  };
}

export function normalizeCampaignBrief(value = {}) {
  const input = value && typeof value === "object" ? value : {};
  const objective = OBJECTIVES.has(input.objective) ? input.objective : "awareness";
  return {
    objective,
    audience: cleanText(input.audience, 240),
    market: cleanText(input.market, 120),
    key_message: cleanText(input.key_message, 320),
    notes: cleanMultilineText(input.notes, 1000),
  };
}

export function referenceFacts(source, brandProfile) {
  const facts = [];
  const add = (value, origin) => {
    const text = cleanText(value, 300);
    if (text) facts.push({ text, origin });
  };
  add(source.name, "catalogue");
  add(source.description, "catalogue");
  add(source.category, "catalogue");
  add(source.audience, "catalogue");
  add(source.cta, "catalogue");
  add(source.warranty, "catalogue");
  add(brandProfile.brand_name, "marque");
  add(brandProfile.tagline, "marque");
  if (source.promo_price !== undefined && source.promo_price !== null && Number.isFinite(Number(source.promo_price))) {
    add(`Prix promotionnel : ${source.promo_price} ${source.currency || ""}`.trim(), "catalogue");
  }
  if (source.original_price !== undefined && source.original_price !== null && Number.isFinite(Number(source.original_price))) {
    add(`Prix initial : ${source.original_price} ${source.currency || ""}`.trim(), "catalogue");
  }
  for (const claim of brandProfile.approved_claims) add(claim, "marque");
  return facts;
}

function normalizeFact(value) {
  return String(value || "")
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase();
}

function normalizeClaimChecks(value, facts) {
  if (!Array.isArray(value)) return [];
  const references = new Map(facts.map((fact) => [normalizeFact(fact.text), fact]));
  return value
    .slice(0, 10)
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const claim = cleanText(item.claim, 300);
      if (!claim) return null;
      const suppliedEvidence = cleanText(item.evidence, 300);
      const match = references.get(normalizeFact(suppliedEvidence));
      return {
        claim,
        evidence: match?.text || "",
        reference: match?.origin || "",
        status: match ? "reference_found" : "needs_review",
      };
    })
    .filter(Boolean);
}

export function normalizeIdeas(value, count, facts = []) {
  if (!value || !Array.isArray(value.ideas)) return [];
  return value.ideas
    .slice(0, count)
    .map((idea) => {
      if (!idea || typeof idea !== "object") return null;
      const storyboard = Array.isArray(idea.storyboard)
        ? idea.storyboard
            .slice(0, 8)
            .map((scene) => ({
              time: cleanText(scene?.time, 30),
              visual: cleanText(scene?.visual, 500),
              camera: cleanText(scene?.camera, 300),
              audio: cleanText(scene?.audio, 400),
              overlay: cleanText(scene?.overlay, 240),
              transition: cleanText(scene?.transition, 200),
            }))
            .filter(
              (scene) =>
                scene.visual || scene.camera || scene.audio || scene.overlay || scene.transition
            )
        : [];
      const normalized = {
        title: cleanText(idea.title, 120),
        concept: cleanText(idea.concept, 500),
        hook: cleanText(idea.hook, 300),
        script: cleanMultilineText(idea.script, 2400),
        production_notes: cleanText(idea.production_notes, 700),
        storyboard,
        caption: cleanMultilineText(idea.caption, 800),
        cta: cleanText(idea.cta, 240),
        claim_checks: normalizeClaimChecks(idea.claim_checks, facts),
      };
      return normalized.title && normalized.hook && normalized.script ? normalized : null;
    })
    .filter(Boolean);
}
