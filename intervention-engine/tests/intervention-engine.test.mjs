import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import {
  canScoreWithoutAI,
  createActivityFingerprint,
  planPedagogicalIntervention,
  wouldAIImproveIntervention
} from "../intervention-engine.mjs";
import { INTERVENTION_CONFIG } from "../intervention-config.mjs";
import { createInterventionService } from "../../server/intervention-service.mjs";
import { applyLearningEvent, createMasteryProfile } from "../../mastery-engine/mastery-engine.mjs";

const masteryConfig = JSON.parse(await readFile(new URL("../../mastery-engine/mastery-config.json", import.meta.url), "utf8"));
const localized = text => Object.fromEntries(INTERVENTION_CONFIG.uiLocales.map(language => [language, text]));
const motherBase = {
  id: "mother-question",
  conceptId: "family-mother",
  conceptIds: ["family-mother"],
  learningObjectiveId: "family-1",
  type: "multiple-choice",
  activityType: "multiple-choice",
  skill: "vocabulary",
  difficulty: "foundation-1",
  prompt: localized("¿Cómo se dice mamá?"),
  options: [
    { id: "sy", label: "Sy" },
    { id: "ru", label: "Ru" },
    { id: "mita", label: "Mitã" }
  ],
  correctOptionId: "sy",
  correctAnswer: "Sy",
  acceptedAnswers: ["Sy"],
  lexemeIds: ["LEX-SY"],
  grammarRuleIds: [],
  sourceIds: []
};
const motherAudio = {
  ...motherBase,
  id: "mother-audio-image",
  type: "listening",
  skill: "listening",
  prompt: localized("Escucha y elige la palabra que corresponde a la imagen de una madre."),
  instruction: localized("Usa la imagen y el audio como apoyo."),
  audioText: "Sy",
  image: "fixture://mother-image"
};
const motherMatching = {
  ...motherBase,
  id: "mother-matching",
  type: "matching",
  prompt: localized("Relaciona cada integrante de la familia."),
  options: [],
  pairs: [{ id: "mother", left: "Sy", right: localized("mamá") }, { id: "father", left: "Ru", right: localized("papá") }]
};
const motherFill = {
  ...motherBase,
  id: "mother-guided-fill",
  type: "fill-blank",
  skill: "writing",
  prompt: localized("Completa la frase guiada."),
  template: localized("Mi mamá: {{blank}}"),
  acceptedAnswers: ["Sy"],
  options: []
};
const pool = [motherBase, motherAudio, motherMatching, motherFill];

const INTERVENTION_ACTIVITY_AUTHORITY = Object.freeze({
  resolve({ activityId, uiLocale = "es" } = {}) {
    if (activityId !== motherBase.id || !INTERVENTION_CONFIG.uiLocales.includes(uiLocale)) return null;
    const sourceActivity = structuredClone(motherBase);
    return {
      sourceActivity,
      correctAnswer: "Sy",
      knowledgeIds: ["LEX-SY"],
      approvedActivityMaterial: {
        options: sourceActivity.options.map(option => ({ id: option.id, text: option.label, authorized: true })),
        correctOptionId: sourceActivity.correctOptionId,
        correctAnswer: "Sy",
        acceptedAnswers: ["Sy"],
        pairs: [],
        contexts: [],
        categories: [],
        items: [],
        dialogue: [],
        dialogueOptions: [],
        dialogueCorrectOptionId: "",
        dialogueCorrectAnswer: "",
        dialogueSourceContentId: "",
        audio: null
      }
    };
  },
  listByLearningObjective({ learningObjectiveId, uiLocale = "es" } = {}) {
    return learningObjectiveId === motherBase.learningObjectiveId && INTERVENTION_CONFIG.uiLocales.includes(uiLocale)
      ? [structuredClone(motherBase)]
      : [];
  }
});

const contextFor = (activity, changes = {}) => ({
  correct: false,
  conceptId: "family-mother",
  learningObjectiveId: "family-1",
  currentSkill: activity.skill,
  activityType: activity.type,
  difficulty: "foundation-1",
  studentAnswer: "Ru",
  correctAnswer: "Sy",
  attemptNumber: 1,
  recentErrors: [],
  recentActivities: [],
  recentActivityFingerprints: [],
  modalitiesAlreadyUsed: [activity.type],
  recentInterventions: [],
  hintHistory: [],
  retentionHistory: [],
  uiLocale: "es",
  grammarRuleIds: [],
  lexemeIds: ["LEX-SY"],
  knowledgeIds: ["LEX-SY"],
  activity,
  availableActivities: pool,
  ...changes
});

