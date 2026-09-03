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
  "ANSWER_IN_INSTRUCTION",
  "ANSWER_IN_EXPLANATION",
  "ANSWER_IN_CONTEXT",
  "ANSWER_IN_VISIBLE_HINT",
  "ANSWER_IN_DIALOGUE",
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
const localize = (value, locale = "es", seen = new Set()) => {
  if (value == null) return "";
  if (typeof value !== "object") return String(value);
  if (seen.has(value)) return "";
  seen.add(value);
  if (Array.isArray(value)) return value.map(item => localize(item, locale, seen)).filter(Boolean).join(" ");
  const localized = value[locale] ?? value.es ?? value.en ?? value.text ?? value.label ?? value.value;
  return localized === undefined || localized === value ? "" : localize(localized, locale, seen);
};
const optionText = (option, locale) => localize(option?.text ?? option?.label ?? option?.value ?? option, locale);
const unique = values => [...new Set(values.filter(Boolean))];
const countMarker = (value, expression) => (String(value || "").match(expression) || []).length;
const containsAnswer = (value, answer) => Boolean(value && answer && ` ${value} `.includes(` ${answer} `));
const effectiveAnswers = (activity, locale) => unique([
  activity.correctAnswer,
  activity.answer,
  ...(Array.isArray(activity.acceptedAnswers) ? activity.acceptedAnswers : [])
].map(value => localize(value, locale).trim()).filter(Boolean));
const effectiveAnswer = (activity, locale) => effectiveAnswers(activity, locale)[0] || "";

export function approvedAudioForTarget(context = {}) {
  const locale = context.uiLocale || "es";
  const material = context.approvedActivityMaterial || {};
  const audio = material.audio;
  if (!audio || typeof audio !== "object") return null;
  const canonicalKeys = ["audioAuthorized", "audioId", "audioPath", "audioSource", "audioText", "humanRecorded"];
  const richKeys = [...canonicalKeys, "authorized", "id", "path", "recordingId", "source", "text"];
  const suppliedKeys = Object.keys(audio).sort();
  const hasExactKeys = expected => suppliedKeys.length === expected.length
    && expected.every(key => suppliedKeys.includes(key));
  const canonicalShape = hasExactKeys(canonicalKeys);
  const richShape = hasExactKeys(richKeys);
  if (!canonicalShape && !richShape) return null;
  const targets = [
    context.correctAnswer,
    material.correctAnswer,
    context.activity?.correctAnswer,
    context.activity?.answer,
    ...(Array.isArray(material.acceptedAnswers) ? material.acceptedAnswers : []),
    ...(Array.isArray(context.activity?.acceptedAnswers) ? context.activity.acceptedAnswers : [])
  ].map(value => localize(value, locale).trim()).filter(Boolean);
  const audioId = String(audio.audioId || "").trim();
  const audioPath = String(audio.audioPath || "").trim();
  const audioText = localize(audio.audioText, locale).trim();
  const ids = [audio.audioId, audio.id, audio.recordingId].map(value => String(value || "").trim()).filter(Boolean);
  const paths = [audio.audioPath, audio.path].map(value => String(value || "").trim()).filter(Boolean);
  const texts = [audio.audioText, audio.text].map(value => localize(value, locale).trim()).filter(Boolean);
  const sources = [audio.audioSource, audio.source].map(value => String(value || "").trim()).filter(Boolean);
  const aliases = unique([audioText, audioText.split("(")[0].trim()].map(normalize));
  const coherent = Boolean(
    audioId
    && audioPath
    && audioText
    && ids.length === (richShape ? 3 : 1)
    && ids.every(value => value === audioId)
    && paths.length === (richShape ? 2 : 1)
    && paths.every(value => value === audioPath)
    && texts.length === (richShape ? 2 : 1)
    && texts.every(value => aliases.includes(normalize(value)))
    && sources.length === (richShape ? 2 : 1)
    && sources.every(value => value === "manifest-human-recording")
    && audio.audioAuthorized === true
    && audio.humanRecorded === true
    && (!richShape || audio.authorized === true)
    && targets.length > 0
    && targets.every(target => aliases.includes(normalize(target)))
  );
  return coherent ? {
    audioId,
    audioPath,
    audioText,
    audioAuthorized: true,
    humanRecorded: true,
    audioSource: "manifest-human-recording"
  } : null;
}

