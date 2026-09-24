// Moteur de pagination du Générateur : mesure RÉELLE du rendu navigateur via
// l'API Range (chaque mot obtient sa position exacte — identique dans
// l'aperçu HTML et le PDF jsPDF, d'où une fidélité garantie), puis flux en
// pages avec règles typographiques professionnelles :
//   - veuves/orphelines : au moins 2 lignes de chaque côté d'une coupure
//     (la ligne orpheline est REPORTÉE en tête de la page suivante, jamais
//     supprimée) ;
//   - titres insécables (jamais seul en bas de page) + saut de chapitre ;
//   - tableaux scindés par lignes, images redimensionnées à la boîte ;
//   - table des matières avec numéros de page exacts (2 passes).
//
// CONVENTION DE COORDONNÉES (source des 2 rendus) :
//   - `item.top`  : position verticale de l'atome dans la BOÎTE DE CONTENU (px) ;
//   - `ln.top`    : 0..hauteur de ligne, DANS la boîte de l'atome ;
//   - `wd.x`      : position horizontale du mot dans la LARGEUR DE CONTENU (px) ;
//   - mm et pt   : uniquement dans le modèle (templates.js) et l'export PDF.
// L'aperçu ajoute `item.top` à `ln.top`, le PDF ajoute en plus la marge de
// page (m.left/m.top) : les deux affichent donc exactement la même chose.
import { FONT_CSS, getTemplate, resolveTemplate, resolvePageBox, blockSpacing } from "./templates.js";

export const PX_PER_MM = 96 / 25.4; // px CSS par mm (96 dpi)
export const PT_TO_PX = 96 / 72; // px CSS par point typographique
// Boîte du marqueur [QR] : un paragraphe contenant exactement « [QR] » réserve
// cet emplacement (40 mm, scannable à l'impression) ; le PDF y dessine le vrai
// QR de vérification, l'aperçu un cadre en pointillés, l'EPUB l'image réelle.
export const QR_BOX_MM = 40;

export function rgbToHex(rgb) {
  const m = String(rgb).match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (m) {
    const to = (n) => Number(n).toString(16).padStart(2, "0");
    return `#${to(m[1])}${to(m[2])}${to(m[3])}`;
  }
  return "#000000";
}

function decodeColor(v) {
  if (!v) return null;
  if (v.startsWith("#")) return v;
  if (v.startsWith("rgb")) return rgbToHex(v);
  return null;
}

// Style de rendu d'un mot, échantillonné sur l'élément qui le porte.
function styleOf(el, template) {
  const cs = getComputedStyle(el);
  const fw = parseInt(cs.fontWeight, 10) || 400;
  const fam = String(cs.fontFamily || "");
  let font = template.bodyFont;
  if (/courier/i.test(fam)) font = "mono";
  else if (/times|georgia|garamond|serif/i.test(fam) && !/sans/i.test(fam)) font = "serif";
  else if (/arial|helvetica|sans/i.test(fam)) font = "sans";
  const deco = String(cs.textDecorationLine || cs.textDecoration || "");
  const va = String(cs.verticalAlign || "");
  // Surlignage : couleur de fond effective (ignorée si transparente).
  const bgRaw = String(cs.backgroundColor || "");
  const bg = bgRaw && bgRaw !== "transparent" && !/^rgba\(0, 0, 0, 0\)/.test(bgRaw)
    ? decodeColor(bgRaw)
    : null;
  return {
    bold: fw >= 600,
    italic: /italic/i.test(cs.fontStyle || ""),
    underline: /underline/.test(deco),
    strike: /line-through/.test(deco),
    color: decodeColor(cs.color) || template.colors.body,
    bg,
    sup: va === "super",
    sub: va === "sub",
    sizePx: parseFloat(cs.fontSize) || template.sizes.body * PT_TO_PX,
    font,
  };
}

function styleKey(s, href) {
  return [s.bold ? 1 : 0, s.italic ? 1 : 0, s.underline ? 1 : 0, s.strike ? 1 : 0,
    s.color, s.bg || "", s.sup ? 1 : 0, s.sub ? 1 : 0,
    Math.round(s.sizePx * 10) / 10, s.font, href || ""].join("|");
}

