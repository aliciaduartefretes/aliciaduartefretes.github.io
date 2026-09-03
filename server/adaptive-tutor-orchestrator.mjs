import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { catalogAudit, cognitiveDemandFor } from "../activity-catalog/nalvi-activity-catalog.mjs";
import { selectFirstValidCandidate } from "../activity-catalog/nalvi-activity-quality.mjs";
import { buildDeterministicFallbackCandidates, deterministicInterventionCopy } from "../progression-engine/fallback-intervention.mjs";
import { classifyError } from "../intervention-engine/intervention-engine.mjs";
import { INTERVENTION_CONFIG } from "../intervention-engine/intervention-config.mjs";
import { filterAllowedKnowledge } from "./reinforcement-engine.mjs";
import { ADAPTIVE_TUTOR_CRITIC_SCHEMA, ADAPTIVE_TUTOR_PLAN_SCHEMA } from "./adaptive-tutor-schema.mjs";
import { planMetrics, validatePedagogicalQuality } from "./adaptive-tutor-quality.mjs";
import { authorizeRecordedAudioForTarget } from "./recorded-audio-authority.mjs";
import { normalizeInterventionRequest, trustedRecordedAudio } from "./intervention-service.mjs";
import { approvedActivityAuthority as defaultApprovedActivityAuthority } from "./approved-activity-authority.mjs";

export const ADAPTIVE_TUTOR_VERSION = "NALVI-TUTOR-CATALOG-1";
const plannerPrompt = readFileSync(new URL("../prompts/nalvi-tutor-planner-v1.md", import.meta.url), "utf8");
const criticPrompt = readFileSync(new URL("../prompts/nalvi-tutor-critic-v1.md", import.meta.url), "utf8");
const LOCALES = new Set(["es", "en", "pt", "fr", "it", "de"]);
const FEEDBACK = Object.freeze({
  es: "No del todo. Probemos de otra forma.", en: "Not quite. Let’s try another way.",
  pt: "Ainda não. Vamos tentar de outra forma.", fr: "Pas tout à fait. Essayons autrement.",
  it: "Non proprio. Proviamo in un altro modo.", de: "Noch nicht ganz. Versuchen wir es anders."
});
const hash = value => createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
const normalize = value => String(value ?? "").normalize("NFC").trim().toLocaleLowerCase().replace(/\s+/g, " ");
const localize = (value, locale) => value && typeof value === "object" && !Array.isArray(value) ? String(value[locale] ?? value.es ?? value.en ?? Object.values(value)[0] ?? "") : String(value ?? "");
const sourceIdsFor = record => [...new Set((record?.sourceReferences || []).map(item => item.sourceId).filter(Boolean))];

function exactText(value, locale = "es") {
  let selected = value;
  if (value && typeof value === "object" && !Array.isArray(value)) {
    selected = [locale, "es", "en", "pt", "fr", "it", "de"]
      .filter((key, index, keys) => keys.indexOf(key) === index)
      .map(key => Object.hasOwn(value, key) ? value[key] : undefined)
      .find(candidate => typeof candidate === "string");
  }
  return typeof selected === "string" ? selected.normalize("NFC") : "";
}

function contextWithApprovedMaterial(context = {}, activityAuthority = defaultApprovedActivityAuthority) {
  return normalizeInterventionRequest(context, { activityAuthority });
}

function lessonInventory(context) {
  const values = new Set();
  const add = value => { const text = localize(value, context.uiLocale); if (text) values.add(normalize(text)); };
  const approved = context.approvedActivityMaterial || {};
  add(approved.correctAnswer);
  for (const answer of approved.acceptedAnswers || []) add(answer);
  for (const option of [...(approved.options || []), ...(approved.dialogueOptions || [])]) add(option?.text);
  for (const pair of approved.pairs || []) { add(pair?.left); add(pair?.right); }
  for (const category of approved.categories || []) add(category?.label);
  for (const item of approved.items || []) add(item?.text);
  for (const turn of approved.dialogue || []) add(turn?.text);
  add(approved.dialogueCorrectAnswer);
  return values;
}

function knowledgeInventory(records) {
  const values = new Set();
  for (const record of records) {
    [record.lemma, record.lexeme, record.normalizedForm, ...Object.values(record.forms || {}), ...Object.values(record.sourceForms || {})].forEach(value => value && values.add(normalize(value)));
    for (const sense of record.senses || []) [sense.form, sense.glossEs, ...Object.values(sense.glosses || {}), ...Object.values(sense.meanings || {})].forEach(value => value && values.add(normalize(value)));
  }
  return values;
}

export function determineLinguisticMode(context, allowedKnowledge = [], { activityAuthority = defaultApprovedActivityAuthority } = {}) {
  const secured = contextWithApprovedMaterial(context, activityAuthority);
  if (secured.activityAuthorityVerified !== true) return "BLOCKED";
  const target = normalize(secured.correctAnswer);
  if (!target) return "BLOCKED";
  if (secured.activity?.literalReuseOnly === true || secured.activity?.allowedForMastery !== true
    || secured.activity?.contentValidationStatus !== "verified") {
    return lessonInventory(secured).has(target) ? "LESSON_BOUNDED" : "BLOCKED";
  }
  if (allowedKnowledge.length && knowledgeInventory(allowedKnowledge).has(target)) return "NORMATIVE_GENERATIVE";
  return lessonInventory(secured).has(target) ? "LESSON_BOUNDED" : "BLOCKED";
}

