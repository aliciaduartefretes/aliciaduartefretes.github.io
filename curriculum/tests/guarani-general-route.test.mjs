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
vm.runInContext(read("versions/kuaa-general-activities-NALVI-P5-stable.js"), previousContext);
const previousActivities = previousContext.window.KUAA_GENERAL_ACTIVITY_DATA.activities;
const languages = ["es", "en", "pt", "fr", "it", "de"];
const approvedAdaptiveDialogueSources = new Map([
  ["general-u01-dialogue-greetings", { path: "versions/index-NALVI-P5-stable.html", unitIndex: 0 }]
]);
const plain = value => JSON.parse(JSON.stringify(value));
const stringsIn = (value, result = new Set()) => {
  if (typeof value === "string") result.add(value.normalize("NFC"));
  else if (Array.isArray(value)) value.forEach(item => stringsIn(item, result));
  else if (value && typeof value === "object") Object.values(value).forEach(item => stringsIn(item, result));
  return result;
};
const hasValidAdaptiveDialogueTurnCount = dialogue => Array.isArray(dialogue?.turns)
  && dialogue.turns.length >= 2
  && dialogue.turns.length <= 4;
const stableGeneralUnit = source => {
  const stableHtml = read(source.path);
  const declarationStart = stableHtml.indexOf("const U=[");
  const valueStart = stableHtml.indexOf("[", declarationStart);
  const valueEnd = stableHtml.indexOf("];\nconst quizBase", valueStart);
  assert.ok(declarationStart >= 0 && valueStart > declarationStart && valueEnd > valueStart, `No se pudo leer ${source.path}.`);
  const units = vm.runInNewContext(`(${stableHtml.slice(valueStart, valueEnd + 1)})`);
  assert.ok(units[source.unitIndex], `No existe la unidad estable ${source.unitIndex} en ${source.path}.`);
  return units[source.unitIndex];
};
const adaptiveMetadataFields = ["semanticPair", "adaptiveDialogue"];
const directAuthorCorrections = {
  "general-u01-significado-mba-eichapa": {
    target: "Mba’éichapa reime",
    prompt: {
      es: "¿Qué forma completa pregunta cómo está una persona?",
      en: "Which complete form asks one person how they are?",
      pt: "Qual forma completa pergunta a uma pessoa como ela está?",
      fr: "Quelle forme complète demande à une personne comment elle va ?",
      it: "Quale forma completa chiede a una persona come sta?",
      de: "Welche vollständige Form fragt eine Person nach ihrem Befinden?"
    },
    explanation: {
      es: "En guaraní, usa Mba’éichapa reime con una persona y Mba’éichapa peime con varias. Mba’éichapa solo puede aceptarse socialmente como abreviación, pero en los ejercicios se exige la forma completa. Puedes responder Aime porã.",
      en: "In Guaraní, greetings often open a warm, personal conversation. Use Mba’éichapa reime with one person and Mba’éichapa peime with several people. Mba’éichapa alone can be accepted socially as an abbreviation, but exercises require the complete form. You can answer Aime porã.",
      pt: "Em guarani, use Mba’éichapa reime com uma pessoa e Mba’éichapa peime com várias. Mba’éichapa sozinho pode ser aceito socialmente como abreviação, mas os exercícios exigem a forma completa. Você pode responder Aime porã.",
      fr: "En guarani, utilisez Mba’éichapa reime avec une personne et Mba’éichapa peime avec plusieurs. Employé seul, Mba’éichapa peut être socialement accepté comme abréviation, mais les exercices exigent la forme complète. Vous pouvez répondre Aime porã.",
      it: "In guaraní, usa Mba’éichapa reime con una persona e Mba’éichapa peime con più persone. Mba’éichapa da solo può essere accettato socialmente come abbreviazione, ma negli esercizi è richiesta la forma completa. Puoi rispondere Aime porã.",
      de: "Auf Guaraní verwendest du Mba’éichapa reime für eine Person und Mba’éichapa peime für mehrere. Mba’éichapa allein kann gesellschaftlich als Abkürzung akzeptiert sein, in den Übungen ist aber die vollständige Form erforderlich. Du kannst mit Aime porã antworten."
    },
    options: [
      { id: "plural", label: "¿Mba’éichapa peime?" },
      { id: "singular", label: "¿Mba’éichapa reime?" },
      { id: "greeting", label: "Maitei" }
    ],
    correctOptionId: "singular",
    dialogueLiterals: [
      "¿Mba’éichapa reime Ana?",
      "Aime porã, ¿ha nde?",
      "Aime porã avei. ¡Jajoechata!"
    ]
  },
  "general-u01-escuchar-jajotopata": {
    meaning: {
      es: "Nos vamos a encontrar",
      en: "We are going to meet",
      pt: "Nós vamos nos encontrar",
      fr: "Nous allons nous rencontrer",
      it: "Ci incontreremo",
      de: "Wir werden uns treffen"
    },
    prompt: {
      es: "¿Cómo dices «nos vamos a encontrar»?",
      en: "How do you say “we are going to meet”?",
      pt: "Como se diz “nós vamos nos encontrar”?",
      fr: "Comment dit-on « nous allons nous rencontrer » ?",
      it: "Come si dice «ci incontreremo»?",
      de: "Wie sagt man „Wir werden uns treffen“?"
    }
  }
};
const withoutAdaptiveMetadata = activity => {
  const result = plain(activity);
  for (const field of adaptiveMetadataFields) delete result[field];
  return result;
};
const expectedStableContent = activity => {
  const result = withoutAdaptiveMetadata(activity);
  const correction = directAuthorCorrections[result.id];
  if (correction?.prompt) result.prompt = plain(correction.prompt);
  if (correction?.explanation) result.explanation = plain(correction.explanation);
  if (correction?.options) result.options = plain(correction.options);
  if (correction?.correctOptionId) result.correctOptionId = correction.correctOptionId;
  return result;
};

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

