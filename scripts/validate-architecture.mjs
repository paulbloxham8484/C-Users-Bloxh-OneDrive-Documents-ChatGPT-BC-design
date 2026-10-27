import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const manifest = JSON.parse(await readFile(resolve(root, "architecture/domain-manifest.json"), "utf8"));
const html = await readFile(resolve(root, "index.html"), "utf8");
const loadedScripts = [...html.matchAll(/<script src="([^?"]+)(?:\?[^\"]*)?" defer><\/script>/g)].map(match => match[1]);
const ownedFiles = Object.values(manifest.domains).flatMap(domain => domain.files);
const duplicates = ownedFiles.filter((file, index) => ownedFiles.indexOf(file) !== index);
const existence = await Promise.all(ownedFiles.map(file => exists(resolve(root, file))));
const missing = ownedFiles.filter((file, index) => !existence[index]);
const unownedScripts = loadedScripts.filter(file => !ownedFiles.includes(file));
const missingFromHtml = ownedFiles.filter(file => !loadedScripts.includes(file));
const serviceFiles = manifest.domains.services.files;
const serviceIndexes = serviceFiles.map(file => loadedScripts.indexOf(file));
const servicesBeforeBase = serviceIndexes.some(index => index < loadedScripts.indexOf("services.js"));

async function exists(path) {
  try { await readFile(path); return true; } catch { return false; }
}

const errors = [];
if (manifest.architecture !== "modular-monolith") errors.push("manifest architecture must remain modular-monolith");
if (duplicates.length) errors.push(`duplicate ownership: ${[...new Set(duplicates)].join(", ")}`);
if (missing.length) errors.push(`missing owned files: ${missing.join(", ")}`);
if (unownedScripts.length) errors.push(`unowned index scripts: ${unownedScripts.join(", ")}`);
if (missingFromHtml.length) errors.push(`owned files missing from index.html: ${missingFromHtml.join(", ")}`);
if (servicesBeforeBase) errors.push("a services domain file loads before services.js");
if (!loadedScripts.includes("domain-registry.js")) errors.push("domain-registry.js is not loaded by index.html");

if (errors.length) {
  console.error("Architecture validation failed:");
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log(`Architecture valid: ${Object.keys(manifest.domains).length} domains, ${ownedFiles.length} owned files, one deployable.`);
}
