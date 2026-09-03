import assert from "node:assert/strict";
import test from "node:test";

import { cognitiveDemandFor } from "../../activity-catalog/nalvi-activity-catalog.mjs";
import { classifyError } from "../../intervention-engine/intervention-engine.mjs";
import { INTERVENTION_CONFIG } from "../../intervention-engine/intervention-config.mjs";
import {
  buildDeterministicFallbackCandidates,
  deterministicInterventionCopy
} from "../../progression-engine/fallback-intervention.mjs";
import {
  createAdaptiveTutorOrchestrator,
  createProfessionalFallbackPlan,
  toRenderable,
  validateActivityAgainstApprovedMaterial
} from "../adaptive-tutor-orchestrator.mjs";
import { ADAPTIVE_TUTOR_PLAN_SCHEMA } from "../adaptive-tutor-schema.mjs";
import { normalizeInterventionRequest, sanitizeApprovedActivityMaterial } from "../intervention-service.mjs";

const TARGET = "Jagua";
const CONCEPT_ID = "security-dog";
const LEARNING_OBJECTIVE_ID = "security-lo-dog";
const SOURCE_ACTIVITY_ID = "security-source-jagua";
const LEXEME_ID = "LEX-SECURITY-JAGUA";
const GRAMMAR_RULE_ID = "GRAMMAR-SECURITY-NOUN";
const SOURCE_ID = "SOURCE-SECURITY-LITERAL";
const SOURCE_CONTENT_ID = "SOURCE-CONTENT-SECURITY-LITERAL";
const DIALOGUE_SOURCE_ID = "DIALOGUE-SECURITY-LITERAL";
const VISIBLE_INJECTION = "PLANNER_VISIBLE_COPY_MUST_NOT_SURVIVE";
const PLAN_INJECTION = "PLANNER_POLICY_MUST_NOT_SURVIVE";

const clone = value => JSON.parse(JSON.stringify(value));
const option = (id, text, provenance = {}) => ({ id, text, authorized: true, ...provenance });

const OPTIONS = Object.freeze([
  option("dog", "Jagua", { sourceActivityId: SOURCE_ACTIVITY_ID }),
  option("bird", "Guyra", { sourceContentId: SOURCE_CONTENT_ID }),
  option("cat", "Mbarakaja", { sourceIds: [SOURCE_ID, "SOURCE-OPTION-CAT"] })
]);
const PAIRS = Object.freeze([
  { id: "pair-dog", left: "Jagua", right: "perro", authorized: true, sourceActivityId: SOURCE_ACTIVITY_ID },
  { id: "pair-bird", left: "Guyra", right: "ave", authorized: true, sourceContentId: SOURCE_CONTENT_ID },
  { id: "pair-cat", left: "Mbarakaja", right: "gato", authorized: true, sourceIds: [SOURCE_ID, "SOURCE-PAIR-CAT"] }
]);
const CATEGORIES = Object.freeze([
  { id: "animals", label: "Animales", authorized: true, sourceActivityId: SOURCE_ACTIVITY_ID },
  { id: "places", label: "Lugares", authorized: true, sourceContentId: SOURCE_CONTENT_ID }
]);
const ITEMS = Object.freeze([
  { id: "dog-item", text: "Jagua", categoryId: "animals", authorized: true, sourceActivityId: SOURCE_ACTIVITY_ID },
  { id: "bird-item", text: "Guyra", categoryId: "animals", authorized: true, sourceContentId: SOURCE_CONTENT_ID },
  { id: "cat-item", text: "Mbarakaja", categoryId: "animals", authorized: true },
  { id: "house-item", text: "Óga", categoryId: "places", authorized: true },
  { id: "road-item", text: "Tape", categoryId: "places", authorized: true },
  { id: "field-item", text: "Kokue", categoryId: "places", authorized: true }
]);
const DIALOGUE = Object.freeze([
  { id: "turn-one", speaker: "A", text: "Mba’éichapa, Ana?", authorized: true, sourceActivityId: SOURCE_ACTIVITY_ID },
  { id: "turn-two", speaker: "B", text: "Ahendu peteĩ mymba okápe.", authorized: true, sourceContentId: SOURCE_CONTENT_ID }
]);
const DIALOGUE_OPTIONS = Object.freeze([
  option("dog", "Jagua", { sourceActivityId: SOURCE_ACTIVITY_ID }),
  option("bird", "Guyra", { sourceContentId: SOURCE_CONTENT_ID }),
  option("cat", "Mbarakaja", { sourceIds: [SOURCE_ID, "SOURCE-DIALOGUE-CAT"] })
]);
const AUDIO = Object.freeze({
  audioId: "NALVI-AUDIO-096",
  audioPath: "assets/audio/guarani/ali-2026/096-jagua.m4a",
  audioText: "Jagua",
  audioAuthorized: true,
  humanRecorded: true,
  audioSource: "manifest-human-recording"
});

const SOURCE_ACTIVITY = Object.freeze({
  id: SOURCE_ACTIVITY_ID,
  conceptId: CONCEPT_ID,
  conceptIds: [CONCEPT_ID],
  learningObjectiveId: LEARNING_OBJECTIVE_ID,
  type: "multiple-choice",
  activityType: "multiple-choice",
  skill: "vocabulary",
  difficulty: "foundation-1",
  prompt: "Selecciona el nombre documentado del perro.",
  instruction: "Usa únicamente el material literal de esta lección.",
  options: OPTIONS.map(({ id, text }) => ({ id, label: text })),
  correctOptionId: "dog",
  acceptedAnswers: [TARGET],
  requiresStudentResponse: true,
  lexemeIds: [LEXEME_ID],
  grammarRuleIds: [GRAMMAR_RULE_ID],
  sourceIds: [SOURCE_ID],
  contentValidationStatus: "unreviewed",
  allowedForMastery: false,
  literalReuseOnly: true,
  lessonContext: {
    sourceActivityId: SOURCE_ACTIVITY_ID,
    sourceAnswer: TARGET,
    sourceOptions: OPTIONS.map(({ id, text }) => ({ id, label: text })),
    sourceCorrectOptionId: "dog",
    sourcePrompt: "Selecciona el nombre documentado del perro.",
    sourceInstruction: "Usa únicamente el material literal de esta lección."
  }
});

