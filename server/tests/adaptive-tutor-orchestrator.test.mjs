import test from "node:test";
import assert from "node:assert/strict";
import { catalogAudit } from "../../activity-catalog/nalvi-activity-catalog.mjs";
import { createActivityFingerprint } from "../../intervention-engine/intervention-engine.mjs";
import { buildDeterministicFallbackCandidates } from "../../progression-engine/fallback-intervention.mjs";
import { createAdaptiveTutorOrchestrator, createProfessionalFallbackPlan } from "../adaptive-tutor-orchestrator.mjs";
import { normalizeInterventionRequest } from "../intervention-service.mjs";

const ENABLED_TYPES = [
  "CONTEXT_CHOICE",
  "ARROW_MATCH",
  "CATEGORY_SORT",
  "DIALOGUE_NEXT_TURN",
  "INDEPENDENT_RECALL",
  "AUDIO_SELECT"
];
const CANONICAL_AUDIO = Object.freeze({
  audioId: "NALVI-AUDIO-096",
  audioPath: "assets/audio/guarani/ali-2026/096-jagua.m4a",
  audioText: "Jagua",
  audioAuthorized: true,
  humanRecorded: true,
  audioSource: "manifest-human-recording"
});
const APPROVED_AUDIO = Object.freeze({
  id: CANONICAL_AUDIO.audioId,
  audioId: CANONICAL_AUDIO.audioId,
  recordingId: CANONICAL_AUDIO.audioId,
  path: CANONICAL_AUDIO.audioPath,
  audioPath: CANONICAL_AUDIO.audioPath,
  text: CANONICAL_AUDIO.audioText,
  audioText: CANONICAL_AUDIO.audioText,
  source: CANONICAL_AUDIO.audioSource,
  audioSource: CANONICAL_AUDIO.audioSource,
  authorized: true,
  audioAuthorized: true,
  humanRecorded: true
});

const optionText = option => String(option?.text ?? option?.label ?? option?.value ?? "");

function approvedMaterialFor(activity, correctAnswer) {
  const options = (activity.options || []).map((option, index) => ({
    id: String(option?.id || `option-${index + 1}`),
    text: optionText(option),
    authorized: true
  }));
  return {
    options,
    correctOptionId: String(activity.correctOptionId || ""),
    correctAnswer,
    acceptedAnswers: [correctAnswer].filter(Boolean),
    pairs: options.slice(0, 3).map((option, index) => ({
      id: `approved-pair-${index + 1}`,
      left: option.text,
      right: `significado aprobado ${index + 1}`,
      authorized: true
    })),
    contexts: [{ text: "Una situación documentada de la lección.", authorized: true }],
    categories: [
      { id: "known", label: "Conocido", authorized: true },
      { id: "contrast", label: "Contraste", authorized: true }
    ],
    items: Array.from({ length: 6 }, (_, index) => ({
      id: `approved-item-${index + 1}`,
      text: `elemento aprobado ${index + 1}`,
      categoryId: index < 3 ? "known" : "contrast",
      authorized: true
    })),
    dialogue: [
      { id: "turn-1", speaker: "A", text: "Elige la continuación documentada.", authorized: true },
      { id: "turn-2", speaker: "B", text: "La conversación sigue aquí.", authorized: true }
    ],
    dialogueOptions: options,
    dialogueCorrectOptionId: String(activity.correctOptionId || ""),
    dialogueCorrectAnswer: correctAnswer,
    dialogueSourceContentId: "fixture-dialogue-source",
    audio: { ...APPROVED_AUDIO }
  };
}

function context(overrides = {}) {
  const baseActivity = {
    id: "family-mother-choice", conceptId: "family-mother", type: "multiple-choice",
    skill: "vocabulary", difficulty: "foundation-1", instruction: "Selecciona la respuesta.",
    prompt: "¿Cómo se dice mamá?", options: [
      { id: "sy", label: "sy" }, { id: "ru", label: "ru" }, { id: "oga", label: "óga" }
    ], correctOptionId: "sy"
  };
  const activity = overrides.activity || baseActivity;
  const value = {
    correct: false, conceptId: "family-mother", learningObjectiveId: "GG-LO-FAMILY",
    currentSkill: "vocabulary", activityType: "multiple-choice", difficulty: "foundation-1",
    studentAnswer: "ru", correctAnswer: "sy", attemptNumber: 1, recentErrors: [],
    recentActivityFingerprints: [], modalitiesAlreadyUsed: ["multiple-choice"], hintHistory: [],
    retentionHistory: [], strategyEffectiveness: {}, uiLocale: "es", grammarRuleIds: [],
    lexemeIds: [], knowledgeIds: [], activity,
    fullName: "Private Student", email: "private@example.com", institution: "Private School",
    administrativeRole: "student", ...overrides
  };
  value.activity = activity;
  value.previousActivityFingerprint = overrides.previousActivityFingerprint
    || createActivityFingerprint(activity, { uiLocale: value.uiLocale });
  if (!Object.hasOwn(overrides, "approvedActivityMaterial")) {
    value.approvedActivityMaterial = approvedMaterialFor(activity, value.correctAnswer);
  }
  return value;
}