// Collecte mot par mot (positions exactes via Range), regroupement en lignes.
function collectLines(el, hostRect, template) {
  const words = [];
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let node;
  // Conserve la séparation du texte source, y compris entre deux balises
  // inlinestrong. La position graphique seule ne suffit pas : une espace peut
  // mesurer moins de 1,5 px selon la police, et les mots seraient recollés
  // lors de la reconstruction HTML du Studio.
  let trailingSpace = false;
  while ((node = walker.nextNode())) {
    if (!node.data.trim()) {
      // Un nœud entièrement blanc entre deux nœuds textuels est aussi un
      // séparateur source (par exemple « bonjour <strong>Monde</strong> »).
      trailingSpace = true;
      continue;
    }
    const parent = node.parentElement;
    if (!parent) continue;
    const style = styleOf(parent, template);
    const anchor = parent.closest("a");
    const href = anchor ? anchor.getAttribute("href") : null;
    const upper = template.headingUpper && /^h1$/i.test(el.tagName) ? node.data.toUpperCase() : node.data;
    const re = /\S+/g;
    let m;
    while ((m = re.exec(upper))) {
      const range = document.createRange();
      range.setStart(node, m.index);
      range.setEnd(node, m.index + m[0].length);
      const rects = range.getClientRects();
      if (!rects.length) continue;
      const r = rects[rects.length - 1];
      if (!r || !r.width) continue;
      const leadingSpace = m.index > 0 && /\s/.test(node.data.slice(0, m.index));
      words.push({
        text: m[0],
        x: r.left - hostRect.left,
        w: r.width,
        top: r.top - hostRect.top,
        bottom: r.bottom - hostRect.top,
        style,
        href,
        // `true` signifie qu'une espace existait réellement avant ce mot.
        // `false` est important : il empêche un faux espace créé uniquement par
        // l'écart graphique de deux glyphes sans espace dans le texte source.
        spaceBefore: Boolean(leadingSpace || trailingSpace),
      });
      trailingSpace = /\s/.test(node.data.slice(m.index + m[0].length));
    }
  }
  if (!words.length) return [];
  // Regroupement en lignes : tri par ordre DOM puis par top (tolérance 3 px).
  const lines = [];
  let cur = null;
  for (const w of words) {
    if (!cur || Math.abs(w.top - cur.top) > 3) {
      cur = { top: w.top, bottom: w.bottom, words: [w] };
      lines.push(cur);
    } else {
      cur.words.push(w);
      cur.top = Math.min(cur.top, w.top);
      cur.bottom = Math.max(cur.bottom, w.bottom);
    }
  }
  // Runs : fusion des mots consécutifs de même style (positions conservées
  // mot à mot pour le rendu exact — un run ne fait que partager le style).
  for (const ln of lines) {
    ln.runs = [];
    let run = null;
    for (const w of ln.words) {
      const key = styleKey(w.style, w.href);
      if (run && run.key === key && Math.abs(w.x - (run.lastX + run.lastW)) < 1.5) {
        run.text += w.text;
        run.w += w.w;
        run.words.push({ text: w.text, x: w.x, w: w.w, spaceBefore: w.spaceBefore });
      } else {
        run = { key, text: w.text, x: w.x, w: w.w, style: w.style, href: w.href,
          words: [{ text: w.text, x: w.x, w: w.w, spaceBefore: w.spaceBefore }] };
        ln.runs.push(run);
      }
      run.lastX = w.x;
      run.lastW = w.w;
    }
    // Les positions mot à mot restent la source de vérité (justification).
  }
  return lines;
}

// ─── Transformation du HTML de l'éditeur en atomes mesurés ──────────────────

function kindOfTag(tag) {
  const t = tag.toLowerCase();
  if (t === "h1" || t === "h2" || t === "h3" || t === "h4") return t;
  if (t === "blockquote") return "quote";
  if (t === "pre") return "pre";
  if (t === "hr") return "hr";
  return "p";
}