const APPROVED_MATERIAL = Object.freeze({
  sourceActivityId: SOURCE_ACTIVITY_ID,
  sourceContentId: SOURCE_CONTENT_ID,
  sourceIds: [SOURCE_ID],
  options: OPTIONS,
  correctOptionId: "dog",
  correctAnswer: TARGET,
  acceptedAnswers: [TARGET],
  pairs: PAIRS,
  contexts: [{ text: "Un animal doméstico ladra detrás del portón.", authorized: true }],
  categories: CATEGORIES,
  items: ITEMS,
  dialogue: DIALOGUE,
  dialogueOptions: DIALOGUE_OPTIONS,
  dialogueCorrectOptionId: "dog",
  dialogueCorrectAnswer: TARGET,
  dialogueSourceContentId: DIALOGUE_SOURCE_ID,
  audio: AUDIO
});

const AUTHORITY_RECORD = Object.freeze({
  sourceActivity: SOURCE_ACTIVITY,
  correctAnswer: TARGET,
  knowledgeIds: [GRAMMAR_RULE_ID, LEXEME_ID],
  approvedActivityMaterial: APPROVED_MATERIAL
});

const activityAuthority = Object.freeze({
  resolve({ activityId } = {}) {
    return activityId === SOURCE_ACTIVITY_ID ? clone(AUTHORITY_RECORD) : null;
  },
  listByLearningObjective({ learningObjectiveId } = {}) {
    return learningObjectiveId === LEARNING_OBJECTIVE_ID ? [clone(SOURCE_ACTIVITY)] : [];
  },
  audit() {
    return { ready: true, source: SOURCE_ID, literalReuseOnly: true };
  }
});

function sourceRequest(overrides = {}) {
  const request = {
    correct: false,
    conceptId: CONCEPT_ID,
    learningObjectiveId: LEARNING_OBJECTIVE_ID,
    currentSkill: SOURCE_ACTIVITY.skill,
    activityType: SOURCE_ACTIVITY.activityType,
    difficulty: SOURCE_ACTIVITY.difficulty,
    studentAnswer: "Guyra",
    correctAnswer: TARGET,
    attemptNumber: 1,
    recentErrors: [],
    recentActivities: [],
    recentActivityFingerprints: [],
    modalitiesAlreadyUsed: [SOURCE_ACTIVITY.activityType],
    recentInterventions: [],
    hintHistory: [],
    retentionHistory: [],
    uiLocale: "es",
    grammarRuleIds: [GRAMMAR_RULE_ID],
    lexemeIds: [LEXEME_ID],
    knowledgeIds: [GRAMMAR_RULE_ID, LEXEME_ID],
    activity: clone(SOURCE_ACTIVITY),
    authorizedAudio: clone(AUDIO),
    approvedActivityMaterial: { audio: clone(AUDIO) },
    availableActivities: [],
    aiPolicy: { allowInterventionAI: true, AI_TUTOR_ON_EVERY_INCORRECT_ANSWER: true }
  };
  return Object.assign(request, overrides);
}

function matcherContext() {
  return {
    conceptId: CONCEPT_ID,
    learningObjectiveId: LEARNING_OBJECTIVE_ID,
    currentSkill: SOURCE_ACTIVITY.skill,
    difficulty: SOURCE_ACTIVITY.difficulty,
    correctAnswer: TARGET,
    uiLocale: "es",
    lexemeIds: [LEXEME_ID],
    grammarRuleIds: [GRAMMAR_RULE_ID],
    sourceIds: [SOURCE_ID],
    activity: clone(SOURCE_ACTIVITY),
    approvedActivityMaterial: clone(APPROVED_MATERIAL)
  };
}

function commonActivity(type, id = `planner-${type.toLocaleLowerCase()}`) {
  return {
    id,
    type,
    activityType: type,
    conceptId: CONCEPT_ID,
    conceptIds: [CONCEPT_ID],
    learningObjectiveId: LEARNING_OBJECTIVE_ID,
    skill: SOURCE_ACTIVITY.skill,
    difficulty: SOURCE_ACTIVITY.difficulty,
    helpLevel: 1,
    answerExposure: "HIDDEN",
    requiresStudentResponse: true,
    instruction: deterministicInterventionCopy(type, "es"),
    prompt: deterministicInterventionCopy(type, "es"),
    contextText: "",
    contextAuthorized: false,
    audioId: "",
    audioPath: "",
    audioText: "",
    audioAuthorized: false,
    humanRecorded: false,
    audioSource: "",
    dialogueAuthorized: false,
    dialogueSourceContentId: "",
    options: [],
    pairs: [],
    tiles: [],
    categories: [],
    items: [],
    segments: [],
    corrections: [],
    correctedSentence: "",
    dialogue: [],
    questions: [],
    steps: [],
    template: "",
    correctOrder: [],
    media: { type: "none", value: "", alt: "", sourceId: "", authorized: false },
    hints: [],
    explanation: "",
    correctAnswer: TARGET,
    correctOptionId: "",
    correctCorrectionId: "",
    acceptedAnswers: [TARGET],
    lexemeIds: [LEXEME_ID],
    grammarRuleIds: [GRAMMAR_RULE_ID],
    sourceIds: [SOURCE_ID],
    sourceActivityId: SOURCE_ACTIVITY_ID,
    sourceContentId: SOURCE_CONTENT_ID,
    conflictIds: [],
    hasOpenConflict: false,
    distractorQuality: "PLAUSIBLE",
    cognitiveDemand: cognitiveDemandFor(type),
    fingerprintSeed: "server-security-test"
  };
}

