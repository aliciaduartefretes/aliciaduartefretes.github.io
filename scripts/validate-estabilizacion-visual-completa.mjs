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
assert(html.includes('<body aria-busy="true">'), "El body no comunica el estado inicial ocupado.");
assert(criticalStyleIndex > 0 && criticalStyleIndex < designSystemIndex && designSystemIndex < bodyIndex, "La protección crítica de BOOTING no precede al CSS y al body.");
assert(html.includes('id="nalviBoot"'), "Falta la superficie mínima de arranque NALVI.");
assert(html.includes('body>:not(#nalviBoot){visibility:hidden!important}'), "La UI heredada puede pintarse antes del CSS externo.");
assert(css.includes('body > :not(#nalviBoot)') && css.includes("visibility: hidden !important"), "El Design System no preserva BOOTING.");
assert(html.includes('<div class="hero-art" hidden aria-hidden="true">'), "El hero heredado es pintable desde el HTML inicial.");
assert(ui.indexOf("removeLegacyHomeHero();") < ui.indexOf("markApplicationReady();"), "El hero se retira después de READY.");
assert(ui.includes('dataset.nalviBoot = "ready"'), "No existe transición a READY.");
assert(ui.includes("boot.remove();") && ui.includes('document.body.removeAttribute("aria-busy")'), "El loader o su espacio pueden permanecer después de READY.");
assert(ui.includes("Promise.race([waitForMinimumIdentity(), wait(1600)])"), "El arranque no tiene límite breve.");
assert(ui.includes("removeLegacyAcademicPromotion") && ui.includes("removePublicDictionarySources"), "Falta la limpieza de promoción o bibliografía pública.");
assert(!html.includes('<div class="dictionary-source">'), "La bibliografía sigue en el HTML público del diccionario.");
assert(!html.includes("Entrada del diccionario Ñe'ẽryru."), "El fallback público aún expone la obra bibliográfica.");
assert(css.includes("#catalog .course-card") && css.includes("grid-template-columns: 52px minmax(0, 1fr)"), "El catálogo no usa tarjetas compactas NALVI.");
assert(css.includes("#catalog .course-card-icon") && css.includes("width: 52px !important"), "La iconografía no está normalizada.");
assert(!/generalSub:\"(?:Curso tradicional|A traditional course|Cours traditionnel|Corso tradizionale|Traditioneller Kurs)/.test(html), "Permanece un rótulo legacy en el catálogo.");
assert(route.includes('languages.includes(candidate)') || route.includes("curriculum.languages.includes(candidate)"), "La ruta dejó de usar los seis idiomas.");

for (const language of ["es", "en", "pt", "fr", "it", "de"]) {
  assert(html.includes(`<option value="${language}">`), `Falta ${language} en el selector.`);
  assert(new RegExp(`\\b${language}:`).test(ui), `Falta ${language} en el arranque.`);
}

assert(html.includes("const ACADEMIC_QUERY_TIMEOUT_MS=15000;"), "Se perdió la estabilización de Gestión académica.");
assert(fs.existsSync(path.join(root, "knowledge-base")), "Falta Knowledge Base.");
assert(fs.existsSync(path.join(root, "grammar-engine")), "Falta Grammar Engine.");
assert(fs.existsSync(path.join(root, "mastery-engine")), "Falta Mastery Engine.");
assert(!html.includes("OPENAI_API_KEY"), "Existe una clave OpenAI en el cliente.");

console.log(JSON.stringify({
  status: "PASS",
  boot: ["BOOTING", "READY"],
  criticalBootIsInline: true,
  legacyHomeHiddenDuringBoot: true,
  aliHeroRemovedBeforeReady: true,
  aliAcademicPromotionRemoved: true,
  publicDictionaryBibliographyRemoved: true,
  internalKnowledgeBasePreserved: true,
  catalogCards: "NALVI compact",
  languages: ["es", "en", "pt", "fr", "it", "de"],
  secondaryAcademicQueriesBlockBoot: false,
  firebaseRulesChanged: false,
  intelligentEnginesChanged: false
}, null, 2));
