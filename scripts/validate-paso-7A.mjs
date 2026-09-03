import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const paso6Root = path.resolve(root, "../NALVI-paso-6");
const read = relative => fs.readFileSync(path.join(root, relative), "utf8");
const digest = absolute => crypto.createHash("sha256").update(fs.readFileSync(absolute)).digest("hex");
const assert = (condition, message) => { if (!condition) throw new Error(message); };

const index = read("index.html");
const snapshot = read("versions/index-NALVI-P6-stable.html");
assert(index !== snapshot, "PASO 7A no produjo cambios respecto a la copia estable de PASO 6.");
assert(digest(path.join(root, "versions/index-NALVI-P6-stable.html")) === digest(path.join(paso6Root, "index.html")), "La copia recuperable de PASO 6 no coincide con el original estable.");

const forbidden = [
  [/Ali IA/i, "Permanece el nombre Ali IA."],
  [/data-go=["']aiCenter["']/i, "Permanece el acceso al centro de IA."],
  [/id=["']ai(?:Center|Panel|Workspace|Messages|Form|Input)["']/i, "Permanece una pantalla o elemento del chatbot."],
  [/data-ai-prompt/i, "Permanece una sugerencia del chatbot."],
  [/\b(?:callAliApi|smartAiReply|addAi|aiReply|refreshAiAdmin|renderAiAdminCard|AI_ERROR_TEXT)\b/, "Permanece lógica ejecutable del chatbot."],
  [/\/api\/ai\b/i, "Permanece la llamada cliente al endpoint del chatbot."],
  [/preg[uú]ntale\s+(?:a\s+)?(?:Ali|la\s+IA)/i, "Permanece un texto que invita a usar el chatbot."],
  [/class=["'][^"']*\bai-(?:panel|messages|suggestions|launcher|form)\b/i, "Permanece la interfaz del chatbot."],
  [/id=["'](?:aiLauncher|aiClose|aiAdmin)["']/i, "Permanece un control del chatbot."],
];
for (const [pattern, message] of forbidden) assert(!pattern.test(index), message);

const languages = ["es", "en", "pt", "fr", "it", "de"];
for (const language of languages) {
  assert(index.includes(`<option value="${language}">`), `Falta ${language} en el selector de idioma.`);
  assert(new RegExp(`(?:^|[,\\s])${language}\\s*:`).test(index), `No se encontró contenido de interfaz para ${language}.`);
}
assert(index.includes('id="headerLang"'), "Falta el selector principal de idioma.");
assert(/function\s+setAppLanguage\s*\(/.test(index), "Falta el cambio instantáneo de idioma.");
assert(!/location\.reload\s*\(/.test(index), "El cambio de idioma o navegación incluye una recarga de página.");

for (const authSymbol of ["signInWithPopup", "signInWithRedirect", "signInAnonymously", "onAuthStateChanged"]) {
  assert(index.includes(authSymbol), `Se alteró el flujo de autenticación: falta ${authSymbol}.`);
}
for (const preserved of [
  'id="xp"',
  'id="lives"',
  "POLICE_LESSONS",
  "MEDICAL_LESSONS",
  'id="kidsCourse"',
  'id="rudeCourse"',
  "nalvi-guarani-general-route.js",
  "kuaa-activity-renderer.js",
]) assert(index.includes(preserved), `Falta una función conservada: ${preserved}.`);

const unchanged = [
  "assets/css/kuaa-activity-components.css",
  "assets/css/nalvi-design-system.css",
  "assets/js/kuaa-activity-renderer.js",
  "assets/js/kuaa-general-activities.js",
  "assets/js/nalvi-general-route-ui.js",
  "assets/js/nalvi-guarani-general-route.js",
  "assets/js/nalvi-ui.js",
  "curriculum/guarani-general-route.schema.json",
  "firebase/database-GESA.rules.json",
  "firebase/firestore-PASO-6.rules",
  "grammar-engine/compiled-knowledge.json",
  "grammar-engine/grammar-engine.mjs",
  "knowledge-base/governance.json",
  "knowledge-base/pilot-corpus.json",
  "mastery-engine/mastery-config.json",
  "mastery-engine/mastery-engine.mjs",
  "policies/ai-usage-policy.json",
];
for (const relative of unchanged) {
  assert(digest(path.join(root, relative)) === digest(path.join(paso6Root, relative)), `PASO 7A modificó un archivo fuera de alcance: ${relative}.`);
}

const policy = JSON.parse(read("policies/ai-usage-policy.json"));
assert(policy.openAIEnabled === false, "OpenAI quedó habilitado durante PASO 7A.");

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
  step: "7A",
  removed: "Ali IA generic chatbot",
  newAIImplemented: false,
  clientAIEndpointCalled: false,
  interfaceLanguages: languages,
  classicInlineScriptsChecked: classicScriptsChecked,
  regressionSuites: suites,
  preservedLayers: ["Firebase Auth", "Firestore rules", "Knowledge Base", "Grammar Engine", "Mastery Engine", "courses", "XP", "lives", "progress"],
}, null, 2));