function validPlan(overrides = {}) {
  const sourceContext = context();
  const catalogCandidate = buildDeterministicFallbackCandidates(sourceContext, 1, "SEMANTIC_CONFUSION")[0];
  return {
    planVersion: "NALVI-TUTOR-CATALOG-1", planId: "plan-family-mother-1", conceptId: "family-mother",
    linguisticMode: "LESSON_BOUNDED",
    diagnosis: { errorType: "SEMANTIC_CONFUSION", likelyDifficulty: "meaning contrast", confidence: 0.84, prerequisiteGap: null, skillAffected: "vocabulary" },
    pedagogicalGoal: "Discriminate the same validated lesson item in a new context.",
    strategy: { primaryStrategy: "CHANGE_MODALITY", secondaryStrategy: "USE_CONTEXT", reasonCode: "contextual-discrimination" },
    studentFeedback: { locale: "es", shortMessage: "No del todo. Probemos de otra forma." },
    candidateActivities: [catalogCandidate],
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
  assert.deepEqual(catalogAudit().enabledTypes, ENABLED_TYPES);
  assert.equal(result.adaptiveInterventionPlan.activities[0].type, "CONTEXT_CHOICE");
  assert.ok(ENABLED_TYPES.includes(result.adaptiveInterventionPlan.activities[0].type));
  assert.notEqual(result.adaptiveInterventionPlan.activities[0].fingerprint, context().previousActivityFingerprint);
  assert.equal(result.metrics.answerLeakageRate, 0);
  assert.equal(result.metrics.duplicateRate, 0);
  assert.equal(result.persistence.status, "persisted");
  assert.equal(persisted.length, 1);
  assert.doesNotMatch(JSON.stringify(persisted[0]), /Private Student|private@example\.com|Private School/);
  for (const call of calls) {
    const input = JSON.parse(call.input);
    assert.deepEqual(input.context.approvedActivityMaterial.audio, CANONICAL_AUDIO);
    assert.equal(input.context.approvedActivityMaterial.dialogueCorrectOptionId, "sy");
    assert.equal(input.context.approvedActivityMaterial.dialogueCorrectAnswer, "sy");
    assert.doesNotMatch(JSON.stringify(input.context.approvedActivityMaterial), /\[object Object\]/);
  }
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
  assert.ok(ENABLED_TYPES.includes(result.adaptiveInterventionPlan.activities[0].activityType));
  assert.ok(result.adaptiveInterventionPlan.activities[0].type);
  assert.ok(result.adaptiveInterventionPlan.activities[0].contextText);
  assert.notEqual(result.adaptiveInterventionPlan.activities[0].prompt, "¿Cómo se dice mamá?");
  assert.equal(result.persistence.reason, "ANONYMOUS_SESSION");
});

test("el primer refuerzo usa el catálogo oficial, muestra contexto y no repite el prompt", () => {
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
  assert.equal(activity.activityType, "CONTEXT_CHOICE");
  assert.ok(activity.contextText);
  assert.equal(activity.conceptId, "family-mother");
  assert.notEqual(activity.prompt, "¿Qué expresa «Mba’éichapa»?");
  assert.ok(activity.options.length >= 3);
});