function validActivity(type, id) {
  const activity = commonActivity(type, id);
  if (type === "CONTEXT_CHOICE") Object.assign(activity, {
    options: clone(OPTIONS),
    correctOptionId: "dog",
    contextText: APPROVED_MATERIAL.contexts[0].text,
    contextAuthorized: true
  });
  if (type === "ARROW_MATCH") activity.pairs = clone(PAIRS);
  if (type === "CATEGORY_SORT") Object.assign(activity, {
    categories: clone(CATEGORIES),
    items: clone(ITEMS)
  });
  if (type === "DIALOGUE_NEXT_TURN") Object.assign(activity, {
    options: clone(DIALOGUE_OPTIONS),
    correctOptionId: "dog",
    dialogue: clone(DIALOGUE),
    dialogueAuthorized: true,
    dialogueSourceContentId: DIALOGUE_SOURCE_ID
  });
  if (type === "INDEPENDENT_RECALL") Object.assign(activity, {
    helpLevel: 0,
    answerExposure: "HIDDEN",
    hints: []
  });
  if (type === "AUDIO_SELECT") Object.assign(activity, {
    options: clone(OPTIONS),
    correctOptionId: "dog",
    ...clone(AUDIO)
  });
  return activity;
}

function withSchemaSourceIdentityTransport(activity) {
  const record = value => ({
    ...value,
    sourceActivityId: Object.hasOwn(value, "sourceActivityId") ? value.sourceActivityId : null,
    sourceContentId: Object.hasOwn(value, "sourceContentId") ? value.sourceContentId : null,
    sourceIds: Object.hasOwn(value, "sourceIds") ? clone(value.sourceIds) : null
  });
  const transported = {
    ...clone(activity),
    sourceActivityId: Object.hasOwn(activity, "sourceActivityId") ? activity.sourceActivityId : null,
    sourceContentId: Object.hasOwn(activity, "sourceContentId") ? activity.sourceContentId : null
  };
  for (const key of ["options", "pairs", "categories", "items", "dialogue"]) {
    transported[key] = (transported[key] || []).map(record);
  }
  return transported;
}

function expectReason(activity, reason, context = matcherContext()) {
  const reasons = validateActivityAgainstApprovedMaterial(activity, context);
  assert.ok(reasons.includes(reason), `${reason} no apareció en ${JSON.stringify(reasons)}`);
}

function candidateFor(activity, errorType = "SEMANTIC_CONFUSION", overrides = {}) {
  return {
    activityType: activity.activityType,
    pedagogicalGoal: PLAN_INJECTION,
    errorType,
    helpLevel: activity.helpLevel,
    reasonCode: PLAN_INJECTION,
    estimatedCognitiveDemand: cognitiveDemandFor(activity.activityType),
    requiresIndependentRetest: false,
    activity,
    ...overrides
  };
}

function plannerPlan(candidate, context, overrides = {}) {
  const errorType = classifyError({ ...context, correct: false }).errorType;
  return {
    planVersion: "NALVI-TUTOR-CATALOG-1",
    planId: PLAN_INJECTION,
    conceptId: CONCEPT_ID,
    linguisticMode: "LESSON_BOUNDED",
    diagnosis: {
      errorType,
      likelyDifficulty: PLAN_INJECTION,
      confidence: 0.01,
      prerequisiteGap: PLAN_INJECTION,
      skillAffected: PLAN_INJECTION
    },
    pedagogicalGoal: PLAN_INJECTION,
    strategy: { primaryStrategy: PLAN_INJECTION, secondaryStrategy: PLAN_INJECTION, reasonCode: PLAN_INJECTION },
    studentFeedback: { locale: "es", shortMessage: PLAN_INJECTION },
    candidateActivities: [candidate],
    progressionPolicy: {
      onIncorrect: PLAN_INJECTION,
      onGuidedCorrect: "REVIEW_LATER",
      requiresIndependentRetest: false,
      maxInterventionsBeforeDefer: 8
    },
    fallbackPolicy: { strategy: PLAN_INJECTION, reason: PLAN_INJECTION },
    validationMetadata: {
      sourceIds: [PLAN_INJECTION],
      knowledgeIds: [PLAN_INJECTION],
      claimedRiskLevel: "RED"
    },
    ...overrides
  };
}

const responseFor = value => ({
  ok: true,
  json: async () => ({ output_text: JSON.stringify(value), usage: { input_tokens: 1, output_tokens: 1 } })
});

async function runPlanner({
  activity,
  request = sourceRequest(),
  candidateOverrides = {},
  planOverrides = {},
  authority = activityAuthority
}) {
  const normalized = normalizeInterventionRequest(request, { activityAuthority: authority });
  const errorType = classifyError({ ...normalized, correct: false }).errorType;
  const candidate = candidateFor(activity, errorType, candidateOverrides);
  const plan = plannerPlan(candidate, normalized, planOverrides);
  let plannerCalls = 0;
  const orchestrator = createAdaptiveTutorOrchestrator({
    activityAuthority: authority,
    fetchImpl: async () => {
      plannerCalls += 1;
      return responseFor(plan);
    },
    env: {
      OPENAI_API_KEY: "test-only",
      OPENAI_TUTOR_MODEL: "test-model",
      AI_TUTOR_CRITIC_ENABLED: "false",
      AI_TUTOR_MAX_REVISION_ATTEMPTS: "0"
    }
  });
  const result = await orchestrator.orchestrateAdaptiveTutoring(request);
  return { result, normalized, plannerCalls, submittedPlan: plan };
}

test("el matcher acepta exclusivamente las seis formas construidas con material literal exacto", () => {
  for (const type of [
    "CONTEXT_CHOICE",
    "ARROW_MATCH",
    "CATEGORY_SORT",
    "DIALOGUE_NEXT_TURN",
    "INDEPENDENT_RECALL",
    "AUDIO_SELECT"
  ]) {
    assert.deepEqual(validateActivityAgainstApprovedMaterial(validActivity(type), matcherContext()), [], type);
  }
});

test("los seis formatos de intervención inmediata se proyectan siempre como evidencia guiada", () => {
  const context = matcherContext();
  for (const type of [
    "CONTEXT_CHOICE",
    "ARROW_MATCH",
    "CATEGORY_SORT",
    "DIALOGUE_NEXT_TURN",
    "INDEPENDENT_RECALL",
    "AUDIO_SELECT"
  ]) {
    const renderable = toRenderable({
      ...validActivity(type),
      independentRetest: true,
      spacedRetest: true,
      evidenceMode: "independent",
      nalviGuided: false
    }, context, `guided-${type.toLowerCase()}`, 0);

    assert.ok(renderable, type);
    assert.equal(renderable.nalviGuided, true, type);
    assert.equal(renderable.independentRetest, false, type);
    assert.equal(renderable.spacedRetest, false, type);
    assert.equal(renderable.evidenceMode, "guided", type);
  }
});