export const approvedAudioAvailableForTarget = context => Boolean(approvedAudioForTarget(context));

const canonicalContent = (value, locale) => localize(value, locale).normalize("NFC").trim();
const signature = values => JSON.stringify(values);
const authorizedSubset = (candidateValues, approvedValues, signatureFor) => {
  const approved = new Set((approvedValues || [])
    .filter(value => value?.authorized === true)
    .map(signatureFor));
  return Array.isArray(candidateValues)
    && candidateValues.every(value => value?.authorized === true && approved.has(signatureFor(value)));
};

const exactValueSet = (candidateValues, approvedValues, locale) => {
  const candidate = candidateValues.map(value => canonicalContent(value, locale)).filter(Boolean);
  const approved = approvedValues.map(value => canonicalContent(value, locale)).filter(Boolean);
  return candidate.length === new Set(candidate).size
    && approved.length === new Set(approved).size
    && candidate.length === approved.length
    && candidate.every(value => approved.includes(value));
};

const authorizedSequenceEquals = (candidateValues, approvedValues, signatureFor) => {
  const approved = (approvedValues || []).filter(value => value?.authorized === true);
  return Array.isArray(candidateValues)
    && candidateValues.length === approved.length
    && candidateValues.every((value, index) => value?.authorized === true
      && signatureFor(value) === signatureFor(approved[index]));
};

function answersAreApproved(activity, material, context, locale, { dialogue = false } = {}) {
  const contextAnswer = canonicalContent(context.correctAnswer, locale);
  const materialAnswer = canonicalContent(material.correctAnswer, locale);
  const activityAnswer = canonicalContent(activity.correctAnswer, locale);
  const activityAnswerAlias = canonicalContent(activity.answer, locale);
  const expectedAnswer = canonicalContent(dialogue ? material.dialogueCorrectAnswer : material.correctAnswer, locale);
  if (!contextAnswer || !materialAnswer || contextAnswer !== materialAnswer || !activityAnswer || activityAnswer !== expectedAnswer) return false;
  if (activityAnswerAlias && activityAnswerAlias !== expectedAnswer) return false;
  const candidateAccepted = Array.isArray(activity.acceptedAnswers) ? activity.acceptedAnswers : [];
  const approvedAccepted = dialogue
    ? [material.dialogueCorrectAnswer]
    : (Array.isArray(material.acceptedAnswers) ? material.acceptedAnswers : []);
  return exactValueSet(candidateAccepted, approvedAccepted, locale);
}

function activityUsesOnlyApprovedMaterial(activity, context, locale) {
  const type = activity.activityType || activity.type;
  const material = context.approvedActivityMaterial;
  if (!material || typeof material !== "object") return false;
  const optionSignature = option => signature([String(option?.id ?? ""), canonicalContent(option?.text ?? option?.label ?? option?.value, locale)]);
  const pairSignature = pair => signature([String(pair?.id ?? ""), canonicalContent(pair?.left, locale), canonicalContent(pair?.right, locale)]);
  const categorySignature = category => signature([String(category?.id ?? ""), canonicalContent(category?.label ?? category?.text, locale)]);
  const itemSignature = item => signature([String(item?.id ?? ""), canonicalContent(item?.text ?? item?.label, locale), String(item?.categoryId ?? "")]);
  const turnSignature = turn => signature([String(turn?.id ?? ""), canonicalContent(turn?.speaker, locale), canonicalContent(turn?.text, locale)]);
  const candidateContexts = [activity.contextText, activity.scenario, activity.lessonContext?.visibleContext]
    .map(value => canonicalContent(value, locale))
    .filter(Boolean);
  const approvedContexts = new Set((material.contexts || [])
    .filter(value => value?.authorized === true)
    .map(value => canonicalContent(value?.text ?? value?.value, locale))
    .filter(Boolean));
  if (candidateContexts.some(value => !approvedContexts.has(value))) return false;
  const standardOptionsApproved = () => authorizedSubset(activity.options || [], material.options || [], optionSignature)
    && String(activity.correctOptionId ?? "") === String(material.correctOptionId ?? "")
    && answersAreApproved(activity, material, context, locale);

  if (type === ACTIVITY_TYPES.CONTEXT_CHOICE) {
    return standardOptionsApproved() && candidateContexts.length > 0;
  }
  if (type === ACTIVITY_TYPES.ARROW_MATCH) {
    return authorizedSubset(activity.pairs || [], material.pairs || [], pairSignature)
      && answersAreApproved(activity, material, context, locale);
  }
  if (type === ACTIVITY_TYPES.CATEGORY_SORT) {
    return authorizedSubset(activity.categories || [], material.categories || [], categorySignature)
      && authorizedSubset(activity.items || [], material.items || [], itemSignature)
      && answersAreApproved(activity, material, context, locale);
  }
  if (type === ACTIVITY_TYPES.DIALOGUE_NEXT_TURN) {
    return authorizedSequenceEquals(activity.dialogue || activity.turns || [], material.dialogue || [], turnSignature)
      && authorizedSubset(activity.options || [], material.dialogueOptions || [], optionSignature)
      && String(activity.correctOptionId ?? "") === String(material.dialogueCorrectOptionId ?? "")
      && answersAreApproved(activity, material, context, locale, { dialogue: true });
  }
  if (type === ACTIVITY_TYPES.AUDIO_SELECT) return standardOptionsApproved();
  if (type === ACTIVITY_TYPES.INDEPENDENT_RECALL) return answersAreApproved(activity, material, context, locale);
  return false;
}

