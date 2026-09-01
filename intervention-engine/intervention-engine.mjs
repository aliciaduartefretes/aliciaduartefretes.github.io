import { ERROR_TYPES, INTERVENTION_CONFIG, INTERVENTION_VERSION, STRATEGIES } from "./intervention-config.mjs";

const TYPE_ALIASES = new Map([
  ["multiple_choice", "multiple-choice"],
  ["choice", "multiple-choice"],
  ["ordering", "order-sentence"],
  ["order", "order-sentence"],
  ["complete", "fill-blank"],
  ["guided-fill", "fill-blank"],
  ["context_choice", "context_choice"],
  ["image_choice", "image_choice"],
  ["arrow_match", "arrow_match"],
  ["category_sort", "category_sort"],
  ["word_tile_builder", "word_tile_builder"],
  ["sentence_tile_builder", "sentence_tile_builder"],
  ["guided_gap", "guided_gap"],
  ["error_spotting", "error_spotting"],
  ["concept_contrast", "concept_contrast"],
  ["dialogue_next_turn", "dialogue_next_turn"],
  ["dialogue_order", "dialogue_order"],
  ["dialogue_comprehension", "dialogue_comprehension"],
  ["two_step_challenge", "two_step_challenge"],
  ["independent_recall", "independent_recall"]
]);

const validLocale = value => INTERVENTION_CONFIG.uiLocales.includes(value) ? value : "es";
const normalizeType = value => {
  const raw = String(value || "").trim().toLowerCase();
  return TYPE_ALIASES.get(raw) || raw || "unknown";
};
const localize = (value, locale = "es") => {
  if (value == null) return "";
  if (typeof value !== "object" || Array.isArray(value)) return String(value);
  return String(value[locale] ?? value.es ?? value.en ?? Object.values(value)[0] ?? "");
};
const normalizeText = value => String(value ?? "")
  .normalize("NFC")
  .trim()
  .toLocaleLowerCase()
  .replace(/[“”«»]/g, '"')
  .replace(/[’]/g, "'")
  .replace(/\s+/g, " ");
const withoutMarks = value => normalizeText(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const sorted = values => [...values].map(normalizeText).sort((a, b) => a.localeCompare(b));

function stableSerialize(value) {
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableSerialize(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

function fnv1a(value) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function activityMedia(activity, locale) {
  return sorted([
    localize(activity.audioText, locale),
    localize(activity.imageAlt, locale),
    activity.image,
    activity.imageUrl,
    activity.audio,
    activity.audioUrl,
    activity.media?.value,
    activity.media?.src,
    activity.media?.url,
    ...(Array.isArray(activity.media) ? activity.media.map(item => typeof item === "string" ? item : item?.src || item?.url || "") : [])
  ].filter(Boolean));
}

export function createActivityFingerprint(activity, options = {}) {
  const locale = validLocale(options.uiLocale || options.locale || "es");
  const optionsNormalized = (activity?.options || []).map(option => localize(option?.label ?? option?.text ?? option?.value ?? option, locale));
  const correct = activity?.correctOptionId ?? activity?.correctAnswer ?? activity?.answer ?? activity?.acceptedAnswers ?? activity?.correctOrder ?? "";
  const payload = {
    conceptId: activity?.conceptId || activity?.conceptIds?.[0] || "",
    activityType: normalizeType(activity?.type || activity?.activityType),
    prompt: normalizeText(localize(activity?.prompt, locale)),
    instruction: normalizeText(localize(activity?.instruction, locale)),
    options: sorted(optionsNormalized),
    pairs: (activity?.pairs || []).map(pair => ({
      left: normalizeText(localize(pair?.left, locale)),
      right: normalizeText(localize(pair?.right, locale))
    })).sort((left, right) => stableSerialize(left).localeCompare(stableSerialize(right))),
    tiles: (activity?.tiles || activity?.tokens || []).map(tile => ({
      id: String(tile?.id ?? ""),
      text: normalizeText(localize(tile?.text ?? tile?.label ?? tile?.value ?? tile, locale))
    })).sort((left, right) => stableSerialize(left).localeCompare(stableSerialize(right))),
    categories: (activity?.categories || []).map(category => normalizeText(localize(category?.label ?? category?.text ?? category, locale))).sort(),
    dialogue: (activity?.dialogue || activity?.turns || []).map(turn => ({
      speaker: normalizeText(localize(turn?.speaker, locale)),
      text: normalizeText(localize(turn?.text ?? turn?.content, locale))
    })),
    answer: Array.isArray(correct) ? sorted(correct.map(item => localize(item, locale))) : normalizeText(localize(correct, locale)),
    media: activityMedia(activity || {}, locale),
    context: normalizeText(localize(activity?.contextText ?? activity?.context ?? activity?.scenario ?? activity?.template, locale)),
    helpLevel: Number.isFinite(Number(activity?.helpLevel)) ? Number(activity.helpLevel) : 0,
    answerExposure: String(activity?.answerExposure || "HIDDEN")
  };
  return `nalvi-afp-${fnv1a(stableSerialize(payload))}`;
}

export function canScoreWithoutAI(context = {}) {
  if (typeof context.correct === "boolean") return true;
  const activity = context.activity || {};
  const type = normalizeType(context.activityType || activity.type);
  if (["multiple-choice", "matching", "order-sentence", "fill-blank", "writing", "context_choice", "image_choice", "arrow_match", "category_sort", "word_tile_builder", "sentence_tile_builder", "guided_gap", "error_spotting", "concept_contrast", "dialogue_next_turn", "dialogue_order", "dialogue_comprehension", "two_step_challenge", "independent_recall"].includes(type)) {
    return activity.correctOptionId != null || activity.correctOrder != null || activity.acceptedAnswers != null || context.correctAnswer != null;
  }
  return false;
}

function levenshtein(left, right) {
  const a = Array.from(left), b = Array.from(right), row = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    let previous = row[0]; row[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const saved = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1));
      previous = saved;
    }
  }
  return row[b.length];
}

