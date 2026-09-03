import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { selectFirstValidCandidate } from "../../activity-catalog/nalvi-activity-quality.mjs";
import { classifyError, createActivityFingerprint } from "../../intervention-engine/intervention-engine.mjs";
import { buildDeterministicFallbackCandidates } from "../fallback-intervention.mjs";
import { evaluateProgressionGate } from "../progression-gate.mjs";

const mother = {
  id: "mother-question",
  conceptId: "family-mother",
  conceptIds: ["family-mother"],
  learningObjectiveId: "GG-LO-FAMILY",
  type: "multiple-choice",
  activityType: "multiple-choice",
  skill: "vocabulary",
  difficulty: "foundation-1",
  prompt: { es: "¿Cómo se dice mamá?", en: "How do you say mom?" },
  options: [{ id: "mother", label: "sy" }, { id: "father", label: "ru" }, { id: "child", label: "mitã" }],
  correctOptionId: "mother"
};

const approvedMotherFixture = Object.freeze({
  sourcePath: "versions/index-NALVI-P5-stable.html",
  authorized: true,
  options: [
    { id: "mother", text: "Sy", authorized: true, stableRef: { unitIndex: 4, vocabIndex: 0 } },
    { id: "father", text: "Ru", authorized: true, stableRef: { unitIndex: 4, vocabIndex: 1 } },
    { id: "child", text: "Mitã", authorized: true, stableRef: { unitIndex: 4, vocabIndex: 2 } },
    { id: "unapproved-grandmother", text: "Jarýi", authorized: false, stableRef: { unitIndex: 4, vocabIndex: 3 } }
  ],
  pairs: [
    { id: "mother", left: "Sy", right: "Madre", authorized: true, stableRef: { unitIndex: 4, vocabIndex: 0 } },
    { id: "father", left: "Ru", right: "Padre", authorized: true, stableRef: { unitIndex: 4, vocabIndex: 1 } },
    { id: "child", left: "Mitã", right: "Niño/a", authorized: true, stableRef: { unitIndex: 4, vocabIndex: 2 } },
    { id: "unapproved-grandmother", left: "Jarýi", right: "Abuela", authorized: false, stableRef: { unitIndex: 4, vocabIndex: 3 } }
  ],
  contexts: [
    {
      es: "Che sy = mi madre. Nde ru = tu padre. Che reindy = mi hermana (dicho por un hombre); che ryke’y = mi hermano mayor (dicho por un hombre).",
      authorized: true,
      stableRef: { unitIndex: 4, field: "key" }
    },
    {
      es: "Mba’éichapa no es solamente «hola»: pregunta «¿cómo estás?». Maitei funciona como saludo, mientras que jajotopata expresa «nos vemos».",
      authorized: false,
      stableRef: { unitIndex: 0, field: "key" }
    }
  ]
});

function stableP5GeneralUnits(sourcePath) {
  assert.equal(sourcePath, "versions/index-NALVI-P5-stable.html", "La fixture no refiere el artefacto estable aprobado.");
  const stableHtml = readFileSync(new URL(`../../${sourcePath}`, import.meta.url), "utf8");
  const declarationStart = stableHtml.indexOf("const U=[");
  const valueStart = stableHtml.indexOf("[", declarationStart);
  const valueEnd = stableHtml.indexOf("];\nconst quizBase", valueStart);
  assert.ok(declarationStart >= 0 && valueStart > declarationStart && valueEnd > valueStart, "No se pudo resolver la fuente estable P5 de Guaraní General.");
  return vm.runInNewContext(`(${stableHtml.slice(valueStart, valueEnd + 1)})`);
}

function filterAlreadyAuthorizedMaterial(source) {
  if (source?.authorized !== true) return { options: [], pairs: [], contexts: [] };
  return {
    options: source.options.filter(item => item.authorized === true),
    pairs: source.pairs.filter(item => item.authorized === true),
    contexts: source.contexts.filter(item => item.authorized === true)
  };
}

