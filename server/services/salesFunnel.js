const FUNNEL_THEMES = new Set(["ocean", "sunset", "forest", "night"]);
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function invalid(message) {
  const error = new Error(message);
  error.statusCode = 422;
  error.code = "INVALID_SALES_FUNNEL";
  throw error;
}

export function cleanFunnelText(value, maxLength, { required = false } = {}) {
  const text = String(value ?? "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
  if (required && !text) invalid("Ce champ est obligatoire.");
  return text;
}

export function normalizeFunnelBrief(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    invalid("Décrivez votre activité et votre offre.");
  }
  return {
    business_name: cleanFunnelText(value.business_name, 100, { required: true }),
    offer: cleanFunnelText(value.offer, 1200, { required: true }),
    audience: cleanFunnelText(value.audience, 300),
    goal: cleanFunnelText(value.goal, 200),
    style: cleanFunnelText(value.style, 200),
    design_notes: cleanFunnelText(value.design_notes, 500),
  };
}

export function normalizeFunnelTheme(value) {
  const theme = String(value || "ocean");
  if (!FUNNEL_THEMES.has(theme)) invalid("Thème visuel invalide.");
  return theme;
}

export function normalizeFunnelContactUrl(value) {
  const text = cleanFunnelText(value, 500);
  if (!text) return null;
  if (text.startsWith("/") && !text.startsWith("//") && !text.includes("\\") && !/\s/.test(text)) {
    return text;
  }
  let url;
  try {
    url = new URL(text);
  } catch {
    invalid("Utilisez un lien https, WhatsApp, e-mail ou téléphone valide.");
  }
  if (!["https:", "mailto:", "tel:"].includes(url.protocol)) {
    invalid("Ce type de lien de contact n’est pas autorisé.");
  }
  return text;
}

export function normalizeFunnelProductIds(value) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > 10) {
    invalid("Sélectionnez au maximum 10 produits.");
  }
  const ids = value.map(Number);
  if (ids.some((id) => !Number.isSafeInteger(id) || id < 1)) {
    invalid("La sélection de produits est invalide.");
  }
  return [...new Set(ids)];
}

export function normalizeFunnelContent(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    invalid("Le contenu du tunnel est invalide.");
  }
  const sections = Array.isArray(value.sections) ? value.sections : [];
  if (sections.length > 6) invalid("Le tunnel peut contenir au maximum 6 sections.");
  return {
    title: cleanFunnelText(value.title, 120, { required: true }),
    subtitle: cleanFunnelText(value.subtitle, 400),
    cta_label: cleanFunnelText(value.cta_label, 60),
    sections: sections.map((section) => {
      if (!section || typeof section !== "object" || Array.isArray(section)) {
        invalid("Une section du tunnel est invalide.");
      }
      return {
        title: cleanFunnelText(section.title, 100, { required: true }),
        body: cleanFunnelText(section.body, 700),
      };
    }),
  };
}

export function normalizeSalesFunnelEvent(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    invalid("Événement de tunnel invalide.");
  }
  const event = String(value.event || "");
  if (event === "view" || event === "contact") {
    return { event, targetId: 0 };
  }
  if (event === "product") {
    const targetId = Number(value.product_id);
    if (!Number.isSafeInteger(targetId) || targetId < 1) {
      invalid("Produit suivi invalide.");
    }
    return { event, targetId };
  }
  invalid("Type d’événement de tunnel invalide.");
}

export function summarizeSalesFunnelMetrics(rows) {
  const totals = { views: 0, contact_clicks: 0, product_clicks: 0 };
  const productClicks = [];
  for (const row of rows) {
    const count = Math.max(0, Number(row.event_count) || 0);
    if (row.event_type === "view") totals.views += count;
    if (row.event_type === "contact") totals.contact_clicks += count;
    if (row.event_type === "product") {
      totals.product_clicks += count;
      productClicks.push({
        product_id: Number(row.target_id),
        clicks: count,
      });
    }
  }
  productClicks.sort((a, b) => b.clicks - a.clicks || a.product_id - b.product_id);
  return { totals, product_clicks: productClicks };
}

export function slugifySalesFunnel(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50)
    .replace(/-+$/g, "");
}

export function normalizeSalesFunnelSlug(value) {
  const slug = cleanFunnelText(value, 50).toLowerCase();
  if (!slug || !SLUG_RE.test(slug) || slug === "creer") {
    invalid("Choisissez une adresse courte sans espaces ni caractères spéciaux.");
  }
  return slug;
}
