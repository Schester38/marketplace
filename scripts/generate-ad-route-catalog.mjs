import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appPath = path.join(root, "client", "src", "App.jsx");
const outputPath = path.join(root, "server", "data", "adRoutes.generated.js");
const appSource = fs.readFileSync(appPath, "utf8");

function getPageComponents(source) {
  const components = new Map();
  const patterns = [
    /const\s+([A-Z]\w*)\s*=\s*lazyRetry\(\s*\(\)\s*=>\s*import\(\s*["']\.\/(pages\/[^"']+)["']\s*\)/g,
    /import\s+([A-Z]\w*)\s+from\s+["']\.\/(pages\/[^"']+)["']/g,
  ];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) components.set(match[1], match[2]);
  }
  return components;
}

function pageCopy(source) {
  const candidates = [];
  const patterns = [
    />([^<>{}]{4,180})</g,
    /\bt\(\s*(?:"([^"\r\n]{4,180})"|'([^'\r\n]{4,180})')/g,
    /(?:placeholder|title|aria-label)\s*=\s*(?:"([^"\r\n]{4,180})"|'([^'\r\n]{4,180})')/g,
    /(?:title|text|description|label)\s*:\s*(?:"([^"\r\n]{4,180})"|'([^'\r\n]{4,180})')/g,
  ];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      const raw = match.slice(1).find(Boolean);
      if (!raw) continue;
      const text = raw
        .replace(/&(?:amp|nbsp|apos|quot|lt|gt);/g, " ")
        .replace(/\\(['"\\])/g, "$1")
        .replace(/\s+/g, " ")
        .trim();
      if (
        text.length >= 5 &&
        /\s/.test(text) &&
        /[A-Za-zÀ-ÿ]/.test(text) &&
        !/^(?:tw-|https?:|\/api\/|[a-z_-]+\/[a-z_-]+$)/i.test(text) &&
        !/[{}<>]/.test(text)
      ) {
        candidates.push(text);
      }
    }
  }
  return [...new Map(candidates.map((text) => [text.toLocaleLowerCase(), text])).values()].slice(
    0,
    12
  );
}

function routeTags(source) {
  const tags = [];
  let searchFrom = 0;
  while (searchFrom < source.length) {
    const start = source.indexOf("<Route", searchFrom);
    if (start < 0) break;
    const boundary = source[start + 6];
    if (boundary && !/\s|>/.test(boundary)) {
      searchFrom = start + 6;
      continue;
    }

    let quote = "";
    let braceDepth = 0;
    let end = -1;
    for (let index = start + 6; index < source.length; index += 1) {
      const character = source[index];
      if (quote) {
        if (character === "\\") index += 1;
        else if (character === quote) quote = "";
        continue;
      }
      if (character === '"' || character === "'" || character === "`") {
        quote = character;
      } else if (character === "{") {
        braceDepth += 1;
      } else if (character === "}" && braceDepth > 0) {
        braceDepth -= 1;
      } else if (braceDepth === 0 && character === "/" && source[index + 1] === ">") {
        end = index + 2;
        break;
      }
    }
    if (end < 0) throw new Error("Unterminated <Route /> declaration in client/src/App.jsx");
    tags.push(source.slice(start, end));
    searchFrom = end;
  }
  return tags;
}

function slug(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function pageLabel(component) {
  return component.replace(/([a-z0-9])([A-Z])/g, "$1 $2");
}

const pageComponents = getPageComponents(appSource);
const routes = new Map();
for (const tag of routeTags(appSource)) {
  const routePath = tag.match(/\bpath\s*=\s*["']([^"']+)["']/)?.[1];
  if (!routePath || routePath === "*") continue;
  const component = [...tag.matchAll(/<([A-Z]\w*)\b/g)]
    .map((match) => match[1])
    .find((name) => pageComponents.has(name));
  if (!component) continue;

  const id = `route-${slug(routePath) || "home"}`;
  const label = pageLabel(component);
  const pageSource = fs.readFileSync(
    path.join(root, "client", "src", pageComponents.get(component)),
    "utf8"
  );
  const content = pageCopy(pageSource);
  const contentSummary = content.length
    ? ` Textes et fonctions visibles : ${content.join(" · ")}.`
    : "";
  routes.set(id, {
    id,
    name: `${label} — ${routePath}`,
    path: routePath,
    component,
    description: `Page de l’application MboppiShop « ${label} », accessible via ${routePath}. Elle présente les informations et actions associées à ce parcours.${contentSummary}`,
    audience: "Visiteurs, clients ou professionnels selon les accès de la page",
    cta: `Découvrir ${label}`,
  });
}

if (routes.size === 0) {
  throw new Error("No page routes were found in client/src/App.jsx");
}

const output = `// Generated from client/src/App.jsx by scripts/generate-ad-route-catalog.mjs.\nexport const AD_ROUTE_FEATURES = ${JSON.stringify([...routes.values()], null, 2)};\n`;
if (!fs.existsSync(outputPath) || fs.readFileSync(outputPath, "utf8") !== output) {
  fs.writeFileSync(outputPath, output, "utf8");
}
console.log(`Generated ${routes.size} advertising page entries from App.jsx.`);