function assertApprovedMaterialMatchesStableSource(source) {
  const stableUnits = stableP5GeneralUnits(source.sourcePath);
  for (const option of source.options) {
    const [, stableTerm] = stableUnits[option.stableRef.unitIndex]?.vocab?.[option.stableRef.vocabIndex] || [];
    assert.equal(option.text, stableTerm, `${option.id} no coincide con el término de P5.`);
  }
  for (const pair of source.pairs) {
    const [, stableTerm, stableMeaning] = stableUnits[pair.stableRef.unitIndex]?.vocab?.[pair.stableRef.vocabIndex] || [];
    assert.equal(pair.left, stableTerm, `${pair.id} no coincide con el término de P5.`);
    assert.equal(pair.right, stableMeaning, `${pair.id} no coincide con el significado de P5.`);
  }
  for (const context of source.contexts) {
    assert.equal(context.es, stableUnits[context.stableRef.unitIndex]?.[context.stableRef.field], "El contexto no coincide con P5.");
  }
}

function executeTwoIncorrectAnswersInGeneralUi() {
  const html = readFileSync(new URL("../../index.html", import.meta.url), "utf8");
  const buildMarker = html.indexOf("/* GCA45 · flujo sucesivo y dominio de errores en todos los cursos */");
  const iifeStart = html.indexOf("(()=>{", buildMarker);
  const nextCourseMarker = html.indexOf("/* POLICÍA: cola de preguntas falladas y continuación sucesiva. */", iifeStart);
  assert.ok(buildMarker >= 0 && iifeStart > buildMarker && nextCourseMarker > iifeStart, "No se encontró el flujo general GCA45 ejecutable.");
  const generalFlowBody = html.slice(iifeStart + "(()=>{".length, nextCourseMarker);
  const executableGeneralFlow = `(()=>{${generalFlowBody}
    window.__NALVI_QA_GENERAL_FLOW__={
      render:()=>renderQuiz(),
      snapshot:()=>({
        queue:[...generalQueue],queuePos:generalQueuePos,queueUnit:generalQueueUnit,
        unit,step,xp:state.xp,lives:state.lives,
        completionAuthorized:generalCompletionAuthorized,
        learningObjectiveId:lastGeneralActivity?.learningObjectiveId||"",
        advanceHandlerInstalled:typeof $("#check")?.onclick==="function",
        checkButtonHidden:Boolean($("#check")?.hidden)
      })
    };
  })();`;

  const dispatchedEvents = [];
  const diagnostics = [];
  const evaluatedProgressions = [];
  let completionEvaluations = 0;
  let activityEvaluations = 0;
  let finishCalls = 0;
  let saveCalls = 0;
  let answerElements = [];
  const elements = new Map();
  const makeElement = () => ({
    dataset: {},
    style: {},
    className: "",
    textContent: "",
    disabled: false,
    hidden: false,
    onclick: null,
    classList: { add() {}, remove() {}, contains() { return false; } }
  });
  const lessonBody = makeElement();
  Object.defineProperty(lessonBody, "innerHTML", {
    configurable: true,
    get() { return this.value || ""; },
    set(value) {
      this.value = String(value);
      elements.set("#check", makeElement());
      elements.set("#feedback", makeElement());
      answerElements = [...this.value.matchAll(/class="answer" data-a="([^"]*)"/g)].map(match => {
        const element = makeElement();
        element.dataset.a = match[1];
        return element;
      });
    }
  });
  elements.set("#lessonBody", lessonBody);
  elements.set("#lessonProgress", makeElement());
  elements.set("#lessonLabel", makeElement());

  const listeners = new Map();
  class TestCustomEvent {
    constructor(type, init = {}) { this.type = type; this.detail = init.detail; }
  }
  const sandbox = {
    document: {
      documentElement: { dataset: {} },
      querySelectorAll(selector) { return selector.includes(".answer") ? answerElements : []; }
    },
    CustomEvent: TestCustomEvent,
    clearTimeout() {},
    setTimeout() { return 1; },
    console,
    unit: 0,
    step: 0,
    checked: false,
    selected: "",
    phase: "quiz",
    state: { xp: 40, lives: 5 },
    U: [{}, {}],
    lang: "es",
    UI: { es: { practice: "Práctica", check: "Comprobar", correct: "Correcto", wrong: "Incorrecto", next: "Siguiente", finish: "Fin", earned: "Ganaste", return: "Volver" } },
    quizData: () => [["¿Cómo se dice mamá?", "sy", ["sy", "ru", "mitã"]]],
    title: () => "Familia",
    $: selector => elements.get(selector) || null,
    renderStudy() {},
    finish() { finishCalls += 1; },
    save() { saveCalls += 1; },
    playReaction() {},
    animateExerciseReaction() {},
    renderUnits() {},
    show() {},
    scrollTo() {},
    addEventListener(type, listener) {
      const values = listeners.get(type) || [];
      values.push(listener);
      listeners.set(type, values);
    },
    dispatchEvent(event) {
      dispatchedEvents.push(event);
      for (const listener of listeners.get(event.type) || []) listener(event);
      return true;
    },
    NALVI_GUARANI_GENERAL_CURRICULUM: {
      getLearningObjectiveForLegacyUnit: () => ({ id: mother.learningObjectiveId, conceptIds: mother.conceptIds, skills: [mother.skill], difficulty: mother.difficulty })
    },
    KUAA_GENERAL_ACTIVITY_DATA: { activities: [{ ...mother, legacy: { unit: 0, question: 0 } }] },
    NALVI_PROGRESSION: {
      evaluateActivityResult({ activity, result }) {
        activityEvaluations += 1;
        const progression = evaluateProgressionGate(result, {
          activityType: activity.activityType || activity.type,
          profile: { status: "MASTERED" },
          atObjectiveBoundary: true
        });
        evaluatedProgressions.push(progression);
        return progression;
      },
      evaluateObjectiveCompletion() {
        completionEvaluations += 1;
        return { decision: "CONTINUE_PRACTICE", canComplete: false };
      },
      diagnostic(event) { diagnostics.push(event); }
    },
    NALVI_INTERVENTION: { hasPendingRetest: () => false }
  };
  sandbox.window = sandbox;
  vm.runInContext(executableGeneralFlow, vm.createContext(sandbox), { filename: "index-gca45-general-flow.js" });

  const flow = sandbox.__NALVI_QA_GENERAL_FLOW__;
  const clickIncorrectAnswer = () => {
    const answer = answerElements.find(element => element.dataset.a !== "sy");
    assert.equal(typeof answer?.onclick, "function", "La opción incorrecta no recibió su interacción real.");
    answer.onclick();
    const check = elements.get("#check");
    assert.equal(check?.disabled, false, "La selección no habilitó la comprobación.");
    assert.equal(typeof check?.onclick, "function", "El botón de comprobación no recibió su interacción real.");
    check.onclick();
  };
  flow.render();
  const before = flow.snapshot();
  clickIncorrectAnswer();
  const afterFirst = flow.snapshot();
  flow.render();
  clickIncorrectAnswer();
  const afterSecond = flow.snapshot();
  return { before, afterFirst, afterSecond, activityEvaluations, evaluatedProgressions, completionEvaluations, finishCalls, saveCalls, diagnostics, dispatchedEvents };
}

