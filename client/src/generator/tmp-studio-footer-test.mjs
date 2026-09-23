// Test des pieds de page promotionnels du Studio (temporaire — supprimé après tests)
import { ensureStudioFooters, makeElement, makePage } from "./studioModel.js";
import { MBOPPI_CONTENT_LABEL, MBOPPI_CONTENT_URL, safeWebUrl } from "./footerPromo.js";
import { exportDocumentPdf } from "./exportPdf.js";

let pass = 0;
let fail = 0;
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const ok = (label, got, want) => {
  if (same(got, want)) pass += 1;
  else {
    fail += 1;
    console.log(`✗ ${label}\n   obtenu : ${JSON.stringify(got)}\n   attendu: ${JSON.stringify(want)}`);
  }
};

const box = { w: 210, h: 297, m: { left: 18, right: 18, top: 18, bottom: 18 } };
const template = {
  bodyFont: "serif", headingFont: "sans", align: "left", lineHeight: 1.5, paraSpace: 4,
  sizes: { h1: 24, h2: 17, h3: 13.5, h4: 12, body: 10.5, small: 8.5 },
  colors: { heading: "#111111", body: "#1f2937", accent: "#2563eb", bg: "#ffffff" },
  pageDecor: null,
};
const custom = makeElement(template, "footer", { x: 18, y: 280, w: 80, h: 6 }, {
  name: "Pied personnalisé", html: "Édition 2026", style: { align: "right" }, autoH: false,
});
const pages = [
  makePage({ kind: "cover", elements: [] }),
  makePage({ kind: "content", elements: [custom] }),
  makePage({ kind: "copyright", elements: [] }),
];
const snapshot = JSON.stringify(pages);
const withPromotion = ensureStudioFooters(pages, box, template);
const content = withPromotion[1];
const promo = content.elements.find((el) => el.data?.promotion === "mboppi-content");

ok("pages d’origine non mutées", JSON.stringify(pages), snapshot);
ok("couverture sans promotion", withPromotion[0].elements.length, 0);
ok("pied personnalisé conservé", content.elements[0], custom);
ok("une promotion par page non-couverture", withPromotion.slice(1).map((p) => p.elements.filter((el) => el.data?.promotion === "mboppi-content").length), [1, 1]);
ok("promotion à gauche", promo.style.align, "left");
ok("promotion en italique", promo.style.italic, true);
ok("promotion verrouillée", promo.locked, true);
ok("domaine affiché", promo.html.includes(MBOPPI_CONTENT_LABEL), true);
ok("lien de promotion", promo.html.includes(`href="${MBOPPI_CONTENT_URL}"`), true);
ok("URL https valide", safeWebUrl(MBOPPI_CONTENT_URL), `${MBOPPI_CONTENT_URL}/`);
ok("URL dangereuse refusée", safeWebUrl("javascript:alert(1)"), null);
ok("commande idempotente", ensureStudioFooters(withPromotion, box, template), withPromotion);

const paginated = {
  box,
  template,
  contentWpx: (box.w - box.m.left - box.m.right) * 3.7795,
  pages: [{ kind: "content", number: 1, items: [] }],
};
const pdf = await exportDocumentPdf({
  doc: {},
  docMeta: {
    title: "Test", protection: { footer: true, qrEnabled: false },
  },
  paginated,
  download: false,
});
const rawPdf = pdf.output();
ok("annotation PDF classique présente", /\/URI \(https:\/\/www\.mboppishop\.com\)/.test(rawPdf), true);

console.log(`\n${pass} réussis, ${fail} échoués`);
process.exit(fail ? 1 : 0);