test("separa puntuación local de mejora pedagógica posterior", () => {
  const context = contextFor(motherBase, { availableActivities: [] });
  assert.equal(canScoreWithoutAI(context), true);
  const plan = planPedagogicalIntervention(context);
  assert.equal(wouldAIImproveIntervention(context, plan), true);
});

test("el primer error puede justificar IA aunque ya exista una actividad local distinta", () => {
  const context = contextFor(motherBase, {
    activityType: "speaking",
    currentSkill: "reading",
    studentAnswer: "respuesta distante",
    availableActivities: pool
  });
  const plan = planPedagogicalIntervention(context);
  assert.ok(plan.nextActivity, "Debe existir una alternativa local segura antes de evaluar IA.");
  assert.equal(plan.diagnosis.errorType, "UNKNOWN_ERROR");
  assert.equal(wouldAIImproveIntervention(context, plan), true);
});

test("la huella cambia por modalidad, prompt, opciones, respuesta, media y contexto", () => {
  const base = createActivityFingerprint(motherBase, { uiLocale: "es" });
  assert.notEqual(base, createActivityFingerprint(motherAudio, { uiLocale: "es" }));
  assert.notEqual(base, createActivityFingerprint({ ...motherBase, prompt: localized("Otra instrucción") }, { uiLocale: "es" }));
  assert.notEqual(base, createActivityFingerprint({ ...motherBase, image: "fixture://new" }, { uiLocale: "es" }));
});

test("mamá: primer, segundo y tercer ejercicio usan huellas y estrategias distintas", () => {
  const firstContext = contextFor(motherBase), first = planPedagogicalIntervention(firstContext);
  assert.equal(first.nextActivity.id, motherAudio.id);
  assert.notEqual(first.previousFingerprint, first.nextFingerprint);
  assert.notEqual(first.nextActivity.prompt.es, motherBase.prompt.es);

  const secondContext = contextFor(motherAudio, {
    attemptNumber: 2,
    recentActivityFingerprints: [first.previousFingerprint, first.nextFingerprint],
    recentErrors: [{ conceptId: "family-mother", errorType: first.errorType }],
    recentInterventions: [{ strategy: first.strategy, errorType: first.errorType }]
  });
  const second = planPedagogicalIntervention(secondContext);
  assert.equal(second.nextActivity.id, motherMatching.id);
  assert.notEqual(second.nextFingerprint, first.nextFingerprint);
  assert.notEqual(second.strategy, first.strategy);

  const thirdContext = contextFor(motherMatching, {
    attemptNumber: 3,
    recentActivityFingerprints: [first.previousFingerprint, first.nextFingerprint, second.nextFingerprint],
    recentErrors: [{ conceptId: "family-mother", errorType: first.errorType }, { conceptId: "family-mother", errorType: second.errorType }],
    recentInterventions: [{ strategy: first.strategy }, { strategy: second.strategy }]
  });
  const third = planPedagogicalIntervention(thirdContext);
  assert.equal(third.nextActivity.id, motherFill.id);
  assert.notEqual(third.nextFingerprint, second.nextFingerprint);
  assert.equal(new Set([first.nextFingerprint, second.nextFingerprint, third.nextFingerprint]).size, 3);
});

test("dos estudiantes con debilidades distintas reciben modalidades distintas", () => {
  const studentA = planPedagogicalIntervention(contextFor(motherAudio, { currentSkill: "listening" }));
  const studentB = planPedagogicalIntervention(contextFor(motherFill, { currentSkill: "writing" }));
  assert.notEqual(studentA.nextActivityType, studentB.nextActivityType);
  assert.notEqual(studentA.errorType, studentB.errorType);
});

