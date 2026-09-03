import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";
import {compileKnowledgeBase, createGrammarEngine} from "../grammar-engine/grammar-engine.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readText = relativePath => fs.readFileSync(path.join(root, relativePath), "utf8");
const readJson = relativePath => JSON.parse(readText(relativePath));
const sha256 = relativePath => crypto.createHash("sha256").update(fs.readFileSync(path.join(root, relativePath))).digest("hex");
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const expectedHashes = {
  "index.html": "caa5fe1cce4d5c181cadf698ed14bf6ee6cb8ac9765fef698a26bbba22b7c0c4",
  "assets/js/kuaa-general-activities.js": "82237745860149c75994b5379c5b802b5c86aed9a120b42dfae5d16cd7cdb7d7",
  "assets/js/kuaa-activity-renderer.js": "e280bc9f2e882955aeeb44d1a12ed7f298a4faf0dd47ef2d59cfff3540bf50e6",
  "assets/js/nalvi-ui.js": "598e323d784704b2f31e5ae3e98740f9feb4cbecbc217209c32540ee94f3d7b8",
  "assets/css/kuaa-activity-components.css": "111f62f3bed7a09479e78f6a72151581995f5059416372b5e8ae9e3d137a4f6b",
  "assets/css/nalvi-design-system.css": "c7d7aa2ed8eb16afeaf7b66cd02f67586b92ce1d17d4f98fa8ba49c091291292",
  "knowledge-base/pilot-corpus.json": "a99be7bc2ce61a240f3be279a812597f1a1b9806f6d3d7e173675fc00b8e6918",
  "knowledge-base/governance.json": "218f9b0e0c82eea04db2d13944b8c671de024a018969bac055122e168ed22cd0",
  "policies/ai-usage-policy.json": "f90c3e13db1e00fc9f6a128280b39c2eb06c0d0ce4c81a5d1adf297a9f3bda08"
};

for (const [relativePath, expectedHash] of Object.entries(expectedHashes)) {
  assert(sha256(relativePath) === expectedHash, `${relativePath}: cambió respecto de la versión estable del PASO 3.`);
}

const corpus = readJson("knowledge-base/pilot-corpus.json");
const governance = readJson("knowledge-base/governance.json");
const aiPolicy = readJson("policies/ai-usage-policy.json");
const compiledFile = readJson("grammar-engine/compiled-knowledge.json");
const compiledAgain = compileKnowledgeBase({corpus, governance});
const engine = createGrammarEngine({corpus, governance});
const engineSource = readText("grammar-engine/grammar-engine.mjs");
const html = readText("index.html");

assert(JSON.stringify(compiledFile) === JSON.stringify(compiledAgain), "compiled-knowledge.json no coincide con la compilación determinística actual.");
assert(compiledFile.engineSchemaVersion === "1.0.0", "Versión de Grammar Engine incorrecta.");
assert(compiledFile.languageVariant === "gug-PY", "Variedad lingüística incorrecta.");
assert(compiledFile.openAIConnected === false, "OpenAI no debe estar conectado.");
assert(aiPolicy.openAIEnabled === false, "La política global debe mantener OpenAI deshabilitado.");
assert(engine.policy.openAIConnected === false && engine.policy.inventUnknownForms === false, "El motor no cumple la política de no invención.");
assert(!/\bfetch\s*\(|XMLHttpRequest|WebSocket|openai\.com/i.test(engineSource), "El Grammar Engine contiene acceso de red no autorizado.");

const requiredPatternFields = [
  "id",
  "name",
  "description",
  "persons",
  "prefixes",
  "inclusiveExclusive",
  "oralVariant",
  "nasalVariant",
  "restrictions",
  "exceptions",
  "references",
  "validationStatus",
  "allowedForGeneration"
];
assert(compiledFile.conjugationPatterns.length === 3, "Deben conservarse los tres patrones piloto.");
for (const pattern of compiledFile.conjugationPatterns) {
  for (const field of requiredPatternFields) assert(Object.hasOwn(pattern, field), `${pattern.id}: falta ${field}.`);
  assert(pattern.allowedForGeneration === false, `${pattern.id}: no debe quedar productivo.`);
}
assert(compiledFile.conjugationPatterns.map(pattern => pattern.name).join(",") === "Areal,Aireal,Hareal", "Se alteraron las clases documentadas.");
assert(["C-001", "C-002"].every(id => compiledFile.blockedConflicts.includes(id)), "Faltan conflictos bloqueados.");
assert(compiledFile.inventories.negation.status === "unavailable", "La negación no debe habilitarse sin reglas expertas.");
assert(compiledFile.inventories.interrogation.status === "unavailable", "La interrogación no debe habilitarse sin reglas expertas.");
assert(compiledFile.inventories.mandate.status === "unavailable", "El mandato no debe habilitarse sin reglas expertas.");
assert(compiledFile.inventories.possession.status === "reviewRequired", "La posesión debe seguir pendiente de revisión experta.");

const unknown = engine.getValidatedVerbForm("NO-EXISTE", "1sg");
assert(unknown.status === "unavailable" && unknown.form === null, "El motor inventó una forma inexistente.");
const unreviewed = engine.getValidatedVerbForm("LEX-CANDIDATE-JAJOTOPATA", "1sg");
assert(unreviewed.status === "reviewRequired" && unreviewed.form === null, "Se usó contenido unreviewed.");
const possession = engine.validateSentenceStructure({constructionType: "possession", constituents: [{role: "possessor"}, {role: "possessed"}]});
assert(possession.status === "reviewRequired", "Se promovió indebidamente la regla de posesión.");

for (const language of ["es", "en", "pt", "fr", "it", "de"]) {
  assert(html.includes(`<option value="${language}">`), `Falta el idioma ${language}.`);
}
assert(html.includes("signInWithPopup") && html.includes("signInWithRedirect") && html.includes("signInAnonymously") && html.includes("onAuthStateChanged"), "Se alteró el cableado de login.");
assert(html.includes('id="xp"') && html.includes("gca:progress-updated") && html.includes('data-go="progressHub"'), "No se encontró el código estable de XP/progreso.");
assert(!/sk-[A-Za-z0-9_-]{16,}/.test(html), "Posible clave de API expuesta en el cliente.");

const previousValidation = spawnSync(process.execPath, [path.join(root, "scripts/validate-paso-3.mjs")], {
  cwd: root,
  encoding: "utf8"
});
assert(previousValidation.status === 0, `Regresión del PASO 3: ${previousValidation.stderr || previousValidation.stdout}`);

const tests = spawnSync(process.execPath, ["--test", path.join(root, "grammar-engine/tests/grammar-engine.test.mjs")], {
  cwd: root,
  encoding: "utf8"
});
assert(tests.status === 0, `Fallaron las pruebas del Grammar Engine: ${tests.stderr || tests.stdout}`);

console.log(JSON.stringify({
  status: "PASS",
  step: 4,
  grammarEngineTests: 15,
  productionPatterns: compiledFile.conjugationPatterns.length,
  productivePatterns: compiledFile.conjugationPatterns.filter(pattern => pattern.allowedForGeneration).length,
  productionVerbFormsAvailable: 0,
  unavailableBeforeInventing: true,
  blockedConflicts: compiledFile.blockedConflicts,
  openAIConnected: compiledFile.openAIConnected,
  stableUiHashPreserved: true,
  languagesPreserved: ["es", "en", "pt", "fr", "it", "de"]
}, null, 2));
