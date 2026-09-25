// ─── Moteur EPUB 3 (reflowable) ─────────────────────────────────────────────
// Second format d'export du Générateur, indépendant du moteur PDF (spec §28/§106).
// Source de vérité : le docModel TipTap (JSON) — pas le HTML paginé — car un EPUB
// est REFLOWABLE : la pagination est recalculée par le lecteur, on ne transpose
// donc surtout pas les positions mesurées du PDF.
//
// Contenu réellement embarqué : couverture (image rendue localement), page de
// couverture XHTML, page de copyright, table des matières de navigation (nav.xhtml
// + toc.ncx pour les anciens lecteurs), un fichier XHTML par chapitre, feuille de
// style issue du modèle de design, métadonnées Dublin Core complètes.
import JSZip from "jszip";
import { FONT_CSS, getTemplate, resolveTemplate } from "./templates.js";
import { renderCoverImage } from "./coverImage.js";
import { copyrightBlock, COPYRIGHT_FONT_PT, COPYRIGHT_REFERENCE_FONT_PT, makeQrDataUrl, verificationPayload } from "./protection.js";
import { MBOPPI_CONTENT_URL, MBOPPI_CONTENT_LABEL, MBOPPI_PROMO_FONT_PT } from "./footerPromo.js";

const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" };
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ESC[c]);