test("una recuperación guiada actualiza Mastery con evidencia penalizada, no equivalente a independencia", () => {
  let profile = createMasteryProfile({ userId: "student", conceptId: "family-mother", learningObjectiveId: "family-1", requiredSkills: ["vocabulary", "listening"] }, masteryConfig);
  const failed = applyLearningEvent(profile, {
    userId: "student", conceptId: "family-mother", learningObjectiveId: "family-1", activityId: "mother-question",
    activityType: "multiple-choice", skill: "vocabulary", difficulty: "foundation-1", correct: false,
    attemptNumber: 1, responseTime: 8000, hintUsed: false, timestamp: "2026-08-28T10:00:00.000Z"
  }, masteryConfig);
  profile = failed.profile;
  const plan = planPedagogicalIntervention(contextFor(motherBase));
  const recovered = applyLearningEvent(profile, {
    userId: "student", conceptId: "family-mother", learningObjectiveId: "family-1", activityId: plan.nextActivity.id,
    activityType: "listening", skill: "listening", difficulty: "foundation-1", correct: true,
    attemptNumber: 2, responseTime: 11000, hintUsed: true, timestamp: "2026-08-28T10:04:00.000Z"
  }, masteryConfig);
  assert.ok(recovered.profile.masteryScore > failed.profile.masteryScore);
  assert.ok(recovered.event.performanceFactors.attempt < 1);
  assert.ok(recovered.event.performanceFactors.hint < 1);
  assert.equal(plan.evidencePolicy.independentRecoveryRequiredForStrongEvidence, true);
});

test("IA solo mejora selección con conocimiento experto y no recibe identidad personal", async () => {
  let requestBody = null, persisted = null;
  const service = createInterventionService({
    activityAuthority: INTERVENTION_ACTIVITY_AUTHORITY,
    corpusRecords: [{ id: "LEX-SY", validationStatus: "expertVerified", allowedForGeneration: true, recordType: "lexeme", lemma: "sy" }],
    env: { OPENAI_API_KEY: "test-only", OPENAI_MODEL: "test-model", OPENAI_INPUT_COST_PER_1M: "1", OPENAI_OUTPUT_COST_PER_1M: "2" },
    fetchImpl: async (_url, options) => {
      requestBody = JSON.parse(options.body);
      return { ok: true, json: async () => ({ output_text: JSON.stringify({ errorType: "SEMANTIC_CONFUSION", strategy: "USE_CONTEXT", rationale: "Cambiar a un contexto familiar guiado." }), usage: { input_tokens: 100, output_tokens: 20 } }) };
    },
    persistEvent: async payload => { persisted = payload; return { status: "persisted", path: "users/student/learningEvents/test" }; }
  });
  const result = await service.planIntervention({ ...contextFor(motherBase, { availableActivities: [] }), fullName: "No enviar", email: "private@example.com", institution: "Privada" }, { verifiedUserId: "student" });
  assert.equal(result.canScoreWithoutAI, true);
  assert.equal(result.wouldAIImproveIntervention, true);
  assert.equal(result.usedAI, true);
  assert.equal(result.plan.strategy, "USE_CONTEXT");
  assert.equal(result.persistence.status, "persisted");
  assert.equal(persisted.event.eventKind, "pedagogicalIntervention");
  assert.equal(persisted.event.logicalCollection, "interventionEvents");
  const serialized = JSON.stringify(requestBody);
  assert.ok(!serialized.includes("private@example.com"));
  assert.ok(!serialized.includes("No enviar"));
  assert.ok(!serialized.includes("Privada"));
});

test("sin conocimiento autorizado o si OpenAI falla, el plan local sigue funcionando", async () => {
  let calls = 0;
  const noAuthority = createInterventionService({
    activityAuthority: INTERVENTION_ACTIVITY_AUTHORITY,
    corpusRecords: [],
    env: { OPENAI_API_KEY: "test" },
    fetchImpl: async () => { calls += 1; throw new Error("no debe llamar"); }
  });
  const result = await noAuthority.planIntervention(contextFor(motherBase, { availableActivities: [] }), { verifiedUserId: "student" });
  assert.equal(result.ok, true);
  assert.equal(result.usedAI, false);
  assert.equal(calls, 0);
  assert.equal(result.aiReason, "NO_AUTHORIZED_KNOWLEDGE_LOCAL_FALLBACK");
});

test("mantiene exactamente los seis idiomas de interfaz", () => {
  assert.deepEqual(INTERVENTION_CONFIG.uiLocales, ["es", "en", "pt", "fr", "it", "de"]);
});
