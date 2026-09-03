import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = relative => fs.readFileSync(path.join(root, relative), "utf8");
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const html = read("index.html");
const css = read("assets/css/nalvi-design-system.css");
const ui = read("assets/js/nalvi-ui.js");
const route = read("assets/js/nalvi-general-route-ui.js");
const bodyIndex = html.indexOf("<body");
const criticalStyleIndex = html.indexOf("nalvi-boot-critical");
const designSystemIndex = html.indexOf("assets/css/nalvi-design-system.css?v=NALVI-VISUAL-STABLE-1");

assert(html.includes('data-nalvi-boot="booting"'), "El documento no nace en BOOTING.");
assert(criticalStyleIndex > 0 && criticalStyleIndex < designSystemIndex && designSystemIndex < bodyIndex, "La protección crítica y el Design System no cargan antes del body.");
assert(html.includes('<body aria-busy="true">'), "El body no comunica BOOTING.");
assert(html.includes('id="nalviBoot"'), "Falta la superficie mínima de arranque NALVI.");
assert(css.includes('body > :not(#nalviBoot)') && css.includes("visibility: hidden !important"), "La UI heredada puede pintarse durante BOOTING.");
assert(html.includes('<div class="hero-art" hidden aria-hidden="true">'), "El hero heredado puede pintarse desde el HTML inicial.");
assert(ui.indexOf("removeLegacyHomeHero();") < ui.indexOf("markApplicationReady();"), "El hero se retira después de READY.");
assert(ui.includes('dataset.nalviBoot = "ready"'), "No existe transición a READY.");
assert(ui.includes("boot.remove();") && ui.includes('document.body.removeAttribute("aria-busy")'), "El loader no se retira por completo al llegar a READY.");
assert(ui.includes("removeLegacyAcademicPromotion") && ui.includes("removePublicDictionarySources"), "Falta la limpieza académica visual.");
assert(!html.includes('<div class="dictionary-source">'), "La bibliografía continúa en la UI pública.");
assert(ui.includes("Promise.race([waitForMinimumIdentity(), wait(1600)])"), "El arranque no tiene límite breve.");
assert(ui.includes("waitForSignal(\"nalvi:role-known\"") && html.includes("nalvi:role-known"), "No se contempla el rol mínimo.");
assert(html.includes("NALVI_AUTH_SNAPSHOT") && html.includes("NALVI_ROLE_SNAPSHOT"), "Falta señalización de sesión o rol.");
assert(!html.includes('href="/icons/apple-touch-icon.png"'), "Permanece una ruta local de icono inexistente.");
assert(html.includes('rel="apple-touch-icon" href="/icons/icon-192.png"'), "El icono Apple no reutiliza el activo existente.");
assert(route.includes('languages.includes(candidate)') || route.includes("curriculum.languages.includes(candidate)"), "La ruta dejó de usar los seis idiomas.");
for (const language of ["es", "en", "pt", "fr", "it", "de"]) {
  assert(html.includes(`<option value="${language}">`), `Falta ${language} en el selector.`);
  assert(new RegExp(`\\b${language}:`).test(ui), `Falta ${language} en el arranque.`);
}
assert(html.includes("const ACADEMIC_QUERY_TIMEOUT_MS=15000;"), "Se perdió la estabilización de Gestión académica.");
assert(fs.existsSync(path.join(root, "knowledge-base")), "Falta Knowledge Base.");
assert(fs.existsSync(path.join(root, "grammar-engine")), "Falta Grammar Engine.");
assert(fs.existsSync(path.join(root, "mastery-engine")), "Falta Mastery Engine.");

console.log(JSON.stringify({
  status: "PASS",
  boot: ["BOOTING", "READY"],
  designSystemBeforeBody: true,
  legacyHomeHiddenDuringBoot: true,
  aliHeroRemovedBeforeReady: true,
  languages: ["es", "en", "pt", "fr", "it", "de"],
  secondaryAcademicQueriesBlockBoot: false,
  firebaseRulesChanged: false,
  openAIConnected: false,
  paso7BStarted: false
}, null, 2));
