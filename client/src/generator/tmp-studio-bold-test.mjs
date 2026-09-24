// Test pur du gras global du Studio (temporaire — supprimé après tests)
import { boldDocumentText } from "./studioModel.js";

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

const pages = [
  {
    id: "p1",
    locked: { design: false, content: false },
    elements: [
      { id: "body", type: "paragraph", style: { bold: false, size: 11 } },
      { id: "list", type: "list", style: { bold: true, size: 10 } },
      { id: "title", type: "heading", style: { bold: true, size: 18 } },
      { id: "subtitle", type: "subtitle", style: { bold: false, size: 14 } },
      { id: "chapter", type: "chapter", style: { bold: true, size: 22 } },
      { id: "quote", type: "quote", style: { bold: false, italic: true } },
      { id: "locked", type: "paragraph", locked: true, style: { bold: false, size: 10 } },
      { id: "image", type: "image", style: { radius: 2 } },
    ],
  },
  {
    id: "p2-locked",
    locked: { design: true, content: false },
    elements: [{ id: "frozen", type: "paragraph", style: { bold: false, size: 11 } }],
  },
];
const snapshot = JSON.stringify(pages);
const result = boldDocumentText(pages);
const byId = Object.fromEntries(result.pages.flatMap((p) => p.elements.map((e) => [e.id, e])));

ok("corps du document en gras", byId.body.style.bold, true);
ok("police et autres styles conservés", byId.body.style.size, 11);
ok("texte déjà gras laissé intact", result.pages[0].elements[1], pages[0].elements[1]);
ok("titre laissé intact", byId.title.style.bold, true);
ok("sous-titre non gras laissé intact", byId.subtitle.style.bold, false);
ok("chapitre laissé intact", byId.chapter.style.bold, true);
ok("citation laissée intacte", byId.quote.style.bold, false);
ok("ancien élément verrouillé devient modifiable", byId.locked.style.bold, true);
ok("élément non textuel laissé intact", byId.image.style, { radius: 2 });
ok("ancienne page verrouillée devient modifiable", byId.frozen.style.bold, true);
ok("nombre d’éléments modifiés", result.count, 3);
ok("pages d’origine non mutées", JSON.stringify(pages), snapshot);

const second = boldDocumentText(result.pages);
ok("commande idempotente", second.count, 0);
ok("résultat idempotent stable", second.pages, result.pages);

console.log(`\n${pass} réussis, ${fail} échoués`);
process.exit(fail ? 1 : 0);