function pseudonymizedContext(context, mode, errorType) {
  return {
    conceptId: context.conceptId, learningObjectiveId: context.learningObjectiveId, currentSkill: context.currentSkill,
    activityType: context.activityType, difficulty: context.difficulty, studentAnswer: context.studentAnswer,
    correctAnswer: context.correctAnswer, attemptNumber: context.attemptNumber, recentErrors: context.recentErrors || [],
    recentActivities: (context.recentActivities || []).slice(-5).map(activity => ({ id: activity.id, activityType: activity.activityType || activity.type })),
    recentActivityFingerprints: (context.recentActivityFingerprints || []).slice(-5),
    modalitiesAlreadyUsed: (context.modalitiesAlreadyUsed || []).slice(-5), hintHistory: context.hintHistory || [],
    retentionHistory: context.retentionHistory || [], uiLocale: context.uiLocale, grammarRuleIds: context.grammarRuleIds || [],
    lexemeIds: context.lexemeIds || [], previousActivityFingerprint: context.previousActivityFingerprint || context.previousFingerprint,
    linguisticMode: mode, errorType, enabledActivityTypes: catalogAudit().enabledTypes,
    approvedActivityMaterial: context.approvedActivityMaterial || {},
    authorizedAudio: context.approvedActivityMaterial?.audio || context.authorizedAudio || null,
    lessonMaterial: mode === "LESSON_BOUNDED" ? {
      prompt: localize(context.activity?.prompt, context.uiLocale),
      instruction: localize(context.activity?.instruction, context.uiLocale),
      options: (context.activity?.options || []).map(option => localize(option?.label ?? option?.text ?? option?.value ?? option, context.uiLocale)),
      correctAnswer: context.correctAnswer
    } : undefined
  };
}

function extractOutputText(payload) {
  if (typeof payload?.output_text === "string") return payload.output_text;
  for (const output of payload?.output || []) for (const content of output.content || []) if (content.type === "output_text") return content.text;
  return "";
}

async function callResponses({ fetchImpl, apiKey, model, schema, schemaName, instructions, input, safetyIdentifier, timeoutMs }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = Date.now();
  try {
    const response = await fetchImpl("https://api.openai.com/v1/responses", {
      method: "POST", signal: controller.signal,
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model, store: false, instructions, input: JSON.stringify(input), max_output_tokens: 6200,
        text: { format: { type: "json_schema", name: schemaName, strict: true, schema } }, safety_identifier: safetyIdentifier })
    });
    if (!response.ok) throw new Error(`OPENAI_HTTP_${response.status}`);
    const payload = await response.json();
    return { value: JSON.parse(extractOutputText(payload)), usage: payload.usage || {}, latencyMs: Date.now() - started };
  } finally { clearTimeout(timer); }
}

export async function critiqueAdaptiveTutorPlan({ plan, context, permittedKnowledge, fetchImpl = globalThis.fetch, env = process.env, safetyIdentifier = "anonymous", timeoutMs = 9000 } = {}) {
  return callResponses({ fetchImpl, apiKey: env.OPENAI_API_KEY, model: env.OPENAI_TUTOR_MODEL || env.OPENAI_MODEL || "gpt-4.1-mini",
    schema: ADAPTIVE_TUTOR_CRITIC_SCHEMA, schemaName: "nalvi_adaptive_tutor_critic", instructions: criticPrompt,
    input: { context, plan, deterministicValidation: { valid: true }, permittedKnowledge }, safetyIdentifier, timeoutMs });
}

function validateLinguisticActivity(activity, context, mode, allowedKnowledge) {
  if (activity.hasOpenConflict || (activity.conflictIds || []).length) return "OPEN_LINGUISTIC_CONFLICT";
  if (mode === "BLOCKED") return "LINGUISTIC_MODE_BLOCKED";
  const inventory = mode === "NORMATIVE_GENERATIVE"
    ? new Set([...knowledgeInventory(allowedKnowledge), ...lessonInventory(context)])
    : lessonInventory(context);
  if (normalize(activity.correctAnswer) && !inventory.has(normalize(activity.correctAnswer))) return mode === "LESSON_BOUNDED" ? "LESSON_BOUNDARY_EXCEEDED" : "INVALID_LINGUISTIC_CONTENT";
  if (mode === "NORMATIVE_GENERATIVE") {
    const ids = new Set(allowedKnowledge.map(record => record.id));
    const sources = new Set(allowedKnowledge.flatMap(sourceIdsFor));
    if ((activity.lexemeIds || []).some(id => !ids.has(id))) return "UNAUTHORIZED_LEXEME";
    if ((activity.sourceIds || []).some(id => !sources.has(id))) return "UNAUTHORIZED_SOURCE";
  }
  return "";
}

const tupleKey = values => JSON.stringify(values);
const exactId = value => typeof value === "string" ? value.normalize("NFC") : "";
const optionTuple = (option, locale) => {
  const id = exactId(option?.id);
  const text = exactText(option?.text ?? option?.label ?? option?.value, locale);
  return id && text ? tupleKey([id, text]) : "";
};
const pairTuple = (pair, locale) => {
  const id = exactId(pair?.id), left = exactText(pair?.left, locale), right = exactText(pair?.right, locale);
  return id && left && right ? tupleKey([id, left, right]) : "";
};
const categoryTuple = (category, locale) => {
  const id = exactId(category?.id), label = exactText(category?.label ?? category?.text, locale);
  return id && label ? tupleKey([id, label]) : "";
};
const itemTuple = (item, locale) => {
  const id = exactId(item?.id), text = exactText(item?.text ?? item?.label, locale), categoryId = exactId(item?.categoryId);
  return id && text && categoryId ? tupleKey([id, text, categoryId]) : "";
};
const turnTuple = (turn, locale) => {
  const id = exactId(turn?.id), speaker = exactText(turn?.speaker, locale), text = exactText(turn?.text, locale);
  return id && speaker && text ? tupleKey([id, speaker, text]) : "";
};

function exactSubset(candidateValues, approvedValues, keyFor) {
  const approvedCounts = new Map();
  for (const value of approvedValues) {
    const key = keyFor(value);
    if (!key) return false;
    approvedCounts.set(key, (approvedCounts.get(key) || 0) + 1);
  }
  for (const value of candidateValues) {
    const key = keyFor(value);
    if (!key || !approvedCounts.get(key)) return false;
    approvedCounts.set(key, approvedCounts.get(key) - 1);
  }
  return true;
}

function exactMultiset(left, right, keyFor) {
  return left.length === right.length && exactSubset(left, right, keyFor);
}

function contiguousSubset(candidateValues, approvedValues, keyFor) {
  if (!candidateValues.length || candidateValues.length > approvedValues.length) return false;
  const candidateKeys = candidateValues.map(keyFor);
  const approvedKeys = approvedValues.map(keyFor);
  if (candidateKeys.some(key => !key) || approvedKeys.some(key => !key)) return false;
  return approvedKeys.some((_, start) => candidateKeys.every((key, offset) => approvedKeys[start + offset] === key));
}