test("provenance exacta sobrevive authority → sanitizer → fallback → matcher → renderable", () => {
  const normalized = normalizeInterventionRequest(sourceRequest(), { activityAuthority });
  assert.equal(normalized.approvedActivityMaterial.sourceActivityId, SOURCE_ACTIVITY_ID);
  assert.equal(normalized.approvedActivityMaterial.sourceContentId, SOURCE_CONTENT_ID);
  assert.deepEqual(normalized.approvedActivityMaterial.sourceIds, [SOURCE_ID]);
  assert.deepEqual(normalized.approvedActivityMaterial.pairs, clone(PAIRS));

  const arrow = buildDeterministicFallbackCandidates(normalized, 1, "SEMANTIC_CONFUSION")
    .find(candidate => candidate.activityType === "ARROW_MATCH")?.activity;
  assert.ok(arrow);
  assert.equal(arrow.sourceActivityId, SOURCE_ACTIVITY_ID);
  assert.equal(arrow.sourceContentId, SOURCE_CONTENT_ID);
  assert.deepEqual(arrow.sourceIds, [SOURCE_ID]);
  assert.deepEqual(arrow.pairs, clone(PAIRS));
  assert.deepEqual(validateActivityAgainstApprovedMaterial(arrow, normalized), []);

  const rendered = toRenderable(arrow, normalized, "provenance-plan", 0);
  assert.equal(rendered.sourceActivityId, SOURCE_ACTIVITY_ID);
  assert.equal(rendered.sourceContentId, SOURCE_CONTENT_ID);
  assert.deepEqual(rendered.sourceIds, [SOURCE_ID]);
  assert.deepEqual(rendered.pairs, clone(PAIRS));
  assert.equal(rendered.validatedAgainstApprovedMaterial, true);

  const reordered = clone(arrow);
  reordered.pairs[2].sourceIds.reverse();
  assert.deepEqual(validateActivityAgainstApprovedMaterial(reordered, normalized), []);
});

test("provenance omitida, alterada, malformada o con whitespace se rechaza sin sanarla", () => {
  const context = matcherContext();
  const cases = [
    ["sourceActivityId omitido", activity => { delete activity.pairs[0].sourceActivityId; }, "UNAPPROVED_PAIRS"],
    ["sourceActivityId alterado", activity => { activity.pairs[0].sourceActivityId = "forged-source"; }, "UNAPPROVED_PAIRS"],
    ["sourceContentId alterado", activity => { activity.pairs[1].sourceContentId = "forged-content"; }, "UNAPPROVED_PAIRS"],
    ["sourceIds alterados", activity => { activity.pairs[2].sourceIds = [SOURCE_ID, "forged-source"]; }, "UNAPPROVED_PAIRS"],
    ["sourceIds duplicados", activity => { activity.pairs[2].sourceIds = [SOURCE_ID, SOURCE_ID]; }, "UNAPPROVED_PAIRS"],
    ["sourceActivityId objeto", activity => { activity.pairs[0].sourceActivityId = { forged: true }; }, "UNAPPROVED_PAIRS"],
    ["sourceActivityId con whitespace", activity => { activity.pairs[0].sourceActivityId = ` ${SOURCE_ACTIVITY_ID}`; }, "UNAPPROVED_PAIRS"],
    ["sourceIds con whitespace", activity => { activity.pairs[2].sourceIds = [` ${SOURCE_ID}`]; }, "UNAPPROVED_PAIRS"],
    ["top sourceActivityId alterado", activity => { activity.sourceActivityId = "forged-source"; }, "UNAPPROVED_SOURCE_IDENTITY"],
    ["top sourceContentId omitido", activity => { delete activity.sourceContentId; }, "UNAPPROVED_SOURCE_IDENTITY"],
    ["top sourceIds alterados", activity => { activity.sourceIds = ["forged-source"]; }, "UNAPPROVED_SOURCE_IDS"]
  ];
  for (const [name, mutate, reason] of cases) {
    const activity = validActivity("ARROW_MATCH");
    mutate(activity);
    assert.ok(validateActivityAgainstApprovedMaterial(activity, context).includes(reason), name);
  }

  for (const malformed of [
    { sourceActivityId: ` ${SOURCE_ACTIVITY_ID}` },
    { sourceContentId: `${SOURCE_CONTENT_ID} ` },
    { sourceIds: [` ${SOURCE_ID}`] },
    { sourceIds: [SOURCE_ID, SOURCE_ID] },
    { sourceIds: { forged: SOURCE_ID } }
  ]) {
    const sanitized = sanitizeApprovedActivityMaterial({ ...clone(APPROVED_MATERIAL), ...malformed }, TARGET, "es");
    assert.deepEqual(sanitized, {
      options: [], correctOptionId: "", correctAnswer: "", acceptedAnswers: [],
      pairs: [], contexts: [], categories: [], items: [], dialogue: [], dialogueOptions: [],
      dialogueCorrectOptionId: "", dialogueCorrectAnswer: "", dialogueSourceContentId: "", audio: null
    });
    assert.deepEqual(buildDeterministicFallbackCandidates({ ...matcherContext(), approvedActivityMaterial: { ...clone(APPROVED_MATERIAL), ...malformed } }), []);
  }
});

test("toRenderable público no emite contenido cuyo matcher rechaza", () => {
  const context = matcherContext();
  const pairDrift = validActivity("ARROW_MATCH");
  pairDrift.pairs[0].right = "FORGED_VISIBLE";
  assert.ok(validateActivityAgainstApprovedMaterial(pairDrift, context).includes("UNAPPROVED_PAIRS"));
  assert.equal(toRenderable(pairDrift, context, "rejected-pair", 0), null);

  const optionDrift = validActivity("CONTEXT_CHOICE");
  optionDrift.options[1].text = "FORGED_OPTION";
  assert.ok(validateActivityAgainstApprovedMaterial(optionDrift, context).includes("UNAPPROVED_OPTIONS"));
  assert.equal(toRenderable(optionDrift, context, "rejected-option", 0), null);

  for (const [activity, invalidContext] of [
    [null, context],
    [{}, null],
    [{ ...validActivity("ARROW_MATCH"), conceptIds: {} }, context],
    [new Proxy(validActivity("ARROW_MATCH"), {
      get() { throw new Error("HOSTILE_ACTIVITY"); }
    }), context]
  ]) {
    let result = "not-called";
    assert.doesNotThrow(() => { result = toRenderable(activity, invalidContext, "invalid-shape", 0); });
    assert.equal(result, null);
  }
});