function grammarHint(context, needle) {
  return [...(context.grammarRuleIds || []), ...(context.ruleTags || [])].some(value => normalizeText(value).includes(needle));
}

export function classifyError(context = {}) {
  if (ERROR_TYPES.includes(context.errorTypeHint)) return { errorType: context.errorTypeHint, confidence: 1, source: "explicitHint" };
  if (context.correct !== false) return { errorType: "UNKNOWN_ERROR", confidence: 0, source: "notIncorrect" };
  const type = normalizeType(context.activityType || context.activity?.type);
  const attempt = Math.max(1, Number(context.attemptNumber) || 1);
  const recentSameConceptErrors = (context.recentErrors || []).filter(item => !context.conceptId || item.conceptId === context.conceptId).length;
  const answer = normalizeText(context.studentAnswer), expected = normalizeText(context.correctAnswer);
  if (attempt >= 3 || recentSameConceptErrors >= INTERVENTION_CONFIG.repeatedErrorThreshold) return { errorType: "PREREQUISITE_GAP", confidence: 0.78, source: "repeatedErrorRule" };
  if (!answer) return { errorType: "RECALL_FAILURE", confidence: 0.9, source: "emptyAnswerRule" };
  if (["listening", "audio_select", "audio_missing_word", "audio_to_tiles"].includes(type)) return { errorType: "LISTENING_CONFUSION", confidence: 0.86, source: "activityTypeRule" };
  if (["order-sentence", "sentence_tile_builder", "dialogue_order"].includes(type)) return { errorType: "WORD_ORDER_ERROR", confidence: 0.92, source: "activityTypeRule" };
  if (["context_choice", "concept_contrast", "dialogue_next_turn", "dialogue_comprehension"].includes(type)) return { errorType: "CONTEXT_APPLICATION_ERROR", confidence: 0.8, source: "activityTypeRule" };
  if (["word_tile_builder", "error_spotting", "guided_gap", "independent_recall"].includes(type) && expected && answer) return { errorType: "SPELLING_ERROR", confidence: 0.72, source: "activityTypeRule" };
  if (grammarHint(context, "neg")) return { errorType: "NEGATION_ERROR", confidence: 0.86, source: "grammarRule" };
  if (grammarHint(context, "poss") || grammarHint(context, "poses")) return { errorType: "POSSESSIVE_ERROR", confidence: 0.86, source: "grammarRule" };
  if (grammarHint(context, "conjug") || grammarHint(context, "person")) return { errorType: "CONJUGATION_PERSON_ERROR", confidence: 0.82, source: "grammarRule" };
  if (grammarHint(context, "morph") || grammarHint(context, "morfo")) return { errorType: "MORPHOLOGY_ERROR", confidence: 0.82, source: "grammarRule" };
  if (expected && answer !== expected && withoutMarks(answer) === withoutMarks(expected)) return { errorType: "NASALITY_ERROR", confidence: 0.72, source: "diacriticComparison" };
  if (expected && levenshtein(answer, expected) <= Math.max(1, Math.floor(expected.length * 0.22))) return { errorType: "SPELLING_ERROR", confidence: 0.88, source: "editDistance" };
  if (context.currentSkill === "application" || type === "scenario") return { errorType: "CONTEXT_APPLICATION_ERROR", confidence: 0.8, source: "skillRule" };
  if (type === "multiple-choice" || type === "matching") return { errorType: "SEMANTIC_CONFUSION", confidence: 0.72, source: "recognitionRule" };
  return { errorType: "UNKNOWN_ERROR", confidence: 0.25, source: "fallback" };
}

