import {
  ACTIVITY_TYPES,
  SELECTION_ACTIVITY_TYPES,
  allowedTypesForError,
  cognitiveDemandFor,
  getCatalogEntry,
  isEnabledActivityType,
  isSupportedActivityType
} from "./nalvi-activity-catalog.mjs";
import { createActivityFingerprint } from "../intervention-engine/intervention-engine.mjs";

export const ANSWER_LEAKAGE_CODES = Object.freeze([
  "ANSWER_IN_PROMPT",
  "ANSWER_IN_CONTEXT",
  "ANSWER_IN_VISIBLE_HINT",
  "ANSWER_IN_SINGLE_PAIR",
  "ANSWER_ALREADY_ORDERED",
  "ANSWER_IN_IMAGE_LABEL"
]);

const normalize = value => String(value ?? "")
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLocaleLowerCase()
  .replace(/[^a-z0-9\p{L}\p{N}]+/gu, " ")
  .trim();
const localize = (value, locale = "es") => value && typeof value === "object" && !Array.isArray(value)
  ? String(value[locale] ?? value.es ?? value.en ?? Object.values(value)[0] ?? "")
  : String(value ?? "");
const optionText = (option, locale) => localize(option?.text ?? option?.label ?? option?.value ?? option, locale);
const unique = values => [...new Set(values.filter(Boolean))];
const countMarker = (value, expression) => (String(value || "").match(expression) || []).length;

export function detectAnswerLeakage(activity = {}, { uiLocale = "es" } = {}) {
  const answer = normalize(activity.correctAnswer ?? activity.answer ?? activity.acceptedAnswers?.[0]);
  const codes = [];
  if (!answer) return { leaked: false, codes };
  const prompt = normalize(localize(activity.prompt, uiLocale));
  const context = normalize(localize(activity.contextText ?? activity.scenario ?? activity.lessonContext?.visibleContext, uiLocale));
  const hints = normalize((activity.hints || []).map(item => localize(item, uiLocale)).join(" "));
  if (prompt && prompt.includes(answer)) codes.push("ANSWER_IN_PROMPT");
  if (context && context.includes(answer)) codes.push("ANSWER_IN_CONTEXT");
  if (hints && hints.includes(answer) && activity.answerExposure !== "EXPLICIT_SOLUTION") codes.push("ANSWER_IN_VISIBLE_HINT");
  if ((activity.pairs || []).length === 1) codes.push("ANSWER_IN_SINGLE_PAIR");
  const tokenIds = (activity.tokens || activity.tiles || []).map((item, index) => String(item?.id ?? index));
  const expectedOrder = (activity.correctOrder || []).map(String);
  if (expectedOrder.length > 1 && tokenIds.length === expectedOrder.length && tokenIds.every((id, index) => id === expectedOrder[index])) codes.push("ANSWER_ALREADY_ORDERED");
  const imageOption = (activity.options || []).find(option => normalize(optionText(option, uiLocale)) === answer || String(option?.id) === String(activity.correctOptionId));
  if (imageOption && normalize(imageOption.alt ?? imageOption.imageAlt).includes(answer)) codes.push("ANSWER_IN_IMAGE_LABEL");
  return { leaked: codes.length > 0, codes: unique(codes) };
}

