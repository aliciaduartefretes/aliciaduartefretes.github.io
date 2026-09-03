import test from "node:test";
import assert from "node:assert/strict";
import {
  ADAPTIVE_INTERVENTION_PLAN_SCHEMA,
  buildAdaptivePlanOpenAIRequest,
  createAdaptiveInterventionPlanService,
  validateAdaptiveInterventionPlan
} from "../adaptive-intervention-plan.mjs";
import { createActivityFingerprint } from "../../intervention-engine/intervention-engine.mjs";

const expertKnowledge = {
  id: "LEX-FAMILY-001",
  recordType: "lexeme",
  languageVariant: "gug-PY",
  lemma: "sy",
  lexeme: "sy",
  forms: ["sy", "ru"],
  validationStatus: "expertVerified",
  allowedForGeneration: true,
  needsHumanReview: false,
  automaticUseBlocked: false,
  conflictIds: [],
  sourceReferences: [{ sourceId: "SRC-TEST-001", sourceTitle: "Fixture experta" }]
};

const failedActivity = {
  id: "failed-mother-choice",
  conceptId: "family-mother",
  type: "multiple-choice",
  skill: "vocabulary",
  difficulty: "foundation-1",
  instruction: "Selecciona la respuesta.",
  prompt: "¿Cómo se dice mamá?",
  options: [{ id: "a", label: "sy" }, { id: "b", label: "ru" }],
  correctOptionId: "a"
};

function baseRequest(overrides = {}) {
  const previousFingerprint = createActivityFingerprint(failedActivity, { uiLocale: overrides.uiLocale || "es" });
  const nextActivity = {
    id: "local-safe-alternative",
    conceptId: "family-mother",
    learningObjectiveId: "GG-LO-FAMILY",
    type: "fill-blank",
    skill: "writing",
    difficulty: "foundation-1",
    instruction: "Completa.",
    prompt: "Familia",
    template: "{{blank}}",
    acceptedAnswers: ["sy"]
  };
  return {
    correct: false,
    conceptId: "family-mother",
    learningObjectiveId: "GG-LO-FAMILY",
    currentSkill: "vocabulary",
    activityType: "multiple-choice",
    difficulty: "foundation-1",
    studentAnswer: "ru",
    correctAnswer: "sy",
    attemptNumber: 1,
    recentErrors: [],
    recentActivityFingerprints: [],
    modalitiesAlreadyUsed: ["multiple-choice"],
    hintHistory: [],
    retentionHistory: [],
    uiLocale: "es",
    grammarRuleIds: [],
    lexemeIds: ["LEX-FAMILY-001"],
    knowledgeIds: ["LEX-FAMILY-001"],
    allowedConceptIds: ["family-mother"],
    previousFingerprint,
    wouldAIImproveIntervention: true,
    localPlan: {
      errorType: "SEMANTIC_CONFUSION",
      strategy: "CHANGE_MODALITY",
      diagnosis: { confidence: 0.72 },
      nextActivity,
      nextFingerprint: createActivityFingerprint(nextActivity, { uiLocale: "es" })
    },
    ...overrides
  };
}

const interfaceText = {
  es: "Reconoce la forma validada.", en: "Recognize the validated form.", pt: "Reconheça a forma validada.",
  fr: "Reconnaissez la forme validée.", it: "Riconosci la forma convalidata.", de: "Erkenne die validierte Form."
};

function activity(type, locale = "es", suffix = "1") {
  const shared = {
    activityType: type,
    skill: type === "listening" ? "listening" : type === "writing" ? "writing" : "vocabulary",
    difficulty: "foundation-1",
    instruction: interfaceText[locale],
    prompt: `${interfaceText[locale]} ${suffix}`,
    options: [],
    correctAnswer: "sy",
    answerLanguage: "target",
    hints: [interfaceText[locale]],
    explanation: interfaceText[locale],
    conceptIds: ["family-mother"],
    lexemeIds: ["LEX-FAMILY-001"],
    grammarRuleIds: [],
    sourceIds: ["SRC-TEST-001"],
    targetLanguageClaims: [{ text: "sy", recordId: "LEX-FAMILY-001", sourceId: "SRC-TEST-001", claimType: "exactKnowledgeForm" }],
    grammarEngineClaims: [],
    media: { type: "none", sourceId: "", value: "", alt: "" }
  };
  if (type === "multiple-choice" || type === "matching" || type === "listening") {
    shared.options = [
      { id: `sy-${suffix}`, text: "sy", contentLanguage: "target", pairId: type === "matching" ? `mother-${suffix}` : "", sourceIds: ["SRC-TEST-001"] },
      { id: `ru-${suffix}`, text: "ru", contentLanguage: "target", pairId: type === "matching" ? `father-${suffix}` : "", sourceIds: ["SRC-TEST-001"] }
    ];
    shared.targetLanguageClaims.push({ text: "ru", recordId: "LEX-FAMILY-001", sourceId: "SRC-TEST-001", claimType: "exactKnowledgeForm" });
    if (type === "matching") {
      shared.options.push(
        { id: `mother-${suffix}`, text: locale === "de" ? "Mutter" : "madre", contentLanguage: "interface", pairId: `mother-${suffix}`, sourceIds: [] },
        { id: `father-${suffix}`, text: locale === "de" ? "Vater" : "padre", contentLanguage: "interface", pairId: `father-${suffix}`, sourceIds: [] }
      );
    }
  }
  if (type === "listening") shared.media = { type: "audio", sourceId: "SRC-TEST-001", value: "sy", alt: interfaceText[locale] };
  return shared;
}

