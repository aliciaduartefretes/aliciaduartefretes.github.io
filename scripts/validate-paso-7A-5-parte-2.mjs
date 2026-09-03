import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const previousRoot = path.resolve(root, "../NALVI-paso-7A-5");
const read = (relative, base = root) => fs.readFileSync(path.join(base, relative), "utf8");
const digest = absolute => crypto.createHash("sha256").update(fs.readFileSync(absolute)).digest("hex");
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const sameAsPrevious = relative => digest(path.join(root, relative)) === digest(path.join(previousRoot, relative));

const index = read("index.html");
const previousIndex = read("index.html", previousRoot);
const ui = read("assets/js/nalvi-general-route-ui.js");
const css = read("assets/css/nalvi-design-system.css");
const routeData = read("assets/js/nalvi-guarani-general-route.js");

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
  assert(sameAsPrevious(relative), `Se modificó un archivo protegido o fuera de alcance: ${relative}.`);
}

assert(previousIndex.includes('class="follow-float"'), "La base estable no contiene el CTA que debía retirarse.");
assert(!index.includes('class="follow-float"'), "El CTA flotante Ali Explora todavía está en el DOM.");
assert(!index.includes('class="ali-watermark"'), "La marca personal flotante todavía está en el DOM.");
assert(!/\.follow-float\s*\{/.test(index), "Quedaron estilos inline del CTA flotante.");
assert(!/\.ali-watermark\s*\{/.test(index), "Quedaron estilos inline de la marca flotante.");
assert(!/\.follow-float\s*\{/.test(css), "Quedaron estilos del CTA flotante en el Design System.");
assert(index.includes('id="videos"') && index.includes('class="insta-cta"'), "Se eliminaron referencias editoriales fuera del alcance del CTA flotante.");

const scriptsOf = source => [...source.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/gi)].map(match => match[0]).join("\n");
assert(scriptsOf(index) === scriptsOf(previousIndex), "Se alteró JavaScript embebido al retirar el CTA visual.");

const adaptiveLabels = {
  es: "práctica adaptativa",
  en: "adaptive practice",
  pt: "prática adaptativa",
  fr: "pratique adaptative",
  it: "pratica adattiva",
  de: "adaptives Üben",
};
const centralPhrases = {
  es: "Aprende para comunicarte, no para contar lecciones",
  en: "Learn to communicate, not to count lessons",
  pt: "Aprenda para se comunicar, não para contar lições",
  fr: "Apprendre à communiquer, pas à compter les leçons",
  it: "Impara a comunicare, non a contare lezioni",
  de: "Kommunizieren lernen statt Lektionen zählen",
};
for (const language of ["es", "en", "pt", "fr", "it", "de"]) {
  assert(ui.includes(`variable: "${adaptiveLabels[language]}"`), `Falta la etiqueta de práctica adaptativa en ${language}.`);
  assert(ui.includes(`overviewTitle: "${centralPhrases[language]}"`), `Falta la frase central en ${language}.`);
  assert(index.includes(`<option value="${language}">`), `Falta ${language} en el selector de idioma.`);
}
for (const oldLabel of ["práctica variable", "variable practice", "prática variável", "pratique variable", "pratica variabile", "variable Übung"]) {
  assert(!ui.includes(oldLabel), `La promesa anterior sigue presente: ${oldLabel}.`);
}
assert(!ui.includes("<b>∞</b>"), "El KPI todavía promete práctica infinita.");
assert(ui.includes('<b aria-hidden="true">↻</b>'), "Falta el indicador neutral de adaptación.");

assert(routeData.includes('difficulty: "foundation-1"'), "Se eliminó el ID interno foundation-1 del modelo de datos.");
assert(ui.includes('data-learning-objective-id="${esc(objective.id)}"'), "Se eliminó el ID interno usado por Analytics/Mastery.");
assert(!ui.includes("objective.difficulty"), "La interfaz imprime el ID técnico de dificultad.");
assert(!/foundation-[1-9]/.test(ui), "La capa pública contiene un identificador foundation-*.");
assert(ui.includes("`${copy.objective} ${module.order}.${objective.order}`"), "No se encontró la etiqueta pública Objetivo M.N.");

assert(ui.includes('const INTRO_STORAGE_KEY = "nalvi:general-route:intro-seen:v1"'), "Se perdió la preferencia local de introducción vista.");
assert(ui.includes("route-overview-compact"), "Se perdió el modo compacto de la introducción.");
assert(ui.includes("route-next-focus"), "El modo compacto ya no prioriza el siguiente objetivo.");
assert(ui.includes("route-method-icon"), "Se perdió la separación visual del método pedagógico.");
assert(/\.pro-outcome\.route-method-step::before\s*\{[\s\S]*?content:\s*none\s*!important/.test(css), "Volvieron los checks ambiguos del método pedagógico.");
assert(/#course \.general-module \.unit\s*\{[\s\S]*?min-height:\s*116px/.test(css), "Se perdió la compactación desktop de objetivos.");
assert(/@media \(max-width: 760px\)[\s\S]*?#course \.general-module \.unit\s*\{[\s\S]*?min-height:\s*106px/.test(css), "Se perdió la compactación móvil de objetivos.");
assert(css.includes("env(safe-area-inset-bottom)"), "Se perdió la protección del safe area inferior.");
assert(/body > header \.header-lang\s*\{[\s\S]*?min-height:\s*44px\s*!important/.test(css), "El selector de idioma móvil no conserva un target de 44 px.");
assert(/body > header \.account-btn\s*\{[\s\S]*?min-width:\s*44px\s*!important/.test(css), "El botón de cuenta móvil no conserva un target de 44 px.");

assert(ui.includes("const completedObjectives = () =>"), "Falta el cálculo visible de objetivos completados.");
assert(ui.includes("const done = stateDone();"), "El progreso visible dejó de usar el estado histórico existente.");
assert(ui.includes("copy.progress"), "Falta el rótulo localizado de objetivos completados.");
assert(ui.includes("role=\"progressbar\""), "Falta la barra de progreso accesible.");

for (const authSymbol of ["signInWithPopup", "signInWithRedirect", "signInAnonymously", "onAuthStateChanged"]) {
  assert(index.includes(authSymbol), `Se alteró el login: falta ${authSymbol}.`);
}
assert(index.includes("function syncInstitutionNavigation(canManage)"), "Falta la navegación institucional condicionada por rol.");
assert(index.includes('button.dataset.go=canManage?"institutional":"institutions"'), "La barra inferior ya no diferencia roles.");
assert(/function\s+setAppLanguage\s*\(/.test(index), "Falta el cambio instantáneo de idioma.");
assert(!/location\.reload\s*\(/.test(index), "El cambio de idioma incluye una recarga.");
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
let classicInlineScriptsChecked = 0;
for (const [, rawAttributes, source] of scripts) {
  const attributes = rawAttributes || "";
  if (/\bsrc\s*=/.test(attributes) || /type\s*=\s*["'](?:module|text\/plain)["']/i.test(attributes)) continue;
  new vm.Script(source, { filename: `index-inline-${classicInlineScriptsChecked + 1}.js` });
  classicInlineScriptsChecked += 1;
}

const suites = [
  "curriculum/tests/guarani-general-route.test.mjs",
  "grammar-engine/tests/grammar-engine.test.mjs",
  "mastery-engine/tests/mastery-engine.test.mjs",
];
let regressionTests = 0;
for (const suite of suites) {
  const result = spawnSync(process.execPath, ["--test", path.join(root, suite)], { cwd: root, encoding: "utf8" });
  assert(result.status === 0, `Falló ${suite}:\n${result.stdout}\n${result.stderr}`);
  regressionTests += Number(result.stdout.match(/tests\s+(\d+)/)?.[1] || 0);
}

console.log(JSON.stringify({
  status: "PASS",
  step: "7A.5-parte-2",
  scope: "CTA flotante + comunicación precisa de práctica",
  interfaceLanguages: ["es", "en", "pt", "fr", "it", "de"],
  floatingFounderCtaRemoved: true,
  adaptivePracticeLabels: adaptiveLabels,
  internalIdsPreserved: true,
  internalIdsDisplayed: false,
  progressSource: "legacy state.done (documentado; no equivale todavía a Mastery)",
  firebaseChanged: false,
  masteryChanged: false,
  openAIConnected: false,
  roleNavigationPreserved: true,
  classicInlineScriptsChecked,
  regressionTests,
}, null, 2));
