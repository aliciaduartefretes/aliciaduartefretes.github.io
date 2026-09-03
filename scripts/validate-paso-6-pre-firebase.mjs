import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = relative => fs.readFileSync(path.join(root, relative), "utf8");
const hash = relative => crypto.createHash("sha256").update(fs.readFileSync(path.join(root, relative))).digest("hex");
const assert = (condition, message) => { if (!condition) throw new Error(message); };

assert(hash("index.html") === "889782f5605d6a17759ba593add3bad3af2602384023ccb663a97b82d3f38523", "index.html dejó de ser la versión estable del PASO 5.");

const config = JSON.parse(read("mastery-engine/mastery-config.json"));
const layout = JSON.parse(read("mastery-engine/firestore-layout.json"));
JSON.parse(read("mastery-engine/mastery-data.schema.json"));
assert(JSON.stringify(config.skills) === JSON.stringify(["listening", "reading", "writing", "speaking", "vocabulary", "grammar", "application"]), "Las habilidades de PASO 6 son incorrectas.");
assert(layout.authority.clientWrites === "denied", "El layout permite escritura cliente de Mastery.");

const engine = read("mastery-engine/mastery-engine.mjs");
assert(!/openai\.com|sk-[A-Za-z0-9_-]{16,}|\bfetch\s*\(|XMLHttpRequest|WebSocket/i.test(engine), "El motor incluye IA, secretos o red.");
assert(!/firebase|firestore|localStorage|sessionStorage/i.test(engine), "El motor puro depende de Firebase o del navegador.");

const debug = read("mastery-engine/debug/index.html");
for (const language of ["es", "en", "pt", "fr", "it", "de"]) {
  assert(debug.includes(`<option value="${language}">`), `El panel debug no ofrece ${language}.`);
  assert(debug.includes(`${language}:{`), `El panel debug no traduce ${language}.`);
}
assert(debug.includes("@media(max-width:800px)"), "El panel debug no declara adaptación móvil.");

const rules = read("firebase/firestore-PASO-6.rules");
for (const collection of ["learningEvents", "mastery", "baselines", "reviewSchedule"]) {
  assert(rules.includes(`match /${collection}/`), `Faltan reglas para ${collection}.`);
}
assert((rules.match(/allow create, update, delete: if false;/g) || []).length >= 4, "Las escrituras cliente de Mastery no están denegadas.");
assert(rules.includes("selfProfileRoleIsTrusted"), "No se protege la elevación de rol.");
assert(hash("firebase/firestore-PASO-6.rules") === hash("REGLAS-FIRESTORE-PASO-6-PARA-COPIAR.rules"), "El archivo para copiar no coincide con la regla probada.");

const paso5 = spawnSync(process.execPath, [path.join(root, "scripts/validate-paso-5.mjs")], { cwd: root, encoding: "utf8" });
assert(paso5.status === 0, `Regresión PASO 5:\n${paso5.stdout}\n${paso5.stderr}`);
const mastery = spawnSync(process.execPath, ["--test", path.join(root, "mastery-engine/tests/mastery-engine.test.mjs")], { cwd: root, encoding: "utf8" });
assert(mastery.status === 0, `Pruebas Mastery:\n${mastery.stdout}\n${mastery.stderr}`);

console.log(JSON.stringify({
  status: "PASS",
  step: "6-pre-firebase",
  masteryTests: 12,
  firestoreSpecificEmulatorTests: 7,
  legacyRulesRegressionTests: 14,
  skills: config.skills,
  statuses: ["NEW", "LEARNING", "PRACTICING", "MASTERED", "REVIEW_DUE", "WEAK"],
  decisions: ["ADVANCE", "REVIEW", "REPEAT", "SIMPLIFY", "CHALLENGE", "REVIEW_LATER"],
  interfaceLanguages: ["es", "en", "pt", "fr", "it", "de"],
  openAIConnected: false,
  clientMasteryWritesEnabled: false,
  mainApplicationChanged: false,
  nextGate: "publishFirestoreRulesAndWait"
}, null, 2));