function blockInlineStyle(kind, template) {
  const s = template.sizes;
  const map = {
    p: `font-family:${FONT_CSS[template.bodyFont]};font-size:${s.body}pt;line-height:${template.lineHeight};color:${template.colors.body};margin:0;text-align:${template.align};`,
    h1: `font-family:${FONT_CSS[template.headingFont]};font-size:${s.h1}pt;line-height:1.25;font-weight:bold;color:${template.colors.heading};margin:0;`,
    h2: `font-family:${FONT_CSS[template.headingFont]};font-size:${s.h2}pt;line-height:1.3;font-weight:bold;color:${template.colors.heading};margin:0;`,
    h3: `font-family:${FONT_CSS[template.headingFont]};font-size:${s.h3}pt;line-height:1.35;font-weight:bold;color:${template.colors.heading};margin:0;`,
    h4: `font-family:${FONT_CSS[template.headingFont]};font-size:${s.h4}pt;line-height:1.35;font-weight:bold;color:${template.colors.accent};margin:0;`,
    quote: `font-family:${FONT_CSS[template.bodyFont]};font-size:${s.body}pt;line-height:${template.lineHeight};font-style:italic;color:${template.colors.accent};margin:0;border-left:3px solid ${template.colors.accent};padding-left:14px;text-align:${template.align};`,
    pre: `font-family:${FONT_CSS.mono};font-size:${s.small + 0.5}pt;line-height:1.45;color:${template.colors.body};margin:0;white-space:pre;background:#f4f4f5;padding:8px;`,
    liText: `font-family:${FONT_CSS[template.bodyFont]};font-size:${s.body}pt;line-height:${template.lineHeight};color:${template.colors.body};margin:0;text-align:${template.align};padding-left:18px;text-indent:-18px;`,
  };
  return map[kind] || map.p;
}

// Un atome = UNE ligne. La position verticale mesurée (relative au bloc mesuré)
// est ramenée dans la boîte de l'atome (`top: 0`) : c'est `item.top` — calculé
// par flowAtoms — qui place ensuite la ligne sur la page. Sans cette remise à
// zéro, la 3ᵉ ligne d'un paragraphe serait peinte à 3 interlignes du HAUT DE LA
// PAGE : tous les blocs se superposaient (aperçu comme PDF). Les `x` des mots
// restent relatifs à la largeur de contenu (aucun décalage horizontal).
//
// ⚠️ VERTICAL (anti « des écrits sur des écrits ») — deux règles, désormais
// cohérentes avec ce que le navigateur a réellement mesuré :
//  1. l'avance verticale d'une ligne est l'AVANCE RÉELLE mesurée jusqu'à la
//     suivante (`h`, interligne compris), jamais la seule hauteur d'encre
//     `bottom - top` (≈ 1,12 × taille de police) : sinon chaque ligne du bloc
//     se rapprochait de ~7 px et les lignes finissaient par se superposer ;
//  2. les positions restituées à l'aperçu/au PDF (`top` relatif à la première
//     ligne du bloc) sont RECONSTRUITES à partir de ces mêmes avances : la
//     ligne est donc peinte exactement là où le flux l'a placée (aucun écart
//     possible entre la décision de saut de page et l'encre dessinée).
// Les espacements du bloc (`sp.before` / `sp.after`) s'appliquent désormais aux
// BORDS du bloc uniquement : appliquer `after` après la première ligne
// ajoutait l'espacement de paragraphe AU MILIEU du bloc (les lignes d'un
// paragraphe se retrouvaient espacées de « encre + espacement », masquant le
// premier défaut au prix d'un interlignage faux et irrégulier).
function pushLineAtoms(atoms, lines, kind, sp, groupId, marker) {
  if (!lines.length) return;
  const n = lines.length;
  const ink = lines.map((ln) => Math.max(1, ln.bottom - ln.top));
  // Avances et décalages cumulés (le max protège d'une mesure d'encre
  // supérieure à l'avance réelle : jamais de ligne écrasée).
  const offsets = [0];
  for (let i = 1; i < n; i++) {
    const adv = Math.max(ink[i - 1], lines[i].top - lines[i - 1].top);
    offsets.push(offsets[i - 1] + adv);
  }
  // Hauteur d'encre du bloc complet : sert au décor de titre (barre latérale
  // des h1, règle sous le titre) pour couvrir TOUTES les lignes du titre.
  const groupH = Math.max(1, offsets[n - 1] + ink[n - 1]);
  const heading = /^h[1-4]$/.test(kind);
  const lastBottom = groupH;
  lines.forEach((ln, i) => {
    const isFirst = i === 0;
    const isLast = i === n - 1;
    // Avance : distance jusqu'à la ligne suivante ; la dernière ligne du bloc
    // conserve sa hauteur d'encre (l'espacement qui suit reste `sp.after`).
    const advance = isLast ? ink[i] : offsets[i + 1] - offsets[i];
    atoms.push({
      kind,
      // CONVENTION : la ligne est peinte à `item.top + ln.top` par l'aperçu et
      // à `item.top + ln.bottom` par le PDF — comme chaque atome est UNE ligne
      // placée par le flux à sa position exacte, la boîte de la ligne repart de
      // 0 dans l'atome (les avances cumulées ci-dessus servent uniquement à
      // `h`, `groupH` et `restH`, jamais au rendu).
      lines: [{ ...ln, top: 0, bottom: ink[i] }],
      h: advance,
      groupH,
      // Hauteur restante du bloc depuis cette ligne (titres insécables).
      restH: lastBottom - offsets[i],
      heading,
      marker: i === 0 ? marker : null,
      // Bords du bloc seulement (voir l'en-tête de la fonction).
      sp: { before: isFirst ? sp.before : 0, after: isLast ? sp.after : 0 },
      groupId,
      groupLines: n,
      lineIndex: i,
      keepNext: heading && isLast,
      // Seul un h1 (chapitre) ouvre une nouvelle page : les h2 sont des
      // sections, qui restent dans le flux (titre jamais isolé en bas de page).
      chapterStart: kind === "h1" && i === 0,
      breakable: true,
    });
  });
}

