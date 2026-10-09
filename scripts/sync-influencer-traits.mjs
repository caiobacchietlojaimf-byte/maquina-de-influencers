import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pageUrl = "https://higgsfield.ai/ai-influencer-studio";
const apiOptionsUrl = "https://api.higgsfield.ai/models/higgsfield/ai-influencer/options";
const manifestPath = path.join(root, "scripts/influencer-traits.manifest.json");
const assetDirectory = path.join(root, "public/influencer-traits");

export function webpMetadata(bytes) {
  if (bytes.length < 30 || bytes.toString("ascii", 0, 4) !== "RIFF" || bytes.toString("ascii", 8, 12) !== "WEBP" || bytes.readUInt32LE(4) + 8 !== bytes.length) throw new Error("Invalid WebP container");
  for (let offset = 12; offset + 8 <= bytes.length;) {
    const type = bytes.toString("ascii", offset, offset + 4), size = bytes.readUInt32LE(offset + 4), start = offset + 8;
    if (start + size > bytes.length) throw new Error("Truncated WebP chunk");
    if (type === "VP8X" && size >= 10) return { width: bytes.readUIntLE(start + 4, 3) + 1, height: bytes.readUIntLE(start + 7, 3) + 1 };
    if (type === "VP8 " && size >= 10 && bytes.subarray(start + 3, start + 6).equals(Buffer.from([0x9d, 0x01, 0x2a]))) return { width: bytes.readUInt16LE(start + 6) & 0x3fff, height: bytes.readUInt16LE(start + 8) & 0x3fff };
    if (type === "VP8L" && size >= 5 && bytes[start] === 0x2f) { const bits = bytes.readUInt32LE(start + 1); return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 }; }
    offset = start + size + (size & 1);
  }
  throw new Error("Missing WebP image data");
}

async function text(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`${response.status} fetching ${url}`);
  return response.text();
}

// Parse public data literals only. Never execute downloaded application code.
export function extractCatalog(bundle) {
  const source = ts.createSourceFile("studio.js", bundle, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const assignments = new Map();
  function visit(node) {
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken && ts.isIdentifier(node.left)) assignments.set(node.left.text, node.right);
    ts.forEachChild(node, visit);
  }
  visit(source);
  function literal(node, seen = new Set()) {
    if (!node) throw new Error("Missing catalog literal");
    if (ts.isStringLiteralLike(node)) return node.text;
    if (ts.isNumericLiteral(node)) return Number(node.text);
    if (node.kind === ts.SyntaxKind.NullKeyword) return null;
    if (ts.isArrayLiteralExpression(node)) return node.elements.map(value => literal(value, new Set(seen)));
    if (ts.isObjectLiteralExpression(node)) return Object.fromEntries(node.properties.filter(property => ts.isPropertyAssignment(property) && property.name.getText(source) !== "icon").map(property => [property.name.text, literal(property.initializer, new Set(seen))]));
    if (ts.isTemplateExpression(node)) return node.head.text + node.templateSpans.map(span => literal(span.expression, new Set(seen)) + span.literal.text).join("");
    if (ts.isIdentifier(node) && assignments.has(node.text) && !seen.has(node.text)) { seen.add(node.text); return literal(assignments.get(node.text), seen); }
    throw new Error(`Unsupported catalog literal: ${ts.SyntaxKind[node.kind]}`);
  }
  const arrays = [...assignments.values()].filter(ts.isArrayLiteralExpression);
  const groupsNode = arrays.find(node => node.elements.some(item => ts.isObjectLiteralExpression(item) && item.properties.some(property => ts.isPropertyAssignment(property) && property.name.getText(source) === "id" && property.initializer.text === "gender")));
  const typesNode = arrays.find(node => node.elements.some(item => ts.isObjectLiteralExpression(item) && item.properties.some(property => ts.isPropertyAssignment(property) && property.name.getText(source) === "id" && property.initializer.text === "insects")));
  if (!groupsNode || !typesNode) throw new Error("Public studio catalog was not found");
  return { groups: literal(groupsNode), types: literal(typesNode) };
}