function canonicalAudioFields(value = {}) {
  return {
    audioId: exactId(value.audioId),
    audioPath: typeof value.audioPath === "string" ? value.audioPath.trim() : "",
    audioText: exactText(value.audioText),
    audioAuthorized: value.audioAuthorized === true,
    humanRecorded: value.humanRecorded === true,
    audioSource: typeof value.audioSource === "string" ? value.audioSource.trim() : ""
  };
}

export function validateActivityAgainstApprovedMaterial(activity = {}, context = {}) {
  const locale = LOCALES.has(context.uiLocale) ? context.uiLocale : "es";
  const approved = context.approvedActivityMaterial || {};
  const type = activity.activityType || activity.type;
  const reasons = [];
  const options = Array.isArray(activity.options) ? activity.options : [];
  const pairs = Array.isArray(activity.pairs) ? activity.pairs : [];
  const categories = Array.isArray(activity.categories) ? activity.categories : [];
  const items = Array.isArray(activity.items) ? activity.items : [];
  const dialogue = Array.isArray(activity.dialogue) ? activity.dialogue : [];
  const approvedOptions = Array.isArray(approved.options) ? approved.options : [];
  const selectionTypes = new Set(["CONTEXT_CHOICE", "DIALOGUE_NEXT_TURN", "AUDIO_SELECT"]);
  const expectedCorrectAnswer = type === "DIALOGUE_NEXT_TURN"
    ? exactText(approved.dialogueCorrectAnswer, locale)
    : exactText(approved.correctAnswer, locale);
  const expectedAcceptedAnswers = type === "DIALOGUE_NEXT_TURN"
    ? [expectedCorrectAnswer].filter(Boolean)
    : (Array.isArray(approved.acceptedAnswers) ? approved.acceptedAnswers : []).map(value => exactText(value, locale)).filter(Boolean);
  const actualCorrectAnswer = exactText(activity.correctAnswer, locale);
  const actualAcceptedAnswers = (Array.isArray(activity.acceptedAnswers) ? activity.acceptedAnswers : [])
    .map(value => exactText(value, locale)).filter(Boolean);

  if (activity.requiresStudentResponse !== true) reasons.push("STUDENT_RESPONSE_REQUIRED");
  if (activity.conceptId && exactId(activity.conceptId) !== exactId(context.conceptId)) reasons.push("UNAPPROVED_CONCEPT_ID");
  if (!exactMultiset((activity.conceptIds || []).map(exactId).filter(Boolean), [exactId(context.conceptId)].filter(Boolean), value => value)) {
    reasons.push("UNAPPROVED_CONCEPT_IDS");
  }
  if (activity.learningObjectiveId && exactId(activity.learningObjectiveId) !== exactId(context.learningObjectiveId)) {
    reasons.push("UNAPPROVED_LEARNING_OBJECTIVE");
  }
  for (const [field, approvedIds] of [
    ["lexemeIds", context.lexemeIds || []],
    ["grammarRuleIds", context.grammarRuleIds || []],
    ["sourceIds", context.sourceIds || context.activity?.sourceIds || []]
  ]) {
    const candidateIds = Array.isArray(activity[field]) ? activity[field].map(exactId).filter(Boolean) : [];
    if (!exactSubset(candidateIds, approvedIds.map(exactId).filter(Boolean), value => value)) reasons.push(`UNAPPROVED_${field.replace(/([A-Z])/g, "_$1").toUpperCase()}`);
  }

  if (!expectedCorrectAnswer || actualCorrectAnswer !== expectedCorrectAnswer) reasons.push("APPROVED_CORRECT_ANSWER_MISMATCH");
  if (!exactMultiset(actualAcceptedAnswers, expectedAcceptedAnswers, value => value)) reasons.push("APPROVED_ACCEPTED_ANSWERS_MISMATCH");

  if (selectionTypes.has(type)) {
    const sourceOptions = type === "DIALOGUE_NEXT_TURN"
      ? (Array.isArray(approved.dialogueOptions) ? approved.dialogueOptions : [])
      : approvedOptions;
    const expectedCorrectOptionId = exactId(type === "DIALOGUE_NEXT_TURN" ? approved.dialogueCorrectOptionId : approved.correctOptionId);
    if (!exactSubset(options, sourceOptions, value => optionTuple(value, locale))) reasons.push("UNAPPROVED_OPTIONS");
    if (!expectedCorrectOptionId || exactId(activity.correctOptionId) !== expectedCorrectOptionId) reasons.push("APPROVED_CORRECT_OPTION_MISMATCH");
    const correctOption = options.find(option => exactId(option?.id) === expectedCorrectOptionId);
    if (!correctOption || exactText(correctOption?.text ?? correctOption?.label ?? correctOption?.value, locale) !== expectedCorrectAnswer) {
      reasons.push("APPROVED_CORRECT_OPTION_CONTENT_MISMATCH");
    }
    if (options.some(option => exactText(option?.image ?? option?.imageAlt, locale))) reasons.push("UNAPPROVED_OPTION_MEDIA");
  } else {
    if (options.length) reasons.push("UNAPPROVED_OPTIONS_FOR_ACTIVITY_TYPE");
    if (exactId(activity.correctOptionId)) reasons.push("UNAPPROVED_CORRECT_OPTION_FOR_ACTIVITY_TYPE");
  }

  if (type === "CONTEXT_CHOICE") {
    const contextText = exactText(activity.contextText, locale);
    const contexts = Array.isArray(approved.contexts) ? approved.contexts : [];
    if (!contextText || !contexts.some(item => exactText(item?.text, locale) === contextText)) reasons.push("UNAPPROVED_CONTEXT");
  } else if (exactText(activity.contextText, locale)) reasons.push("UNAPPROVED_CONTEXT_FOR_ACTIVITY_TYPE");

  if (type === "ARROW_MATCH") {
    const approvedPairs = Array.isArray(approved.pairs) ? approved.pairs : [];
    if (!exactSubset(pairs, approvedPairs, value => pairTuple(value, locale))) reasons.push("UNAPPROVED_PAIRS");
    if (!pairs.some(pair => [pair?.left, pair?.right].some(value => exactText(value, locale) === expectedCorrectAnswer))) {
      reasons.push("APPROVED_TARGET_MISSING_FROM_PAIRS");
    }
  } else if (pairs.length) reasons.push("UNAPPROVED_PAIRS_FOR_ACTIVITY_TYPE");

  if (type === "CATEGORY_SORT") {
    const approvedCategories = Array.isArray(approved.categories) ? approved.categories : [];
    const approvedItems = Array.isArray(approved.items) ? approved.items : [];
    if (!exactSubset(categories, approvedCategories, value => categoryTuple(value, locale))) reasons.push("UNAPPROVED_CATEGORIES");
    if (!exactSubset(items, approvedItems, value => itemTuple(value, locale))) reasons.push("UNAPPROVED_ITEMS");
    const selectedCategoryIds = new Set(categories.map(category => exactId(category?.id)).filter(Boolean));
    if (items.some(item => !selectedCategoryIds.has(exactId(item?.categoryId)))) reasons.push("UNAPPROVED_ITEM_CATEGORY_REFERENCE");
    if (!items.some(item => exactText(item?.text ?? item?.label, locale) === expectedCorrectAnswer)) {
      reasons.push("APPROVED_TARGET_MISSING_FROM_ITEMS");
    }
  } else if (categories.length || items.length) reasons.push("UNAPPROVED_SORT_CONTENT_FOR_ACTIVITY_TYPE");

  if (type === "DIALOGUE_NEXT_TURN") {
    const approvedDialogue = Array.isArray(approved.dialogue) ? approved.dialogue : [];
    if (!exactId(approved.dialogueSourceContentId)
      || exactId(activity.dialogueSourceContentId) !== exactId(approved.dialogueSourceContentId)) reasons.push("UNTRACEABLE_APPROVED_DIALOGUE");
    if (dialogue.length < 2 || dialogue.length > 4) reasons.push("UNAPPROVED_DIALOGUE_LENGTH");
    if (!contiguousSubset(dialogue, approvedDialogue, value => turnTuple(value, locale))) reasons.push("UNAPPROVED_DIALOGUE");
  } else if (dialogue.length) reasons.push("UNAPPROVED_DIALOGUE_FOR_ACTIVITY_TYPE");

  if (type === "AUDIO_SELECT") {
    const expectedAudio = canonicalAudioFields(approved.audio || {});
    const candidateAudio = canonicalAudioFields(activity);
    const serverAuthorized = trustedRecordedAudio(activity, expectedCorrectAnswer, { activityClaim: true });
    if (!serverAuthorized || tupleKey(Object.values(candidateAudio)) !== tupleKey(Object.values(expectedAudio))) {
      reasons.push("UNAPPROVED_AUDIO");
    }
  } else if (activity.audioId || activity.audioPath || activity.audioText || activity.audioAuthorized === true
    || activity.humanRecorded === true || activity.audioSource) reasons.push("UNAPPROVED_AUDIO_FOR_ACTIVITY_TYPE");

  if (activity.media && typeof activity.media === "object"
    && (exactText(activity.media.type, locale) && exactText(activity.media.type, locale) !== "none"
      || exactText(activity.media.value, locale) || exactId(activity.media.sourceId))) reasons.push("UNAPPROVED_MEDIA");
  if ((activity.tiles || []).length || (activity.segments || []).length || (activity.corrections || []).length
    || (activity.questions || []).length || (activity.steps || []).length) reasons.push("UNAPPROVED_STRUCTURED_CONTENT_FOR_ACTIVITY_TYPE");

  return [...new Set(reasons)];
}