function validPlan({ locale = "es", count = 2, firstType = "writing", planId = "adaptive-family-plan" } = {}) {
  const types = [firstType, "matching", "fill-blank", "listening"];
  return {
    planId,
    conceptId: "family-mother",
    diagnosis: "SEMANTIC_CONFUSION",
    diagnosisConfidence: 0.88,
    strategy: "CHANGE_MODALITY",
    studentFeedback: interfaceText[locale],
    internalRationale: "Uses a different modality and only supplied expert knowledge.",
    activities: Array.from({ length: count }, (_, index) => activity(types[index], locale, String(index + 1))),
    retestPolicy: "after-plan",
    masteryRecommendation: "AWAIT_RETEST",
    validationMetadata: { claimedRiskLevel: "GREEN", sourceIds: ["SRC-TEST-001"] }
  };
}

function openAIResponse(plan, usage = { input_tokens: 140, output_tokens: 220 }) {
  return { ok: true, status: 200, json: async () => ({ output_text: JSON.stringify(plan), usage }) };
}

function serviceFor(fetchImpl, extra = {}) {
  return createAdaptiveInterventionPlanService({
    corpusRecords: [expertKnowledge],
    fetchImpl,
    env: { OPENAI_API_KEY: "server-only-secret", OPENAI_MODEL: "configured-model", ...extra.env },
    persistEvent: extra.persistEvent || (async () => ({ status: "persisted", path: "users/test/learningEvents/event" }))
  });
}

test("primer error: genera en segundo plano un plan válido de 1 a 4 actividades", async () => {
  let calls = 0;
  const service = serviceFor(async (_url, options) => {
    calls += 1;
    const body = JSON.parse(options.body);
    assert.equal(body.store, false);
    assert.equal(body.text.format.type, "json_schema");
    assert.equal(body.text.format.strict, true);
    assert.doesNotMatch(body.input, /student@example|Alicia|instituci[oó]n/i);
    return openAIResponse(validPlan({ count: 2 }));
  });
  const result = await service.generateAdaptiveInterventionPlan(baseRequest(), { verifiedUserId: "student-pseudonymous-a" });
  assert.equal(calls, 1);
  assert.equal(result.mode, "generated");
  assert.equal(result.usedAI, true);
  assert.equal(result.adaptiveInterventionPlan.activities.length, 2);
  assert.equal(result.adaptiveInterventionPlan.validationMetadata.riskLevel, "GREEN");
  assert.equal(result.persistence.status, "persisted");
  assert.equal(result.event.eventKind, "adaptiveInterventionPlan");
});

test("error repetido: permite una secuencia coherente de tres actividades, no siempre cuatro", async () => {
  const service = serviceFor(async () => openAIResponse(validPlan({ count: 3, planId: "repeated-error-plan" })));
  const result = await service.generateAdaptiveInterventionPlan(baseRequest({ attemptNumber: 2, recentErrors: [{ conceptId: "family-mother", errorType: "SEMANTIC_CONFUSION" }] }), { verifiedUserId: "student-a" });
  assert.equal(result.adaptiveInterventionPlan.activities.length, 3);
  assert.deepEqual(result.adaptiveInterventionPlan.activities.map(item => item.type), ["writing", "matching", "fill-blank"]);
  assert.deepEqual(result.adaptiveInterventionPlan.activities[1].pairs, [
    { id: "mother-2", left: "sy", right: "madre" },
    { id: "father-2", left: "ru", right: "padre" }
  ]);
});

test("fallo de OpenAI conserva la enseñanza mediante fallback local diferente", async () => {
  const request = baseRequest();
  const service = serviceFor(async () => { throw new Error("network down"); });
  const result = await service.generateAdaptiveInterventionPlan(request, { verifiedUserId: "student-a" });
  assert.equal(result.mode, "fallback");
  assert.equal(result.usedAI, false);
  assert.equal(result.adaptiveInterventionPlan.activities.length, 1);
  assert.notEqual(result.adaptiveInterventionPlan.activities[0].fingerprint, request.previousFingerprint);
  assert.equal(result.telemetry.errors, 1);
});