function componentRules(activity, locale) {
  const type = activity.activityType || activity.type;
  const reasons = [];
  const entry = getCatalogEntry(type);
  const options = activity.options || [];
  const pairs = activity.pairs || [];
  const tiles = activity.tiles || activity.tokens || [];
  const categories = activity.categories || [];
  const items = activity.items || [];
  const dialogue = activity.dialogue || activity.turns || [];
  const answer = String(activity.correctAnswer || activity.answer || "");
  const expectedOrder = activity.correctOrder || [];

  if (!entry) return ["UNSUPPORTED_ACTIVITY_TYPE"];
  if (!entry.enabled) return [entry.disabledReason || "ACTIVITY_TYPE_DISABLED"];
  if (activity.hasOpenConflict === true || (activity.conflictIds || []).some(id => ["C-001", "C-002"].includes(String(id)))) reasons.push("OPEN_LINGUISTIC_CONFLICT");
  if ([...(activity.options || []), ...(activity.pairs || []), ...(activity.items || []), ...(activity.tiles || activity.tokens || [])].some(item => item && typeof item === "object" && item.authorized === false)) reasons.push("UNAUTHORIZED_CONTENT");
  if (activity.cognitiveDemand && activity.cognitiveDemand !== entry.cognitiveDemand) reasons.push("COGNITIVE_DEMAND_MISMATCH");

  if ([ACTIVITY_TYPES.CONTEXT_CHOICE, ACTIVITY_TYPES.CONCEPT_CONTRAST, ACTIVITY_TYPES.DIALOGUE_NEXT_TURN].includes(type)) {
    if (options.length < 3 || options.length > 4) reasons.push("INVALID_OPTION_COUNT");
  }
  if (type === ACTIVITY_TYPES.IMAGE_CHOICE) {
    if (options.length < 3 || options.length > 4) reasons.push("INVALID_OPTION_COUNT");
    if (options.some(option => !String(option.image || option.imageUrl || "").trim() || option.authorized !== true)) reasons.push("UNAUTHORIZED_OR_MISSING_IMAGE");
  }
  if (type === ACTIVITY_TYPES.ARROW_MATCH && (pairs.length < 3 || pairs.length > 5)) reasons.push("INVALID_PAIR_COUNT");
  if (type === ACTIVITY_TYPES.CATEGORY_SORT) {
    if (items.length < 6 || items.length > 10) reasons.push("INVALID_SORT_ITEM_COUNT");
    if (categories.length < 2 || categories.length > 3) reasons.push("INVALID_CATEGORY_COUNT");
    for (const category of categories) if (items.filter(item => String(item.categoryId) === String(category.id)).length < 2) reasons.push("CATEGORY_WITH_TOO_FEW_ITEMS");
  }
  if (type === ACTIVITY_TYPES.WORD_TILE_BUILDER) {
    if (tiles.length < 6 || tiles.length > 12) reasons.push("INVALID_TILE_COUNT");
    if (Array.from(answer).length < 4) reasons.push("TARGET_TOO_SHORT_FOR_WORD_TILES");
    if ((activity.correctOrder || []).length < 2) reasons.push("INVALID_WORD_SEGMENTATION");
    if (tiles.length === expectedOrder.length && tiles.every((tile, index) => String(tile.id ?? index) === String(expectedOrder[index]))) reasons.push("ANSWER_ALREADY_ORDERED");
  }
  if (type === ACTIVITY_TYPES.SENTENCE_TILE_BUILDER) {
    if (tiles.length < 4 || tiles.length > 10) reasons.push("INVALID_TILE_COUNT");
    if (expectedOrder.length < 4) reasons.push("INVALID_SENTENCE_ORDER");
  }
  if (type === ACTIVITY_TYPES.GUIDED_GAP) {
    const template = localize(activity.template, locale);
    const gaps = countMarker(template, /\{\{blank\}\}|_{2,}/g);
    if (gaps < 1 || gaps > 2) reasons.push("INVALID_GAP_COUNT");
    if (options.length < 3 || options.length > 5) reasons.push("INVALID_OPTION_COUNT");
    if (!normalize(template.replace(/\{\{blank\}\}|_{2,}/g, ""))) reasons.push("EMPTY_GAP_CONTEXT");
    if (activity.gapUnit === "LETTER" || activity.targetUnit === "LETTER" || Array.from(answer).length === 1) reasons.push("SINGLE_LETTER_COMPLETION");
  }
  if (type === ACTIVITY_TYPES.ERROR_SPOTTING) {
    const segments = activity.segments || [];
    if (segments.length < 2) reasons.push("TOO_FEW_ERROR_SEGMENTS");
    if (segments.filter(segment => segment.isIncorrect === true).length !== 1) reasons.push("INVALID_ERROR_TARGET_COUNT");
    if (!String(activity.correctedSentence || "").trim()) reasons.push("MISSING_VALIDATED_CORRECTION");
  }
  if (type === ACTIVITY_TYPES.DIALOGUE_NEXT_TURN && (dialogue.length < 2 || dialogue.length > 4)) reasons.push("INVALID_DIALOGUE_LENGTH");
  if (type === ACTIVITY_TYPES.DIALOGUE_ORDER) {
    if (dialogue.length < 3 || dialogue.length > 5) reasons.push("INVALID_DIALOGUE_LENGTH");
    if (expectedOrder.length !== dialogue.length) reasons.push("INVALID_DIALOGUE_ORDER");
  }
  if (type === ACTIVITY_TYPES.DIALOGUE_COMPREHENSION) {
    if (dialogue.length < 3 || dialogue.length > 6) reasons.push("INVALID_DIALOGUE_LENGTH");
    if ((activity.questions || []).length < 1 || (activity.questions || []).length > 2) reasons.push("INVALID_QUESTION_COUNT");
  }
  if (type === ACTIVITY_TYPES.TWO_STEP_CHALLENGE) {
    if ((activity.steps || []).length !== 2) reasons.push("INVALID_STEP_COUNT");
    if ((activity.steps || []).some(step => [ACTIVITY_TYPES.TWO_STEP_CHALLENGE, ACTIVITY_TYPES.AUDIO_SELECT, ACTIVITY_TYPES.AUDIO_MISSING_WORD, ACTIVITY_TYPES.AUDIO_TO_TILES, ACTIVITY_TYPES.MORPHEME_BUILDER].includes(step.activityType || step.type))) reasons.push("INVALID_NESTED_ACTIVITY_TYPE");
  }
  if (type === ACTIVITY_TYPES.INDEPENDENT_RECALL) {
    if (Number(activity.helpLevel || 0) !== 0 || activity.answerExposure !== "HIDDEN") reasons.push("INDEPENDENT_RECALL_NOT_INDEPENDENT");
    if ((activity.hints || []).length) reasons.push("INDEPENDENT_RECALL_HAS_HINTS");
  }
  if (options.length) {
    const values = options.map(option => normalize(optionText(option, locale)));
    if (new Set(values).size !== values.length) reasons.push("DUPLICATE_OPTIONS");
    if (options.length >= 3 && !options.some(option => String(option.id) === String(activity.correctOptionId) || normalize(optionText(option, locale)) === normalize(answer))) reasons.push("CORRECT_OPTION_MISSING");
    if (activity.distractorQuality && activity.distractorQuality !== "PLAUSIBLE") reasons.push("UNRELATED_DISTRACTORS");
  }
  return unique(reasons);
}