function canonicalizeVisibleActivityCopy(activity = {}, context = {}) {
  const type = activity.activityType || activity.type;
  const copy = deterministicInterventionCopy(type, context.uiLocale);
  return { ...activity, prompt: copy, instruction: copy, hints: [], explanation: "" };
}

function canonicalContentDigest(content) {
  const sortedRecords = values => [...values].sort((left, right) => tupleKey(left).localeCompare(tupleKey(right)));
  return hash({
    ...content,
    conceptIds: [...content.conceptIds].sort(),
    lexemeIds: [...content.lexemeIds].sort(),
    grammarRuleIds: [...content.grammarRuleIds].sort(),
    sourceIds: [...content.sourceIds].sort(),
    options: sortedRecords(content.options),
    pairs: sortedRecords(content.pairs),
    categories: sortedRecords(content.categories),
    items: sortedRecords(content.items),
    acceptedAnswers: [...content.acceptedAnswers].sort()
  });
}

function isCanonicalDuplicate(activity, context = {}) {
  if (!activity?.fingerprint) return false;
  return new Set([
    context.previousActivityFingerprint,
    context.previousFingerprint,
    ...(context.recentActivityFingerprints || [])
  ].filter(Boolean)).has(activity.fingerprint);
}

function canonicalDiagnosis(context) {
  const diagnosis = classifyError({ ...context, correct: false });
  return {
    errorType: diagnosis.errorType,
    likelyDifficulty: diagnosis.source,
    confidence: diagnosis.confidence,
    prerequisiteGap: diagnosis.errorType === "PREREQUISITE_GAP" ? "possible" : null,
    skillAffected: context.currentSkill || "vocabulary"
  };
}

function candidateWrapperReasons(candidate = {}, context = {}, expectedErrorType = "UNKNOWN_ERROR") {
  const activity = candidate.activity && typeof candidate.activity === "object" ? candidate.activity : {};
  const type = activity.activityType || activity.type;
  const reasons = [];
  const expectedDemand = cognitiveDemandFor(type);
  if (!type || candidate.activityType !== type) reasons.push("CANDIDATE_ACTIVITY_TYPE_MISMATCH");
  if (candidate.errorType !== expectedErrorType) reasons.push("CANDIDATE_ERROR_TYPE_MISMATCH");
  if (Number(candidate.helpLevel) !== Number(activity.helpLevel)) reasons.push("CANDIDATE_HELP_LEVEL_MISMATCH");
  if (!expectedDemand || candidate.estimatedCognitiveDemand !== expectedDemand
    || (activity.cognitiveDemand && activity.cognitiveDemand !== expectedDemand)) reasons.push("CANDIDATE_COGNITIVE_DEMAND_MISMATCH");
  if (activity.conceptId && exactId(activity.conceptId) !== exactId(context.conceptId)) reasons.push("CANDIDATE_CONCEPT_MISMATCH");
  return reasons;
}

