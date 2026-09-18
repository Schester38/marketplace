// Moteur de pagination du Générateur : mesure RÉELLE du rendu navigateur via
// l'API Range (chaque mot obtient sa position exacte — identique dans
// l'aperçu HTML et le PDF jsPDF, d'où une fidélité garantie), puis flux en
// pages avec règles typographiques professionnelles :
//   - veuves/orphelines : au moins 2 lignes de chaque côté d'une coupure ;
//   - titres insécables (jamais seul en bas de page) + saut de chapitre ;
//   - tableaux scindés par lignes, images redimensionnées à la boîte ;
//   - table des matières avec numéros de page exacts (2 passes).
import { FONT_CSS, getTemplate, resolvePageBox, blockSpacing } from "./templates.js";

export const PX_PER_MM = 96 / 25.4; // px CSS par mm (96 dpi)
const PT_TO_PX = 96 / 72;

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
  return {
    bold: fw >= 600,
    italic: /italic/i.test(cs.fontStyle || ""),
    underline: /underline/.test(deco),
    strike: /line-through/.test(deco),
    color: decodeColor(cs.color) || template.colors.body,
    sizePx: parseFloat(cs.fontSize) || template.sizes.body * PT_TO_PX,
    font,
  };
}

function styleKey(s, href) {
  return [s.bold ? 1 : 0, s.italic ? 1 : 0, s.underline ? 1 : 0, s.strike ? 1 : 0,
    s.color, Math.round(s.sizePx * 10) / 10, s.font, href || ""].join("|");
}

// Collecte mot par mot (positions exactes via Range), regroupement en lignes.
function collectLines(el, hostRect, template) {
  const words = [];
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let node;
  while ((node = walker.nextNode())) {
    if (!node.data.trim()) continue;
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
      words.push({
        text: m[0],
        x: r.left - hostRect.left,
        w: r.width,
        top: r.top - hostRect.top,
        bottom: r.bottom - hostRect.top,
        style, href,
      });
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
      } else {
        run = { key, text: w.text, x: w.x, w: w.w, style: w.style, href: w.href,
          words: [{ text: w.text, x: w.x, w: w.w }] };
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

function pushLineAtoms(atoms, lines, kind, sp, groupId, marker) {
  if (!lines.length) return;
  lines.forEach((ln, i) => {
    atoms.push({
      kind,
      lines: [ln],
      marker: i === 0 ? marker : null,
      sp: i === 0 ? sp : { before: 0, after: 0 },
      groupId,
      groupLines: lines.length,
      lineIndex: i,
      keepNext: /^h[1-4]$/.test(kind),
      chapterStart: (kind === "h1" || kind === "h2") && i === 0,
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
          lines: collectLines(td, hostRect, template),
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
            const probe = new Image();
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

function findGroupStart(items, groupId) {
  for (let i = 0; i < items.length; i++) {
    if (items[i].groupId === groupId) return i;
  }
  return -1;
}

export function flowAtoms(atoms, contentHpx, template, bodyLineH) {
  const pages = [];
  const headings = [];
  let items = [];
  let y = 0;
  let prevAfter = 0;
  let firstPlaced = false;

  const flush = () => {
    pages.push(items);
    items = [];
    y = 0;
    prevAfter = 0;
  };

  const atomH = (a) => {
    if (a.kind === "image" || a.kind === "tableRow") return a.h;
    if (a.kind === "hr") return 4;
    const ln = a.lines?.[0];
    return ln ? ln.bottom - ln.top : 0;
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

    // Saut de chapitre (jamais sur la toute première page de contenu).
    if (atom.chapterStart && template.chapterNewPage && firstPlaced) {
      flush();
    }

    if (items.length > 0) {
      // Titre insécable : réserve la place de ~2 lignes de corps après lui.
      const reserve = atom.keepNext ? bodyLineH * 2 : 0;
      let needsBreak = y + before + h + reserve > contentHpx;

      if (needsBreak && atom.breakable && atom.groupLines > 1 && !atom.keepNext) {
        // Veuves/orphelines : ajuste la coupure au sein du groupe.
        const startIdx = findGroupStart(items, atom.groupId);
        if (startIdx >= 0) {
          const placedCount = items.length - startIdx;
          const remaining = atom.groupLines - atom.lineIndex; // lignes restantes (courante incluse)
          let cut = startIdx;
          if (remaining === 1 && placedCount >= 2) {
            cut = items.length - 1; // déplace une ligne de plus (orpheline)
          }
          if (placedCount - (cut - startIdx) >= 1 || cut > startIdx) {
            const removed = items.splice(cut);
            y = removed.length ? removed[0].top - removed[0].spBefore : 0;
            prevAfter = 0;
            needsBreak = false;
          }
        }
      }

      if (needsBreak) flush();
    }

    const spBefore = items.length === 0 ? 0 : Math.max(atom.sp.before * PT_TO_PX, prevAfter * PT_TO_PX);
    const item = { ...atom, spBefore, top: y + spBefore };
    y = item.top + h + atom.sp.after * PT_TO_PX;
    prevAfter = atom.sp.after;

    if ((atom.kind === "h1" || atom.kind === "h2") && atom.lineIndex === 0) {
      headings.push({
        level: atom.kind === "h1" ? 1 : 2,
        text: lineText(atom.lines[0]),
        pageIndex: pages.length,
      });
    }
    items.push(item);
    firstPlaced = true;
  }
  if (items.length || !pages.length) flush();
  return { pages, headings };
}

// Reconstitue le texte d'une ligne mesurée (espaces déduits des positions).
export function lineText(ln) {
  if (!ln) return "";
  let out = "";
  let prev = null;
  for (const w of ln.words) {
    if (prev && w.x - (prev.x + prev.w) > 1.5) out += " ";
    out += w.text;
    prev = w;
  }
  return out;
}

// ─── Pagination complète (2 passes : flux + table des matières) ────────────

const TOC_LINE_FACTOR = 2.0;

export async function paginateDocument({ html, doc, toc = true }) {
  const template = getTemplate(doc.template_id);
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