function atomsFromBlock(el, host, hostRect, template, groupId) {
  const lower = el.tagName.toLowerCase();

  // Image seule (TipTap : <p><img></p> ou <img> nu) : l'élément vit dans un
  // fragment hors DOM → on l'attache à l'hôte pour obtenir ses dimensions.
  const soleImg =
    lower === "img" ||
    (lower === "p" && el.children.length === 1 && el.children[0].tagName === "IMG" && !el.textContent.trim());
  if (soleImg) {
    const img = lower === "img" ? el : el.children[0];
    host.appendChild(el);
    img.style.maxWidth = "100%";
    img.style.height = "auto";
    const r = img.getBoundingClientRect();
    const w = img.clientWidth || r.width;
    const h = img.clientHeight || r.height;
    host.removeChild(el);
    if (w > 2 && h > 2) {
      return [{
        kind: "image",
        src: img.getAttribute("src") || "",
        x: r.left - hostRect.left,
        w, h,
        sp: blockSpacing(template, "image"),
        groupId: groupId + "-img", groupLines: 1, breakable: false,
      }];
    }
    return [];
  }

  if (lower === "hr") {
    return [{ kind: "hr", sp: blockSpacing(template, "hr"), groupId, groupLines: 1, breakable: false }];
  }

  // Marqueur [QR] : un bloc contenant exactement ce texte (insensible à la
  // casse/espaces) réserve l'emplacement du QR code de vérification. Accepté
  // dans un paragraphe OU un titre (documents anciens où la détection avait
  // transformé « [QR] » en titre). La boîte est centrée dans la largeur de
  // contenu ; sa hauteur guide la pagination comme une image (insécable,
  // jamais coupée entre deux pages).
  if (
    (lower === "p" || /^h[1-6]$/.test(lower)) &&
    /^\[\s*qr\s*\]$/i.test(el.textContent.trim())
  ) {
    const size = QR_BOX_MM * PX_PER_MM;
    return [{
      kind: "qr",
      x: Math.max(0, (hostRect.width - size) / 2),
      w: size,
      h: size,
      sp: blockSpacing(template, "image"),
      groupId: groupId + "-qr", groupLines: 1, breakable: false,
    }];
  }

  if (lower === "table") {
    // Tableau : un atome par ligne <tr> ; le rendu redessine bordures + texte.
    // Clone attaché à l'hôte (l'original est hors DOM) pour la mesure.
    const clone = el.cloneNode(true);
    clone.style.cssText = "border-collapse:collapse;width:100%;margin:0;";
    [...clone.querySelectorAll("td,th")].forEach((td) => {
      td.style.cssText += `border:1px solid ${template.colors.accent}55;padding:4px 6px;vertical-align:top;`;
    });
    host.appendChild(clone);
    const rows = [...clone.querySelectorAll("tr")];
    const atoms = [];
    rows.forEach((tr, ri) => {
      const cells = [...tr.children].map((td) => {
        const rect = td.getBoundingClientRect();
        return {
          x: rect.left - hostRect.left,
          w: rect.width,
          h: rect.height,
          header: /^th$/i.test(td.tagName),
          // Lignes mesurées dans le repère de LA CELLULE : l'aperçu comme le PDF
          // peignent la cellule à (x, item.top) puis son texte à l'intérieur
          // (sinon le texte était décalé de la position de la cellule).
          lines: collectLines(td, { left: rect.left, top: rect.top }, template),
        };
      });
      if (!cells.length) return;
      const trRect = tr.getBoundingClientRect();
      atoms.push({
        kind: "tableRow",
        cells,
        h: trRect.height,
        sp: ri === 0 ? { before: 6, after: 6 } : { before: 0, after: 0 },
        groupId: groupId + "-tr" + ri, groupLines: 1, breakable: true,
        tableFirst: ri === 0,
      });
    });
    host.removeChild(clone);
    return atoms;
  }

  if (lower === "ul" || lower === "ol") {
    const atoms = [];
    [...el.children].forEach((li, idx) => {
      if (!/^li$/i.test(li.tagName)) return;
      const ordered = lower === "ol";
      const div = document.createElement("div");
      div.style.cssText = blockInlineStyle("liText", template);
      div.textContent = (ordered ? `${idx + 1}. ` : "• ") + li.textContent;
      host.appendChild(div);
      const lines = collectLines(div, hostRect, template);
      host.removeChild(div);
      pushLineAtoms(atoms, lines, "list", blockSpacing(template, "list"), groupId + "-li" + idx, null);
    });
    return atoms;
  }

  // Bloc texte standard (p, h1-h4, blockquote, pre).
  const kind = kindOfTag(el.tagName);
  const div = document.createElement("div");
  div.style.cssText = blockInlineStyle(kind, template);
  div.innerHTML = el.innerHTML;
  host.appendChild(div);
  const lines = collectLines(div, hostRect, template);
  host.removeChild(div);
  const atoms = [];
  pushLineAtoms(atoms, lines, kind, blockSpacing(template, kind), groupId, null);
  return atoms;
}