function canonicalPlanForActivity({ context, mode, activity, rejectedCandidates, allowedKnowledge }) {
  const diagnosis = canonicalDiagnosis(context);
  const type = activity.activityType || activity.type;
  const sourceIds = [...new Set([
    ...(context.sourceIds || context.activity?.sourceIds || []),
    ...allowedKnowledge.flatMap(sourceIdsFor)
  ].filter(Boolean))];
  const knowledgeIds = [...new Set([
    ...(context.knowledgeIds || []),
    ...allowedKnowledge.map(record => record.id)
  ].filter(Boolean))];
  const planId = `nalvi-${hash({ activityId: activity.id, conceptId: context.conceptId, attempt: context.attemptNumber, type }).slice(0, 20)}`;
  const renderableActivity = { ...activity, context: `adaptive-tutor:${planId}:1` };
  return {
    planVersion: ADAPTIVE_TUTOR_VERSION,
    planId,
    conceptId: context.conceptId,
    linguisticMode: mode,
    diagnosis,
    pedagogicalGoal: "Practise the verified lesson objective through an approved activity format.",
    strategy: {
      primaryStrategy: "CHANGE_MODALITY",
      secondaryStrategy: null,
      reasonCode: `SERVER_APPROVED_${type}`
    },
    studentFeedback: { locale: context.uiLocale, shortMessage: FEEDBACK[context.uiLocale] || FEEDBACK.es },
    activities: [renderableActivity],
    progressionPolicy: {
      onIncorrect: "BLOCK_AND_INTERVENE",
      onGuidedCorrect: "CONTINUE_PRACTICE",
      requiresIndependentRetest: true,
      maxInterventionsBeforeDefer: INTERVENTION_CONFIG.maxInterventionsBeforeDefer
    },
    fallbackPolicy: { strategy: "OFFICIAL_CATALOG_LOCAL_FALLBACK", reason: "SERVER_VALIDATED_SELECTION" },
    validationMetadata: {
      sourceIds,
      knowledgeIds,
      claimedRiskLevel: "GREEN",
      selectedActivityType: type,
      rejectedCandidates,
      validatedAt: new Date().toISOString(),
      validationPipeline: ["strictStructuredOutput", "officialCatalog", "approvedMaterialMembership", "knowledgeBoundary", "grammarBoundary", "pedagogicalQuality", "answerLeakage", "duplicateChecker"]
    }
  };
}

export function toRenderable(activity, context, planId, index) {
  const materialValid = validateActivityAgainstApprovedMaterial(activity, context).length === 0;
  activity = canonicalizeVisibleActivityCopy(activity, context);
  const locale = LOCALES.has(context.uiLocale) ? context.uiLocale : "es";
  const type = activity.activityType || activity.type;
  const approved = context.approvedActivityMaterial || {};
  const selectionTypes = new Set(["CONTEXT_CHOICE", "DIALOGUE_NEXT_TURN", "AUDIO_SELECT"]);
  const correctAnswer = type === "DIALOGUE_NEXT_TURN"
    ? exactText(approved.dialogueCorrectAnswer, locale)
    : exactText(approved.correctAnswer, locale);
  const correctOptionId = selectionTypes.has(type)
    ? exactId(type === "DIALOGUE_NEXT_TURN" ? approved.dialogueCorrectOptionId : approved.correctOptionId)
    : "";
  const optionText = option => exactText(option?.text ?? option?.label ?? option?.value, locale);
  const options = selectionTypes.has(type)
    ? (activity.options || []).filter(option => exactId(option?.id)).map(option => {
        const text = optionText(option);
        return {
          id: exactId(option.id),
          text,
          label: text,
          value: text,
          image: "",
          imageAlt: "",
          authorized: true
        };
      })
    : [];
  const correctOption = options.find(option => option.id === correctOptionId);
  const correctOptionText = correctOption?.text || "";
  const audioClaim = type === "AUDIO_SELECT" && materialValid
    ? trustedRecordedAudio(activity, correctAnswer, { activityClaim: true })
    : null;
  const activityAudio = audioClaim ? authorizeRecordedAudioForTarget(audioClaim, correctAnswer) : null;
  const recordedAudio = activityAudio ? authorizeRecordedAudioForTarget(audioClaim, correctOptionText) : null;
  const pairs = type === "ARROW_MATCH" ? (activity.pairs || []).map(pair => ({
    id: exactId(pair?.id),
    left: exactText(pair?.left, locale),
    right: exactText(pair?.right, locale),
    authorized: true
  })) : [];
  const categories = type === "CATEGORY_SORT" ? (activity.categories || []).map(category => ({
    id: exactId(category?.id),
    label: exactText(category?.label ?? category?.text, locale),
    authorized: true
  })) : [];
  const items = type === "CATEGORY_SORT" ? (activity.items || []).map(item => ({
    id: exactId(item?.id),
    text: exactText(item?.text ?? item?.label, locale),
    categoryId: exactId(item?.categoryId),
    authorized: true
  })) : [];
  const dialogue = type === "DIALOGUE_NEXT_TURN" ? (activity.dialogue || []).map(turn => ({
    id: exactId(turn?.id),
    speaker: exactText(turn?.speaker, locale),
    text: exactText(turn?.text, locale),
    authorized: true
  })) : [];
  const acceptedAnswers = type === "DIALOGUE_NEXT_TURN"
    ? [correctAnswer].filter(Boolean)
    : (approved.acceptedAnswers || []).map(value => exactText(value, locale)).filter(Boolean);
  const helpLevel = type === "INDEPENDENT_RECALL"
    ? 0
    : Math.min(2, Math.max(0, Number(context.attemptNumber || 1) - 1));
  const canonicalContent = {
    type,
    activityType: type,
    conceptId: context.conceptId, conceptIds: [context.conceptId].filter(Boolean), learningObjectiveId: context.learningObjectiveId,
    skill: context.currentSkill, difficulty: context.difficulty,
    helpLevel,
    cognitiveDemand: cognitiveDemandFor(type),
    answerExposure: "HIDDEN",
    lexemeIds: [...(context.lexemeIds || [])], grammarRuleIds: [...(context.grammarRuleIds || [])],
    sourceIds: [...(context.sourceIds || context.activity?.sourceIds || [])], requiresStudentResponse: true,
    instruction: deterministicInterventionCopy(type, locale),
    prompt: deterministicInterventionCopy(type, locale),
    contextText: type === "CONTEXT_CHOICE" ? exactText(activity.contextText, locale) : "",
    contextAuthorized: type === "CONTEXT_CHOICE",
    dialogueAuthorized: type === "DIALOGUE_NEXT_TURN",
    dialogueSourceContentId: type === "DIALOGUE_NEXT_TURN" ? exactId(approved.dialogueSourceContentId) : "",
    options,
    pairs,
    tiles: [],
    tokens: [],
    categories,
    items,
    segments: [],
    corrections: [],
    correctedSentence: "",
    dialogue,
    questions: [],
    steps: [],
    template: "",
    correctOrder: [],
    media: { type: "none", value: "", alt: "", sourceId: "", authorized: false },
    hints: [],
    explanation: "",
    correctAnswer,
    correctOptionId,
    correctCorrectionId: "",
    acceptedAnswers,
    conflictIds: [],
    hasOpenConflict: false,
    distractorQuality: "PLAUSIBLE",
    fingerprintSeed: "",
    answer: correctAnswer,
    image: "",
    imageAlt: "",
    audioId: recordedAudio?.audioId || "", audioPath: recordedAudio?.audioPath || "", audioText: recordedAudio?.audioText || "",
    audioAuthorized: recordedAudio?.audioAuthorized === true, humanRecorded: recordedAudio?.humanRecorded === true,
    audioSource: recordedAudio?.audioSource || "",
    reasonCode: `SERVER_APPROVED_${type}`,
    validatedAgainstApprovedMaterial: materialValid,
    nalviGuided: true,
    independentRetest: false,
    spacedRetest: false,
    evidenceMode: "guided"
  };
  const contentDigest = canonicalContentDigest(canonicalContent);
  const serverActivityId = `nalvi-intervention-${hash({
    sourceActivityId: context.activity?.id || "",
    attemptNumber: context.attemptNumber,
    index,
    contentDigest
  }).slice(0, 40)}`;
  return {
    ...canonicalContent,
    id: serverActivityId,
    fingerprint: `nalvi-afp-${contentDigest.slice(0, 40)}`,
    context: `adaptive-tutor:${planId}:${index + 1}`
  };
}