export function detectAnswerLeakage(activity = {}, { uiLocale = "es" } = {}) {
  const answers = unique(effectiveAnswers(activity, uiLocale).map(normalize));
  const codes = [];
  if (!answers.length) return { leaked: false, codes };
  const prompt = normalize(localize(activity.prompt, uiLocale));
  const instruction = normalize(localize(activity.instruction, uiLocale));
  const explanation = normalize(localize(activity.explanation, uiLocale));
  const context = normalize(localize(activity.contextText ?? activity.scenario ?? activity.lessonContext?.visibleContext, uiLocale));
  const hints = normalize((activity.hints || []).map(item => localize(item, uiLocale)).join(" "));
  const dialogue = normalize((activity.dialogue || activity.turns || []).map(turn => localize(turn?.text ?? turn, uiLocale)).join(" "));
  if (answers.some(answer => containsAnswer(prompt, answer))) codes.push("ANSWER_IN_PROMPT");
  if (answers.some(answer => containsAnswer(instruction, answer))) codes.push("ANSWER_IN_INSTRUCTION");
  if (answers.some(answer => containsAnswer(explanation, answer))) codes.push("ANSWER_IN_EXPLANATION");
  if (answers.some(answer => containsAnswer(context, answer))) codes.push("ANSWER_IN_CONTEXT");
  if (answers.some(answer => containsAnswer(hints, answer)) && activity.answerExposure !== "EXPLICIT_SOLUTION") codes.push("ANSWER_IN_VISIBLE_HINT");
  if (answers.some(answer => containsAnswer(dialogue, answer))) codes.push("ANSWER_IN_DIALOGUE");
  if ((activity.pairs || []).length === 1) codes.push("ANSWER_IN_SINGLE_PAIR");
  const tokenIds = (activity.tokens || activity.tiles || []).map((item, index) => String(item?.id ?? index));
  const expectedOrder = (activity.correctOrder || []).map(String);
  if (expectedOrder.length > 1 && tokenIds.length === expectedOrder.length && tokenIds.every((id, index) => id === expectedOrder[index])) codes.push("ANSWER_ALREADY_ORDERED");
  const imageLeak = (activity.options || []).some(option =>
    (answers.includes(normalize(optionText(option, uiLocale))) || String(option?.id) === String(activity.correctOptionId))
    && answers.some(answer => containsAnswer(normalize(option.alt ?? option.imageAlt), answer)));
  if (imageLeak) codes.push("ANSWER_IN_IMAGE_LABEL");
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
  const answers = effectiveAnswers(activity, locale);
  const answer = localize(activity.correctAnswer, locale).trim();
  const expectedOrder = activity.correctOrder || [];

  if (!entry) return ["UNSUPPORTED_ACTIVITY_TYPE"];
  if (!entry.enabled) return [entry.disabledReason || "ACTIVITY_TYPE_DISABLED"];
  if (![activity.instruction, activity.prompt].some(value => normalize(localize(value, locale)))) reasons.push("MISSING_ACTIVITY_PROMPT");
  if (activity.requiresStudentResponse !== true) reasons.push("STUDENT_RESPONSE_REQUIRED");
  if (!normalize(answer)) reasons.push("CORRECT_ANSWER_MISSING");
  if (activity.hasOpenConflict === true || (activity.conflictIds || []).some(id => ["C-001", "C-002"].includes(String(id)))) reasons.push("OPEN_LINGUISTIC_CONFLICT");
  if ([...(activity.options || []), ...(activity.pairs || []), ...(activity.items || []), ...(activity.tiles || activity.tokens || [])].some(item => item && typeof item === "object" && item.authorized === false)) reasons.push("UNAUTHORIZED_CONTENT");
  if (activity.cognitiveDemand && activity.cognitiveDemand !== entry.cognitiveDemand) reasons.push("COGNITIVE_DEMAND_MISMATCH");
  if (type !== ACTIVITY_TYPES.AUDIO_SELECT && (
    String(activity.audioId || "")
    || String(activity.audioPath || "")
    || localize(activity.audioText, locale).trim()
    || activity.audioAuthorized === true
    || activity.humanRecorded === true
    || String(activity.audioSource || "")
    || (activity.authorizedAudio && typeof activity.authorizedAudio === "object")
  )) reasons.push("UNEXPECTED_AUDIO_MATERIAL");

  if ([ACTIVITY_TYPES.CONTEXT_CHOICE, ACTIVITY_TYPES.CONCEPT_CONTRAST, ACTIVITY_TYPES.DIALOGUE_NEXT_TURN].includes(type)) {
    if (options.length < 3 || options.length > 4) reasons.push("INVALID_OPTION_COUNT");
  }
  if (type === ACTIVITY_TYPES.IMAGE_CHOICE) {
    if (options.length < 3 || options.length > 4) reasons.push("INVALID_OPTION_COUNT");
    if (options.some(option => !String(option.image || option.imageUrl || "").trim() || option.authorized !== true)) reasons.push("UNAUTHORIZED_OR_MISSING_IMAGE");
  }
  if (type === ACTIVITY_TYPES.CONTEXT_CHOICE) {
    if (activity.contextAuthorized !== true) reasons.push("UNAUTHORIZED_CONTEXT");
    const hasContext = [activity.contextText, activity.scenario, activity.lessonContext?.visibleContext]
      .some(value => normalize(localize(value, locale)));
    if (!hasContext) reasons.push("MISSING_CONTEXT_CONTENT");
  }
  if (type === ACTIVITY_TYPES.ARROW_MATCH) {
    const pairIds = pairs.map(pair => String(pair?.id ?? "").trim());
    const pairContent = pairs.map(pair => ({
      left: normalize(localize(pair?.left, locale)),
      right: normalize(localize(pair?.right, locale))
    }));
    const pairTuples = pairContent.map(pair => `${pair.left}\u0000${pair.right}`);
    if (pairs.length < 3 || pairs.length > 5) reasons.push("INVALID_PAIR_COUNT");
    if (pairIds.some(id => !id)) reasons.push("MISSING_PAIR_ID");
    if (new Set(pairIds).size !== pairIds.length) reasons.push("DUPLICATE_PAIR_IDS");
    if (pairContent.some(pair => !pair.left || !pair.right)) reasons.push("MISSING_PAIR_CONTENT");
    if (new Set(pairTuples).size !== pairTuples.length) reasons.push("DUPLICATE_PAIRS");
    if (pairContent.some(pair => pair.left && pair.left === pair.right)) reasons.push("TRIVIAL_SELF_PAIR");
    if (new Set(pairContent.map(pair => pair.left)).size !== pairContent.length
      || new Set(pairContent.map(pair => pair.right)).size !== pairContent.length) reasons.push("AMBIGUOUS_PAIR_MAPPING");
    if (pairs.some(pair => pair?.authorized !== true)) reasons.push("UNAUTHORIZED_PAIR");
  }
  if (type === ACTIVITY_TYPES.CATEGORY_SORT) {
    const categoryIds = categories.map(category => String(category?.id ?? "").trim());
    const itemIds = items.map(item => String(item?.id ?? "").trim());
    const categoryLabels = categories.map(category => normalize(localize(category?.label ?? category?.text, locale)));
    const itemTexts = items.map(item => normalize(localize(item?.text ?? item?.label, locale)));
    if (items.length < 6 || items.length > 10) reasons.push("INVALID_SORT_ITEM_COUNT");
    if (categories.length < 2 || categories.length > 3) reasons.push("INVALID_CATEGORY_COUNT");
    if (categoryIds.some(id => !id)) reasons.push("MISSING_CATEGORY_ID");
    if (new Set(categoryIds).size !== categoryIds.length) reasons.push("DUPLICATE_CATEGORY_IDS");
    if (categoryLabels.some(label => !label)) reasons.push("MISSING_CATEGORY_LABEL");
    if (new Set(categoryLabels).size !== categoryLabels.length) reasons.push("DUPLICATE_CATEGORY_LABELS");
    if (itemIds.some(id => !id)) reasons.push("MISSING_ITEM_ID");
    if (new Set(itemIds).size !== itemIds.length) reasons.push("DUPLICATE_ITEM_IDS");
    if (itemTexts.some(text => !text)) reasons.push("MISSING_ITEM_CONTENT");
    if (new Set(itemTexts).size !== itemTexts.length) reasons.push("DUPLICATE_SORT_ITEMS");
    if (items.some(item => {
      const categoryId = String(item?.categoryId ?? "");
      return !categoryId.trim() || categories.filter(category => String(category?.id ?? "") === categoryId && category?.authorized === true).length !== 1;
    })) reasons.push("INVALID_CATEGORY_REFERENCE");
    if (categories.some(category => category?.authorized !== true) || items.some(item => item?.authorized !== true)) reasons.push("UNAUTHORIZED_SORT_CONTENT");
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
  if (type === ACTIVITY_TYPES.ERROR_SPOTTING) {
    const segments = activity.segments || [];
    if (segments.length < 2) reasons.push("TOO_FEW_ERROR_SEGMENTS");
    if (segments.filter(segment => segment.isIncorrect === true).length !== 1) reasons.push("INVALID_ERROR_TARGET_COUNT");
    if (!String(activity.correctedSentence || "").trim()) reasons.push("MISSING_VALIDATED_CORRECTION");
  }
  if (type === ACTIVITY_TYPES.DIALOGUE_NEXT_TURN) {
    const turnIds = dialogue.map(turn => String(turn?.id ?? "").trim());
    const speakers = dialogue.map(turn => normalize(localize(turn?.speaker, locale)));
    const turnTexts = dialogue.map(turn => normalize(localize(turn?.text, locale)));
    if (dialogue.length < 2 || dialogue.length > 4) reasons.push("INVALID_DIALOGUE_LENGTH");
    if (turnIds.some(id => !id)) reasons.push("MISSING_DIALOGUE_TURN_ID");
    if (new Set(turnIds).size !== turnIds.length) reasons.push("DUPLICATE_DIALOGUE_TURN_IDS");
    if (speakers.some(speaker => !speaker)) reasons.push("MISSING_DIALOGUE_SPEAKER");
    if (turnTexts.some(text => !text)) reasons.push("MISSING_DIALOGUE_TEXT");
    if (activity.dialogueAuthorized !== true || dialogue.some(turn => turn?.authorized !== true)) reasons.push("UNAUTHORIZED_DIALOGUE");
  }
  if (type === ACTIVITY_TYPES.AUDIO_SELECT) {
    const audioAliases = unique([
      localize(activity.audioText, locale),
      localize(activity.audioText, locale).split("(")[0].trim()
    ].map(normalize));
    if (options.length < 3 || options.length > 4) reasons.push("INVALID_OPTION_COUNT");
    if (activity.audioAuthorized !== true || activity.humanRecorded !== true) reasons.push("UNAUTHORIZED_AUDIO");
    if (!String(activity.audioId || "").trim() || !String(activity.audioPath || "").trim() || !String(activity.audioText || "").trim()) reasons.push("MISSING_AUDIO_SOURCE");
    if (activity.audioSource !== "manifest-human-recording") reasons.push("UNAUTHORIZED_AUDIO_SOURCE");
    if (answers.map(normalize).some(value => value && !audioAliases.includes(value))) reasons.push("AUDIO_TARGET_MISMATCH");
  }
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
    const optionIds = options.map(option => String(option?.id ?? ""));
    const values = options.map(option => normalize(optionText(option, locale)));
    if (optionIds.some(id => !id.trim())) reasons.push("MISSING_OPTION_ID");
    if (new Set(optionIds.map(id => id.trim())).size !== optionIds.length) reasons.push("DUPLICATE_OPTION_IDS");
    if (values.some(value => !value)) reasons.push("MISSING_OPTION_CONTENT");
    if (options.some(option => option?.authorized !== true)) reasons.push("UNAUTHORIZED_OPTION");
    if (new Set(values).size !== values.length) reasons.push("DUPLICATE_OPTIONS");
    const correctOptionId = String(activity.correctOptionId ?? "");
    const correctOptions = options.filter(option => String(option?.id ?? "") === correctOptionId);
    const correctOption = correctOptions[0];
    const normalizedAnswers = new Set(answers.map(normalize).filter(Boolean));
    if (!correctOptionId.trim() || correctOptions.length === 0) reasons.push("CORRECT_OPTION_MISSING");
    if (correctOptions.length > 1) reasons.push("CORRECT_OPTION_AMBIGUOUS");
    if (correctOption && (!normalize(answer) || normalize(optionText(correctOption, locale)) !== normalize(answer))) reasons.push("CORRECT_OPTION_MISMATCH");
    if (options.some(option => String(option?.id ?? "") !== correctOptionId
      && normalizedAnswers.has(normalize(optionText(option, locale))))) reasons.push("ANSWER_ALSO_IN_DISTRACTOR");
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
  if (context.requireApprovedMaterial === true && !activityUsesOnlyApprovedMaterial(activity, context, context.uiLocale || "es")) {
    reasons.push("CONTENT_NOT_IN_APPROVED_MATERIAL");
  }
  if (type === ACTIVITY_TYPES.AUDIO_SELECT && context.requireApprovedAudio === true) {
    const approvedAudio = approvedAudioForTarget(context);
    const matchesApprovedAudio = approvedAudio
      && String(activity.audioId || "") === approvedAudio.audioId
      && String(activity.audioPath || "") === approvedAudio.audioPath
      && canonicalContent(activity.audioText, context.uiLocale || "es") === canonicalContent(approvedAudio.audioText, context.uiLocale || "es")
      && activity.audioAuthorized === true
      && activity.humanRecorded === true
      && activity.audioSource === approvedAudio.audioSource;
    if (!matchesApprovedAudio) reasons.push("AUDIO_NOT_AUTHORIZED_FOR_TARGET");
  }
  if (context.errorType) {
    const availability = typeof context.audioEnabled === "boolean" ? { audioEnabled: context.audioEnabled } : undefined;
    const allowed = allowedTypesForError(context.errorType, availability);
    if (!allowed.includes(type)) reasons.push("TYPE_NOT_ALIGNED_WITH_ERROR");
  }
  const fingerprint = activity.fingerprint || fingerprintFor(activity);
  const recentFingerprints = new Set((context.recentActivityFingerprints || []).slice(-5));
  if (fingerprint === context.previousActivityFingerprint || recentFingerprints.has(fingerprint)) reasons.push("EXACT_ACTIVITY_DUPLICATE");
  const recentTypes = (context.recentActivities || []).slice(-5).map(item => item.activityType || item.type).filter(Boolean);
  if (recentTypes.at(-1) === type) reasons.push("SAME_MODALITY_WITHOUT_REASON");
  if (SELECTION_ACTIVITY_TYPES.has(type) && recentTypes.length >= 2 && recentTypes.slice(-2).every(recentType => SELECTION_ACTIVITY_TYPES.has(recentType))) reasons.push("THREE_SELECTION_ACTIVITIES_IN_A_ROW");
  const answerExposure = activity.answerExposure || "HIDDEN";
  if (Number(context.attemptNumber || 1) === 1 && ["WORKED_EXAMPLE", "EXPLICIT_SOLUTION"].includes(answerExposure)) reasons.push("FIRST_ERROR_EXPLICIT_SOLUTION");
  if (!activity.cognitiveDemand) activity.cognitiveDemand = cognitiveDemandFor(type);
  return { valid: unique(reasons).length === 0, reasons: unique(reasons), leakage, fingerprint, cognitiveDemand: cognitiveDemandFor(type) };
}

export function selectFirstValidCandidate(candidates = [], context = {}) {
  const prepared = candidates.slice(0, 3).map(candidate => ({
    candidate,
    activity: candidate.activity
      ? { ...candidate.activity, activityType: candidate.activityType, cognitiveDemand: candidate.estimatedCognitiveDemand, reasonCode: candidate.reasonCode }
      : candidate
  }));
  const trustedErrorType = String(context.errorType || "").trim();
  const audioEnabled = approvedAudioAvailableForTarget(context);
  const validatePrepared = ({ candidate, activity }, audioAvailable) => {
    const validation = validateCatalogActivity(activity, {
      ...context,
      errorType: trustedErrorType,
      audioEnabled: audioAvailable,
      requireApprovedAudio: true,
      requireApprovedMaterial: true
    });
    const envelopeReasons = [];
    if (!trustedErrorType) envelopeReasons.push("MISSING_TRUSTED_ERROR_TYPE");
    if (candidate.activity && String(candidate.errorType || "").trim() !== trustedErrorType) envelopeReasons.push("CANDIDATE_ERROR_TYPE_MISMATCH");
    const reasons = unique([...validation.reasons, ...envelopeReasons]);
    return { ...validation, valid: reasons.length === 0, reasons };
  };
  const rejected = [];
  const primaryValidations = [];
  for (const preparedCandidate of prepared) {
    const { candidate, activity } = preparedCandidate;
    const validation = validatePrepared(preparedCandidate, audioEnabled);
    primaryValidations.push({ candidate, activity, validation });
    if (validation.valid) {
      const canonicalAudio = (activity.activityType || activity.type) === ACTIVITY_TYPES.AUDIO_SELECT
        ? approvedAudioForTarget(context)
        : null;
      const acceptedActivity = canonicalAudio ? { ...activity, ...canonicalAudio } : activity;
      return {
        accepted: true,
        candidate: { ...candidate, activity: { ...acceptedActivity, fingerprint: fingerprintFor(acceptedActivity) } },
        validation: { ...validation, fingerprint: fingerprintFor(acceptedActivity) },
        rejected
      };
    }
    rejected.push({ activityType: candidate.activityType || activity.activityType, reasons: validation.reasons });
  }
  const historyReasons = new Set(["EXACT_ACTIVITY_DUPLICATE", "SAME_MODALITY_WITHOUT_REASON", "THREE_SELECTION_ACTIVITIES_IN_A_ROW"]);
  const approvedAudioBlockedByHistory = audioEnabled && primaryValidations.some(({ activity, validation }) =>
    (activity.activityType || activity.type) === ACTIVITY_TYPES.AUDIO_SELECT
    && validation.reasons.length > 0
    && validation.reasons.every(reason => historyReasons.has(reason)));
  if (approvedAudioBlockedByHistory) {
    for (const preparedCandidate of prepared) {
      const { candidate, activity } = preparedCandidate;
      if ((activity.activityType || activity.type) === ACTIVITY_TYPES.AUDIO_SELECT) continue;
      const validation = validatePrepared(preparedCandidate, false);
      if (validation.valid) {
        return {
          accepted: true,
          candidate: { ...candidate, activity: { ...activity, fingerprint: fingerprintFor(activity) } },
          validation: { ...validation, fingerprint: fingerprintFor(activity) },
          rejected
        };
      }
    }
  }
  return { accepted: false, candidate: null, validation: null, rejected, reason: "NO_VALID_CANDIDATE" };
}

export function catalogQualityMetrics(activities = [], context = {}) {
  const validations = activities.map(activity => validateCatalogActivity(activity, context));
  const types = activities.map(activity => activity.activityType || activity.type);
  return {
    singlePairMatchingRate: activities.some(activity => (activity.activityType || activity.type) === ACTIVITY_TYPES.ARROW_MATCH && (activity.pairs || []).length < 3) ? 1 : 0,
    singleLetterCompletionRate: 0,
    firstErrorExplicitSolutionRate: Number(context.attemptNumber || 1) === 1 && activities.some(activity => ["WORKED_EXAMPLE", "EXPLICIT_SOLUTION"].includes(activity.answerExposure)) ? 1 : 0,
    exactDuplicateAfterErrorRate: validations.some(validation => validation.reasons.includes("EXACT_ACTIVITY_DUPLICATE")) ? 1 : 0,
    technicalUIExposureRate: activities.some(activity => /\b(?:openai|debug|fallback|fingerprint|strategy|planid|usedai)\b/i.test([activity.prompt, activity.instruction, activity.explanation].join(" "))) ? 1 : 0,
    unsupportedActivityTypeRate: types.some(type => !isSupportedActivityType(type) || !isEnabledActivityType(type)) ? 1 : 0,
    incorrectObjectiveCompletionRate: 0
  };
}