test("el schema estricto transporta provenance nullable y el matcher elimina sólo null ausente", async () => {
  const activitySchema = ADAPTIVE_TUTOR_PLAN_SCHEMA.properties.candidateActivities.items.properties.activity;
  for (const branch of activitySchema.anyOf) {
    for (const field of ["sourceActivityId", "sourceContentId"]) {
      assert.ok(branch.required.includes(field));
      assert.deepEqual(branch.properties[field].type, ["string", "null"]);
    }
    for (const recordKey of ["options", "pairs", "categories", "items", "dialogue"]) {
      const recordSchema = branch.properties[recordKey].items;
      for (const field of ["sourceActivityId", "sourceContentId", "sourceIds"]) assert.ok(recordSchema.required.includes(field));
    }
  }

  const exact = await runPlanner({ activity: withSchemaSourceIdentityTransport(validActivity("ARROW_MATCH")) });
  assert.equal(exact.result.usedAI, true);
  assert.deepEqual(exact.result.adaptiveInterventionPlan.activities[0].pairs, clone(PAIRS));

  const recordWithoutTopIdentity = clone(AUTHORITY_RECORD);
  delete recordWithoutTopIdentity.approvedActivityMaterial.sourceActivityId;
  delete recordWithoutTopIdentity.approvedActivityMaterial.sourceContentId;
  const authorityWithoutTopIdentity = Object.freeze({
    ...activityAuthority,
    resolve({ activityId } = {}) {
      return activityId === SOURCE_ACTIVITY_ID ? clone(recordWithoutTopIdentity) : null;
    }
  });
  const activityWithoutTopIdentity = validActivity("ARROW_MATCH");
  delete activityWithoutTopIdentity.sourceActivityId;
  delete activityWithoutTopIdentity.sourceContentId;
  const absentTop = await runPlanner({
    activity: withSchemaSourceIdentityTransport(activityWithoutTopIdentity),
    authority: authorityWithoutTopIdentity
  });
  assert.equal(absentTop.result.usedAI, true);
  assert.equal(Object.hasOwn(absentTop.result.adaptiveInterventionPlan.activities[0], "sourceActivityId"), false);
  assert.equal(Object.hasOwn(absentTop.result.adaptiveInterventionPlan.activities[0], "sourceContentId"), false);

  const mismatched = withSchemaSourceIdentityTransport(validActivity("ARROW_MATCH"));
  mismatched.pairs[0].sourceActivityId = "forged-source";
  const rejected = await runPlanner({ activity: mismatched });
  assert.equal(rejected.result.usedAI, false);
  assert.ok(rejected.result.adaptiveInterventionPlan.activities.every(activity =>
    !JSON.stringify(activity).includes("forged-source")));
});

test("el builder público rechaza IDs y referencias malformados sin coerción ni excepciones", async t => {
  const cases = [
    ["option id objeto", material => {
      material.options[0].id = { evil: 1 };
      material.correctOptionId = { evil: 1 };
    }, ["CONTEXT_CHOICE", "AUDIO_SELECT"]],
    ["option id con whitespace", material => {
      material.options[0].id = " dog";
      material.correctOptionId = " dog";
    }, ["CONTEXT_CHOICE", "AUDIO_SELECT"]],
    ["pair id objeto", material => { material.pairs[0].id = { evil: 1 }; }, ["ARROW_MATCH"]],
    ["pair id con whitespace", material => { material.pairs[0].id = " pair-dog"; }, ["ARROW_MATCH"]],
    ["category id objeto", material => { material.categories[0].id = { evil: 1 }; }, ["CATEGORY_SORT"]],
    ["item id objeto", material => { material.items[0].id = { evil: 1 }; }, ["CATEGORY_SORT"]],
    ["item categoryId objeto", material => { material.items[0].categoryId = { evil: 1 }; }, ["CATEGORY_SORT"]],
    ["turn id objeto", material => { material.dialogue[0].id = { evil: 1 }; }, ["DIALOGUE_NEXT_TURN"]],
    ["turn id con whitespace", material => { material.dialogue[0].id = " turn-one"; }, ["DIALOGUE_NEXT_TURN"]],
    ["dialogue option/correct id objeto", material => {
      material.dialogueOptions[0].id = { evil: 1 };
      material.dialogueCorrectOptionId = { evil: 1 };
    }, ["DIALOGUE_NEXT_TURN"]],
    ["dialogue correct id con whitespace", material => {
      material.dialogueCorrectOptionId = " dog";
    }, ["DIALOGUE_NEXT_TURN"]],
    ["dialogueOptions no-array", material => { material.dialogueOptions = {}; }, ["DIALOGUE_NEXT_TURN"]],
    ["options no-array", material => { material.options = {}; }, ["CONTEXT_CHOICE", "AUDIO_SELECT"]],
    ["pairs no-array", material => { material.pairs = {}; }, ["ARROW_MATCH"]],
    ["contexts no-array", material => { material.contexts = {}; }, ["CONTEXT_CHOICE"]]
  ];
  for (const [name, mutate, forbiddenTypes] of cases) await t.test(name, () => {
    const context = matcherContext();
    mutate(context.approvedActivityMaterial);
    let candidates;
    assert.doesNotThrow(() => {
      candidates = buildDeterministicFallbackCandidates(context, 1, "SEMANTIC_CONFUSION");
    });
    for (const type of forbiddenTypes) {
      assert.equal(candidates.some(candidate => candidate.activityType === type), false, `${name}: ${type}`);
    }
    assert.doesNotMatch(JSON.stringify(candidates), /\[object Object\]/);
  });
});