function selectValidatedCandidate(plan, context, mode, allowedKnowledge) {
  const expectedDiagnosis = canonicalDiagnosis(context);
  if (!plan || plan.planVersion !== ADAPTIVE_TUTOR_VERSION || plan.conceptId !== context.conceptId || plan.linguisticMode !== mode) return { valid: false, reasons: ["INVALID_PLAN_SHAPE"] };
  if (plan.diagnosis?.errorType !== expectedDiagnosis.errorType) return { valid: false, reasons: ["PLAN_ERROR_TYPE_MISMATCH"] };
  const rejectedCandidates = [];
  for (const rawCandidate of (plan.candidateActivities || []).slice(0, 3)) {
    const wrapperReasons = candidateWrapperReasons(rawCandidate, context, expectedDiagnosis.errorType);
    if (wrapperReasons.length) {
      rejectedCandidates.push({ activityType: rawCandidate.activityType, reasons: wrapperReasons });
      continue;
    }
    const type = rawCandidate.activity.activityType || rawCandidate.activity.type;
    const candidateWithSafeCopy = {
      ...rawCandidate,
      activityType: type,
      errorType: expectedDiagnosis.errorType,
      estimatedCognitiveDemand: cognitiveDemandFor(type),
      reasonCode: `SERVER_APPROVED_${type}`,
      activity: canonicalizeVisibleActivityCopy(rawCandidate.activity, context)
    };
    const selected = selectFirstValidCandidate([candidateWithSafeCopy], { ...context, errorType: expectedDiagnosis.errorType });
    if (!selected.accepted) {
      rejectedCandidates.push(...selected.rejected);
      continue;
    }
    const materialReasons = validateActivityAgainstApprovedMaterial(selected.candidate.activity, context);
    if (materialReasons.length) {
      rejectedCandidates.push({ activityType: rawCandidate.activityType, reasons: materialReasons });
      continue;
    }
    const linguisticReason = validateLinguisticActivity(selected.candidate.activity, context, mode, allowedKnowledge);
    if (linguisticReason) {
      rejectedCandidates.push({ activityType: rawCandidate.activityType, reasons: [linguisticReason] });
      continue;
    }
    const activity = toRenderable({ ...selected.candidate.activity, validatedAgainstApprovedMaterial: true }, context, "server-validated", 0);
    if (isCanonicalDuplicate(activity, context)) {
      rejectedCandidates.push({ activityType: rawCandidate.activityType, reasons: ["EXACT_ACTIVITY_DUPLICATE"] });
      continue;
    }
    const candidate = canonicalPlanForActivity({ context, mode, activity, rejectedCandidates, allowedKnowledge });
    const quality = validatePedagogicalQuality(candidate, { ...context, errorType: plan.diagnosis.errorType });
    if (!quality.valid) {
      rejectedCandidates.push({ activityType: rawCandidate.activityType, reasons: quality.reasons });
      continue;
    }
    return { valid: true, plan: candidate };
  }
  return { valid: false, reasons: rejectedCandidates.flatMap(item => item.reasons), rejectedCandidates };
}

