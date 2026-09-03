import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

import { applyLearningEvent, createMasteryProfile } from "../../mastery-engine/mastery-engine.mjs";
import { MASTERY_CONFIG } from "../../mastery-engine/mastery-config.mjs";
import { evaluateProgressionGate } from "../../progression-engine/progression-gate.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = relativePath => fs.readFileSync(path.join(root, relativePath), "utf8");
const plain = value => JSON.parse(JSON.stringify(value));
const context = vm.createContext({ window: {} });
vm.runInContext(read("assets/js/kuaa-general-activities.js"), context, { filename: "kuaa-general-activities.js" });
vm.runInContext(read("assets/js/nalvi-guarani-general-route.js"), context, { filename: "nalvi-guarani-general-route.js" });
const curriculum = context.window.NALVI_GUARANI_GENERAL_CURRICULUM;

const EXPECTED_PAGES = [
  {
    page: 1,
    kind: "cover",
    blocks: [
      { role: "title", text: "GUARANÍ DESDE CERO" },
      { role: "credit", text: "CON MBO'EHÁRA MARCE" }
    ]
  },
  {
    page: 2,
    kind: "objective",
    blocks: [
      { role: "title", text: "¿QUÉ APRENDEREMOS?" },
      { role: "text", text: "Conjugaciones en tiempo presente." }
    ]
  },
  {
    page: 3,
    kind: "reference",
    blocks: [
      { role: "title", text: "Terarãngue - pronombres." },
      {
        role: "columns",
        columns: [
          {
            heading: "Singular",
            lines: ["Che → yo", "Nde → tú / vos", "Ha’e → él, ella"]
          },
          {
            heading: "Plural",
            lines: [
              "Ñande → nosotros (inclusivo: vos y yo, nosotros todos)",
              "Ore → nosotros (excluyente: yo y otros, pero sin vos)",
              "Pende → ustedes",
              "Ha’ekuéra → ellos, ellas"
            ]
          }
        ]
      }
    ]
  },
  {
    page: 4,
    kind: "dialogue",
    blocks: [
      { role: "title", text: "ÑOMONGETA" },
      {
        role: "lines",
        lines: [
          "¿Mba'éicha nde réra?",
          "Che réra Marcelo, ¿ha nde?",
          "Che réra Michel. ¡Che rory roikuaávo!",
          "Che rory avei",
          "¿Mba'e rejapo?",
          "Che akaru hina, ¿ha nde?",
          "Che aterere aína"
        ]
      }
    ]
  },
  {
    page: 5,
    kind: "reference",
    blocks: [
      { role: "title", text: "Verbos básicos y conjugación" },
      {
        role: "paragraph",
        text: "Algunos verbos básicos son karu (comer), guata (caminar), japo (hacer), inupã (golpear), ñani(correr) y purahéi (cantar). La estructura del verbo es Prefijo + Raíz del Verbo, y los prefijos varían para cada persona y tiempo."
      },
      {
        role: "conjugation",
        heading: "PRESENTE",
        rows: [
          { pronoun: "Che", form: "Aguata", row: 1 },
          { pronoun: "Nde", form: "Reguata", row: 2 },
          { pronoun: "Ha’e", form: "Oguata", row: 3 },
          { pronoun: "Ñande", form: "Jaguata", row: 4 },
          { pronoun: "Ore", form: "Roguata", row: 5 },
          { pronoun: "Pende", form: "Peguata", row: 6 },
          { pronoun: "Ha’ekuéra", form: "Oguata", row: 6 }
        ]
      }
    ]
  },
  {
    page: 6,
    kind: "reference",
    blocks: [
      { role: "title", text: "Verbos básicos y conjugación" },
      {
        role: "paragraph",
        text: "En el caso de los verbos con raíces nasales como inupã (golpear), ñani(correr), los pronombres “Nde, Ñande y Pende” cambia su estructura a “Ne, Ñane y Pene(o peẽ)” y el caso del pronombre “ñane” su prefijo “Ja” pasa a ser “Ña”."
      },
      {
        role: "conjugation",
        heading: "PRESENTE",
        rows: [
          { pronoun: "Che", form: "Añani", row: 1 },
          { pronoun: "Ne", form: "Reñani", row: 2 },
          { pronoun: "Ha’e", form: "Oñani", row: 3 },
          { pronoun: "Ñane", form: "Ñañani", row: 4 },
          { pronoun: "Ore", form: "Roñani", row: 5 },
          { pronoun: "Pene(Peẽ)", form: "Peñani", row: 6 },
          { pronoun: "Ha’ekuéra", form: "Oñani", row: 6 }
        ]
      }
    ]
  },
  {
    page: 7,
    kind: "dialogue",
    blocks: [
      { role: "title", text: "ÑOMONGETARÃ" },
      {
        role: "lines",
        lines: [
          "¿Mba'éicha héra ha´e?",
          "Ha´e héra Violeta, Violeta ha´e héra Michel",
          "¡Che rory roikuaávo Violeta!",
          "Che rory avei Michel",
          "¿Mboy ary reguereko?",
          "Che aguereko ___ ary, ¿Ha nde?",
          "Aguereko 20 ary"
        ]
      }
    ]
  },
  {
    page: 8,
    kind: "exercise",
    blocks: [
      { role: "title", text: "AMOÑE´Ẽ HA AMBOJOAPY TÉRARÃNGUE OIKOTEVẼVA" },
      {
        role: "items",
        items: [
          { text: "¿Mba'éicha héra ha´e?", answerParts: [], completed: "¿Mba'éicha héra ha´e?" },
          { text: "__ héra Violeta, Violeta ___héra Marcos", answerParts: ["Ha´e", "ha´e"], completed: "Ha´e héra Violeta, Violeta ha´e héra Marcos" },
          { text: "¡___ rory roikuaávo Violeta!", answerParts: ["Che"], completed: "¡Che rory roikuaávo Violeta!" },
          { text: "___ rory avei Marcos", answerParts: ["Che"], completed: "Che rory avei Marcos" },
          { text: "¿Mboy ary __guereko?", answerParts: ["re"], completed: "¿Mboy ary reguereko?" },
          { text: "__ __guereko 26 ary, ¿Ha nde?", answerParts: ["Che", "a"], completed: "Che aguereko 26 ary, ¿Ha nde?" },
          { text: "__guereko 20 ary", answerParts: ["A"], completed: "Aguereko 20 ary" }
        ]
      }
    ]
  },
  {
    page: 9,
    kind: "dialogue",
    blocks: [
      { role: "title", text: "ÑOMONGETARÃ" },
      {
        role: "lines",
        lines: [
          "¿Nde ekaru?",
          "Heẽ, akaru aina, ¿ha nde?",
          "Che akaruse, ¿Marcelo okarúma?",
          "Ha´e okarúma",
          "¿Mba´e tembi´u ojapo?",
          "Ahecha ojapo vori vori",
          "Hetéikoo"
        ]
      }
    ]
  },
  {
    page: 10,
    kind: "exercise",
    blocks: [
      { role: "title", text: "AMOÑE´Ẽ HA AMBOJOAPY" },
      {
        role: "items",
        items: [
          { text: "¿__ ekaru?", answerParts: ["Nde"], completed: "¿Nde ekaru?" },
          { text: "Heẽ, __karu aina, ¿ha nde?", answerParts: ["a"], completed: "Heẽ, akaru aina, ¿ha nde?" },
          { text: "__ __karuse, ¿Marcos __karúma?", answerParts: ["Che", "a", "o"], completed: "Che akaruse, ¿Marcos okarúma?" },
          { text: "___ __karuma", answerParts: ["Ha´e", "o"], completed: "Ha´e okarúma" },
          { text: "¿Mba´e tembi´u _japo?", answerParts: ["o"], completed: "¿Mba´e tembi´u ojapo?" },
          { text: "_hecha __japo vori vori", answerParts: ["A", "o"], completed: "Ahecha ojapo vori vori" },
          { text: "Hetéikoo", answerParts: [], completed: "Hetéikoo" }
        ]
      }
    ]
  },
  {
    page: 11,
    kind: "dialogue",
    blocks: [
      { role: "title", text: "ÑOMONGETARÃ" },
      {
        role: "lines",
        lines: [
          "¿Nde repurahéi?",
          "Heẽ, che apurahéi, ¿ha nde?",
          "Nahániri, apurahéise",
          "Japurahéi oñondive",
          "Oima, japurahéi katu"
        ]
      }
    ]
  },
  {
    page: 12,
    kind: "exercise",
    blocks: [
      { role: "title", text: "AMOÑE´Ẽ HA AMBOJOAPY" },
      {
        role: "items",
        items: [
          { text: "¿__ __purahéi?", answerParts: ["Nde", "re"], completed: "¿Nde repurahéi?" },
          { text: "Heẽ, __ __purahéi, ¿ha nde?", answerParts: ["che", "a"], completed: "Heẽ, che apurahéi, ¿ha nde?" },
          { text: "Nahániri, __purahéise", answerParts: ["a"], completed: "Nahániri, apurahéise" },
          { text: "__purahéi oñondive", answerParts: ["Ja"], completed: "Japurahéi oñondive" },
          { text: "Oima, __purahéi katu", answerParts: ["ja"], completed: "Oima, japurahéi katu" }
        ]
      }
    ]
  }
];