test("CONTEXT_CHOICE rechaza opción, distractor y contextText alterados", async t => {
  const cases = [
    ["opción correcta", activity => { activity.options[0].text = "Jaguá"; }, "UNAPPROVED_OPTIONS"],
    ["distractor", activity => { activity.options[1].text = "Guyrá"; }, "UNAPPROVED_OPTIONS"],
    ["contextText", activity => { activity.contextText += " X"; }, "UNAPPROVED_CONTEXT"]
  ];
  for (const [name, mutate, reason] of cases) await t.test(name, () => {
    const activity = validActivity("CONTEXT_CHOICE");
    mutate(activity);
    expectReason(activity, reason);
  });
});

test("ARROW_MATCH rechaza una pareja alterada y la ausencia del target", async t => {
  await t.test("pareja alterada", () => {
    const activity = validActivity("ARROW_MATCH");
    activity.pairs[1].right = "pájaro inventado";
    expectReason(activity, "UNAPPROVED_PAIRS");
  });
  await t.test("target ausente", () => {
    const activity = validActivity("ARROW_MATCH");
    activity.pairs = activity.pairs.filter(pair => pair.left !== TARGET && pair.right !== TARGET);
    expectReason(activity, "APPROVED_TARGET_MISSING_FROM_PAIRS");
  });
});

test("CATEGORY_SORT rechaza category, categoryId, item y ausencia del target", async t => {
  const cases = [
    ["category", activity => { activity.categories[0].label = "Animales inventados"; }, "UNAPPROVED_CATEGORIES"],
    ["categoryId", activity => { activity.items[0].categoryId = "missing-category"; }, "UNAPPROVED_ITEM_CATEGORY_REFERENCE"],
    ["item", activity => { activity.items[1].text = "Guyra inventado"; }, "UNAPPROVED_ITEMS"],
    ["target ausente", activity => { activity.items = activity.items.filter(item => item.text !== TARGET); }, "APPROVED_TARGET_MISSING_FROM_ITEMS"]
  ];
  for (const [name, mutate, reason] of cases) await t.test(name, () => {
    const activity = validActivity("CATEGORY_SORT");
    mutate(activity);
    expectReason(activity, reason);
  });
});

test("DIALOGUE_NEXT_TURN rechaza turno, opción, source y cambio de un solo carácter", async t => {
  const cases = [
    ["turno", activity => { activity.dialogue[1].text = "Turno inventado"; }, "UNAPPROVED_DIALOGUE"],
    ["opción", activity => { activity.options[1].text = "Guyra inventado"; }, "UNAPPROVED_OPTIONS"],
    ["source", activity => { activity.dialogueSourceContentId = "DIALOGUE-EVIL"; }, "UNTRACEABLE_APPROVED_DIALOGUE"],
    ["un carácter", activity => { activity.dialogue[0].text = activity.dialogue[0].text.replace("’", "'"); }, "UNAPPROVED_DIALOGUE"]
  ];
  for (const [name, mutate, reason] of cases) await t.test(name, () => {
    const activity = validActivity("DIALOGUE_NEXT_TURN");
    mutate(activity);
    expectReason(activity, reason);
  });
});

test("INDEPENDENT_RECALL rechaza acceptedAnswers adicionales", () => {
  const activity = validActivity("INDEPENDENT_RECALL");
  activity.acceptedAnswers.push("Guyra");
  expectReason(activity, "APPROVED_ACCEPTED_ANSWERS_MISMATCH");
});

test("AUDIO_SELECT rechaza cualquier alteración de su tupla canónica", async t => {
  const cases = [
    ["id", activity => { activity.audioId = "NALVI-AUDIO-095"; }],
    ["ruta", activity => { activity.audioPath = "assets/audio/guarani/ali-2026/095-itati.m4a"; }],
    ["texto", activity => { activity.audioText = "Guyra"; }],
    ["autorización", activity => { activity.audioAuthorized = false; }],
    ["origen humano", activity => { activity.humanRecorded = false; }],
    ["source", activity => { activity.audioSource = "client-claim"; }]
  ];
  for (const [name, mutate] of cases) await t.test(name, () => {
    const activity = validActivity("AUDIO_SELECT");
    mutate(activity);
    expectReason(activity, "UNAPPROVED_AUDIO");
  });
});

test("el matcher rechaza requiresStudentResponse=false y scope/provenance forjados", async t => {
  const cases = [
    ["requiresStudentResponse", activity => { activity.requiresStudentResponse = false; }, "STUDENT_RESPONSE_REQUIRED"],
    ["conceptId", activity => { activity.conceptId = "concept-evil"; }, "UNAPPROVED_CONCEPT_ID"],
    ["conceptIds", activity => { activity.conceptIds.push("concept-evil"); }, "UNAPPROVED_CONCEPT_IDS"],
    ["learningObjectiveId", activity => { activity.learningObjectiveId = "lo-evil"; }, "UNAPPROVED_LEARNING_OBJECTIVE"],
    ["lexemeIds", activity => { activity.lexemeIds = ["LEX-EVIL"]; }, "UNAPPROVED_LEXEME_IDS"],
    ["grammarRuleIds", activity => { activity.grammarRuleIds = ["GRAMMAR-EVIL"]; }, "UNAPPROVED_GRAMMAR_RULE_IDS"],
    ["sourceIds", activity => { activity.sourceIds = ["SOURCE-EVIL"]; }, "UNAPPROVED_SOURCE_IDS"]
  ];
  for (const [name, mutate, reason] of cases) await t.test(name, () => {
    const activity = validActivity("INDEPENDENT_RECALL");
    mutate(activity);
    expectReason(activity, reason);
  });
});