function fingerprintFor(activity = {}) {
  return createActivityFingerprint(activity, { uiLocale: activity.uiLocale || "es" });
}

export function validateCatalogActivity(activity = {}, context = {}) {
  const type = activity.activityType || activity.type;
  const reasons = componentRules(activity, context.uiLocale || "es");
  const leakage = detectAnswerLeakage(activity, context);
  reasons.push(...leakage.codes);
  if (!isSupportedActivityType(type)) reasons.push("UNSUPPORTED_ACTIVITY_TYPE");
  else if (!isEnabledActivityType(type)) reasons.push(getCatalogEntry(type)?.disabledReason || "ACTIVITY_TYPE_DISABLED");
  if (context.errorType) {
    const allowed = allowedTypesForError(context.errorType, { audioEnabled: false });
    if (!allowed.includes(type) && !String(activity.reasonCode || "").startsWith("JUSTIFIED_")) reasons.push("TYPE_NOT_ALIGNED_WITH_ERROR");
  }
  const fingerprint = activity.fingerprint || fingerprintFor(activity);
  const recentFingerprints = new Set((context.recentActivityFingerprints || []).slice(-5));
  if (fingerprint === context.previousActivityFingerprint || recentFingerprints.has(fingerprint)) reasons.push("EXACT_ACTIVITY_DUPLICATE");
  const recentTypes = (context.recentActivities || []).slice(-5).map(item => item.activityType || item.type).filter(Boolean);
  if (recentTypes.at(-1) === type && !String(activity.reasonCode || "").startsWith("JUSTIFIED_")) reasons.push("SAME_MODALITY_WITHOUT_REASON");
  if (SELECTION_ACTIVITY_TYPES.has(type) && recentTypes.length >= 2 && recentTypes.slice(-2).every(recentType => SELECTION_ACTIVITY_TYPES.has(recentType))) reasons.push("THREE_SELECTION_ACTIVITIES_IN_A_ROW");
  const answerExposure = activity.answerExposure || "HIDDEN";
  if (Number(context.attemptNumber || 1) === 1 && ["WORKED_EXAMPLE", "EXPLICIT_SOLUTION"].includes(answerExposure)) reasons.push("FIRST_ERROR_EXPLICIT_SOLUTION");
  if (!activity.cognitiveDemand) activity.cognitiveDemand = cognitiveDemandFor(type);
  return { valid: unique(reasons).length === 0, reasons: unique(reasons), leakage, fingerprint, cognitiveDemand: cognitiveDemandFor(type) };
}

