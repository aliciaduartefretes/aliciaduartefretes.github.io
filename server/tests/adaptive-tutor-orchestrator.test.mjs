import test from "node:test";
import assert from "node:assert/strict";
import { createActivityFingerprint } from "../../intervention-engine/intervention-engine.mjs";
import { createAdaptiveTutorOrchestrator, createProfessionalFallbackPlan } from "../adaptive-tutor-orchestrator.mjs";

function context(overrides = {}) {
  const activity = {
    id: "family-mother-choice", conceptId: "family-mother", type: "multiple-choice",
    skill: "vocabulary", difficulty: "foundation-1", instruction: "Selecciona la respuesta.",
    prompt: "¿Cómo se dice mamá?", options: [
      { id: "sy", label: "sy" }, { id: "ru", label: "ru" }, { id: "oga", label: "óga" }
    ], correctOptionId: "sy"
  };
  return {
    correct: false, conceptId: "family-mother", learningObjectiveId: "GG-LO-FAMILY",
    currentSkill: "vocabulary", activityType: "multiple-choice", difficulty: "foundation-1",
    studentAnswer: "ru", correctAnswer: "sy", attemptNumber: 1, recentErrors: [],
    recentActivityFingerprints: [], modalitiesAlreadyUsed: ["multiple-choice"], hintHistory: [],
    retentionHistory: [], strategyEffectiveness: {}, uiLocale: "es", grammarRuleIds: [],
    lexemeIds: [], knowledgeIds: [], activity,
    previousActivityFingerprint: createActivityFingerprint(activity, { uiLocale: "es" }),
    fullName: "Private Student", email: "private@example.com", institution: "Private School",
    administrativeRole: "student", ...overrides
  };
}

function validPlan(overrides = {}) {
  return {
    planVersion: "NALVI-TUTOR-1", planId: "plan-family-mother-1", conceptId: "family-mother",
    linguisticMode: "LESSON_BOUNDED",
    diagnosis: { errorType: "SEMANTIC_CONFUSION", likelyDifficulty: "meaning contrast", confidence: 0.84, prerequisiteGap: null, skillAffected: "vocabulary" },
    pedagogicalGoal: "Recognise the same validated lesson item through listening.",
    strategy: { primaryStrategy: "CHANGE_MODALITY", secondaryStrategy: "USE_AUDIO", reasonCode: "recognition-to-listening" },
    studentFeedback: { locale: "es", shortMessage: "No del todo. Probemos de otra forma." },
    activities: [{
      id: "listen-family-mother", activityType: "listening", skill: "listening", difficulty: "foundation-1",
      helpLevel: 0, answerExposure: "HIDDEN", requiresStudentResponse: true,
      instruction: "Escucha y selecciona la expresión trabajada.", prompt: "Reconoce la expresión por su sonido.",
      options: [{ id: "ru", text: "ru" }, { id: "oga", text: "óga" }, { id: "sy", text: "sy" }],
      pairs: [], tokens: [], media: { type: "audio", value: "sy", alt: "Audio de la expresión", sourceId: "lesson-bounded" },
      hints: [], explanation: "", correctAnswer: "sy", conceptIds: ["family-mother"], lexemeIds: [],
      grammarRuleIds: [], sourceIds: [], fingerprintSeed: "listen-family-mother-v1"
    }],
    progressionPolicy: { onIncorrect: "BLOCK_AND_INTERVENE", onGuidedCorrect: "CONTINUE_PRACTICE", requiresIndependentRetest: true, maxInterventionsBeforeDefer: 4 },
    fallbackPolicy: { strategy: "PROFESSIONAL_LOCAL_TEMPLATE", reason: "server-unavailable" },
    validationMetadata: { sourceIds: [], knowledgeIds: [], claimedRiskLevel: "GREEN" },
    ...overrides
  };
}

const response = value => ({ ok: true, json: async () => ({ output_text: JSON.stringify(value), usage: { input_tokens: 80, output_tokens: 120 } }) });

test("orquestador: planner + critic aceptan un plan estructurado y sin PII", async () => {
  const calls = [];
  const persisted = [];
  const fetchImpl = async (_url, options) => {
    const body = JSON.parse(options.body); calls.push(body);
    assert.equal(body.store, false);
    assert.equal(body.text.format.strict, true);
    assert.doesNotMatch(body.input, /Private Student|private@example\.com|Private School|administrativeRole/);
    if (body.text.format.name === "nalvi_adaptive_tutor_critic") {
      return response({ accepted: true, reasonCodes: [], summary: "Safe and useful.", revisionInstruction: "" });
    }
    return response(validPlan());
  };
  const service = createAdaptiveTutorOrchestrator({
    fetchImpl,
    env: { OPENAI_API_KEY: "server-secret", OPENAI_TUTOR_MODEL: "configured-model", AI_TUTOR_ON_EVERY_INCORRECT_ANSWER: "true" },
    persistEvent: async payload => { persisted.push(payload); return { status: "persisted", path: "users/pseudonymous/learningEvents/event" }; }
  });
  const result = await service.orchestrateAdaptiveTutoring(context(), { verifiedUserId: "pseudonymous-user" });

  assert.equal(calls.length, 2);
  assert.equal(result.ok, true);
  assert.equal(result.usedAI, true);
  assert.equal(result.reason, "AI_TUTOR_PLAN_VALIDATED");
  assert.equal(result.adaptiveInterventionPlan.activities[0].type, "listening");
  assert.notEqual(result.adaptiveInterventionPlan.activities[0].fingerprint, context().previousActivityFingerprint);
  assert.equal(result.metrics.answerLeakageRate, 0);
  assert.equal(result.metrics.duplicateRate, 0);
  assert.equal(result.persistence.status, "persisted");
  assert.equal(persisted.length, 1);
  assert.doesNotMatch(JSON.stringify(persisted[0]), /Private Student|private@example\.com|Private School/);
});

