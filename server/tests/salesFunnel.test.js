import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeFunnelBrief,
  normalizeFunnelContactUrl,
  normalizeFunnelContent,
  normalizeFunnelProductIds,
  normalizeFunnelWhatsapp,
  normalizeSalesFunnelEvent,
  normalizeFunnelTheme,
  normalizeSalesFunnelSlug,
  summarizeSalesFunnelMetrics,
  slugifySalesFunnel,
} from "../services/salesFunnel.js";

test("funnel brief requires a business name and offer", () => {
  assert.throws(() => normalizeFunnelBrief({ business_name: "Mboppi" }), {
    code: "INVALID_SALES_FUNNEL",
  });
  assert.deepEqual(normalizeFunnelBrief({
    business_name: " Mboppi  Shop ",
    offer: " Des produits locaux ",
  }), {
    business_name: "Mboppi Shop",
    offer: "Des produits locaux",
    audience: "",
    goal: "",
    style: "",
    design_notes: "",
  });
});

test("contact links allow https and safe app paths but reject executable schemes", () => {
  assert.equal(normalizeFunnelContactUrl("https://wa.me/237600000000"), "https://wa.me/237600000000");
  assert.equal(normalizeFunnelContactUrl("/contact"), "/contact");
  assert.equal(normalizeFunnelContactUrl(""), null);
  assert.throws(() => normalizeFunnelContactUrl("javascript:alert(1)"), {
    code: "INVALID_SALES_FUNNEL",
  });
  assert.throws(() => normalizeFunnelContactUrl("//example.com"), {
    code: "INVALID_SALES_FUNNEL",
  });
  assert.throws(() => normalizeFunnelContactUrl("/\\example.com"), {
    code: "INVALID_SALES_FUNNEL",
  });
});

test("WhatsApp numbers are normalized to international digits", () => {
  assert.equal(normalizeFunnelWhatsapp("+237 6 70 12 34 56"), "237670123456");
  assert.equal(normalizeFunnelWhatsapp("00237670123456"), "237670123456");
  assert.equal(normalizeFunnelWhatsapp(""), null);
  assert.throws(() => normalizeFunnelWhatsapp("670 12 34 56"), {
    code: "INVALID_SALES_FUNNEL",
  });
  assert.throws(() => normalizeFunnelWhatsapp("06 70 12 34 56"), {
    code: "INVALID_SALES_FUNNEL",
  });
  assert.throws(() => normalizeFunnelWhatsapp("+237 6 70 ABC"), {
    code: "INVALID_SALES_FUNNEL",
  });
});

test("product selection is bounded, numeric, and deduplicated", () => {
  assert.deepEqual(normalizeFunnelProductIds([2, "2", 7]), [2, 7]);
  assert.throws(() => normalizeFunnelProductIds(Array.from({ length: 11 }, (_, i) => i + 1)), {
    code: "INVALID_SALES_FUNNEL",
  });
  assert.throws(() => normalizeFunnelProductIds([0]), {
    code: "INVALID_SALES_FUNNEL",
  });
});

test("funnel content accepts only the supported editable shape", () => {
  assert.deepEqual(normalizeFunnelContent({
    title: "  Mon offre ",
    subtitle: "Une présentation",
    cta_label: "Découvrir",
    html: "<script>alert(1)</script>",
    sections: [{ title: "Pourquoi", body: "Une explication" }],
  }), {
    title: "Mon offre",
    subtitle: "Une présentation",
    cta_label: "Découvrir",
    sections: [{ title: "Pourquoi", body: "Une explication" }],
  });
  assert.throws(() => normalizeFunnelContent({ title: "Titre", sections: [{ body: "Sans titre" }] }), {
    code: "INVALID_SALES_FUNNEL",
  });
});

test("themes and public slugs are restricted to known values", () => {
  assert.equal(normalizeFunnelTheme("forest"), "forest");
  assert.throws(() => normalizeFunnelTheme("custom-css"), { code: "INVALID_SALES_FUNNEL" });
  assert.equal(slugifySalesFunnel("École de musique"), "ecole-de-musique");
  assert.equal(normalizeSalesFunnelSlug("ecole-de-musique"), "ecole-de-musique");
  assert.throws(() => normalizeSalesFunnelSlug("creer"), { code: "INVALID_SALES_FUNNEL" });
  assert.throws(() => normalizeSalesFunnelSlug("bad/path"), { code: "INVALID_SALES_FUNNEL" });
});

test("funnel analytics accept only valid events and product identifiers", () => {
  assert.deepEqual(normalizeSalesFunnelEvent({ event: "view" }), { event: "view", targetId: 0 });
  assert.deepEqual(normalizeSalesFunnelEvent({ event: "contact" }), { event: "contact", targetId: 0 });
  assert.deepEqual(normalizeSalesFunnelEvent({ event: "product", product_id: "17" }), { event: "product", targetId: 17 });
  assert.throws(() => normalizeSalesFunnelEvent({ event: "product", product_id: "0" }), {
    code: "INVALID_SALES_FUNNEL",
  });
  assert.throws(() => normalizeSalesFunnelEvent({ event: "script", target_id: 17 }), {
    code: "INVALID_SALES_FUNNEL",
  });
});

test("funnel analytics aggregate lifetime totals and rank product clicks", () => {
  assert.deepEqual(summarizeSalesFunnelMetrics([
    { event_type: "view", target_id: 0, event_count: "12" },
    { event_type: "contact", target_id: 0, event_count: "3" },
    { event_type: "product", target_id: 17, event_count: "2" },
    { event_type: "product", target_id: 9, event_count: "5" },
    { event_type: null, target_id: null, event_count: null },
  ]), {
    totals: { views: 12, contact_clicks: 3, product_clicks: 7 },
    product_clicks: [
      { product_id: 9, clicks: 5 },
      { product_id: 17, clicks: 2 },
    ],
  });
});
