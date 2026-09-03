import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = relativePath => fs.readFileSync(path.join(root, relativePath), "utf8");
const loadDataLayer = activitySource => {
  const context = vm.createContext({ window: {} });
  vm.runInContext(activitySource, context, { filename: "kuaa-general-activities.js" });
  vm.runInContext(read("assets/js/nalvi-guarani-general-route.js"), context, { filename: "nalvi-guarani-general-route.js" });
  return {
    activityData: context.window.KUAA_GENERAL_ACTIVITY_DATA,
    curriculum: context.window.NALVI_GUARANI_GENERAL_CURRICULUM
  };
};

const current = loadDataLayer(read("assets/js/kuaa-general-activities.js"));
const previousContext = vm.createContext({ window: {} });
vm.runInContext(read("versions/kuaa-general-activities-NALVI-P4-stable.js"), previousContext);
const previousActivities = previousContext.window.KUAA_GENERAL_ACTIVITY_DATA.activities;
const languages = ["es", "en", "pt", "fr", "it", "de"];
const plain = value => JSON.parse(JSON.stringify(value));
const metadataFields = new Set([
  "learningObjectiveId",
  "conceptIds",
  "lexemeIds",
  "grammarRuleIds",
  "skill",
  "difficulty",
  "activityType",
  "pedagogicalPhase",
  "contentValidationStatus",
  "allowedForMastery"
]);
const withoutPaso5Metadata = activity => Object.fromEntries(Object.entries(activity).filter(([key]) => !metadataFields.has(key)));

test("la ruta usa objetivos y práctica variable, no una cantidad fija de lecciones", () => {
  const route = current.curriculum.route;
  assert.equal(route.courseId, "general");
  assert.equal(route.learningModel, "competency-route");
  assert.equal(route.progressUnit, "learningObjective");
  assert.equal(route.fixedLessonCount, null);
  assert.equal(route.practicePolicy.activityCount, "variable");
  assert.equal(route.practicePolicy.masteryDecisionImplemented, false);
});

test("la jerarquía ruta → módulos → objetivos → conceptos es íntegra", () => {
  const { route, modules, learningObjectives, concepts } = current.curriculum;
  const moduleIds = new Set(modules.map(item => item.id));
  const objectiveIds = new Set(learningObjectives.map(item => item.id));
  const conceptIds = new Set(concepts.map(item => item.id));
  assert.deepEqual(plain(route.moduleIds), plain(modules.map(item => item.id)));
  assert.equal(modules.length, 7);
  assert.equal(learningObjectives.length, 28);
  for (const module of modules) {
    for (const id of module.learningObjectiveIds) assert.ok(objectiveIds.has(id), `${module.id} refiere un objetivo inexistente: ${id}`);
  }
  for (const objective of learningObjectives) {
    assert.ok(moduleIds.has(objective.moduleId), `${objective.id} refiere un módulo inexistente.`);
    for (const id of objective.conceptIds) assert.ok(conceptIds.has(id), `${objective.id} refiere un concepto inexistente: ${id}`);
    assert.ok(objective.skills.length > 0);
    assert.ok(objective.activityTypes.length > 0);
  }
});

test("el ciclo pedagógico completo queda representado sin imponer seis pantallas", () => {
  assert.deepEqual(plain(current.curriculum.pedagogicalCycle.map(item => item.id)), ["ESCUCHA", "ENTIENDE", "CONSTRUYE", "HABLA", "APLICA", "DOMINA"]);
  assert.equal(current.curriculum.route.pedagogicalCycleIds.length, 6);
  assert.equal(Object.hasOwn(current.curriculum.route, "requiredScreenCount"), false);
});

test("los ocho componentes dinámicos del PASO 1 pueden asociarse a objetivos", () => {
  const supported = new Set(current.curriculum.learningObjectives.flatMap(item => item.activityTypes));
  for (const type of ["multiple-choice", "listening", "order-sentence", "fill-blank", "writing", "matching", "speaking", "scenario"]) {
    assert.ok(supported.has(type), `Falta el tipo ${type}.`);
  }
});

test("las tres actividades dinámicas conservan su contenido y ganan metadatos pedagógicos", () => {
  assert.equal(current.activityData.activities.length, previousActivities.length);
  for (let index = 0; index < previousActivities.length; index += 1) {
    assert.deepEqual(plain(withoutPaso5Metadata(current.activityData.activities[index])), plain(previousActivities[index]));
    const activity = current.activityData.activities[index];
    assert.equal(activity.courseId, "general");
    assert.equal(activity.learningObjectiveId, "GG-LO-001");
    assert.ok(activity.conceptIds.length > 0);
    assert.ok(activity.lexemeIds.length > 0);
    assert.ok(Array.isArray(activity.grammarRuleIds));
    assert.ok(activity.skill);
    assert.ok(activity.difficulty);
    assert.equal(activity.activityType, activity.type);
    assert.equal(activity.allowedForMastery, false);
    assert.equal(activity.contentValidationStatus, "unreviewed");
  }
});

