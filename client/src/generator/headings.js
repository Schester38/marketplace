// Détection intelligente des titres DANS l'éditeur du Générateur.
//
//   1. Conversion EN DIRECT : appuyer sur Entrée après une ligne qui est un
//      titre (« CHAPITRE 3 », « INTRODUCTION », « 1.2 Mesure », ligne EN
//      MAJUSCULES…) la transforme en vrai titre (h1-h4) et ouvre un paragraphe.
//   2. Collage intelligent : coller un texte BRUT d'au moins 3 lignes contenant
//      des titres/listes/citations/tableaux applique la même détection que
//      l'import TXT/Markdown (detectStructureHtml) — les tableaux copiés « à
//      plat » (tabulations, « | », 2 espaces, « ; ») sont reconstruits en
//      vrais tableaux. Un collage riche (HTML) garde le comportement natif de
//      TipTap, sauf s'il ne contient aucun tableau alors que son texte brut,
//      lui, en contient un (onglets).
//   3. Passe complète « 🧠 Détecter les titres » : formatHeadings() convertit
//      tout le document et peut numéroter en continu les chapitres sans numéro.
//      La passe « 🔳 Détecter les tableaux » (tables.js → formatTables) fait la
//      même chose pour les tableaux déjà présents dans le document.
//
// La règle de détection elle-même vit dans structure.js (une seule vérité,
// partagée avec l'import) : l'éditeur et l'import donnent le même résultat.
import { Extension } from "@tiptap/core";
import { Plugin, TextSelection } from "@tiptap/pm/state";
import { detectHeading, detectStructureHtml, looksStructured, chapterNumber, hasChapterNumber } from "./structure.js";
import { planTableBlocks } from "./tables.js";

export const HeadingAutoDetect = Extension.create({
  name: "headingAutoDetect",

  addProseMirrorPlugins() {
    const editor = this.editor;
    return [
      new Plugin({
        props: {
          // ── Conversion en direct : Entrée en fin de ligne-titre ───────────
          handleKeyDown(view, event) {
            if (event.key !== "Enter") return false;
            if (event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) return false;
            const { state } = view;
            if (!state.selection.empty) return false;
            const { $from } = state.selection;
            // Seulement en FIN de ligne (sinon l'Entrée doit couper le texte).
            if ($from.pos !== $from.end()) return false;
            const node = $from.parent;
            if (node.type.name !== "paragraph") return false;
            const head = detectHeading(node.textContent);
            if (!head) return false;

            event.preventDefault();
            const pos = $from.before();
            const tr = state.tr.setNodeMarkup(pos, state.schema.nodes.heading, { level: head.level });
            // Nouveau paragraphe juste après le titre : on écrit directement.
            const after = pos + node.nodeSize;
            tr.insert(after, state.schema.nodes.paragraph.createAndFill());
            tr.setSelection(TextSelection.near(tr.doc.resolve(after + 1)));
            view.dispatch(tr.scrollIntoView());
            return true;
          },

          // ── Collage d'un texte brut structuré (document, PDF copié) ───────
          // Un collage RICHE garde le rendu natif de TipTap — sauf s'il ne
          // contient aucun vrai tableau alors que son texte brut, lui,
          // transporte un tableau tabulé (certains logiciels aplatissent les
          // tableaux en HTML sans <table>).
          handlePaste(_view, event) {
            const cd = event.clipboardData;
            if (!cd) return false;
            const html = cd.getData("text/html") || "";
            const text = cd.getData("text/plain") || "";
            if (html) {
              if (/<table[\s>]/i.test(html)) return false; // vrai tableau → natif
              const tabTable =
                text.includes("\t") &&
                planTableBlocks(text.split(/\r\n?|\n/), { minRows: 2 }).some(
                  (b) => b.separator === "tab"
                );
              if (!tabTable) return false;
            }
            if (!looksStructured(text)) return false;
            event.preventDefault();
            editor.chain().focus().insertContent(detectStructureHtml(text)).run();
            return true;
          },
        },
      }),
    ];
  },
});

// ─── Passe complète : bouton « 🧠 Détecter les titres » ──────────────────────
// Convertit tous les paragraphes qui sont des titres. Avec `number`, les
// chapitres SANS numéro reçoivent le numéro suivant la série détectée
// (« CHAPITRE » → « CHAPITRE 1 », puis 2, 3…) ; les titres déjà numérotés
// (chiffres ou romains) ne sont jamais modifiés.
export function formatHeadings(editor, { number = false } = {}) {
  if (!editor) return { headings: 0, numbered: 0 };
  const { state } = editor;
  const tr = state.tr;
  let headings = 0;
  let numbered = 0;
  let last = 0;

  state.doc.descendants((node, pos) => {
    if (node.type.name !== "paragraph") return;
    const text = node.textContent.trim();
    const head = detectHeading(text);
    if (!head) return;
    tr.setNodeMarkup(tr.mapping.map(pos), state.schema.nodes.heading, { level: head.level });
    headings += 1;
    if (!number || head.kind !== "chapter") return;
    if (hasChapterNumber(text)) {
      const n = chapterNumber(text);
      if (n !== null) last = Math.max(last, n);
      return;
    }
    last += 1;
    // Position MAPPÉE : les insertions précédentes ont décalé le document.
    tr.insertText(` ${last}`, tr.mapping.map(pos + 1 + node.content.size));
    numbered += 1;
  });

  if (headings) editor.view.dispatch(tr.scrollIntoView());
  return { headings, numbered };
}