test("las tres actividades dinámicas conservan el contenido estable y las correcciones directas de la autora", () => {
  assert.equal(current.activityData.activities.length, previousActivities.length);
  for (let index = 0; index < previousActivities.length; index += 1) {
    assert.deepEqual(withoutAdaptiveMetadata(current.activityData.activities[index]), expectedStableContent(previousActivities[index]));
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

test("los metadatos adaptativos autorizan sólo material completo y trazable", () => {
  const dialogues = [];
  for (const activity of current.activityData.activities) {
    const pair = activity.semanticPair;
    const stableActivity = previousActivities.find(candidate => candidate.id === activity.id);
    const approvedContent = JSON.stringify([plain(stableActivity), directAuthorCorrections[activity.id] || null]).normalize("NFC").toLocaleLowerCase();
    assert.deepEqual(Object.keys(pair).sort(), ["adaptiveReuseAuthorized", "meaning", "target"]);
    assert.equal(pair.adaptiveReuseAuthorized, true, `${activity.id} no autoriza explícitamente el par semántico.`);
    assert.ok(String(pair.target || "").trim(), `${activity.id} no declara el término meta.`);
    assert.ok(approvedContent.includes(pair.target.normalize("NFC").toLocaleLowerCase()), `${activity.id} intenta reutilizar un término ajeno al contenido estable o a una corrección directa.`);
    assert.deepEqual(Object.keys(pair.meaning).sort(), [...languages].sort(), `${activity.id} declara un conjunto inesperado de idiomas.`);
    for (const language of languages) {
      assert.ok(String(pair.meaning?.[language] || "").trim(), `${activity.id} no declara significado ${language}.`);
      assert.ok(approvedContent.includes(pair.meaning[language].normalize("NFC").toLocaleLowerCase()), `${activity.id} intenta reutilizar un significado ${language} ajeno al contenido estable o a una corrección directa.`);
    }
    if (activity.adaptiveDialogue) dialogues.push({ activityId: activity.id, value: activity.adaptiveDialogue });
  }

  assert.ok(dialogues.length > 0, "Falta al menos un diálogo adaptativo autorizado.");
  for (const { activityId, value: dialogue } of dialogues) {
    assert.deepEqual(Object.keys(dialogue).sort(), ["authorized", "correctAnswer", "correctOptionId", "options", "sourceContentId", "turns"]);
    assert.equal(dialogue.authorized, true, `${activityId} no autoriza explícitamente el diálogo.`);
    assert.ok(String(dialogue.sourceContentId || "").trim(), `${activityId} no declara sourceContentId.`);
    const approvedSource = approvedAdaptiveDialogueSources.get(dialogue.sourceContentId);
    assert.ok(approvedSource, `${activityId} refiere una fuente de diálogo no aprobada: ${dialogue.sourceContentId}.`);
    const approvedLiterals = stringsIn(stableGeneralUnit(approvedSource));
    (directAuthorCorrections[activityId]?.dialogueLiterals || []).forEach(literal => approvedLiterals.add(literal.normalize("NFC")));
    assert.ok(hasValidAdaptiveDialogueTurnCount(dialogue), `${activityId} debe tener entre 2 y 4 turnos.`);
    assert.ok(dialogue.turns.every(turn => turn.authorized === true && turn.id && turn.speaker && turn.text), `${activityId} contiene turnos incompletos o no autorizados.`);
    assert.ok(dialogue.turns.every(turn => approvedLiterals.has(turn.text.normalize("NFC"))), `${activityId} contiene turnos ajenos al bloque estable aprobado.`);
    assert.equal(new Set(dialogue.turns.map(turn => turn.id)).size, dialogue.turns.length, `${activityId} repite IDs de turnos.`);
    assert.ok(dialogue.options.length >= 3, `${activityId} necesita al menos tres opciones de diálogo.`);
    assert.ok(dialogue.options.every(option => option.authorized === true && option.id && option.text), `${activityId} contiene opciones incompletas o no autorizadas.`);
    assert.ok(dialogue.options.every(option => approvedLiterals.has(option.text.normalize("NFC"))), `${activityId} contiene opciones ajenas al bloque estable aprobado.`);
    assert.equal(new Set(dialogue.options.map(option => option.id)).size, dialogue.options.length, `${activityId} repite IDs de opciones.`);
    const correctOption = dialogue.options.find(option => option.id === dialogue.correctOptionId);
    assert.ok(correctOption, `${activityId} refiere una opción correcta inexistente.`);
    assert.equal(dialogue.correctAnswer, correctOption.text, `${activityId} no alinea correctAnswer con correctOptionId.`);
  }
});

test("las correcciones directas distinguen Jajoechata de Jajotopata", () => {
  const greeting = current.activityData.activities.find(activity => activity.id === "general-u01-significado-mba-eichapa");
  assert.equal(greeting.semanticPair.target, "Mba’éichapa reime");
  assert.deepEqual(plain(greeting.prompt), directAuthorCorrections[greeting.id].prompt);
  assert.deepEqual(plain(greeting.explanation), directAuthorCorrections[greeting.id].explanation);
  assert.deepEqual(plain(greeting.options), directAuthorCorrections[greeting.id].options);
  assert.equal(greeting.correctOptionId, "singular");
  assert.deepEqual(plain(greeting.adaptiveDialogue.turns.map(turn => turn.text)), ["¿Mba’éichapa reime Ana?", "Aime porã, ¿ha nde?"]);
  assert.deepEqual(plain(greeting.adaptiveDialogue.options.map(option => option.text)), ["¿Mba’éichapa reime Ana?", "Aime porã, ¿ha nde?", "Aime porã avei. ¡Jajoechata!"]);
  assert.equal(greeting.adaptiveDialogue.correctAnswer, "Aime porã avei. ¡Jajoechata!");

  const meeting = current.activityData.activities.find(activity => activity.id === "general-u01-escuchar-jajotopata");
  assert.deepEqual(plain(meeting.semanticPair.meaning), directAuthorCorrections[meeting.id].meaning);
  assert.deepEqual(plain(meeting.prompt), directAuthorCorrections[meeting.id].prompt);
  assert.equal(meeting.audioText, "Jajotopata");
  assert.equal(current.activityData.version, "NALVI-P5-DATA-3");
});

test("un diálogo adaptativo de un solo turno incumple el contrato del catálogo", () => {
  const activityWithDialogue = current.activityData.activities.find(activity => activity.adaptiveDialogue);
  assert.ok(activityWithDialogue, "Falta una actividad con diálogo para probar el límite inferior.");
  const oneTurnDialogue = {
    ...plain(activityWithDialogue.adaptiveDialogue),
    turns: plain(activityWithDialogue.adaptiveDialogue.turns.slice(0, 1))
  };
  assert.equal(oneTurnDialogue.turns.length, 1);
  assert.equal(hasValidAdaptiveDialogueTurnCount(oneTurnDialogue), false);
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