export function createProfessionalFallbackPlan(context, {
  reason = "PROFESSIONAL_LOCAL_FALLBACK",
  linguisticMode = "LESSON_BOUNDED",
  activityAuthority = defaultApprovedActivityAuthority,
  allowedKnowledge = []
} = {}) {
  context = contextWithApprovedMaterial(context, activityAuthority);
  const locale = LOCALES.has(context.uiLocale) ? context.uiLocale : "es";
  const boundedTargetAvailable = lessonInventory(context).has(normalize(context.correctAnswer));
  const effectiveMode = context.activityAuthorityVerified !== true
    || (linguisticMode === "LESSON_BOUNDED" && !boundedTargetAvailable) ? "BLOCKED" : linguisticMode;
  const diagnosis = classifyError({ ...context, correct: false });
  const attempts = [Number(context.attemptNumber || 1), Number(context.attemptNumber || 1) + 1, Number(context.attemptNumber || 1) + 2];
  let selection = null;
  let renderedSelection = null;
  const rejectedCandidates = [];
  for (const attempt of effectiveMode === "BLOCKED" ? [] : attempts) {
    for (const rawCandidate of buildDeterministicFallbackCandidates(context, attempt, diagnosis.errorType)) {
      const candidateSelection = selectFirstValidCandidate([rawCandidate], { ...context, attemptNumber: attempt, errorType: diagnosis.errorType });
      if (!candidateSelection.accepted) {
        rejectedCandidates.push(...candidateSelection.rejected);
        continue;
      }
      const materialReasons = validateActivityAgainstApprovedMaterial(candidateSelection.candidate.activity, context);
      if (materialReasons.length) {
        rejectedCandidates.push({ activityType: rawCandidate.activityType, reasons: materialReasons });
        continue;
      }
      const linguisticReason = validateLinguisticActivity(candidateSelection.candidate.activity, context, effectiveMode, allowedKnowledge);
      if (linguisticReason) {
        rejectedCandidates.push({ activityType: rawCandidate.activityType, reasons: [linguisticReason] });
        continue;
      }
      const renderedCandidate = toRenderable(candidateSelection.candidate.activity, context, `fallback-${context.conceptId}`, 0);
      if (isCanonicalDuplicate(renderedCandidate, context)) {
        rejectedCandidates.push({ activityType: rawCandidate.activityType, reasons: ["EXACT_ACTIVITY_DUPLICATE"] });
        continue;
      }
      selection = candidateSelection;
      renderedSelection = renderedCandidate;
      break;
    }
    if (selection?.accepted) break;
  }
  const activity = selection?.accepted ? renderedSelection : null;
  const planId = `fallback-${hash({
    sourceActivityId: context.activity?.id || "",
    conceptId: context.conceptId,
    learningObjectiveId: context.learningObjectiveId,
    attempt: context.attemptNumber,
    reason,
    linguisticMode: effectiveMode,
    activityFingerprint: activity?.fingerprint || "NO_APPROVED_ACTIVITY"
  }).slice(0, 24)}`;
  const activities = activity ? [{ ...activity, context: `adaptive-tutor:${planId}:1` }] : [];
  return {
    planVersion: ADAPTIVE_TUTOR_VERSION, planId,
    conceptId: context.conceptId, linguisticMode: effectiveMode,
    diagnosis: { errorType: diagnosis.errorType, likelyDifficulty: diagnosis.source, confidence: diagnosis.confidence, prerequisiteGap: diagnosis.errorType === "PREREQUISITE_GAP" ? "possible" : null, skillAffected: context.currentSkill || "vocabulary" },
    pedagogicalGoal: "Teach the same concept through a different official NALVI activity.",
    strategy: { primaryStrategy: "CHANGE_MODALITY", secondaryStrategy: null, reasonCode: selection?.candidate?.reasonCode || reason },
    studentFeedback: { locale, shortMessage: FEEDBACK[locale] }, activities,
    progressionPolicy: { onIncorrect: "BLOCK_AND_INTERVENE", onGuidedCorrect: "CONTINUE_PRACTICE", requiresIndependentRetest: true, maxInterventionsBeforeDefer: INTERVENTION_CONFIG.maxInterventionsBeforeDefer },
    fallbackPolicy: { strategy: "OFFICIAL_CATALOG_LOCAL_FALLBACK", reason },
    validationMetadata: { sourceIds: context.sourceIds || context.activity?.sourceIds || [], knowledgeIds: context.knowledgeIds || [], claimedRiskLevel: "GREEN", selectedActivityType: activity?.activityType || "", rejectedCandidates, validatedAt: new Date().toISOString(), validationPipeline: ["officialCatalog", "approvedMaterialMembership", "knowledgeBoundary", "pedagogicalQuality", "answerLeakage", "duplicateChecker"] }
  };
}

function percentile(values, percentileValue) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(percentileValue / 100 * sorted.length) - 1))];
}
function estimateCostUsd(telemetry, env) {
  return Number((((telemetry.inputTokens * (Number(env.OPENAI_TUTOR_INPUT_USD_PER_MILLION) || 0)) + (telemetry.outputTokens * (Number(env.OPENAI_TUTOR_OUTPUT_USD_PER_MILLION) || 0))) / 1_000_000).toFixed(6));
}

function canonicalPlanMetrics(plan, context) {
  const metrics = planMetrics(plan, context);
  const independentRetestCoverage = (plan.activities || []).some(activity => context.trustedSpacedRetest === true
    && activity.spacedRetest === true
    && activity.independentRetest === true
    && activity.evidenceMode === "independent"
    && activity.nalviGuided === false
    && Number(activity.helpLevel || 0) === 0
    && Array.isArray(activity.hints) && activity.hints.length === 0
    && !String(activity.explanation || "").trim()
    && activity.answerExposure === "HIDDEN") ? 1 : 0;
  return { ...metrics, independentRetestCoverage };
}