// ─── Mesure du document complet ─────────────────────────────────────────────

export async function measureDocument(html, docMeta, template) {
  const box = resolvePageBox(docMeta);
  const contentWpx = (box.w - box.m.left - box.m.right) * PX_PER_MM;
  const contentHpx = (box.h - box.m.top - box.m.bottom) * PX_PER_MM;

  const host = document.createElement("div");
  host.style.cssText =
    `position:absolute;left:-20000px;top:0;width:${Math.round(contentWpx)}px;` +
    `visibility:hidden;pointer-events:none;background:#fff;`;
  document.body.appendChild(host);

  try {
    // Attendre les polices (webfonts en cours de chargement) : sans cela, la
    // mesure utiliserait une police de repli dont les largeurs diffèrent de
    // celles réellement rendues → texte superposé dans l'aperçu et le PDF.
    if (document.fonts?.ready) await document.fonts.ready;
    const tpl = document.createElement("template");
    tpl.innerHTML = String(html || "<p></p>");
    // Précharge les images (dataURL incluses) : sans chargement effectif,
    // clientWidth/clientHeight vaudraient 0 au moment de la mesure.
    await Promise.all(
      [...tpl.content.querySelectorAll("img")].map(
        (img) =>
          new Promise((resolve) => {
            const src = img.getAttribute("src") || "";
            if (!src) return resolve();
            const probe = new window.Image();
            probe.onload = () => resolve();
            probe.onerror = () => resolve();
            probe.src = src;
            setTimeout(resolve, 4000); // ne bloque jamais la pagination
          })
      )
    );
    const blocks = [...tpl.content.children];
    if (!blocks.length && tpl.content.textContent.trim()) {
      const p = document.createElement("p");
      p.textContent = tpl.content.textContent;
      blocks.push(p);
    }
    let atoms = [];
    blocks.forEach((el, i) => {
      // Réinitialise le contenu de host pour chaque bloc (host sert de
      // gabarit de style) : on y ajoute le bloc stylé, on mesure, on retire.
      try {
        atoms = atoms.concat(atomsFromBlock(el, host, host.getBoundingClientRect(), template, "b" + i));
      } catch {
        /* bloc non mesurable : ignoré */
      }
    });
    return { atoms, contentWpx, contentHpx, box };
  } finally {
    host.remove();
  }
}

