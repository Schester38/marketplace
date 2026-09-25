// Vérifie les marges du Générateur et l'absence de retrait d'ouverture de
// chapitre : un chapitre qui démarre une page commence EXACTEMENT à la marge
// haute (m.top) — l'ancien décalage de 10 % de la hauteur utile éloignait le
// titre du haut de page sur les modèles `chapterNewPage`.
import { flowAtoms } from "./paginate.js";
import { resolvePageBox } from "./templates.js";

let pass = 0;
let fail = 0;
const ok = (cond, label) => {
  if (cond) {
    pass += 1;
    console.log("OK  ", label);
  } else {
    fail += 1;
    console.log("FAIL", label);
  }
};

// 1) Marges haut et bas indépendantes, bornées 5..60.
const box = resolvePageBox({ page_format: "A4", margins: { top: 30, bottom: 45 } });
ok(box.m.top === 30, "marge haute indépendante (30)");
ok(box.m.bottom === 45, "marge basse indépendante (45)");
ok(box.m.left === 18 && box.m.right === 18, "marges gauche/droite par défaut");
const clamped = resolvePageBox({ margins: { top: 2, bottom: 99 } });
ok(clamped.m.top === 5 && clamped.m.bottom === 60, "bornes 5..60 appliquées séparément");

const words = (text) => [{ words: [{ text, spaceBefore: false, x: 0, w: 10 }] }];
let seq = 0;
const p = (h) => ({
  kind: "p", h, sp: { before: 0, after: 0 }, groupId: `p${++seq}`, groupLines: 1,
  lineIndex: 0, breakable: true, keepNext: false, chapterStart: false,
  heading: false, lines: words("Texte"),
});
const h1 = (h) => ({
  kind: "h1", h, sp: { before: 0, after: 0 }, groupId: `h${++seq}`, groupLines: 1,
  lineIndex: 0, breakable: true, keepNext: false, chapterStart: true,
  heading: true, restH: h, lines: words("CHAPITRE"),
});

const contentHpx = 1000;
const template = { chapterNewPage: true };

// 2) Premier chapitre : à la marge haute.
const f1 = flowAtoms([h1(60), p(100)], contentHpx, template, 10);
ok(f1.pages[0][0].top === 0, "premier chapitre à la marge haute (top = 0)");

// 3) Chapitre suivant sur une nouvelle page : top = 0 (avant : 10 % = 100).
const f2 = flowAtoms([p(500), p(400), h1(60), p(50)], contentHpx, template, 10);
ok(f2.pages.length === 2, "le chapitre ouvre bien une nouvelle page");
ok(f2.pages[1][0].kind === "h1" && f2.pages[1][0].top === 0, "chapitre suivant à la marge haute (top = 0)");

// 4) Marge basse respectée : aucun atome ne dépasse la hauteur de contenu.
let overflow = false;
for (const page of f2.pages) {
  for (const it of page) {
    if (it.top + it.h > contentHpx + 0.01) overflow = true;
  }
}
ok(!overflow, "aucun débordement au-delà de la marge basse");

console.log(`\n${pass} réussis, ${fail} échoués`);
if (fail) process.exit(1);
