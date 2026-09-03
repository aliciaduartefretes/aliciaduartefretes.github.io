import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const paso7ARoot = path.resolve(root, "../NALVI-paso-7A");
const read = (relative, base = root) => fs.readFileSync(path.join(base, relative), "utf8");
const digest = absolute => crypto.createHash("sha256").update(fs.readFileSync(absolute)).digest("hex");
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const sameAsPaso7A = relative => digest(path.join(root, relative)) === digest(path.join(paso7ARoot, relative));

const index = read("index.html");
const ui = read("assets/js/nalvi-general-route-ui.js");
const css = read("assets/css/nalvi-design-system.css");
const previousCss = read("assets/css/nalvi-design-system.css", paso7ARoot);
const routeData = read("assets/js/nalvi-guarani-general-route.js");

assert(sameAsPaso7A("index.html"), "PASO 7A.5 modificó index.html; esta etapa debía quedar aislada en la capa visual de la ruta.");
assert(css.startsWith(previousCss), "El Design System anterior fue reescrito en lugar de recibir overrides acotados.");
assert(css.length > previousCss.length, "No se añadieron los ajustes visuales del PASO 7A.5.");

const protectedFiles = [
  "assets/css/kuaa-activity-components.css",
  "assets/js/kuaa-activity-renderer.js",
  "assets/js/kuaa-general-activities.js",
  "assets/js/nalvi-guarani-general-route.js",
  "assets/js/nalvi-ui.js",
  "curriculum/guarani-general-route.schema.json",
  "firebase/database-GESA.rules.json",
  "firebase/firebase.json",
  "firebase/firestore-PASO-6.rules",
  "grammar-engine/compiled-knowledge.json",
  "grammar-engine/grammar-engine.mjs",
  "grammar-engine/grammar-engine.schema.json",
  "knowledge-base/governance.json",
  "knowledge-base/pilot-corpus.json",
  "knowledge-base/supplemental-sources.json",
  "mastery-engine/firestore-layout.json",
  "mastery-engine/mastery-config.json",
  "mastery-engine/mastery-data.schema.json",
  "mastery-engine/mastery-engine.mjs",
  "policies/ai-usage-policy.json",
  "REGLAS-FIRESTORE-PASO-6-PARA-COPIAR.rules",
];
for (const relative of protectedFiles) {
  assert(sameAsPaso7A(relative), `Se modificó un archivo protegido o fuera de alcance: ${relative}.`);
}

assert(routeData.includes('difficulty: "foundation-1"'), "Se eliminó el ID interno foundation-1 del modelo de datos.");
assert(ui.includes('data-learning-objective-id="${esc(objective.id)}"'), "Se eliminó el ID interno usado por Analytics/Mastery.");
assert(!ui.includes("objective.difficulty"), "La interfaz todavía imprime el ID técnico de dificultad.");
assert(!/foundation-[1-9]/.test(ui), "La capa pública contiene un identificador foundation-*.");
assert(ui.includes("`${copy.objective} ${module.order}.${objective.order}`"), "No se encontró la etiqueta pública Objetivo M.N.");