test("copy visible, diagnóstico secundario, políticas, strategy, metadata y wrappers se canonicalizan", async () => {
  const activity = validActivity("CONTEXT_CHOICE", "planner-controlled-id");
  Object.assign(activity, {
    prompt: VISIBLE_INJECTION,
    instruction: VISIBLE_INJECTION,
    hints: [VISIBLE_INJECTION],
    explanation: VISIBLE_INJECTION,
    skill: "planner-skill",
    difficulty: "planner-difficulty"
  });
  const { result } = await runPlanner({
    activity,
    candidateOverrides: {
      pedagogicalGoal: PLAN_INJECTION,
      reasonCode: PLAN_INJECTION,
      requiresIndependentRetest: false
    }
  });

  assert.equal(result.usedAI, true);
  const plan = result.adaptiveInterventionPlan;
  const rendered = plan.activities[0];
  assert.equal(rendered.prompt, deterministicInterventionCopy("CONTEXT_CHOICE", "es"));
  assert.equal(rendered.instruction, deterministicInterventionCopy("CONTEXT_CHOICE", "es"));
  assert.deepEqual(rendered.hints, []);
  assert.equal(rendered.explanation, "");
  assert.doesNotMatch(JSON.stringify({ prompt: rendered.prompt, instruction: rendered.instruction, hints: rendered.hints, explanation: rendered.explanation }), new RegExp(VISIBLE_INJECTION));
  assert.equal(rendered.skill, SOURCE_ACTIVITY.skill);
  assert.equal(rendered.difficulty, SOURCE_ACTIVITY.difficulty);

  assert.equal(plan.diagnosis.errorType, "SEMANTIC_CONFUSION");
  assert.equal(plan.diagnosis.likelyDifficulty, "recognitionRule");
  assert.equal(plan.diagnosis.skillAffected, SOURCE_ACTIVITY.skill);
  assert.equal(plan.pedagogicalGoal, "Practise the verified lesson objective through an approved activity format.");
  assert.deepEqual(plan.strategy, {
    primaryStrategy: "CHANGE_MODALITY",
    secondaryStrategy: null,
    reasonCode: "SERVER_APPROVED_CONTEXT_CHOICE"
  });
  assert.deepEqual(plan.progressionPolicy, {
    onIncorrect: "BLOCK_AND_INTERVENE",
    onGuidedCorrect: "CONTINUE_PRACTICE",
    requiresIndependentRetest: true,
    maxInterventionsBeforeDefer: INTERVENTION_CONFIG.maxInterventionsBeforeDefer
  });
  assert.deepEqual(plan.fallbackPolicy, {
    strategy: "OFFICIAL_CATALOG_LOCAL_FALLBACK",
    reason: "SERVER_VALIDATED_SELECTION"
  });
  assert.equal(plan.validationMetadata.claimedRiskLevel, "GREEN");
  assert.deepEqual(plan.validationMetadata.sourceIds, [SOURCE_ID]);
  assert.deepEqual(plan.validationMetadata.knowledgeIds.sort(), [GRAMMAR_RULE_ID, LEXEME_ID].sort());
  assert.doesNotMatch(JSON.stringify(plan), new RegExp(PLAN_INJECTION));
});

test("diagnosis, candidate.errorType y wrappers incoherentes no controlan la selección", async t => {
  const cases = [
    ["diagnosis.errorType", {
      planOverrides: { diagnosis: { errorType: "WORD_ORDER_ERROR", likelyDifficulty: PLAN_INJECTION, confidence: 1, prerequisiteGap: null, skillAffected: PLAN_INJECTION } }
    }],
    ["candidate.errorType", { candidateOverrides: { errorType: "WORD_ORDER_ERROR" } }],
    ["candidate.activityType", { candidateOverrides: { activityType: "ARROW_MATCH" } }],
    ["candidate.helpLevel", { candidateOverrides: { helpLevel: 4 } }],
    ["candidate.estimatedCognitiveDemand", { candidateOverrides: { estimatedCognitiveDemand: "RECALL" } }]
  ];
  for (const [name, overrides] of cases) await t.test(name, async () => {
    const { result } = await runPlanner({ activity: validActivity("CONTEXT_CHOICE"), ...overrides });
    assert.equal(result.usedAI, false);
    assert.equal(result.adaptiveInterventionPlan.diagnosis.errorType, "SEMANTIC_CONFUSION");
    assert.ok(result.adaptiveInterventionPlan.activities.length > 0, "Debe caer a fallback server-side seguro.");
    assert.doesNotMatch(JSON.stringify(result.adaptiveInterventionPlan), new RegExp(PLAN_INJECTION));
  });
});

test("el fallback profesional pasa el mismo matcher exacto", () => {
  const request = sourceRequest();
  const normalized = normalizeInterventionRequest(request, { activityAuthority });
  const fallback = createProfessionalFallbackPlan(request, {
    activityAuthority,
    linguisticMode: "LESSON_BOUNDED",
    reason: "SECURITY_TEST_FALLBACK"
  });

  assert.equal(fallback.linguisticMode, "LESSON_BOUNDED");
  assert.ok(fallback.activities.length > 0);
  assert.deepEqual(validateActivityAgainstApprovedMaterial(fallback.activities[0], normalized), []);
});

test("INDEPENDENT_RECALL inmediato siempre es guided y nunca un retest independiente", async () => {
  const request = sourceRequest({ studentAnswer: "" });
  const activity = validActivity("INDEPENDENT_RECALL", "planner-recall-id");
  const { result } = await runPlanner({ activity, request });

  assert.equal(result.usedAI, true);
  const rendered = result.adaptiveInterventionPlan.activities[0];
  assert.equal(rendered.activityType, "INDEPENDENT_RECALL");
  assert.equal(rendered.nalviGuided, true);
  assert.equal(rendered.independentRetest, false);
  assert.equal(rendered.spacedRetest, false);
  assert.equal(rendered.evidenceMode, "guided");
  assert.equal(result.adaptiveInterventionPlan.progressionPolicy.requiresIndependentRetest, true);
  assert.equal(result.metrics.independentRetestCoverage, 0);
  assert.equal(result.event.metrics.independentRetestCoverage, 0);
});

test("el ID del Planner no sobrevive y el ID servidor depende del contenido canónico", async () => {
  const first = await runPlanner({ activity: validActivity("CONTEXT_CHOICE", "planner-id-one") });
  const sameContent = await runPlanner({ activity: validActivity("CONTEXT_CHOICE", "planner-id-two") });
  const differentContent = await runPlanner({ activity: validActivity("ARROW_MATCH", "planner-id-three") });

  assert.equal(first.result.usedAI, true);
  assert.equal(sameContent.result.usedAI, true);
  assert.equal(differentContent.result.usedAI, true);
  const firstId = first.result.adaptiveInterventionPlan.activities[0].id;
  const sameContentId = sameContent.result.adaptiveInterventionPlan.activities[0].id;
  const differentContentId = differentContent.result.adaptiveInterventionPlan.activities[0].id;
  assert.notEqual(firstId, "planner-id-one");
  assert.notEqual(sameContentId, "planner-id-two");
  assert.notEqual(differentContentId, "planner-id-three");
  assert.equal(firstId, sameContentId);
  assert.notEqual(firstId, differentContentId);
});