test("JSON inválido cae a fallback sin interrumpir el estudio", async () => {
  const service = serviceFor(async () => ({ ok: true, status: 200, json: async () => ({ output_text: "{not-json" }) }));
  const result = await service.generateAdaptiveInterventionPlan(baseRequest(), { verifiedUserId: "student-a" });
  assert.equal(result.reason, "OPENAI_INVALID_JSON");
  assert.equal(result.mode, "fallback");
});

test("duplicate checker rechaza una actividad reciente", () => {
  const request = baseRequest(), candidate = validPlan({ count: 1, planId: "duplicate-plan" });
  const first = validateAdaptiveInterventionPlan(candidate, { request, allowedKnowledge: [expertKnowledge], grammarEngine: null });
  assert.equal(first.valid, true);
  const duplicate = validateAdaptiveInterventionPlan(candidate, {
    request,
    allowedKnowledge: [expertKnowledge],
    grammarEngine: null,
    recentFingerprints: [first.plan.activities[0].fingerprint]
  });
  assert.equal(duplicate.valid, false);
  assert.equal(duplicate.reason, "DUPLICATE_ACTIVITY");
});

test("un término objetivo no permitido se clasifica RED y nunca se muestra", () => {
  const candidate = validPlan({ count: 1, planId: "disallowed-term-plan" });
  candidate.activities[0].correctAnswer = "inventado";
  candidate.activities[0].targetLanguageClaims = [{ text: "inventado", recordId: "LEX-FAMILY-001", sourceId: "SRC-TEST-001", claimType: "exactKnowledgeForm" }];
  const result = validateAdaptiveInterventionPlan(candidate, { request: baseRequest(), allowedKnowledge: [expertKnowledge], grammarEngine: null });
  assert.equal(result.valid, false);
  assert.equal(result.riskLevel, "RED");
  assert.equal(result.reason, "UNKNOWN_TARGET_LANGUAGE_CONTENT");
});

test("los seis idiomas de interfaz se conservan en feedback e instrucciones", async () => {
  for (const locale of ["es", "en", "pt", "fr", "it", "de"]) {
    const service = serviceFor(async () => openAIResponse(validPlan({ locale, count: 1, planId: `locale-${locale}` })));
    const result = await service.generateAdaptiveInterventionPlan(baseRequest({ uiLocale: locale }), { verifiedUserId: `student-${locale}` });
    assert.equal(result.adaptiveInterventionPlan.studentFeedback, interfaceText[locale]);
    assert.equal(result.adaptiveInterventionPlan.activities[0].instruction, interfaceText[locale]);
  }
});

test("dos perfiles distintos producen claves y planes distintos para el mismo concepto", async () => {
  let calls = 0;
  const service = serviceFor(async (_url, options) => {
    calls += 1;
    const requestBody = JSON.parse(options.body), context = JSON.parse(requestBody.input).pedagogicalContext;
    const type = context.currentSkill === "listening" ? "writing" : "listening";
    return openAIResponse(validPlan({ count: 1, firstType: type, planId: `profile-${context.currentSkill}` }));
  });
  const listener = await service.generateAdaptiveInterventionPlan(baseRequest({ currentSkill: "listening" }), { verifiedUserId: "student-a" });
  const writer = await service.generateAdaptiveInterventionPlan(baseRequest({ currentSkill: "writing" }), { verifiedUserId: "student-b" });
  assert.equal(calls, 2);
  assert.equal(listener.adaptiveInterventionPlan.activities[0].type, "writing");
  assert.equal(writer.adaptiveInterventionPlan.activities[0].type, "listening");
});

test("Structured Output incluye el contrato completo y no expone la API key", () => {
  const payload = buildAdaptivePlanOpenAIRequest({
    request: baseRequest(), allowedKnowledge: [expertKnowledge], model: "configured-model", safetyIdentifier: "hashed-user"
  });
  assert.equal(payload.text.format.schema, ADAPTIVE_INTERVENTION_PLAN_SCHEMA);
  assert.match(payload.instructions, /1 to 4 activities/i);
  assert.match(payload.instructions, /Never invent Guarani/i);
  assert.doesNotMatch(JSON.stringify(payload), /server-only-secret/);
  assert.equal(payload.safety_identifier, "hashed-user");
});

test("un plan YELLOW queda bloqueado salvo política explícita", () => {
  const request = baseRequest({ activityType: "writing" });
  const candidate = validPlan({ count: 1, firstType: "writing", planId: "yellow-plan" });
  const blocked = validateAdaptiveInterventionPlan(candidate, { request, allowedKnowledge: [expertKnowledge], grammarEngine: null });
  assert.equal(blocked.valid, false);
  assert.equal(blocked.riskLevel, "YELLOW");
  const allowed = validateAdaptiveInterventionPlan(candidate, { request, allowedKnowledge: [expertKnowledge], grammarEngine: null, allowYellow: true });
  assert.equal(allowed.valid, true);
  assert.equal(allowed.riskLevel, "YELLOW");
});
