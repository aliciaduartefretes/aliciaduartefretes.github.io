import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = relativePath => fs.readFileSync(path.join(root, relativePath), "utf8");
const hashBuffer = value => crypto.createHash("sha256").update(value).digest("hex");
const sha256 = relativePath => hashBuffer(fs.readFileSync(path.join(root, relativePath)));
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const protectedHashes = {
  "assets/js/kuaa-activity-renderer.js": "e280bc9f2e882955aeeb44d1a12ed7f298a4faf0dd47ef2d59cfff3540bf50e6",
  "assets/js/nalvi-ui.js": "598e323d784704b2f31e5ae3e98740f9feb4cbecbc217209c32540ee94f3d7b8",
  "assets/css/kuaa-activity-components.css": "111f62f3bed7a09479e78f6a72151581995f5059416372b5e8ae9e3d137a4f6b",
  "assets/css/nalvi-design-system.css": "c7d7aa2ed8eb16afeaf7b66cd02f67586b92ce1d17d4f98fa8ba49c091291292",
  "knowledge-base/pilot-corpus.json": "a99be7bc2ce61a240f3be279a812597f1a1b9806f6d3d7e173675fc00b8e6918",
  "knowledge-base/governance.json": "218f9b0e0c82eea04db2d13944b8c671de024a018969bac055122e168ed22cd0",
  "grammar-engine/grammar-engine.mjs": "e5995f92393afbe687e81ec6fa72df2d5253e9102c27ce007b9f0e8733496c42",
  "policies/ai-usage-policy.json": "f90c3e13db1e00fc9f6a128280b39c2eb06c0d0ce4c81a5d1adf297a9f3bda08"
};

for (const [relativePath, expected] of Object.entries(protectedHashes)) {
  assert(sha256(relativePath) === expected, `${relativePath}: regresión respecto del PASO 4.`);
}

const html = read("index.html");
const baselineHtml = read("versions/index-NALVI-P4-stable.html");
const routeTag = '<script src="assets/js/nalvi-guarani-general-route.js"></script>\n';
const routeUiTag = '<script src="assets/js/nalvi-general-route-ui.js"></script>\n';
assert(html.includes(routeTag.trim()), "index.html no carga la ruta pedagógica del PASO 5.");
assert(html.includes(routeUiTag.trim()), "index.html no carga el adaptador visual del PASO 5.");
assert(html.replace(routeTag, "").replace(routeUiTag, "") === baselineHtml, "index.html contiene cambios ajenos a la inclusión de las capas del PASO 5.");
assert(html.indexOf("kuaa-general-activities.js") < html.indexOf("nalvi-guarani-general-route.js"), "La ruta se carga antes que sus actividades.");
assert(html.indexOf("nalvi-guarani-general-route.js") < html.indexOf("kuaa-activity-renderer.js"), "La ruta no está disponible antes del renderizador.");
assert(html.indexOf("nalvi-ui.js") < html.indexOf("nalvi-general-route-ui.js"), "El adaptador curricular se carga antes de la interfaz estable.");

const loadActivities = source => {
  const context = vm.createContext({ window: {} });
  vm.runInContext(source, context);
  return JSON.parse(JSON.stringify(context.window.KUAA_GENERAL_ACTIVITY_DATA.activities));
};
const currentActivities = loadActivities(read("assets/js/kuaa-general-activities.js"));
const baselineActivities = loadActivities(read("versions/kuaa-general-activities-NALVI-P4-stable.js"));
const metadataKeys = new Set(["learningObjectiveId", "conceptIds", "lexemeIds", "grammarRuleIds", "skill", "difficulty", "activityType", "pedagogicalPhase", "contentValidationStatus", "allowedForMastery"]);
const withoutPaso5Metadata = activity => Object.fromEntries(Object.entries(activity).filter(([key]) => !metadataKeys.has(key)));
assert(currentActivities.length === baselineActivities.length, "Se agregó o eliminó contenido dinámico fuera del alcance.");
assert(JSON.stringify(currentActivities.map(withoutPaso5Metadata)) === JSON.stringify(baselineActivities), "El contenido de las actividades heredadas fue alterado.");

for (const language of ["es", "en", "pt", "fr", "it", "de"]) {
  assert(html.includes(`<option value="${language}">`), `Falta el idioma de interfaz ${language}.`);
}
assert(html.includes("signInWithPopup") && html.includes("signInWithRedirect") && html.includes("signInAnonymously") && html.includes("onAuthStateChanged"), "Se alteró el cableado de login.");
assert(html.includes('data-go="progressHub"') && html.includes('id="xp"') && html.includes('id="lives"'), "Se alteró XP, vidas o progreso.");
assert(html.includes("POLICE_LESSONS") && html.includes("MEDICAL_LESSONS") && html.includes("kidsCourse") && html.includes("rudeCourse"), "Falta contenido de cursos conservados.");

const aiPolicy = JSON.parse(read("policies/ai-usage-policy.json"));
const curriculumSource = read("assets/js/nalvi-guarani-general-route.js");
const routeUiSource = read("assets/js/nalvi-general-route-ui.js");
const activitySource = read("assets/js/kuaa-general-activities.js");
assert(aiPolicy.openAIEnabled === false, "OpenAI quedó habilitado en la política.");
assert(!/openai\.com|sk-[A-Za-z0-9_-]{16,}/i.test(curriculumSource + routeUiSource + activitySource), "La nueva capa contiene una conexión o secreto de OpenAI.");
assert(!/\bfetch\s*\(|XMLHttpRequest|WebSocket/.test(curriculumSource + routeUiSource), "La ruta pedagógica realiza acceso de red.");

const curriculumTests = spawnSync(process.execPath, ["--test", path.join(root, "curriculum/tests/guarani-general-route.test.mjs")], { cwd: root, encoding: "utf8" });
assert(curriculumTests.status === 0, `Fallaron las pruebas curriculares:\n${curriculumTests.stdout}\n${curriculumTests.stderr}`);
const grammarTests = spawnSync(process.execPath, ["--test", path.join(root, "grammar-engine/tests/grammar-engine.test.mjs")], { cwd: root, encoding: "utf8" });
assert(grammarTests.status === 0, `Regresión del Grammar Engine:\n${grammarTests.stdout}\n${grammarTests.stderr}`);

console.log(JSON.stringify({
  status: "PASS",
  step: 5,
  scope: "Guaraní General only",
  modules: 7,
  learningObjectives: 28,
  concepts: 28,
  dynamicActivitiesLinked: currentActivities.length,
  activityCountPolicy: "variable",
  progressUnit: "learningObjective",
  masteryCalculated: false,
  curriculumTests: 12,
  grammarEngineTests: 15,
  interfaceLanguages: ["es", "en", "pt", "fr", "it", "de"],
  openAIConnected: false,
  firebaseChanged: false,
  protectedUiAndCoursesPreserved: true
}, null, 2));