test("cada actividad dinámica puede recuperarse por objetivo", () => {
  const linked = current.curriculum.getActivitiesForLearningObjective("GG-LO-001");
  assert.deepEqual(plain(linked.map(item => item.id)), plain(current.activityData.activities.map(item => item.id)));
  assert.deepEqual(plain(current.curriculum.getActivitiesForLearningObjective("GG-LO-999")), []);
});

test("las 28 unidades heredadas quedan conservadas y recuperables por objetivo", () => {
  for (let legacyUnitIndex = 0; legacyUnitIndex < 28; legacyUnitIndex += 1) {
    const objective = current.curriculum.getLearningObjectiveForLegacyUnit(legacyUnitIndex);
    assert.ok(objective, `Falta el objetivo para la unidad heredada ${legacyUnitIndex}.`);
    assert.equal(objective.legacyContentRefs[0].legacyUnitIndex, legacyUnitIndex);
  }
  assert.equal(current.curriculum.getLearningObjectiveForLegacyUnit(99), null);
});

test("los metadatos institucionales informan qué observar sin calcular mastery", () => {
  for (const objective of current.curriculum.learningObjectives) {
    assert.equal(objective.institutionalMetadata.reportableByObjective, true);
    assert.equal(objective.institutionalMetadata.reinforcementSignalReady, true);
    assert.equal(objective.institutionalMetadata.masteryCalculated, false);
    const descriptor = current.curriculum.getInstitutionalObjectiveDescriptor(objective.id, "en");
    assert.equal(descriptor.learningObjectiveId, objective.id);
    assert.equal(descriptor.masteryCalculated, false);
    assert.equal(descriptor.evidenceFields.completed, null);
    assert.equal(descriptor.evidenceFields.reinforcementNeeded, null);
  }
});

test("los seis idiomas están completos en todo texto nuevo visible", () => {
  const localizedFields = [
    current.curriculum.route.title,
    ...current.curriculum.pedagogicalCycle.map(item => item.label),
    ...current.curriculum.modules.flatMap(item => [item.title, item.description]),
    ...current.curriculum.learningObjectives.map(item => item.canDo),
    ...current.curriculum.concepts.map(item => item.title)
  ];
  for (const field of localizedFields) {
    for (const language of languages) assert.ok(String(field[language] || "").trim(), `Falta traducción ${language}.`);
  }
  assert.deepEqual(plain(current.curriculum.languages), languages);
});

test("el idioma de interfaz permanece separado del idioma aprendido", () => {
  assert.equal(current.curriculum.route.languageBeingLearned, "gug-PY");
  assert.equal(current.curriculum.localize(current.curriculum.route.title, "de"), "Lernweg Allgemeines Guaraní");
  assert.equal(current.curriculum.localize(current.curriculum.route.title, "invalid"), "Ruta de Guaraní General");
});

test("las dependencias lingüísticas pendientes no se promueven a dominio", () => {
  assert.equal(current.curriculum.getLearningObjective("GG-LO-001").knowledgeStatus, "unreviewed");
  assert.equal(current.curriculum.getLearningObjective("GG-LO-005").knowledgeStatus, "reviewRequired");
  assert.equal(current.curriculum.getLearningObjective("GG-LO-007").knowledgeStatus, "reviewRequired");
  assert.equal(current.curriculum.learningObjectives.some(item => item.institutionalMetadata.masteryCalculated), false);
});

test("la capa no contiene red, Firebase, OpenAI ni otros cursos", () => {
  const source = read("assets/js/nalvi-guarani-general-route.js");
  const uiSource = read("assets/js/nalvi-general-route-ui.js");
  const executableSource = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const executableUiSource = uiSource.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  assert.doesNotMatch(executableSource + executableUiSource, /\bfetch\s*\(|XMLHttpRequest|WebSocket|initializeApp\s*\(|getFirestore\s*\(|openai\.com|sk-[A-Za-z0-9_-]{16,}/i);
  assert.equal(current.curriculum.learningObjectives.some(item => item.courseId && item.courseId !== "general"), false);
  assert.equal(current.activityData.activities.some(item => item.courseId !== "general"), false);
  assert.equal(current.curriculum.audit().artificialIntelligenceConnected, false);
  assert.equal(current.curriculum.audit().firebaseChanged, false);
  assert.equal(current.curriculum.audit().otherCoursesChanged, false);
  for (const language of languages) assert.match(uiSource, new RegExp(`\\b${language}:\\s*\\{`));
});