function recentFingerprintSet(context) {
  return new Set([
    ...(context.recentActivityFingerprints || []),
    ...(context.recentActivities || []).map(item => item.fingerprint || createActivityFingerprint(item, { uiLocale: context.uiLocale }))
  ].filter(Boolean).slice(-INTERVENTION_CONFIG.fingerprintHistoryLimit));
}

function candidateScore(activity, context, preferredTypes) {
  const type = normalizeType(activity.type), current = normalizeType(context.activityType || context.activity?.type);
  let score = 0;
  if (activity.conceptId && activity.conceptId === context.conceptId) score += 70;
  if (activity.learningObjectiveId && activity.learningObjectiveId === context.learningObjectiveId) score += 30;
  if (type !== current) score += 35;
  const preferredIndex = preferredTypes.indexOf(type);
  if (preferredIndex >= 0) score += 50 - preferredIndex * 7;
  if (activity.skill && activity.skill !== context.currentSkill) score += 8;
  if (Number(activity.difficulty) <= Number(context.difficulty || 1)) score += 8;
  return score;
}

export function selectDifferentActivity(context = {}, preferredTypes = []) {
  const previousFingerprint = context.previousActivityFingerprint || createActivityFingerprint(context.activity || context, { uiLocale: context.uiLocale });
  const recent = recentFingerprintSet(context); recent.add(previousFingerprint);
  const candidates = (context.availableActivities || []).map(activity => ({
    activity,
    fingerprint: createActivityFingerprint(activity, { uiLocale: context.uiLocale })
  })).filter(item => item.fingerprint !== previousFingerprint && !recent.has(item.fingerprint));
  candidates.sort((a, b) => candidateScore(b.activity, context, preferredTypes) - candidateScore(a.activity, context, preferredTypes));
  return candidates[0] || null;
}

function chooseStrategy(errorType, attemptNumber, history = []) {
  const choices = INTERVENTION_CONFIG.strategyByError[errorType] || INTERVENTION_CONFIG.strategyByError.UNKNOWN_ERROR;
  const used = new Set(history.map(item => item.strategy).filter(Boolean));
  const offset = Math.max(0, Number(attemptNumber || 1) - 1);
  return choices.find((strategy, index) => index >= offset % choices.length && !used.has(strategy))
    || choices.find(strategy => !used.has(strategy))
    || choices[offset % choices.length];
}

export function wouldAIImproveIntervention(context = {}, localPlan = null) {
  if (context.correct !== false) return false;
  if (context.aiPolicy?.allowInterventionAI === false) return false;
  if (context.aiPolicy?.AI_TUTOR_ON_EVERY_INCORRECT_ANSWER === false) return false;
  return true;
}

export function needsAdaptiveTutor(context = {}) {
  return context.correct === false
    && context.aiPolicy?.allowInterventionAI !== false
    && context.aiPolicy?.AI_TUTOR_ON_EVERY_INCORRECT_ANSWER !== false;
}

