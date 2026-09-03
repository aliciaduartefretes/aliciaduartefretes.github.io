import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";

const currentRoot = new URL("../", import.meta.url);
const priorRoot = new URL("../NALVI-estabilizacion-boot-previa-7B/", currentRoot);
const read = (root, path) => readFileSync(new URL(path, root));
const sha = bytes => createHash("sha256").update(bytes).digest("hex");

assert.ok(existsSync(priorRoot), "No se encontró la versión estable previa para comparar regresiones.");

const currentIndex = read(currentRoot, "index.html").toString("utf8");
const priorIndex = read(priorRoot, "index.html").toString("utf8");
const normalizedCurrentIndex = currentIndex.replace('<script src="assets/js/nalvi-reinforcement-client.js"></script>\n', "");
assert.equal(normalizedCurrentIndex, priorIndex, "index.html cambió en algo distinto de cargar el puente selectivo de PASO 7B.");

const protectedPaths = [
  "assets/css",
  "assets/js/kuaa-activity-renderer.js",
  "assets/js/kuaa-general-activities.js",
  "assets/js/nalvi-general-route-ui.js",
  "assets/js/nalvi-guarani-general-route.js",
  "assets/js/nalvi-ui.js",
  "firebase",
  "grammar-engine",
  "mastery-engine",
  "curriculum",
  "knowledge-base/pilot-corpus.json",
  "knowledge-base/supplemental-sources.json",
  "knowledge-base/references",
  "carpincho-paraguayo-mascota.png",
  "icons/icon-192.png"
];

function filesUnder(root, relativePath) {
  const absolute = new URL(relativePath, root);
  if (statSync(absolute).isFile()) return [relativePath];
  return readdirSync(absolute, { withFileTypes: true }).flatMap(entry => {
    const child = `${relativePath.replace(/\/$/, "")}/${entry.name}`;
    return entry.isDirectory() ? filesUnder(root, child) : [child];
  }).sort();
}

for (const protectedPath of protectedPaths) {
  const priorFiles = filesUnder(priorRoot, protectedPath);
  const currentFiles = filesUnder(currentRoot, protectedPath);
  assert.deepEqual(currentFiles, priorFiles, `${protectedPath}: cambió el inventario protegido.`);
  for (const file of priorFiles) assert.equal(sha(read(currentRoot, file)), sha(read(priorRoot, file)), `${file}: regresión fuera de PASO 7B.`);
}

assert.match(currentIndex, /GoogleAuthProvider/);
assert.match(currentIndex, /signInAnonymously/);
assert.match(currentIndex, /GESA/);
assert.match(currentIndex, /gca:progress-updated/);
assert.match(currentIndex, /assets\/js\/nalvi-reinforcement-client\.js/);

console.log(JSON.stringify({
  step: "7B",
  status: "PASS",
  indexChange: "one script include only",
  firebaseChanged: false,
  grammarEngineChanged: false,
  masteryEngineChanged: false,
  curriculumChanged: false,
  existingUiChanged: false,
  authenticationPreserved: true,
  academicManagementPreserved: true,
  xpLivesProgressPreserved: true
}, null, 2));