async function discover() {
  const html = await text(pageUrl);
  const urls = [...new Set([...html.matchAll(/<link rel="modulepreload" href="([^"]+)"/g)].map(match => match[1]))];
  const queue = [...urls]; let found;
  await Promise.all(Array.from({ length: 6 }, async () => {
    while (queue.length && !found) {
      const url = queue.shift();
      if (new URL(url).hostname !== "assets.higgsfield.ai") continue;
      const bundle = await text(url);
      if (bundle.includes("body_slim") && bundle.includes("ethnicity_origin_base") && bundle.includes("option-previews")) found = { bundleUrl: url, bundleSha256: createHash("sha256").update(bundle).digest("hex"), ...extractCatalog(bundle) };
    }
  }));
  if (!found) throw new Error("No catalog bundle found in public page preloads");
  const api = JSON.parse(await text(apiOptionsUrl));
  if (!Array.isArray(api.categories) || typeof api.config_revision !== "string") throw new Error("Unexpected official API options format");
  const rules = new Map();
  for (const category of api.categories) {
    const group = found.groups.find(group => group.id === category.key);
    if (!group || group.max !== category.max) throw new Error(`Public UI/API category mismatch: ${category.key}`);
    for (const option of category.options) {
      const key = `${category.key}:${option.key}`;
      const allowed = category.tiers.filter(tier => !option.tiers || option.tiers.includes(tier));
      const existing = rules.get(key);
      const rule = { id: option.key, tiers: [...new Set([...(existing?.tiers ?? []), ...allowed])], ...(option.slot ? { slot: option.slot } : {}), ...(option.exclusive ? { exclusive: true } : {}) };
      rules.set(key, rule);
      if (!group.options.some(existing => existing.id === option.key)) group.options.push({ id: option.key, label: { en: option.label }, visibleIn: [], slot: option.slot, imageUrl: option.img, ...(option.color ? { swatch: option.color } : {}) });
    }
  }
  for (const group of found.groups) for (const option of group.options) {
    const rule = rules.get(`${group.id}:${option.id}`);
    if (!rule) throw new Error(`Public UI option unavailable in official API: ${option.id}`);
    option.visibleIn = rule.tiers;
    option.slot = rule.slot ?? null;
    option.exclusive = rule.exclusive === true;
  }
  return { source: pageUrl, apiOptionsUrl, configRevision: api.config_revision, apiCategories: api.categories, retrievedAt: new Date().toISOString(), ...found };
}

async function synchronize(manifest) {
  await mkdir(assetDirectory, { recursive: true });
  const entries = [...manifest.types.map(option => ({ group: "tier", ...option })), ...manifest.groups.flatMap(group => group.options.map(option => ({ group: group.id, ...option })))];
  const queue = entries.filter(option => option.imageUrl);
  const downloaded = [];
  await Promise.all(Array.from({ length: 6 }, async () => {
    while (queue.length) {
      const option = queue.shift(), url = new URL(option.imageUrl);
      if (!["static.higgsfield.ai", "cdn.higgsfield.ai"].includes(url.hostname) || url.protocol !== "https:" || !/^[a-z0-9_]+$/.test(option.id)) throw new Error(`Unexpected public asset: ${option.id}`);
      const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
      if (!response.ok) throw new Error(`${response.status} fetching ${option.id}`);
      const bytes = Buffer.from(await response.arrayBuffer()), metadata = webpMetadata(bytes);
      if (!metadata.width || !metadata.height || metadata.width < 32 || metadata.height < 32) throw new Error(`Invalid image: ${option.id}`);
      const local = `/influencer-traits/${option.id}.webp`;
      await writeFile(path.join(assetDirectory, `${option.id}.webp`), bytes);
      downloaded.push({ id: option.id, group: option.group, source: option.imageUrl, local, bytes: bytes.length, width: metadata.width, height: metadata.height, sha256: createHash("sha256").update(bytes).digest("hex") });
    }
  }));
  manifest.assets = downloaded.sort((a, b) => a.id.localeCompare(b.id));
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
  const options = manifest.groups.flatMap(group => group.options).map(option => [option.id, {
    ...(option.imageUrl ? { image: `/influencer-traits/${option.id}.webp` } : {}),
    ...(option.swatch ? { swatch: option.swatch } : {}),
    ...(option.imageFit ? { imageFit: option.imageFit } : {}),
  }]);
  const kinds = Object.fromEntries(manifest.groups.map(group => [group.id, group.kind]));
  const rules = Object.fromEntries(manifest.groups.flatMap(group => group.options.map(option => [option.id, { tiers: option.visibleIn, ...(option.slot ? { slot: option.slot } : {}), ...(option.exclusive ? { exclusive: true } : {}) }])));
  await writeFile(path.join(root, "src/data/influencer-trait-media.ts"), "// Public Higgsfield studio catalog, synchronized by scripts/sync-influencer-traits.mjs.\n"
    + "import type { CharacterTier } from \"./character-types\";\n\n"
    + "export const TRAIT_MEDIA: Readonly<Record<string, { image?: string; swatch?: string; imageFit?: \"contain\" | \"cover\" }>> = " + JSON.stringify(Object.fromEntries(options), null, 2) + ";\n\n"
    + "export const TRAIT_KINDS: Readonly<Record<string, \"media\" | \"color\" | \"text\">> = " + JSON.stringify(kinds, null, 2) + ";\n\n"
    + "export const TRAIT_RULES: Readonly<Record<string, { tiers: readonly CharacterTier[]; slot?: string; exclusive?: boolean }>> = " + JSON.stringify(rules, null, 2) + ";\n");
  console.log(JSON.stringify({ groups: manifest.groups.length, options: options.length, types: manifest.types.length, assets: downloaded.length, bytes: downloaded.reduce((sum, asset) => sum + asset.bytes, 0), groupsSummary: manifest.groups.map(group => ({ id: group.id, kind: group.kind, options: group.options.length, images: group.options.filter(option => option.imageUrl).length })) }, null, 2));
}

/** Offline build gate: source mappings, API constraints and local file integrity. */
export async function validateLocalCatalog(manifest) {
  const source = ts.createSourceFile("media.ts", await readFile(path.join(root, "src/data/influencer-trait-media.ts"), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  function data(node) {
    if (ts.isStringLiteralLike(node)) return node.text;
    if (node.kind === ts.SyntaxKind.TrueKeyword) return true;
    if (node.kind === ts.SyntaxKind.FalseKeyword) return false;
    if (ts.isArrayLiteralExpression(node)) return node.elements.map(data);
    if (ts.isObjectLiteralExpression(node)) return Object.fromEntries(node.properties.map(property => {
      if (!ts.isPropertyAssignment(property)) throw new Error("Invalid generated data property");
      return [property.name.text, data(property.initializer)];
    }));
    throw new Error("Generated media mapping must contain data literals only");
  }
  const declarations = {};
  function visit(node) {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) declarations[node.name.text] = data(node.initializer);
    ts.forEachChild(node, visit);
  }
  visit(source);
  const mappings = declarations.TRAIT_MEDIA, kinds = declarations.TRAIT_KINDS, rules = declarations.TRAIT_RULES;
  if (!mappings || !kinds || !rules) throw new Error("Generated catalog mappings are missing");
  const options = manifest.groups.flatMap(group => group.options), assets = new Map(manifest.assets.map(asset => [asset.id, asset]));
  const identifiers = options.map(option => option.id);
  if (new Set(identifiers).size !== identifiers.length || Object.keys(mappings).length !== identifiers.length || assets.size !== manifest.assets.length) throw new Error("Catalog identifiers are duplicated or missing");
  const traitSource = ts.createSourceFile("traits.ts", await readFile(path.join(root, "src/data/traits.ts"), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS), declaredIds = new Set();
  function inspectTraits(node) {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "o" && ts.isStringLiteral(node.arguments[0])) declaredIds.add(node.arguments[0].text);
    ts.forEachChild(node, inspectTraits);
  }
  inspectTraits(traitSource);
  if (declaredIds.size !== identifiers.length || identifiers.some(id => !declaredIds.has(id))) throw new Error("Add translated trait entries for every official option before building");
  for (const group of manifest.groups) {
    if (kinds[group.id] !== group.kind) throw new Error(`Incorrect visual category: ${group.id}`);
    for (const option of group.options) {
      const mapping = mappings[option.id], rule = rules[option.id];
      if (!mapping || !rule || JSON.stringify([...rule.tiers].sort()) !== JSON.stringify([...option.visibleIn].sort()) || (rule.slot ?? null) !== option.slot || (rule.exclusive === true) !== option.exclusive) throw new Error(`Incorrect API constraint: ${option.id}`);
      const expected = option.imageUrl ? `/influencer-traits/${option.id}.webp` : undefined;
      if (mapping.image !== expected || mapping.swatch !== option.swatch || mapping.imageFit !== option.imageFit || (expected && assets.get(option.id)?.source !== option.imageUrl)) throw new Error(`Incorrect asset mapping: ${option.id}`);
    }
  }
  for (const asset of manifest.assets) {
    if (asset.local !== `/influencer-traits/${asset.id}.webp` || !/^[a-z0-9_]+$/.test(asset.id)) throw new Error("Invalid local asset path");
    const bytes = await readFile(path.join(assetDirectory, `${asset.id}.webp`)), metadata = webpMetadata(bytes);
    if (bytes.length !== asset.bytes || createHash("sha256").update(bytes).digest("hex") !== asset.sha256 || metadata.width !== asset.width || metadata.height !== asset.height) throw new Error(`Missing or altered thumbnail: ${asset.id}`);
  }
  const typesSource = await readFile(path.join(root, "src/data/character-types.ts"), "utf8");
  for (const type of manifest.types) if (!typesSource.includes(`icon: "/influencer-traits/${type.id}.webp"`) || assets.get(type.id)?.source !== type.imageUrl) throw new Error(`Missing character type image: ${type.id}`);
  return { groups: manifest.groups.length, options: options.length, assets: assets.size };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const manifest = process.argv.includes("--discover") ? await discover() : JSON.parse(await readFile(manifestPath, "utf8"));
  if (process.argv.includes("--check")) console.log("Influencer catalog verified offline:", await validateLocalCatalog(manifest));
  else await synchronize(manifest);
}