export function planPedagogicalIntervention(context = {}) {
  if (context.correct !== false) return {
    version: INTERVENTION_VERSION,
    status: "notRequired",
    reason: "INTERVENTION_REQUIRES_INCORRECT_RESPONSE"
  };
  const uiLocale = validLocale(context.uiLocale), diagnosis = classifyError(context);
  const strategy = chooseStrategy(diagnosis.errorType, context.attemptNumber, context.recentInterventions || []);
  const currentType = normalizeType(context.activityType || context.activity?.type);
  const weakSkill = String(context.currentSkill || "").trim().toLowerCase();
  const preferredTypes = INTERVENTION_CONFIG.skillRecoveryModalities[weakSkill]
    || INTERVENTION_CONFIG.modalityTransitions[currentType]
    || ["matching", "fill-blank", "listening", "multiple-choice"];
  const selected = selectDifferentActivity({ ...context, uiLocale }, preferredTypes);
  const previousFingerprint = context.previousActivityFingerprint || createActivityFingerprint(context.activity || context, { uiLocale });
  const nextFingerprint = selected?.fingerprint || null;
  if (nextFingerprint && nextFingerprint === previousFingerprint) throw new Error("INTERVENTION_DUPLICATE_FINGERPRINT");
  return {
    version: INTERVENTION_VERSION,
    status: selected ? "planned" : "fallbackRequired",
    diagnosis,
    errorType: diagnosis.errorType,
    strategy,
    previousActivityType: currentType,
    nextActivityType: selected ? normalizeType(selected.activity.type) : preferredTypes[0],
    previousFingerprint,
    nextFingerprint,
    nextActivity: selected?.activity || null,
    usedAI: false,
    shouldPauseSequence: Number(context.attemptNumber || 1) >= 2,
    markWeak: Number(context.attemptNumber || 1) >= INTERVENTION_CONFIG.weakConceptThreshold,
    scheduleReview: Number(context.attemptNumber || 1) >= 2,
    fallback: selected ? null : {
      action: "USE_EXISTING_VALIDATED_ACTIVITY",
      preferredTypes,
      mustDifferFrom: previousFingerprint
    },
    evidencePolicy: {
      guidedIntervention: true,
      multiplier: INTERVENTION_CONFIG.evidence.guidedRecoveryMultiplier,
      independentRecoveryRequiredForStrongEvidence: true
    },
    reason: selected
      ? `sameConceptDifferentExercise:${currentType}->${normalizeType(selected.activity.type)}`
      : "NO_NON_DUPLICATE_LOCAL_ACTIVITY"
  };
}

export function applyAISelection(localPlan, aiSelection = {}) {
  if (!localPlan || localPlan.status === "notRequired") return localPlan;
  const errorType = ERROR_TYPES.includes(aiSelection.errorType) ? aiSelection.errorType : localPlan.errorType;
  const strategy = STRATEGIES.includes(aiSelection.strategy) ? aiSelection.strategy : localPlan.strategy;
  return {
    ...localPlan,
    errorType,
    strategy,
    diagnosis: { ...localPlan.diagnosis, errorType, source: "validatedAISelection" },
    usedAI: true,
    aiRationale: String(aiSelection.rationale || "").slice(0, 320)
  };
}

export function createInterventionEvent(context, plan, telemetry = {}) {
  const timestamp = new Date().toISOString();
  return {
    eventKind: "pedagogicalIntervention",
    logicalCollection: "interventionEvents",
    userId: context.userId || "",
    conceptId: context.conceptId || "",
    learningObjectiveId: context.learningObjectiveId || "",
    errorType: plan.errorType || "UNKNOWN_ERROR",
    strategy: plan.strategy || "CHANGE_MODALITY",
    previousActivityType: plan.previousActivityType || normalizeType(context.activityType),
    nextActivityType: plan.nextActivityType || "",
    usedAI: Boolean(plan.usedAI),
    activityFingerprint: plan.nextFingerprint || "",
    previousActivityFingerprint: plan.previousFingerprint || "",
    result: "planned",
    attemptNumber: Math.max(1, Number(context.attemptNumber) || 1),
    masteryBefore: Number.isFinite(Number(context.masteryBefore)) ? Number(context.masteryBefore) : null,
    masteryAfter: Number.isFinite(Number(context.masteryAfter)) ? Number(context.masteryAfter) : null,
    uiLocale: validLocale(context.uiLocale),
    timestamp,
    aiCallCount: Number(telemetry.callCount || 0),
    aiInputTokens: Number(telemetry.inputTokens || 0),
    aiOutputTokens: Number(telemetry.outputTokens || 0),
    aiLatencyMs: Number(telemetry.latencyMs || 0),
    aiErrors: Number(telemetry.errors || 0),
    estimatedCostUsd: Number.isFinite(Number(telemetry.estimatedCostUsd)) ? Number(telemetry.estimatedCostUsd) : null,
    costEstimateStatus: telemetry.costEstimateStatus || "notApplicable"
  };
}

export const INTERVENTION_CATALOG = Object.freeze({
  errorTypes: ERROR_TYPES,
  strategies: STRATEGIES,
  config: INTERVENTION_CONFIG
});