// ─── Flux en pages ──────────────────────────────────────────────────────────

// Retrait d'ouverture de chapitre (fraction de la hauteur utile) : la première
// page d'un chapitre respire, comme dans un livre imprimé.
const CHAPTER_DROP = 0.1;

function findGroupStart(items, groupId) {
  for (let i = 0; i < items.length; i++) {
    if (items[i].groupId === groupId) return i;
  }
  return -1;
}

export function flowAtoms(atoms, contentHpx, template, bodyLineH) {
  const pages = [];
  const headings = [];
  let items = []; // atomes placés sur la page courante
  let carry = []; // atomes reportés en tête de la page suivante (jamais perdus)
  let y = 0;
  let prevAfter = 0;
  let firstPlaced = false;

  const atomH = (a) => {
    if (a.kind === "image" || a.kind === "tableRow" || a.kind === "qr") return a.h;
    if (a.kind === "hr") return 4;
    // Ligne de texte / liste / citation : `h` porte l'avance verticale RÉELLE
    // mesurée (interligne compris), indispensable pour ne pas empiler les
    // lignes les unes sur les autres (voir pushLineAtoms).
    if (Number.isFinite(a.h)) return a.h;
    const ln = a.lines?.[0];
    return ln ? ln.bottom - ln.top : 0;
  };

  // (Ré)empile une liste d'atomes à partir de `startY` et renvoie la hauteur
  // consommée + l'espacement « after » courant (sert au report de page).
  const restack = (list, startY) => {
    let yy = startY;
    let prev = 0;
    for (const it of list) {
      const spBefore = Math.max(it.sp.before * PT_TO_PX, prev * PT_TO_PX);
      it.spBefore = spBefore;
      it.top = yy + spBefore;
      yy = it.top + atomH(it) + it.sp.after * PT_TO_PX;
      prev = it.sp.after;
    }
    return { y: yy, prevAfter: prev };
  };

  const flush = () => {
    pages.push(items);
    items = carry;
    carry = [];
    ({ y, prevAfter } = restack(items, 0));
  };

  for (let raw of atoms) {
    let atom = raw;
    let h = atomH(atom);
    if (!h) continue;

    // Image trop haute pour une page entière : réduite à la boîte.
    if (atom.kind === "image" && h > contentHpx) {
      const scale = contentHpx / h;
      atom = { ...atom, h: contentHpx, w: atom.w * scale };
      h = contentHpx;
    }

    const before = Math.max(atom.sp.before * PT_TO_PX, prevAfter * PT_TO_PX);
    const after = atom.sp.after * PT_TO_PX;

    // Ouverture de chapitre : un h1 (chapitre) commence TOUJOURS sur une
    // nouvelle page quand le modèle le demande — jamais sur la toute première
    // page de contenu (sinon la première page serait vide). Les h2 sont des
    // sections : ils restent dans le flux (titre insécable + garde avec la
    // suite), sinon chaque ligne en majuscules couperait la page.
    if (atom.chapterStart && template.chapterNewPage && firstPlaced) {
      flush();
      // Retrait « ouverture de chapitre » : la page respire, comme dans un
      // livre imprimé (le PDF et l'aperçu consomment la même position).
      if (items.length === 0) {
        y = contentHpx * CHAPTER_DROP;
        prevAfter = 0;
      }
    }

    if (items.length > 0) {
      // Titre insécable : un titre se déplace EN BLOC (`restH` = hauteur
      // restante du titre depuis cette ligne) et réserve en plus la place de
      // ~2 lignes de corps qui le suivent. Depuis que les lignes sont posées à
      // leur avance réelle (interligne compris), raisonner sur la seule ligne
      // courante laissait la 2ᵉ ligne d'un titre seule en bas de page.
      const reserve = atom.keepNext ? bodyLineH * 2 : 0;
      const needed = atom.heading ? (atom.restH || h) + bodyLineH * 2 : h + reserve;
      let needsBreak = y + before + needed > contentHpx;

      if (needsBreak && atom.breakable && atom.groupLines > 1 && !atom.keepNext) {
        // Veuves/orphelines : si une SEULE ligne du bloc tient en fin de page,
        // elle est reportée avec les lignes suivantes sur la page suivante.
        // (L'ancienne version retirait la ligne de la page sans la replacer :
        // du texte disparaissait silencieusement à chaque coupure.)
        const startIdx = findGroupStart(items, atom.groupId);
        const placedCount = startIdx >= 0 ? items.length - startIdx : 0;
        if (placedCount === 1) {
          carry = items.splice(startIdx);
          flush();
          needsBreak = false;
        }
      }

      if (needsBreak) flush();
    }

    const spBefore = items.length === 0 ? 0 : Math.max(atom.sp.before * PT_TO_PX, prevAfter * PT_TO_PX);
    const item = { ...atom, spBefore, top: y + spBefore };
    y = item.top + h + atom.sp.after * PT_TO_PX;
    prevAfter = atom.sp.after;

    if ((atom.kind === "h1" || atom.kind === "h2") && atom.lineIndex === 0) {
      const hText = lineText(atom.lines[0]);
      // Marqueur [QR] : jamais dans la table des matières (documents anciens
      // où la détection l'avait transformé en titre).
      if (!/^\[\s*qr\s*\]$/i.test(hText.trim())) {
        headings.push({
          level: atom.kind === "h1" ? 1 : 2,
          text: hText,
          pageIndex: pages.length,
        });
      }
    }
    items.push(item);
    firstPlaced = true;
  }
  if (items.length || !pages.length) flush();
  return { pages, headings };
}