test("respuesta incorrecta siempre bloquea, incluso sin OpenAI", () => {
  for (const activityType of ["multiple-choice", "listening", "matching", "order-sentence", "fill-blank", "writing"]) {
    const gate = evaluateProgressionGate({ correct: false }, { activityType, profile: { status: "MASTERED" }, atObjectiveBoundary: true });
    assert.equal(gate.decision, "BLOCK_AND_INTERVENE");
    assert.equal(gate.canAdvance, false);
    assert.equal(gate.canComplete, false);
  }
});

test("mamá: dos errores permanecen bloqueados y producen actividades aceptadas distintas", () => {
  assertApprovedMaterialMatchesStableSource(approvedMotherFixture);
  assert.deepEqual(filterAlreadyAuthorizedMaterial({ ...approvedMotherFixture, authorized: false }), { options: [], pairs: [], contexts: [] });
  const approvedActivityMaterial = filterAlreadyAuthorizedMaterial(approvedMotherFixture);
  assert.equal(approvedActivityMaterial.options.length, 3);
  assert.equal(approvedActivityMaterial.pairs.length, 3);
  assert.equal(approvedActivityMaterial.contexts.length, 1);
  assert.ok(Object.values(approvedActivityMaterial).flat().every(item => item.authorized === true));
  const context = {
    activity: mother,
    conceptId: mother.conceptId,
    learningObjectiveId: mother.learningObjectiveId,
    currentSkill: mother.skill,
    activityType: mother.type,
    difficulty: mother.difficulty,
    correctAnswer: "sy",
    uiLocale: "es",
    lexemeIds: [],
    grammarRuleIds: [],
    approvedActivityMaterial
  };
  const original = createActivityFingerprint(mother, { uiLocale: "es" });
  const firstGate = evaluateProgressionGate({ correct: false }, {
    activityType: mother.type,
    profile: { status: "MASTERED" },
    atObjectiveBoundary: true
  });
  const firstSelection = selectFirstValidCandidate(
    buildDeterministicFallbackCandidates(context, 1, "SEMANTIC_CONFUSION"),
    { ...context, attemptNumber: 1, errorType: "SEMANTIC_CONFUSION" }
  );
  assert.equal(firstSelection.accepted, true);
  const first = firstSelection.candidate.activity;
  const firstFingerprint = createActivityFingerprint(first, { uiLocale: "es" });
  const secondContext = {
    ...context,
    activity: first,
    activityType: first.type,
    attemptNumber: 2,
    studentAnswer: "respuesta-incorrecta",
    recentActivities: [{ activityType: first.activityType, fingerprint: firstFingerprint }],
    recentActivityFingerprints: [firstFingerprint],
    previousActivityFingerprint: firstFingerprint
  };
  const secondErrorType = classifyError({ ...secondContext, correct: false }).errorType;
  const secondGate = evaluateProgressionGate({ correct: false }, {
    activityType: first.type,
    profile: { status: "MASTERED" },
    atObjectiveBoundary: true
  });
  const secondSelection = selectFirstValidCandidate(
    buildDeterministicFallbackCandidates(secondContext, 2, secondErrorType),
    { ...secondContext, errorType: secondErrorType }
  );
  assert.equal(secondSelection.accepted, true);
  const second = secondSelection.candidate.activity;
  const secondFingerprint = createActivityFingerprint(second, { uiLocale: "es" });

  for (const gate of [firstGate, secondGate]) {
    assert.equal(gate.decision, "BLOCK_AND_INTERVENE");
    assert.equal(gate.canAdvance, false);
    assert.equal(gate.canComplete, false);
  }
  assert.equal(first.learningObjectiveId, mother.learningObjectiveId);
  assert.equal(second.learningObjectiveId, mother.learningObjectiveId);
  assert.notEqual(first.prompt, mother.prompt.es);
  assert.notEqual(first.type, mother.type);
  assert.notEqual(second.type, first.type);
  assert.notEqual(firstFingerprint, original);
  assert.notEqual(secondFingerprint, firstFingerprint);
  assert.doesNotMatch(JSON.stringify([first, second]), /Jarýi|Abuela|Mba’éichapa no es solamente/);

  const ui = executeTwoIncorrectAnswersInGeneralUi();
  for (const snapshot of [ui.afterFirst, ui.afterSecond]) {
    assert.equal(snapshot.xp, ui.before.xp);
    assert.equal(snapshot.unit, ui.before.unit);
    assert.equal(snapshot.step, ui.before.step);
    assert.equal(snapshot.queuePos, ui.before.queuePos);
    assert.equal(snapshot.queueUnit, ui.before.queueUnit);
    assert.deepEqual(Array.from(snapshot.queue), Array.from(ui.before.queue));
    assert.equal(snapshot.learningObjectiveId, mother.learningObjectiveId);
    assert.equal(snapshot.completionAuthorized, false);
    assert.equal(snapshot.advanceHandlerInstalled, false);
    assert.equal(snapshot.checkButtonHidden, true);
  }
  assert.equal(ui.afterFirst.lives, ui.before.lives - 1);
  assert.equal(ui.afterSecond.lives, ui.before.lives - 2);
  assert.equal(ui.finishCalls, 0);
  assert.equal(ui.activityEvaluations, 2);
  assert.ok(ui.evaluatedProgressions.every(progression => progression.decision === "BLOCK_AND_INTERVENE" && progression.canAdvance === false && progression.canComplete === false));
  assert.equal(ui.completionEvaluations, 0);
  assert.equal(ui.saveCalls, 2);
  assert.equal(ui.diagnostics.includes("NEXT_OBJECTIVE_UNLOCKED"), false);
  const incorrectEvents = ui.dispatchedEvents.filter(event => event.type === "nalvi:legacy-answer-scored");
  assert.equal(incorrectEvents.length, 2);
  assert.ok(incorrectEvents.every(event => event.detail.result.correct === false));
  assert.ok(incorrectEvents.every(event => event.detail.progression.decision === "BLOCK_AND_INTERVENE"));
});