test("un fallo de red usa fallback profesional y nunca permite avanzar", async () => {
  const service = createAdaptiveTutorOrchestrator({
    fetchImpl: async () => { throw new Error("network down"); },
    env: { OPENAI_API_KEY: "server-secret", AI_TUTOR_ON_EVERY_INCORRECT_ANSWER: "true" }
  });
  const result = await service.orchestrateAdaptiveTutoring(context(), { requesterHash: "guest-hash" });
  assert.equal(result.usedAI, false);
  assert.equal(result.mode, "fallback");
  assert.equal(result.adaptiveInterventionPlan.progressionPolicy.onIncorrect, "BLOCK_AND_INTERVENE");
  assert.notEqual(result.adaptiveInterventionPlan.activities[0].activityType, "multiple-choice");
  assert.ok(result.adaptiveInterventionPlan.activities[0].type);
  assert.equal(result.adaptiveInterventionPlan.activities[0].lessonContext.sourcePrompt, "¿Cómo se dice mamá?");
  assert.equal(result.persistence.reason, "ANONYMOUS_SESSION");
});

test("el primer refuerzo muestra contexto, el mismo concepto y una instrucción accionable", () => {
  const plan = createProfessionalFallbackPlan(context({
    correctAnswer: "¿Cómo estás?",
    activity: {
      ...context().activity,
      id: "legacy-general-0-0",
      prompt: "¿Qué expresa «Mba’éichapa»?",
      options: [
        { id: "thanks", label: "Gracias" },
        { id: "how", label: "¿Cómo estás?" },
        { id: "goodbye", label: "Adiós" }
      ]
    }
  }));
  const activity = plan.activities[0];
  assert.equal(activity.activityType, "fill-blank");
  assert.equal(activity.lessonContext.sourcePrompt, "¿Qué expresa «Mba’éichapa»?");
  assert.match(activity.template, /Mba’éichapa/);
  assert.match(activity.template, /¿Cómo/);
  assert.ok(activity.acceptedAnswers.includes("estás"));
  assert.ok(activity.acceptedAnswers.includes("¿Cómo estás?"));
  assert.notEqual(activity.template.trim(), "{{blank}}");
});

test("el segundo intento conserva la pregunta y ofrece opciones comprensibles", () => {
  const plan = createProfessionalFallbackPlan(context({ attemptNumber: 2 }));
  const activity = plan.activities[0];
  assert.equal(activity.activityType, "multiple-choice");
  assert.equal(activity.lessonContext.sourcePrompt, "¿Cómo se dice mamá?");
  assert.ok(activity.options.length >= 2);
  assert.notEqual(activity.prompt, "Recupera la expresión sin opciones.");
});

test("el crítico puede rechazar y existe como máximo una revisión", async () => {
  let plannerCalls = 0;
  const fetchImpl = async (_url, options) => {
    const body = JSON.parse(options.body);
    if (body.text.format.name === "nalvi_adaptive_tutor_critic") {
      return response({ accepted: false, reasonCodes: ["UNRELATED_DISTRACTORS"], summary: "Reject.", revisionInstruction: "Use only the lesson options." });
    }
    plannerCalls += 1;
    return response(validPlan({ planId: `critic-rejected-${plannerCalls}` }));
  };
  const service = createAdaptiveTutorOrchestrator({
    fetchImpl,
    env: { OPENAI_API_KEY: "server-secret", AI_TUTOR_MAX_REVISION_ATTEMPTS: "1" }
  });
  const result = await service.orchestrateAdaptiveTutoring(context());
  assert.equal(plannerCalls, 2);
  assert.equal(result.usedAI, false);
  assert.equal(result.mode, "fallback");
  assert.equal(result.telemetry.revisionCount, 1);
});

test("contenido lingüístico sin inventario queda BLOCKED y no llama a OpenAI", async () => {
  let calls = 0;
  const service = createAdaptiveTutorOrchestrator({
    fetchImpl: async () => { calls += 1; return response(validPlan()); },
    env: { OPENAI_API_KEY: "server-secret" }
  });
  const blocked = context({ correctAnswer: "", activity: { id: "unknown", type: "writing", prompt: "", instruction: "", options: [] } });
  const result = await service.orchestrateAdaptiveTutoring(blocked);
  assert.equal(calls, 0);
  assert.equal(result.linguisticMode, "BLOCKED");
  assert.equal(result.usedAI, false);
});
