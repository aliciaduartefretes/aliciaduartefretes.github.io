import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readText = relativePath => fs.readFileSync(path.join(root, relativePath), "utf8");
const readJson = relativePath => JSON.parse(readText(relativePath));
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};
const sha256 = relativePath => crypto.createHash("sha256").update(fs.readFileSync(path.join(root, relativePath))).digest("hex");

const corpus = readJson("knowledge-base/pilot-corpus.json");
const initialRegistry = readJson("knowledge-base/references/REGISTRO-FUENTES-INICIAL.json");
const supplementalRegistry = readJson("knowledge-base/supplemental-sources.json");
const governance = readJson("knowledge-base/governance.json");
const aiPolicy = readJson("policies/ai-usage-policy.json");
const html = readText("index.html");

assert(corpus.schemaVersion === "0.5.0", "El corpus debe conservar el esquema aprobado en PASO 0.5.");
assert(corpus.languageVariant === "gug-PY", "La variedad lingüística debe ser gug-PY.");
assert(Array.isArray(corpus.records) && corpus.records.length > 0, "El corpus piloto está vacío.");

const ids = corpus.records.map(record => record.id);
assert(new Set(ids).size === ids.length, "Hay identificadores duplicados en el corpus.");

const sourceIds = new Set([
  ...initialRegistry.sources.map(source => source.id),
  ...supplementalRegistry.sources.map(source => source.id)
]);
const requiredReferenceFields = [
  "sourceId",
  "sourceTitle",
  "sourceAuthor",
  "sourceInstitution",
  "sourceYear",
  "sourceURL",
  "sourcePage",
  "validationStatus"
];
const allowedStatuses = new Set(["unreviewed", "sourceVerified", "expertVerified", "conflict", "rejected", "deprecated"]);

for (const record of corpus.records) {
  assert(record.languageVariant === "gug-PY", `${record.id}: languageVariant inválido.`);
  assert(allowedStatuses.has(record.validationStatus), `${record.id}: validationStatus inválido.`);
  assert(typeof record.allowedForGeneration === "boolean", `${record.id}: falta allowedForGeneration.`);
  assert(Array.isArray(record.sourceReferences) && record.sourceReferences.length > 0, `${record.id}: falta trazabilidad.`);

  for (const reference of record.sourceReferences) {
    for (const field of requiredReferenceFields) {
      assert(Object.hasOwn(reference, field), `${record.id}: falta ${field} en una referencia.`);
    }
    assert(sourceIds.has(reference.sourceId), `${record.id}: fuente desconocida ${reference.sourceId}.`);
    assert(String(reference.sourcePage).trim().length > 0, `${record.id}: sourcePage está vacío.`);
  }

  if (record.allowedForGeneration) {
    assert(record.validationStatus === "expertVerified", `${record.id}: generación habilitada sin expertVerified.`);
    assert(!record.conflictIds?.length, `${record.id}: generación habilitada con conflicto.`);
  }
}

assert(corpus.records.every(record => record.allowedForGeneration === false), "El corpus piloto no debe habilitar generación.");

for (const conflictId of ["C-001", "C-002"]) {
  const conflict = corpus.records.find(record => record.id === conflictId);
  assert(conflict, `Falta ${conflictId}.`);
  assert(conflict.recordType === "conflict", `${conflictId}: tipo incorrecto.`);
  assert(conflict.validationStatus === "conflict", `${conflictId}: debe permanecer en conflict.`);
  assert(conflict.needsHumanReview === true, `${conflictId}: necesita revisión humana.`);
  assert(conflict.automaticUseBlocked === true, `${conflictId}: uso automático no bloqueado.`);
  assert(conflict.allowedForGeneration === false, `${conflictId}: generación no bloqueada.`);
  assert(conflict.resolution === null && conflict.resolvedAt === null, `${conflictId}: no debe figurar como resuelto.`);
}

assert(governance.massImportEnabled === false, "La carga masiva debe seguir deshabilitada.");
assert(governance.connectedToCourseEngine === false, "El corpus piloto no debe conectarse al motor de cursos.");
assert(governance.connectedToFirebase === false, "El PASO 3 no debe modificar Firebase.");
assert(governance.connectedToOpenAI === false, "OpenAI no debe conectarse en PASO 3.");
assert(governance.incompleteAreas.length >= 8, "No se conservaron todas las áreas incompletas.");
assert(["C-001", "C-002"].every(id => governance.blockedConflicts.includes(id)), "Faltan contradicciones bloqueadas.");

assert(aiPolicy.openAIEnabled === false, "OpenAI debe permanecer deshabilitado.");
assert(aiPolicy.decisionGate.field === "canResolveWithoutAI", "Falta la compuerta canResolveWithoutAI.");
assert(aiPolicy.decisionGate.whenTrue === "denyAI", "canResolveWithoutAI=true debe impedir la llamada.");
assert(aiPolicy.fallbackRequired === true && aiPolicy.studyMustContinueWithoutAI === true, "Falta el fallback obligatorio.");

assert(!html.includes('<div class="sponsor-strip"'), "Sigue presente la franja superior de patrocinio.");
assert(!html.includes('<div class="sponsor-info"'), "Sigue presente el CTA público de patrocinio.");
assert(!html.includes("mailto:Aliciaduartefretes@gmail.com?subject=Patrocinio"), "Sigue presente el enlace de patrocinio.");
assert(!html.includes("<option>Colaboración o patrocinio</option>"), "Sigue presente la opción pública de patrocinio.");
assert(!/sk-[A-Za-z0-9_-]{16,}/.test(html), "Posible clave de API expuesta en el cliente.");

for (const language of ["es", "en", "pt", "fr", "it", "de"]) {
  assert(html.includes(`<option value="${language}">`), `Falta el idioma ${language}.`);
}

const referenceHashes = {
  "knowledge-base/references/INFORME-PASO-0.5.md": "8ae0127376c3f22beafa2b8c6434c1639da4287019418f6f95d420570677c094",
  "knowledge-base/references/MODELO-DATOS-CORPUS.schema.json": "1217b5f519765bbe8b4d1ee86bf1c5e56ec76249fca6cc05096108c288058110",
  "knowledge-base/references/REGISTRO-FUENTES-INICIAL.json": "2d9d8d3036e69331dbc7c1de88b6ab4b5b8b401e548785fac9cd502e1f2abf99"
};
for (const [relativePath, expected] of Object.entries(referenceHashes)) {
  assert(sha256(relativePath) === expected, `${relativePath}: la referencia PASO 0.5 fue alterada.`);
}

const summary = {
  status: "PASS",
  records: corpus.records.length,
  recordTypes: Object.fromEntries([...new Set(corpus.records.map(record => record.recordType))].map(type => [type, corpus.records.filter(record => record.recordType === type).length])),
  generationEnabledRecords: corpus.records.filter(record => record.allowedForGeneration).length,
  blockedConflicts: ["C-001", "C-002"],
  sourceRegistries: ["PASO 0.5", "material pedagógico existente"],
  openAIEnabled: aiPolicy.openAIEnabled,
  languagesPreserved: ["es", "en", "pt", "fr", "it", "de"]
};

console.log(JSON.stringify(summary, null, 2));