test("el segundo intento cambia de modalidad cuando la modalidad anterior ya fue utilizada", () => {
  const first = createProfessionalFallbackPlan(context({ attemptNumber: 1 }));
  const previous = first.activities[0];
  const plan = createProfessionalFallbackPlan(context({
    attemptNumber: 2,
    recentActivities: [{ activityType: previous.activityType }],
    recentActivityFingerprints: [previous.fingerprint]
  }));
  const activity = plan.activities[0];
  assert.notEqual(activity.activityType, previous.activityType);
  assert.notEqual(activity.fingerprint, previous.fingerprint);
  assert.notEqual(activity.prompt, "¿Cómo se dice mamá?");
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

test("el límite del servidor conserva solo material autorizado, localizado y trazable", () => {
  const raw = context({
    uiLocale: "en",
    approvedActivityMaterial: {
      ...approvedMaterialFor(context().activity, "sy"),
      contexts: [
        { text: { es: "Contexto aprobado", en: "Approved context" }, authorized: true },
        { text: "No autorizado", authorized: false },
        { arbitrary: "Nunca convertir este objeto", authorized: true }
      ],
      audio: { ...APPROVED_AUDIO }
    }
  });
  const normalized = normalizeInterventionRequest(raw);

  assert.deepEqual(normalized.approvedActivityMaterial.contexts, [
    { text: "Approved context", authorized: true }
  ]);
  assert.equal(normalized.approvedActivityMaterial.dialogueCorrectOptionId, "sy");
  assert.equal(normalized.approvedActivityMaterial.dialogueCorrectAnswer, "sy");
  assert.equal(normalized.approvedActivityMaterial.dialogueSourceContentId, "fixture-dialogue-source");
  assert.deepEqual(normalized.approvedActivityMaterial.audio, CANONICAL_AUDIO);
  assert.doesNotMatch(JSON.stringify(normalized), /\[object Object\]/);

  const mismatchedAudio = normalizeInterventionRequest(context({
    approvedActivityMaterial: {
      ...approvedMaterialFor(context().activity, "sy"),
      audio: {
        ...APPROVED_AUDIO,
        path: "assets/audio/guarani/ali-2026/095-itati.m4a",
        audioPath: "assets/audio/guarani/ali-2026/095-itati.m4a"
      }
    }
  }));
  assert.equal(mismatchedAudio.approvedActivityMaterial.audio, null);
});

test("la validación determinista rechaza material inventado aunque el Planner lo marque autorizado", async () => {
  const source = context();
  const invented = structuredClone(validPlan());
  const arrow = buildDeterministicFallbackCandidates(source, 1, "SEMANTIC_CONFUSION")
    .find(candidate => candidate.activityType === "ARROW_MATCH");
  assert.ok(arrow);
  arrow.activity.pairs[1] = {
    id: "invented-pair",
    left: "forma inventada",
    right: "significado inventado",
    authorized: true
  };
  invented.candidateActivities = [arrow];
  const service = createAdaptiveTutorOrchestrator({
    fetchImpl: async () => response(invented),
    env: { OPENAI_API_KEY: "server-secret", AI_TUTOR_CRITIC_ENABLED: "false", AI_TUTOR_MAX_REVISION_ATTEMPTS: "0" }
  });
  const result = await service.orchestrateAdaptiveTutoring(source);

  assert.equal(result.usedAI, false);
  assert.equal(result.mode, "fallback");
  assert.doesNotMatch(JSON.stringify(result.adaptiveInterventionPlan), /forma inventada|significado inventado/);
});

test("la validación determinista no cambia ni filtra la respuesta correcta aprobada", async () => {
  const source = context();
  const changed = structuredClone(validPlan());
  changed.candidateActivities[0].activity.correctAnswer = "respuesta inventada";
  changed.candidateActivities[0].activity.acceptedAnswers = ["respuesta inventada"];
  const service = createAdaptiveTutorOrchestrator({
    fetchImpl: async () => response(changed),
    env: { OPENAI_API_KEY: "server-secret", AI_TUTOR_CRITIC_ENABLED: "false", AI_TUTOR_MAX_REVISION_ATTEMPTS: "0" }
  });
  const result = await service.orchestrateAdaptiveTutoring(source);

  assert.equal(result.usedAI, false);
  assert.equal(result.adaptiveInterventionPlan.activities[0].correctAnswer, "sy");
  assert.deepEqual(result.adaptiveInterventionPlan.activities[0].acceptedAnswers, ["sy"]);
});

test("AUDIO_SELECT conserva el contrato canónico completo hasta la actividad renderizable", async () => {
  const activity = {
    ...context().activity,
    id: "jagua-listening",
    type: "listening",
    skill: "listening",
    options: [
      { id: "jagua", label: "Jagua" },
      { id: "sy", label: "Sy" },
      { id: "oga", label: "Óga" }
    ],
    correctOptionId: "jagua"
  };
  const source = context({
    conceptId: "animal-dog",
    currentSkill: "listening",
    activityType: "listening",
    studentAnswer: "Sy",
    correctAnswer: "Jagua",
    activity,
    approvedActivityMaterial: approvedMaterialFor(activity, "Jagua")
  });
  const audioCandidate = buildDeterministicFallbackCandidates(source, 1, "LISTENING_CONFUSION")
    .find(candidate => candidate.activityType === "AUDIO_SELECT");
  assert.ok(audioCandidate);
  const plan = validPlan({
    conceptId: source.conceptId,
    diagnosis: { errorType: "LISTENING_CONFUSION", likelyDifficulty: "audio", confidence: 0.9, prerequisiteGap: null, skillAffected: "listening" },
    candidateActivities: [audioCandidate]
  });
  const service = createAdaptiveTutorOrchestrator({
    fetchImpl: async () => response(plan),
    env: { OPENAI_API_KEY: "server-secret", AI_TUTOR_CRITIC_ENABLED: "false", AI_TUTOR_MAX_REVISION_ATTEMPTS: "0" }
  });
  const result = await service.orchestrateAdaptiveTutoring(source);
  const rendered = result.adaptiveInterventionPlan.activities[0];

  assert.equal(result.usedAI, true);
  assert.equal(rendered.activityType, "AUDIO_SELECT");
  assert.deepEqual({
    audioId: rendered.audioId,
    audioPath: rendered.audioPath,
    audioText: rendered.audioText,
    audioAuthorized: rendered.audioAuthorized,
    humanRecorded: rendered.humanRecorded,
    audioSource: rendered.audioSource
  }, CANONICAL_AUDIO);
});