// Reconstitue le texte d'une ligne mesurée. `spaceBefore` vient du texte
// source ; le seuil graphique reste le repli pour les anciens layouts.
export function lineText(ln) {
  if (!ln) return "";
  let out = "";
  let prev = null;
  for (const w of ln.words || []) {
    const sourceSpace = typeof w.spaceBefore === "boolean"
      ? w.spaceBefore
      : prev && w.x - (prev.x + prev.w) > 1.5;
    if (sourceSpace) out += " ";
    out += w.text;
    prev = w;
  }
  return out;
}

// ─── Pagination complète (2 passes : flux + table des matières) ────────────

const TOC_LINE_FACTOR = 2.0;

export async function paginateDocument({ html, doc, toc = true }) {
  // Modèle + surcharges typographiques du document (style_overrides) : la
  // pagination ET l'export PDF consomment le même template résolu.
  const template = resolveTemplate(getTemplate(doc.template_id), doc.style_overrides);
  const measured = await measureDocument(html, doc, template);
  const bodyLineH = template.sizes.body * template.lineHeight * PT_TO_PX;
  const flow = flowAtoms(measured.atoms, measured.contentHpx, template, bodyLineH);

  const front = [];
  if (doc.cover?.enabled !== false) front.push({ kind: "cover" });
  if (doc.protection?.copyright !== false) front.push({ kind: "copyright" });

  const entries = flow.headings.map((h) => ({ level: h.level, text: h.text, page: 0 }));
  const perPage = Math.max(4, Math.floor(measured.contentHpx / (bodyLineH * TOC_LINE_FACTOR)));
  const tocPagesCount = toc && entries.length ? Math.ceil(entries.length / perPage) : 0;

  // Numérotation absolue : les pages de contenu suivent le front matter + TDM.
  const contentStart = front.length + tocPagesCount;
  flow.headings.forEach((h, i) => {
    entries[i].page = contentStart + h.pageIndex + 1;
  });

  const tocPages = [];
  for (let i = 0; i < tocPagesCount; i++) {
    tocPages.push({
      kind: "toc",
      entries: entries.slice(i * perPage, (i + 1) * perPage),
      number: front.length + i + 1,
      tocIndex: i, tocTotal: tocPagesCount,
    });
  }

  const pages = [
    ...front,
    ...tocPages,
    ...flow.pages.map((items, idx) => ({
      kind: "content",
      items,
      number: contentStart + idx + 1,
    })),
  ];

  return {
    pages,
    entries,
    box: measured.box,
    contentWpx: measured.contentWpx,
    contentHpx: measured.contentHpx,
    template,
  };
}