const expectedExerciseRows = EXPECTED_PAGES.flatMap(page => {
  if (page.kind !== "exercise") return [];
  const title = page.blocks.find(block => block.role === "title").text;
  return page.blocks.find(block => block.role === "items").items.flatMap((item, index) => (
    item.answerParts.length ? [{ page: page.page, line: index + 1, title, ...item }] : []
  ));
});

test("las 12 páginas conservan literalmente cada bloque y su orden", () => {
  const material = curriculum.getSourceMaterial("GG-MATERIAL-PRESENT-VERBS-001");
  assert.ok(material);
  assert.deepEqual(plain(material.source), {
    fileName: "NALVI GUARANI CONJUGACIÓN EN TIEMPO PRESENTE.pdf",
    sha256: "9c5034fe75709eaa099cfd65298db1facb49ad163224c5e126ea122e0d5d1a09",
    pageCount: 12,
    suppliedByAuthor: true
  });
  assert.deepEqual(plain(material.pages.map(page => page.page)), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  assert.deepEqual(plain(material.pages), EXPECTED_PAGES);
  assert.deepEqual(plain(curriculum.getSourceMaterialsForLearningObjective("GG-LO-007")), [plain(material)]);
  assert.deepEqual(plain(curriculum.getSourceMaterialsForLearningObjective("GG-LO-999")), []);
});

test("el PDF queda dentro del objetivo de verbos existente y no crea otra ruta", () => {
  const objective = curriculum.getLearningObjective("GG-LO-007");
  assert.equal(curriculum.route.id, "GG-ROUTE-001");
  assert.equal(curriculum.modules.length, 7);
  assert.equal(curriculum.learningObjectives.length, 28);
  assert.equal(objective.moduleId, "GG-MOD-02");
  assert.equal(objective.order, 3);
  assert.deepEqual(plain(objective.conceptIds), ["GG-C-007"]);
  assert.equal(objective.legacyContentRefs[0].legacyUnitIndex, 6);
  assert.deepEqual(plain(objective.sourceMaterialIds), ["GG-MATERIAL-PRESENT-VERBS-001"]);
  assert.equal(curriculum.learningObjectives.filter(item => item.sourceMaterialIds.includes("GG-MATERIAL-PRESENT-VERBS-001")).length, 1);
});

test("los 17 renglones con huecos se proyectan uno a uno sin distractores", () => {
  const objective = curriculum.getLearningObjective("GG-LO-007");
  const activities = curriculum.getActivitiesForLearningObjective("GG-LO-007");
  assert.equal(expectedExerciseRows.length, 17);
  assert.equal(activities.length, 17);
  assert.deepEqual(plain(activities.map(activity => activity.id)), plain(objective.existingDynamicActivityIds));

  activities.forEach((activity, index) => {
    const expected = expectedExerciseRows[index];
    assert.equal(activity.id, `general-u07-verbos-presente-p${String(expected.page).padStart(2, "0")}-l${String(expected.line).padStart(2, "0")}`);
    assert.equal(activity.learningObjectiveId, "GG-LO-007");
    assert.deepEqual(plain(activity.conceptIds), ["GG-C-007"]);
    assert.equal(activity.activityType, "fill-blank");
    assert.equal(activity.type, "fill-blank");
    assert.equal(activity.prompt, expected.title);
    assert.equal(activity.template, expected.text);
    assert.deepEqual(plain(activity.answerParts), expected.answerParts);
    assert.equal(activity.answer, expected.completed);
    assert.equal(activity.correctAnswer, expected.completed);
    assert.deepEqual(plain(activity.acceptedAnswers), [expected.completed]);
    assert.deepEqual(plain(activity.options), []);
    assert.equal(activity.sourceMaterialId, "GG-MATERIAL-PRESENT-VERBS-001");
    assert.equal(activity.sourcePage, expected.page);
    assert.equal(activity.sourceLineOrder, expected.line);
  });
});

test("la proyección conserva evidencia, XP local y bloqueo sin atribuir aprobación normativa", () => {
  const [activity] = curriculum.getActivitiesForLearningObjective("GG-LO-007");
  assert.ok(MASTERY_CONFIG.activityEvidence[activity.activityType] > 0);
  assert.equal(activity.allowedForMastery, false);
  assert.equal(activity.contentValidationStatus, "unreviewed");
  assert.equal(activity.requiresStudentResponse, true);
  assert.equal(activity.answerExposure, "HIDDEN");
  assert.deepEqual(plain(activity.hints), []);

  const profile = createMasteryProfile({
    userId: "verbs-fidelity-student",
    conceptId: activity.conceptIds[0],
    learningObjectiveId: activity.learningObjectiveId,
    requiredSkills: activity.requiredSkills
  }, MASTERY_CONFIG);
  const { profile: after, event } = applyLearningEvent(profile, {
    userId: profile.userId,
    conceptId: activity.conceptIds[0],
    learningObjectiveId: activity.learningObjectiveId,
    activityId: activity.id,
    activityType: activity.activityType,
    skill: activity.skill,
    difficulty: activity.difficulty,
    correct: true,
    attemptNumber: 1,
    responseTime: 5000,
    hintUsed: false,
    timestamp: "2026-09-03T12:00:00.000Z"
  }, MASTERY_CONFIG);
  assert.ok(event.evidenceWeight > 0);
  assert.ok(after.masteryScore > profile.masteryScore);
  assert.equal(evaluateProgressionGate({ correct: false }, { profile: after }).decision, "BLOCK_AND_INTERVENE");
  assert.equal(evaluateProgressionGate({ correct: true }, { profile: after, atObjectiveBoundary: false }).decision, "CONTINUE_PRACTICE");
  const checkpoint = evaluateProgressionGate({ correct: true }, {
    profile: after,
    atObjectiveBoundary: true,
    objectiveEvidence: {
      independentCorrectEvents: 1,
      distinctActivityTypes: 1,
      lastEvidenceIndependentCorrect: true,
      hasPendingRetest: false
    }
  });
  assert.equal(checkpoint.decision, "COMPLETE_OBJECTIVE");
  assert.equal(checkpoint.canComplete, true);
  assert.equal(checkpoint.preservesLongTermMasteryStatus, true);
});

test("la unidad 7 recorre el ejercitario, bloquea el error, suma XP y desbloquea por la compuerta existente", () => {
  const begin = { onclick: null };
  const feedback = { className: "", textContent: "" };
  const action = { onclick: null };
  const actions = {
    innerHTML: "",
    querySelector: selector => selector === "[data-present-verbs-action]" ? action : null
  };
  const body = {
    innerHTML: "",
    querySelector: selector => ({ "#beginQuiz": begin, "#feedback": feedback, ".quiz-actions": actions })[selector] || null
  };
  const progress = { style: { width: "" } };
  const label = { textContent: "" };
  const renderCalls = [];
  const interactive = vm.createContext({
    window: {
      KUAA_ACTIVITY_ENGINE: {
        renderActivity(activity, options) { renderCalls.push({ activity, options }); }
      },
      NALVI_PROGRESSION: {
        evaluateObjectiveCompletion({ objectiveEvidenceOverride }) {
          assert.equal(objectiveEvidenceOverride.expectedActivityCount, 17);
          assert.equal(objectiveEvidenceOverride.completedActivityCount, 17);
          return { decision: "COMPLETE_OBJECTIVE", canComplete: true };
        }
      },
      courseAnalytics() {}
    },
    document: {
      querySelector(selector) {
        return ({ "#lessonBody": body, "#lessonProgress": progress, "#lessonLabel": label })[selector] || null;
      }
    }
  });
  vm.runInContext(`
    let unit = 6;
    let phase = "study";
    let lang = "es";
    let state = { xp: 0, lives: 5, done: [] };
    const UI = { es: { begin: "Comenzar ejercicios", next: "Siguiente", check: "Comprobar", correct: "¡Excelente! Respuesta correcta.", wrong: "No del todo. Probemos de otra forma." } };
    function save() { window.__saveCalls += 1; }
    function renderStudy() { window.__legacyStudyCalls += 1; }
    function renderQuiz() { window.__legacyQuizCalls += 1; }
    function renderGeneralFinishedScreen() { window.__finishedCalls += 1; }
    function finishReaction() { window.__finishReactionCalls += 1; }
    window.__saveCalls = 0;
    window.__legacyStudyCalls = 0;
    window.__legacyQuizCalls = 0;
    window.__finishedCalls = 0;
    window.__finishReactionCalls = 0;
    window.__renderStudy = () => renderStudy();
    window.__setUnit = value => { unit = value; };
    window.__state = () => ({ ...state, done: [...state.done], phase });
  `, interactive);
  vm.runInContext(read("assets/js/kuaa-general-activities.js"), interactive, { filename: "kuaa-general-activities.js" });
  vm.runInContext(read("assets/js/nalvi-guarani-general-route.js"), interactive, { filename: "nalvi-guarani-general-route.js" });

  interactive.window.__renderStudy();
  assert.equal(interactive.window.NALVI_GUARANI_GENERAL_CURRICULUM.presentVerbsExperienceInstalled, true);
  assert.match(body.innerHTML, /GUARANÍ DESDE CERO/);
  assert.match(body.innerHTML, /AMOÑE´Ẽ HA AMBOJOAPY/);
  assert.equal(interactive.window.__legacyStudyCalls, 0);

  begin.onclick();
  assert.equal(renderCalls.length, 1);
  assert.equal(renderCalls[0].activity.id, "general-u07-verbos-presente-p08-l02");
  renderCalls[0].options.onSubmit({ correct: false, progression: { canAdvance: false } });
  assert.deepEqual(plain(interactive.window.__state()), { xp: 0, lives: 4, done: [], phase: "quiz" });
  action.onclick();
  assert.equal(renderCalls.length, 2);
  assert.equal(renderCalls[1].activity.id, renderCalls[0].activity.id);

  for (let index = 0; index < 17; index += 1) {
    const call = renderCalls.at(-1);
    call.options.onSubmit({ correct: true, progression: { canAdvance: true } });
    action.onclick();
  }
  assert.deepEqual(plain(interactive.window.__state()), { xp: 170, lives: 4, done: [6], phase: "finished" });
  assert.equal(interactive.window.__finishedCalls, 1);
  assert.equal(interactive.window.__finishReactionCalls, 1);

  interactive.window.__setUnit(0);
  interactive.window.__renderStudy();
  assert.equal(interactive.window.__legacyStudyCalls, 1);
});

test("el catálogo conserva tres actividades y registra el nuevo hash de las correcciones directas", () => {
  const activitySource = read("assets/js/kuaa-general-activities.js");
  const activityHash = createHash("sha256").update(activitySource.replace(/\r\n?/g, "\n")).digest("hex");
  assert.equal(activityHash, "1000e98448051acc6b0e4d18a0d4584a7877ae95247841b59ff4dc47823fafe2");
  assert.equal(context.window.KUAA_GENERAL_ACTIVITY_DATA.activities.length, 3);
  assert.equal(curriculum.audit().inheritedDynamicActivities, 3);
  assert.equal(curriculum.audit().canonicalVerbActivities, 17);
  assert.equal(curriculum.audit().dynamicActivitiesLinked, 20);
});