test("acierto guiado es evidencia parcial y no completa", () => {
  const gate = evaluateProgressionGate({ correct: true, hintUsed: true }, { guided: true, atObjectiveBoundary: true, profile: { status: "MASTERED" } });
  assert.equal(gate.decision, "CONTINUE_PRACTICE");
  assert.equal(gate.canComplete, false);
});

test("MASTERED completa y un checkpoint independiente puede cerrar práctica sin falsificar retención", () => {
  const incomplete = evaluateProgressionGate({ correct: true }, { atObjectiveBoundary: true, profile: { status: "PRACTICING" } });
  const mastered = evaluateProgressionGate({ correct: true }, { atObjectiveBoundary: true, profile: { status: "MASTERED" } });
  const checkpoint = evaluateProgressionGate({ correct: true }, {
    atObjectiveBoundary: true,
    profile: { status: "PRACTICING" },
    objectiveEvidence: {
      independentCorrectEvents: 1,
      distinctActivityTypes: 1,
      lastEvidenceIndependentCorrect: true,
      hasPendingRetest: false
    }
  });
  assert.equal(incomplete.decision, "CONTINUE_PRACTICE");
  assert.equal(mastered.decision, "COMPLETE_OBJECTIVE");
  assert.equal(mastered.canComplete, true);
  assert.equal(checkpoint.decision, "COMPLETE_OBJECTIVE");
  assert.equal(checkpoint.reason, "objectivePracticeCheckpointSatisfied");
  assert.equal(checkpoint.preservesLongTermMasteryStatus, true);
});

test("checkpoint no completa si la recuperación sigue pendiente o la última evidencia fue guiada", () => {
  const base = {
    atObjectiveBoundary: true,
    profile: { status: "PRACTICING" },
    objectiveEvidence: { independentCorrectEvents: 1, distinctActivityTypes: 1, lastEvidenceIndependentCorrect: true, hasPendingRetest: false }
  };
  assert.equal(evaluateProgressionGate({ correct: true }, { ...base, objectiveEvidence: { ...base.objectiveEvidence, hasPendingRetest: true } }).canComplete, false);
  assert.equal(evaluateProgressionGate({ correct: true }, { ...base, objectiveEvidence: { ...base.objectiveEvidence, lastEvidenceIndependentCorrect: false } }).canComplete, false);
});

test("salir nunca equivale a completar", () => {
  assert.equal(evaluateProgressionGate({ correct: true }, { intent: "leave", profile: { status: "MASTERED" } }).decision, "EXIT_WITHOUT_COMPLETION");
});