test("la comparación de material es NFC literal y no colapsa espacios", () => {
  const activity = validActivity("ARROW_MATCH");
  activity.pairs[0].left = `  ${activity.pairs[0].left}  `;
  expectReason(activity, "UNAPPROVED_PAIRS");
});

test("toRenderable proyecta sólo campos canónicos y elimina contenido no aplicable del Planner", async () => {
  const marker = "CLIENT_EVIL_NON_APPLICABLE_CONTENT";
  const activity = validActivity("ARROW_MATCH");
  Object.assign(activity, {
    media: { type: "none", value: "", alt: marker, sourceId: "", authorized: true },
    template: marker,
    correctedSentence: marker,
    fingerprintSeed: marker
  });
  activity.pairs[0].extraVisibleAlias = marker;

  const direct = toRenderable(activity, matcherContext(), "projection-test", 0);
  assert.deepEqual(direct.media, { type: "none", value: "", alt: "", sourceId: "", authorized: false });
  assert.equal(direct.template, "");
  assert.equal(direct.correctedSentence, "");
  assert.equal(direct.fingerprintSeed, "");
  assert.equal(Object.hasOwn(direct.pairs[0], "extraVisibleAlias"), false);
  assert.doesNotMatch(JSON.stringify(direct), new RegExp(marker));

  const { result } = await runPlanner({ activity });
  assert.doesNotMatch(JSON.stringify(result.adaptiveInterventionPlan), new RegExp(marker));
});

test("CATEGORY_SORT incorpora items, categoryId e IDs a la identidad server-side", () => {
  const approvedItems = [
    ...clone(ITEMS),
    { id: "horse-item", text: "Kavaju", categoryId: "animals", authorized: true },
    { id: "river-item", text: "Ysyry", categoryId: "places", authorized: true }
  ];
  const context = matcherContext();
  context.approvedActivityMaterial.items = approvedItems;
  const first = validActivity("CATEGORY_SORT");
  const second = validActivity("CATEGORY_SORT");
  second.items = [
    clone(ITEMS[0]), clone(ITEMS[1]), clone(approvedItems[6]),
    clone(ITEMS[3]), clone(ITEMS[4]), clone(approvedItems[7])
  ];
  assert.deepEqual(validateActivityAgainstApprovedMaterial(first, context), []);
  assert.deepEqual(validateActivityAgainstApprovedMaterial(second, context), []);

  const firstRendered = toRenderable(first, context, "category-one", 0);
  const secondRendered = toRenderable(second, context, "category-two", 0);
  assert.notEqual(firstRendered.id, secondRendered.id);
  assert.notEqual(firstRendered.fingerprint, secondRendered.fingerprint);
});

test("el fingerprint emitido bloquea el mismo contenido en un intento posterior", async () => {
  const first = await runPlanner({ activity: validActivity("CONTEXT_CHOICE") });
  assert.equal(first.result.usedAI, true);
  const fingerprint = first.result.adaptiveInterventionPlan.activities[0].fingerprint;
  const secondRequest = sourceRequest({
    previousActivityFingerprint: fingerprint,
    recentActivityFingerprints: [fingerprint]
  });
  const second = await runPlanner({ activity: validActivity("CONTEXT_CHOICE"), request: secondRequest });
  assert.equal(second.result.usedAI, false);
  assert.ok(second.result.adaptiveInterventionPlan.activities.every(item => item.fingerprint !== fingerprint));
  assert.notEqual(first.result.adaptiveInterventionPlan.planId, second.result.adaptiveInterventionPlan.planId);
  for (const result of [first.result, second.result]) {
    const { planId, activities } = result.adaptiveInterventionPlan;
    for (const activity of activities) assert.equal(activity.context, `adaptive-tutor:${planId}:1`);
  }
});

test("permutar sourceIds anidados no cambia identidad ni elude antirrepetición", async () => {
  const context = matcherContext();
  const firstActivity = validActivity("ARROW_MATCH");
  const reorderedActivity = clone(firstActivity);
  reorderedActivity.pairs[2].sourceIds.reverse();
  assert.deepEqual(validateActivityAgainstApprovedMaterial(firstActivity, context), []);
  assert.deepEqual(validateActivityAgainstApprovedMaterial(reorderedActivity, context), []);

  const firstDirect = toRenderable(firstActivity, context, "source-order", 0);
  const reorderedDirect = toRenderable(reorderedActivity, context, "source-order", 0);
  assert.equal(reorderedDirect.fingerprint, firstDirect.fingerprint);
  assert.equal(reorderedDirect.id, firstDirect.id);

  const first = await runPlanner({ activity: withSchemaSourceIdentityTransport(firstActivity) });
  assert.equal(first.result.usedAI, true);
  const fingerprint = first.result.adaptiveInterventionPlan.activities[0].fingerprint;
  const second = await runPlanner({
    activity: withSchemaSourceIdentityTransport(reorderedActivity),
    request: sourceRequest({
      previousActivityFingerprint: fingerprint,
      recentActivityFingerprints: [fingerprint]
    })
  });
  assert.equal(second.result.usedAI, false);
  assert.ok(second.result.adaptiveInterventionPlan.activities.every(activity => activity.fingerprint !== fingerprint));
});

test("fallback y evento conservan strategy allowlisted y reasonCode server-side", async () => {
  const activity = validActivity("CONTEXT_CHOICE");
  const { result } = await runPlanner({
    activity,
    candidateOverrides: { errorType: "WORD_ORDER_ERROR" }
  });
  assert.equal(result.usedAI, false);
  assert.equal(result.adaptiveInterventionPlan.strategy.primaryStrategy, "CHANGE_MODALITY");
  assert.match(result.adaptiveInterventionPlan.strategy.reasonCode, /^(?:[A-Z][A-Z0-9_]*|PROFESSIONAL_LOCAL_FALLBACK)$/);
  assert.equal(result.event.strategy, "CHANGE_MODALITY");
});