export function selectFirstValidCandidate(candidates = [], context = {}) {
  const rejected = [];
  for (const candidate of candidates.slice(0, 3)) {
    const activity = candidate.activity ? { ...candidate.activity, activityType: candidate.activityType, cognitiveDemand: candidate.estimatedCognitiveDemand, reasonCode: candidate.reasonCode } : candidate;
    const validation = validateCatalogActivity(activity, { ...context, errorType: candidate.errorType || context.errorType });
    if (validation.valid) return { accepted: true, candidate: { ...candidate, activity: { ...activity, fingerprint: validation.fingerprint } }, validation, rejected };
    rejected.push({ activityType: candidate.activityType || activity.activityType, reasons: validation.reasons });
  }
  return { accepted: false, candidate: null, validation: null, rejected, reason: "NO_VALID_CANDIDATE" };
}

export function catalogQualityMetrics(activities = [], context = {}) {
  const validations = activities.map(activity => validateCatalogActivity(activity, context));
  const types = activities.map(activity => activity.activityType || activity.type);
  return {
    singlePairMatchingRate: activities.some(activity => (activity.activityType || activity.type) === ACTIVITY_TYPES.ARROW_MATCH && (activity.pairs || []).length < 3) ? 1 : 0,
    singleLetterCompletionRate: activities.some(activity => {
      if ((activity.activityType || activity.type) !== ACTIVITY_TYPES.GUIDED_GAP) return false;
      return activity.gapUnit === "LETTER" || activity.targetUnit === "LETTER" || Array.from(String(activity.correctAnswer || "")).length === 1;
    }) ? 1 : 0,
    firstErrorExplicitSolutionRate: Number(context.attemptNumber || 1) === 1 && activities.some(activity => ["WORKED_EXAMPLE", "EXPLICIT_SOLUTION"].includes(activity.answerExposure)) ? 1 : 0,
    exactDuplicateAfterErrorRate: validations.some(validation => validation.reasons.includes("EXACT_ACTIVITY_DUPLICATE")) ? 1 : 0,
    technicalUIExposureRate: activities.some(activity => /\b(?:openai|debug|fallback|fingerprint|strategy|planid|usedai)\b/i.test([activity.prompt, activity.instruction, activity.explanation].join(" "))) ? 1 : 0,
    unsupportedActivityTypeRate: types.some(type => !isSupportedActivityType(type) || !isEnabledActivityType(type)) ? 1 : 0,
    incorrectObjectiveCompletionRate: 0
  };
}