export function createAdaptiveTutorOrchestrator({
  corpusRecords = [],
  fetchImpl = globalThis.fetch,
  env = process.env,
  persistEvent = async () => ({ status: "skipped" }),
  activityAuthority = defaultApprovedActivityAuthority
} = {}) {
  const counters = { requests: 0, aiCalls: 0, criticCalls: 0, revisions: 0, fallbacks: 0, accepted: 0, rejected: 0, inputTokens: 0, outputTokens: 0, cost: 0, planLength: 0, latencies: [] };
  async function orchestrateAdaptiveTutoring(context, { verifiedUserId = "", requesterHash = "anonymous" } = {}) {
    context = contextWithApprovedMaterial(context, activityAuthority);
    counters.requests += 1;
    const allowedKnowledge = filterAllowedKnowledge(corpusRecords, context.knowledgeIds || []);
    const mode = determineLinguisticMode(context, allowedKnowledge, { activityAuthority });
    const diagnosis = classifyError({ ...context, correct: false });
    const fallback = createProfessionalFallbackPlan(context, { linguisticMode: mode, activityAuthority, allowedKnowledge });
    const telemetry = { callCount: 0, criticCallCount: 0, revisionCount: 0, inputTokens: 0, outputTokens: 0, latencyMs: 0, errors: 0, model: env.OPENAI_TUTOR_MODEL || env.OPENAI_MODEL || "gpt-4.1-mini" };
    let finalPlan = fallback, usedAI = false, reason = "PROFESSIONAL_LOCAL_FALLBACK";
    const enabled = env.AI_TUTOR_ON_EVERY_INCORRECT_ANSWER !== "false" && context.correct === false;
    if (enabled && mode !== "BLOCKED" && env.OPENAI_API_KEY) {
      const timeoutMs = Math.max(1500, Number(env.AI_TUTOR_TIMEOUT_MS) || 9000);
      const maxRevision = Math.min(1, Math.max(0, Number(env.AI_TUTOR_MAX_REVISION_ATTEMPTS) || 1));
      const safetyIdentifier = hash(`nalvi-tutor:${verifiedUserId || requesterHash}`).slice(0, 64);
      const permittedKnowledge = allowedKnowledge.map(record => ({ id: record.id, recordType: record.recordType, lemma: record.lemma, lexeme: record.lexeme, forms: record.forms, senses: record.senses, sourceIds: sourceIdsFor(record), validationStatus: record.validationStatus }));
      let revisionInstruction = "";
      for (let attempt = 0; attempt <= maxRevision; attempt += 1) {
        try {
          counters.aiCalls += 1; telemetry.callCount += 1;
          const planner = await callResponses({ fetchImpl, apiKey: env.OPENAI_API_KEY, model: telemetry.model, schema: ADAPTIVE_TUTOR_PLAN_SCHEMA,
            schemaName: "nalvi_adaptive_tutor_plan", instructions: `${plannerPrompt}\n${revisionInstruction}`,
            input: { task: "selectOfficialCatalogCandidates", context: pseudonymizedContext(context, mode, diagnosis.errorType), permittedKnowledge, catalog: catalogAudit(), strategyEffectiveness: context.strategyEffectiveness || {} }, safetyIdentifier, timeoutMs });
          telemetry.inputTokens += Number(planner.usage.input_tokens || 0); telemetry.outputTokens += Number(planner.usage.output_tokens || 0); telemetry.latencyMs += planner.latencyMs;
          const deterministic = selectValidatedCandidate(planner.value, context, mode, allowedKnowledge);
          let critic = { accepted: deterministic.valid, reasonCodes: deterministic.reasons || [], revisionInstruction: "" };
          if (deterministic.valid && env.AI_TUTOR_CRITIC_ENABLED !== "false") {
            counters.criticCalls += 1; telemetry.criticCallCount += 1;
            const crit = await critiqueAdaptiveTutorPlan({ plan: planner.value, context: pseudonymizedContext(context, mode, diagnosis.errorType), permittedKnowledge, fetchImpl, env, safetyIdentifier, timeoutMs });
            telemetry.inputTokens += Number(crit.usage.input_tokens || 0); telemetry.outputTokens += Number(crit.usage.output_tokens || 0); telemetry.latencyMs += crit.latencyMs; critic = crit.value;
          }
          if (deterministic.valid && critic.accepted) { finalPlan = deterministic.plan; usedAI = true; reason = "AI_TUTOR_PLAN_VALIDATED"; counters.accepted += 1; break; }
          counters.rejected += 1;
          if (attempt < maxRevision) { counters.revisions += 1; telemetry.revisionCount += 1; revisionInstruction = `Revise once. Rejection reasons: ${(critic.reasonCodes || deterministic.reasons || []).join(", ")}. ${critic.revisionInstruction || ""}`; }
        } catch (error) { telemetry.errors += 1; reason = error?.name === "AbortError" ? "AI_TUTOR_TIMEOUT" : "AI_TUTOR_UNAVAILABLE"; }
      }
    } else reason = !enabled ? "AI_TUTOR_POLICY_DISABLED" : mode === "BLOCKED" ? "LINGUISTIC_MODE_BLOCKED" : "OPENAI_NOT_CONFIGURED";
    if (!usedAI) counters.fallbacks += 1;
    telemetry.estimatedCostUsd = estimateCostUsd(telemetry, env);
    counters.inputTokens += telemetry.inputTokens; counters.outputTokens += telemetry.outputTokens; counters.cost += telemetry.estimatedCostUsd; counters.planLength += finalPlan.activities.length; counters.latencies.push(telemetry.latencyMs);
    const metrics = canonicalPlanMetrics(finalPlan, context);
    const event = { eventKind: "adaptiveTutorIntervention", logicalCollection: "interventionEvents", conceptId: context.conceptId, learningObjectiveId: context.learningObjectiveId,
      errorType: finalPlan.diagnosis.errorType, strategy: finalPlan.strategy.primaryStrategy, activityTypes: finalPlan.activities.map(activity => activity.activityType),
      activityFingerprints: finalPlan.activities.map(activity => activity.fingerprint), usedAI, linguisticMode: mode, attemptNumber: context.attemptNumber, uiLocale: context.uiLocale, telemetry, metrics, timestamp: new Date().toISOString() };
    let persistence = { status: "skipped", reason: verifiedUserId ? "PERSISTENCE_NOT_CONFIGURED" : "ANONYMOUS_SESSION" };
    if (verifiedUserId) try { persistence = await persistEvent({ userId: verifiedUserId, event: { ...event, userId: verifiedUserId } }); } catch { persistence = { status: "failed", reason: "PERSISTENCE_ERROR" }; }
    return { ok: true, usedAI, mode: usedAI ? "adaptiveTutor" : "fallback", reason, linguisticMode: mode, adaptiveInterventionPlan: finalPlan, telemetry, metrics, persistence, event };
  }
  return Object.freeze({
    orchestrateAdaptiveTutoring,
    audit: () => ({ ...counters, estimatedCostUsd: Number(counters.cost.toFixed(6)), callsPerSession: counters.requests ? counters.aiCalls / counters.requests : 0,
      interventionAcceptanceRate: counters.requests ? counters.accepted / counters.requests : 0, fallbackRate: counters.requests ? counters.fallbacks / counters.requests : 0,
      averagePlanLength: counters.requests ? counters.planLength / counters.requests : 0, latencyP95Ms: percentile(counters.latencies, 95), version: ADAPTIVE_TUTOR_VERSION,
      officialActivityCatalog: catalogAudit(), apiKeyExposedToClient: false, piiSentToModel: false })
  });
}