function dataUrlToUint8(dataUrl) {
  const base64 = String(dataUrl || "").split(",")[1] || "";
  const bin = atob(base64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// ── Inline TipTap → XHTML ───────────────────────────────────────────────────
function inlineToXhtml(nodes) {
  return (nodes || []).map(inlineNode).join("");
}

function inlineNode(node) {
  const t = node?.type;
  if (!node) return "";
  if (t === "text") {
    let html = esc(node.text || "");
    const marks = node.marks || [];
    for (const m of marks) {
      if (m.type === "bold") html = `<strong>${html}</strong>`;
      else if (m.type === "italic") html = `<em>${html}</em>`;
      else if (m.type === "underline") html = `<span class="u">${html}</span>`;
      else if (m.type === "strike") html = `<del>${html}</del>`;
      else if (m.type === "code") html = `<code>${html}</code>`;
      else if (m.type === "link" && m.attrs?.href) {
        html = `<a href="${esc(m.attrs.href)}">${html}</a>`;
      } else if (m.type === "textStyle" && m.attrs?.color) {
        html = `<span style="color:${esc(m.attrs.color)}">${html}</span>`;
      }
    }
    if (node.marks?.some((m) => m.type === "highlight")) html = `<mark>${html}</mark>`;
    return html;
  }
  if (t === "hardBreak") return "<br/>";
  if (t === "image" && node.attrs?.src) {
    const w = node.attrs.width ? ` style="width:${esc(String(node.attrs.width))}"` : "";
    return `<img src="${esc(node.attrs.src)}" alt="${esc(node.attrs.alt || "")}"${w}${
      node.attrs.title ? ` title="${esc(node.attrs.title)}"` : ""
    }/>`;
  }
  if (node.content) return inlineToXhtml(node.content);
  return "";
}

// ── Bloc TipTap → XHTML (alignement, images, listes, tableaux, citations) ───
function blockToXhtml(node) {
  const attrs = node?.attrs || {};
  const align =
    attrs.textAlign === "center" || attrs.textAlign === "right" || attrs.textAlign === "justify"
      ? ` class="ta-${attrs.textAlign}"`
      : "";
  switch (node?.type) {
    case "heading": {
      const lvl = [1, 2, 3, 4, 5, 6].includes(Number(attrs.level)) ? Number(attrs.level) : 2;
      return `<h${lvl}${align}>${inlineToXhtml(node.content)}</h${lvl}>`;
    }
    case "paragraph":
      return node.content?.length ? `<p${align}>${inlineToXhtml(node.content)}</p>` : "<p/>";
    case "blockquote":
      return `<blockquote>${(node.content || []).map(blockToXhtml).join("")}</blockquote>`;
    case "bulletList":
      return `<ul>${(node.content || []).map(blockToXhtml).join("")}</ul>`;
    case "orderedList":
      return `<ol>${(node.content || []).map(blockToXhtml).join("")}</ol>`;
    case "listItem":
      return `<li>${(node.content || []).map(blockToXhtml).join("")}</li>`;
    case "horizontalRule":
      return "<hr/>";
    case "codeBlock":
      return `<pre><code>${esc((node.content || []).map((c) => c.text || "").join(""))}</code></pre>`;
    case "image": {
      const src = attrs.src || "";
      if (!src) return "";
      return `<figure><img src="${esc(src)}" alt="${esc(attrs.alt || attrs.title || "")}"/>${
        attrs.title ? `<figcaption>${esc(attrs.title)}</figcaption>` : ""
      }</figure>`;
    }
    case "table":
      return `<table>${(node.content || []).map(blockToXhtml).join("")}</table>`;
    case "tableRow":
      return `<tr>${(node.content || []).map(blockToXhtml).join("")}</tr>`;
    case "tableHeader":
      return `<th>${(node.content || []).map(blockToXhtml).join("")}</th>`;
    case "tableCell":
      return `<td>${(node.content || []).map(blockToXhtml).join("")}</td>`;
    default:
      return (node?.content || []).map(blockToXhtml).join("");
  }
}
// ── Découpe du docModel en chapitres (H1 = nouveau fichier XHTML) ───────────
function splitChapters(docModel) {
  const nodes = docModel?.content || [];
  const chapters = [];
  let cur = { title: "", nodes: [] };
  for (const node of nodes) {
    if (node.type === "heading" && node.attrs?.level === 1) {
      if (cur.nodes.length || cur.title) chapters.push(cur);
      cur = { title: inlineToXhtml(node.content).replace(/<[^>]+>/g, "").trim(), nodes: [] };
      continue; // le titre H1 devient le nom du chapitre (pas dupliqué dans le corps)
    }
    cur.nodes.push(node);
  }
  if (cur.nodes.length || cur.title) chapters.push(cur);
  if (!chapters.length) chapters.push({ title: "", nodes });
  return chapters;
}

// ── Feuille de style issue du modèle de design (cohérence PDF/EPUB) ──────────
function epubCss(template) {
  const c = template.colors;
  const headingFont = FONT_CSS[template.headingFont] || FONT_CSS.sans;
  return [
    `body{font-family:${FONT_CSS[template.bodyFont] || FONT_CSS.sans};font-size:${template.sizes.body}pt;${template.bodyBold ? "font-weight:700;" : ""}`,
    `line-height:${template.lineHeight};color:${c.body};background:${c.bg};margin:5% 6%;}`,
    `h1,h2,h3,h4{font-family:${headingFont};color:${c.heading};line-height:1.25;}`,
    `h1{font-size:${template.sizes.h1}pt;margin:1.6em 0 .7em;}`,
    `h2{font-size:${template.sizes.h2}pt;margin:1.4em 0 .6em;}`,
    `h3{font-size:${template.sizes.h3}pt;margin:1.2em 0 .5em;}`,
    `h4{font-size:${template.sizes.h4}pt;margin:1em 0 .4em;}`,
    `p{margin:0 0 ${template.paraSpace || 6}px;text-align:${template.align === "justify" ? "justify" : "left"};}`,
    `blockquote{border-left:3px solid ${c.accent};margin:1em 0;padding:.2em 1em;color:${c.body};font-style:italic;}`,
    `img{max-width:100%;height:auto;}`,
    `figure{margin:1em 0;text-align:center;}`,
    `figcaption{font-size:.85em;color:${c.accent};}`,
    `table{border-collapse:collapse;width:100%;margin:1em 0;}`,
    `th,td{border:1px solid ${c.accent}55;padding:.4em .6em;text-align:left;}`,
    `th{background:${c.accent}22;}`,
    `hr{border:0;border-top:1px solid ${c.accent};margin:1.5em 0;}`,
    `a{color:${c.accent};}`,
    `.mboppi-footer{margin-top:2em;padding-top:.6em;border-top:1px solid ${c.accent}55;font-size:${MBOPPI_PROMO_FONT_PT}pt;font-style:italic;text-align:left;color:${c.accent};}`,
    `.mboppi-footer a{color:inherit;text-decoration:underline;}`,
    `mark{background:${c.accent}33;}`,
    `.u{text-decoration:underline;}`,
    `.ta-center{text-align:center;}.ta-right{text-align:right;}.ta-justify{text-align:justify;}`,
    `.cover-page{text-align:center;margin-top:35%;}`,
    `.cover-page .t{font-size:26pt;font-weight:bold;color:${c.heading};}`,
    `.cover-page .s{font-size:14pt;color:${c.accent};margin-top:1em;}`,
    `.cover-page .a{font-size:12pt;margin-top:2em;}`,
    `.copyright-page{margin-top:40%;font-size:${COPYRIGHT_FONT_PT}pt;line-height:1.6;white-space:pre-line;}`,
    `.copyright-page .copyright-reference{font-size:${COPYRIGHT_REFERENCE_FONT_PT}pt;line-height:1.4;color:${c.accent};margin-top:1em;}`,
  ].join("\n");
}

// ── XHTML d'une page simple (couverture éditoriale / copyright) ──────────────
function simpleXhtml(title, inner) {
  return `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head><meta charset="utf-8"/><title>${esc(title)}</title></head>
<body>${inner}</body>
</html>`;
}

// ── Export EPUB 3 réel (ZIP conforme, téléchargé comme le PDF) ────────────────
// docModel = JSON TipTap du document (reflow : la pagination appartient au lecteur).
export async function exportEpub({ doc, docMeta, onProgress }) {
  const template = resolveTemplate(getTemplate(docMeta.template_id), docMeta.style_overrides);
  const docModel = doc || docMeta;
  const chapters = splitChapters(docModel);
  const title = docMeta.title || "Document";
  const author = docMeta.author || "";
  const lang = (navigator.language || "fr").slice(0, 2);
  // Identifiant unique EPUB : la référence MboppiShop quand elle existe (cohérence
  // avec le QR code du PDF), sinon un UUID v4.
  const identifier = docMeta.doc_ref
    ? `urn:mboppi:${docMeta.doc_ref}`
    : `urn:uuid:${typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `gen-${Date.now()}-${Math.random().toString(16).slice(2)}`}`;

  onProgress?.(5, "Préparation des chapitres…");
  const zip = new JSZip();
  zip.file("mimetype", "application/epub+zip", { compression: "STORE" });
  zip.file(
    "META-INF/container.xml",
    `<?xml version="1.0"?>\n<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">\n  <rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>\n</container>`
  );
  const oebps = zip.folder("OEBPS");
  oebps.file("style.css", epubCss(template));

  // Couverture : image rendue localement (canvas) — même design que le PDF.
  let coverId = null;
  onProgress?.(20, "Rendu de la couverture…");
  const coverData = await renderCoverImage(docMeta, { width: 900 });
  if (coverData) {
    const isPng = coverData.includes("image/png");
    oebps.file(isPng ? "cover.png" : "cover.jpg", dataUrlToUint8(coverData));
    coverId = { id: "img-cover", file: isPng ? "cover.png" : "cover.jpg", mime: isPng ? "image/png" : "image/jpeg" };
  }

  // Extraction des images du contenu en fichiers EPUB (dataURL → media/…).
  const imageMap = new Map(); // dataURL -> { file, mime }
  let imgIdx = 0;
  const collectImages = (nodes) => {
    for (const n of nodes || []) {
      const src = n?.type === "image" ? String(n.attrs?.src || "") : "";
      if (src.startsWith("data:image") && !imageMap.has(src)) {
        const isPng = src.includes("image/png");
        const isWebp = src.includes("image/webp");
        imageMap.set(src, {
          file: `media/img${++imgIdx}.${isPng ? "png" : isWebp ? "webp" : "jpg"}`,
          mime: isPng ? "image/png" : isWebp ? "image/webp" : "image/jpeg",
        });
      }
      if (n?.content) collectImages(n.content);
    }
  };
  onProgress?.(35, "Extraction des images…");
  collectImages(docModel.content || []);
  for (const [src, info] of imageMap) oebps.file(info.file, dataUrlToUint8(src));

  // Marqueur [QR] : le QR de vérification (même payload que le PDF) devient une
  // image EPUB classique — déclaré dans le manifeste via imageMap, chaque
  // paragraphe contenant exactement « [QR] » est remplacé par cette image.
  const qrDataUrl =
    docMeta.protection?.qrEnabled === false
      ? null
      : await makeQrDataUrl(verificationPayload(docMeta, docMeta.content_hash || ""), 320);
  let qrFile = null;
  if (qrDataUrl) {
    imageMap.set(qrDataUrl, { file: "media/qr.png", mime: "image/png" });
    oebps.file("media/qr.png", dataUrlToUint8(qrDataUrl));
    qrFile = "media/qr.png";
  }
  const isQrMarker = (n) => {
    if (n?.type !== "paragraph") return false;
    const txt = (n.content || []).map((c) => c.text || "").join("").trim();
    return /^\[\s*qr\s*\]$/i.test(txt);
  };
  const withQr = (nodes) =>
    (nodes || []).map((n) => {
      if (isQrMarker(n)) {
        // Image INLINE dans un paragraphe : blockToXhtml ne sait rendre que des
        // blocs — un nœud image nu en tête de chapitre serait perdu.
        return qrFile
          ? {
              type: "paragraph",
              content: [{ type: "image", attrs: { src: qrFile, alt: "QR de vérification", width: "60%" } }],
            }
          : { type: "paragraph", content: [] };
      }
      if (n.content) return { ...n, content: withQr(n.content) };
      return n;
    });
  // Réécriture des src dataURL → chemins EPUB (les nœuds ne sont jamais mutés :
  // clonage superficiel de l'attr src uniquement).
  const withImages = (nodes) =>
    (nodes || []).map((n) => {
      if (n.type === "image" && n.attrs?.src && imageMap.has(n.attrs.src)) {
        return { ...n, attrs: { ...n.attrs, src: imageMap.get(n.attrs.src).file } };
      }
      if (n.content) return { ...n, content: withImages(n.content) };
      return n;
    });

  // Fichiers XHTML : couverture éditoriale, copyright, puis un par chapitre.
  const documents = []; // { id, file, title, xhtml }
  // L'auteur n'apparaît JAMAIS sur la couverture (règle produit) : il reste
  // dans les métadonnées (`dc:creator`) et sur la page de copyright.
  const coverLines =
    `<div class="t">${esc(docMeta.cover?.title || title)}</div>` +
    (docMeta.cover?.subtitle || docMeta.subtitle
      ? `<div class="s">${esc(docMeta.cover?.subtitle || docMeta.subtitle)}</div>`
      : "");
  documents.push({
    id: "cover",
    file: "cover.xhtml",
    title: "Couverture",
    xhtml: simpleXhtml("Couverture", `<div class="cover-page">${coverId ? "" : ""}${coverLines}</div>`),
  });
  documents.push({
    id: "copyright",
    file: "copyright.xhtml",
    title: "Copyright",
    xhtml: simpleXhtml(
      "Copyright",
      `<div class="copyright-page">${copyrightBlock(docMeta, { detailPt: COPYRIGHT_REFERENCE_FONT_PT })
        .filter((it) => it.text)
        .map((it) => (it.href ? `<div><a href="${esc(it.href)}">${esc(it.text)}</a></div>` : `<div>${esc(it.text)}</div>`))
        .join("")}</div>`
    ),
  });

  const total = chapters.length || 1;
  for (let i = 0; i < chapters.length; i++) {
    onProgress?.(40 + Math.round(((i + 1) / total) * 40), `Chapitre ${i + 1}/${total}…`);
    const ch = chapters[i];
    const body = withImages(withQr(ch.nodes)).map((n) => blockToXhtml(n)).join("\n");
    const heading = ch.title ? `<header><h1>${esc(ch.title)}</h1></header>` : "";
    const footer = `<footer class="mboppi-footer"><em>visitez <a href="${esc(MBOPPI_CONTENT_URL)}">${esc(MBOPPI_CONTENT_LABEL)}</a> pour plus de contenu</em></footer>`;
    const chTitle = ch.title || `Chapitre ${i + 1}`;
    documents.push({
      id: `ch${i + 1}`,
      file: `chapitre-${i + 1}.xhtml`,
      title: chTitle,
      xhtml: simpleXhtml(chTitle, `${heading}${body}${footer}`),
    });
  }
  for (const d of documents) oebps.file(d.file, d.xhtml);

  // ── Table des matières EPUB (nav.xhtml EPUB 3 + toc.ncx EPUB 2 legacy) ──────
  const navItems = documents
    .map((d) => `<li><a href="${d.file}">${esc(d.title)}</a></li>`)
    .join("\n      ");
  oebps.file(
    "nav.xhtml",
    `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head><meta charset="utf-8"/><title>${esc(title)}</title></head>
<body>
  <nav epub:type="toc" id="toc">
    <h1>${esc(title)}</h1>
    <ol>
      ${navItems}
    </ol>
  </nav>
</body>
</html>`
  );
  const navPoints = documents
    .map(
      (d, i) =>
        `<navPoint id="np${i + 1}" playOrder="${i + 1}"><navLabel><text>${esc(d.title)}</text></navLabel><content src="${d.file}"/></navPoint>`
    )
    .join("\n      ");
  oebps.file(
    "toc.ncx",
    `<?xml version="1.0" encoding="utf-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head>
    <meta name="dtb:uid" content="${identifier}"/>
    <meta name="dtb:depth" content="1"/>
    <meta name="dtb:totalPageCount" content="0"/>
    <meta name="dtb:maxPageNumber" content="0"/>
  </head>
  <docTitle><text>${esc(title)}</text></docTitle>
  <navMap>
      ${navPoints}
  </navMap>
</ncx>`
  );

  // ── content.opf : métadonnées Dublin Core + manifest + spine ───────────────
  const mimeOf = (file) => (file.endsWith(".png") ? "image/png" : file.endsWith(".webp") ? "image/webp" : "image/jpeg");
  const manifest = [
    `<item id="css" href="style.css" media-type="text/css"/>`,
    coverId ? `<item id="${coverId.id}" href="${coverId.file}" media-type="${coverId.mime}" properties="cover-image"/>` : "",
    ...[...imageMap.values()].map((im) => `<item id="${im.file.replace(/[./]/g, "-")}" href="${im.file}" media-type="${mimeOf(im.file)}"/>`),
    ...documents.map((d) => `<item id="${d.id}" href="${d.file}" media-type="application/xhtml+xml"/>`),
    `<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>`,
    `<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>`,
  ]
    .filter(Boolean)
    .join("\n      ");
  const spine = documents.map((d) => `<itemref idref="${d.id}"/>`).join("\n      ");
  oebps.file(
    "content.opf",
    `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid" xml:lang="${lang}">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="bookid">${identifier}</dc:identifier>
    <dc:title>${esc(title)}</dc:title>
    ${author ? `<dc:creator>${esc(author)}</dc:creator>` : ""}
    <dc:language>${lang}</dc:language>
    ${docMeta.subtitle ? `<dc:description>${esc(docMeta.subtitle)}</dc:description>` : ""}
    ${docMeta.doc_ref ? `<dc:source>${esc(docMeta.doc_ref)}</dc:source>` : ""}
    <meta property="dcterms:modified">${new Date().toISOString().replace(/\.\d+Z$/, "Z")}</meta>
    <meta name="cover" content="${coverId ? coverId.id : "cover"}"/>
  </metadata>
  <manifest>
      ${manifest}
  </manifest>
  <spine toc="ncx">
      ${spine}
  </spine>
</package>`
  );

  // ── Assemblage du ZIP (mimetype non compressé, obligation EPUB) + download ──
  onProgress?.(88, "Assemblage du fichier…");
  const blob = await zip.generateAsync(
    { type: "blob", mimeType: "application/epub+zip", compression: "DEFLATE", compressionOptions: { level: 6 } },
    (meta) => onProgress?.(88 + Math.round(meta.percent * 0.1), "Compression…")
  );
  onProgress?.(100, "Document prêt.");
  const safe = title.replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "document";
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${safe}.epub`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