const objectiveIconEntries = [...ui.matchAll(/"GG-C-\d{3}":\s*"[^"]+"/g)];
assert(objectiveIconEntries.length === 28, `Se esperaban 28 iconos por objetivo y se encontraron ${objectiveIconEntries.length}.`);
for (const phase of ["ESCUCHA", "ENTIENDE", "CONSTRUYE", "HABLA", "APLICA", "DOMINA"]) {
  assert(new RegExp(`${phase}:\\s*"`).test(ui), `Falta iconografía neutral para ${phase}.`);
}
assert(ui.includes("route-method-icon"), "El método pedagógico no usa iconos neutrales.");
assert(/\.pro-outcome\.route-method-step::before\s*\{[\s\S]*?content:\s*none\s*!important/.test(css), "No se anuló el check ambiguo del método pedagógico.");

for (const language of ["es", "en", "pt", "fr", "it", "de"]) {
  assert(new RegExp(`\\b${language}: \\{[^}]*method: [\"“]`).test(ui), `Falta el texto del método en ${language}.`);
  assert(new RegExp(`\\b${language}: \\{[^}]*showIntro: [\"“]`).test(ui), `Falta el control de introducción en ${language}.`);
  assert(new RegExp(`\\b${language}: \\{[^}]*continue: [\"“]`).test(ui), `Falta el botón Continuar en ${language}.`);
  assert(index.includes(`<option value="${language}">`), `Falta ${language} en el selector de idioma heredado.`);
}
assert(index.includes('id="headerLang"'), "Falta el selector principal de idioma.");
assert(/function\s+setAppLanguage\s*\(/.test(index), "Falta el cambio instantáneo de idioma.");
assert(!/location\.reload\s*\(/.test(index), "El cambio de idioma incluye una recarga.");

assert(ui.includes('const INTRO_STORAGE_KEY = "nalvi:general-route:intro-seen:v1"'), "Falta la preferencia local de introducción vista.");
assert(ui.includes("window.localStorage.getItem"), "La introducción no recuerda localmente su estado.");
assert(ui.includes("route-overview-compact"), "Falta el modo compacto de la introducción.");
assert(ui.includes("route-overview-toggle"), "Falta el control para mostrar u ocultar la explicación.");
assert(ui.includes("route-next-focus"), "El modo compacto no prioriza el siguiente objetivo.");
assert(ui.includes("data-route-continue"), "Falta el acceso directo a la siguiente actividad.");

assert(/#course \.general-module \.unit\s*\{[\s\S]*?min-height:\s*116px/.test(css), "No se compactaron las tarjetas de objetivo.");
assert(/@media \(max-width: 760px\)[\s\S]*?#course \.general-module \.unit\s*\{[\s\S]*?min-height:\s*106px/.test(css), "No se encontró la tarjeta móvil compacta.");
assert(/\.route-continue-button,[\s\S]*?\.route-overview-toggle\s*\{[\s\S]*?min-height:\s*44px/.test(css), "Los nuevos controles no conservan el objetivo táctil mínimo.");
assert(css.includes("env(safe-area-inset-bottom)"), "Falta protección para el safe area inferior.");
assert(/#course \.sources\s*\{[\s\S]*?104px \+ env\(safe-area-inset-bottom\)/.test(css), "El último contenido puede quedar detrás de la navegación inferior.");

for (const authSymbol of ["signInWithPopup", "signInWithRedirect", "signInAnonymously", "onAuthStateChanged"]) {
  assert(index.includes(authSymbol), `Se alteró el login: falta ${authSymbol}.`);
}
assert(index.includes("function syncInstitutionNavigation(canManage)"), "Falta la navegación institucional condicionada por rol.");
assert(index.includes('button.dataset.go=canManage?"institutional":"institutions"'), "La barra inferior ya no diferencia usuarios autorizados y normales.");
for (const preserved of ['id="xp"', 'id="lives"', "POLICE_LESSONS", "MEDICAL_LESSONS", 'id="kidsCourse"', 'id="rudeCourse"']) {
  assert(index.includes(preserved), `Falta una función conservada: ${preserved}.`);
}

for (const forbidden of [/\bfetch\s*\(/, /\/api\//, /setDoc\s*\(/, /updateDoc\s*\(/, /addDoc\s*\(/, /openai/i]) {
  assert(!forbidden.test(ui), `La capa UX agregó una integración fuera de alcance: ${forbidden}.`);
}
const policy = JSON.parse(read("policies/ai-usage-policy.json"));
assert(policy.openAIEnabled === false, "OpenAI quedó habilitado.");

new vm.Script(ui, { filename: "nalvi-general-route-ui.js" });
const scripts = [...index.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/gi)];
let classicScriptsChecked = 0;
for (const [, rawAttributes, source] of scripts) {
  const attributes = rawAttributes || "";
  if (/\bsrc\s*=/.test(attributes) || /type\s*=\s*["'](?:module|text\/plain)["']/i.test(attributes)) continue;
  new vm.Script(source, { filename: `index-inline-${classicScriptsChecked + 1}.js` });
  classicScriptsChecked += 1;
}

const suites = [
  "curriculum/tests/guarani-general-route.test.mjs",
  "grammar-engine/tests/grammar-engine.test.mjs",
  "mastery-engine/tests/mastery-engine.test.mjs",
];
for (const suite of suites) {
  const result = spawnSync(process.execPath, ["--test", path.join(root, suite)], { cwd: root, encoding: "utf8" });
  assert(result.status === 0, `Falló ${suite}:\n${result.stdout}\n${result.stderr}`);
}

console.log(JSON.stringify({
  status: "PASS",
  step: "7A.5",
  scope: "UX polish de Guaraní General",
  interfaceLanguages: ["es", "en", "pt", "fr", "it", "de"],
  objectiveIcons: objectiveIconEntries.length,
  internalIdsPreserved: true,
  internalIdsDisplayed: false,
  introPersistence: "localStorage only",
  firebaseChanged: false,
  masteryChanged: false,
  openAIConnected: false,
  roleNavigationPreserved: true,
  classicInlineScriptsChecked: classicScriptsChecked,
  regressionSuites: suites,
}, null, 2));
