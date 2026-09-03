import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const validationDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(validationDirectory, "..");
const manifest = JSON.parse(fs.readFileSync(path.join(validationDirectory, "product-linguistic-corrections-2026-09-03.json"), "utf8"));
const fileCache = new Map();

function readRepositoryFile(relativePath) {
  if (!fileCache.has(relativePath)) {
    fileCache.set(relativePath, fs.readFileSync(path.join(repositoryRoot, relativePath), "utf8"));
  }
  return fileCache.get(relativePath);
}

function markerScope(definition, name) {
  const source = readRepositoryFile(definition.file);
  const start = source.indexOf(definition.start);
  assert.notEqual(start, -1, `${name}: no se encontró el marcador inicial`);
  const end = source.indexOf(definition.end, start + definition.start.length);
  assert.notEqual(end, -1, `${name}: no se encontró el marcador final`);
  return source.slice(start, end);
}

function jsonChunkScope(definition, name) {
  const parsed = JSON.parse(readRepositoryFile(definition.file));
  assert.ok(Array.isArray(parsed.chunks), `${name}: falta el arreglo chunks`);
  return definition.ids.map((id) => {
    const matches = parsed.chunks.filter((chunk) => chunk.id === id);
    assert.equal(matches.length, 1, `${name}: ${id} debe existir exactamente una vez`);
    assert.equal(typeof matches[0].text, "string", `${name}: ${id}.text debe ser texto`);
    return matches[0].text;
  }).join("\n");
}

function resolveScope(name) {
  const definition = manifest.scopes[name];
  assert.ok(definition, `scope desconocido: ${name}`);
  if (definition.kind === "markers") return markerScope(definition, name);
  if (definition.kind === "json-chunks") return jsonChunkScope(definition, name);
  assert.fail(`${name}: kind no soportado ${definition.kind}`);
}

function countOccurrences(source, needle) {
  return source.split(needle).length - 1;
}

function evaluate(rules, expectedMode) {
  return rules.map((rule) => {
    const occurrences = countOccurrences(resolveScope(rule.scope), rule.text);
    const minimum = expectedMode === "presence" ? (rule.minOccurrences ?? 1) : 0;
    const passes = expectedMode === "presence" ? occurrences >= minimum : occurrences === 0;
    return {id: rule.id, scope: rule.scope, expected: expectedMode === "presence" ? `>= ${minimum}` : "0", occurrences, passes};
  });
}

function assertTable(report, title) {
  console.log(`\n${title}`);
  console.table(report);
  const failures = report.filter((row) => !row.passes);
  assert.deepEqual(failures, [], `${title}: ${failures.map((row) => row.id).join(", ")}`);
}

test("el manifiesto conserva nueve capturas únicas como evidencia", () => {
  const screenshots = manifest.authority.screenshots;
  assert.equal(screenshots.length, 9);
  assert.equal(new Set(screenshots.map((item) => item.sha256)).size, 9);
  for (const screenshot of screenshots) assert.match(screenshot.sha256, /^[a-f0-9]{64}$/);
});

test("tabla de presencia de las formas aprobadas", () => {
  assertTable(evaluate(manifest.presence, "presence"), "PRESENCIA APROBADA");
});

test("tabla de ausencia de las formas reemplazadas", () => {
  assertTable(evaluate(manifest.absence, "absence"), "AUSENCIA DE FORMAS REEMPLAZADAS");
});
