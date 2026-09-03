import { createHash } from "node:crypto";
import { filterAllowedKnowledge } from "./reinforcement-engine.mjs";
import { ERROR_TYPES, STRATEGIES } from "../intervention-engine/intervention-config.mjs";
import { authorizeRecordedAudioForTarget } from "./recorded-audio-authority.mjs";
import { approvedActivityAuthority as defaultApprovedActivityAuthority } from "./approved-activity-authority.mjs";
import {
  applyAISelection,
  canScoreWithoutAI,
  createInterventionEvent,
  planPedagogicalIntervention,
  wouldAIImproveIntervention
} from "../intervention-engine/intervention-engine.mjs";

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,95}$/;
const UI_LOCALES = new Set(["es", "en", "pt", "fr", "it", "de"]);
const ALLOWED_ACTIVITY_TYPES = new Set([
  "multiple-choice", "listening", "order-sentence", "fill-blank", "writing", "matching", "speaking", "scenario",
  "CONTEXT_CHOICE", "ARROW_MATCH", "CATEGORY_SORT", "DIALOGUE_NEXT_TURN", "INDEPENDENT_RECALL", "AUDIO_SELECT"
]);
const CANONICAL_AUDIO_KEYS = Object.freeze([
  "audioId", "audioPath", "audioText", "audioAuthorized", "humanRecorded", "audioSource"
]);
const RICH_AUDIO_KEYS = Object.freeze([
  "id", "audioId", "recordingId", "path", "audioPath", "text", "audioText", "source", "audioSource",
  "authorized", "audioAuthorized", "humanRecorded"
]);
const safeId = (value, fallback = "") => {
  const normalized = String(value || "").trim();
  return SAFE_ID.test(normalized) ? normalized : fallback;
};
const truncate = (value, max = 320) => String(value ?? "").slice(0, max);
const arrayOfIds = (value, max = 16) => [...new Set((Array.isArray(value) ? value : []).map(item => safeId(item)).filter(Boolean))].slice(0, max);
const sameIds = (left, right) => {
  const normalized = value => arrayOfIds(value).sort();
  return JSON.stringify(normalized(left)) === JSON.stringify(normalized(right));
};
const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

function exactSourceIdentity(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const identity = {};
  for (const key of ["sourceActivityId", "sourceContentId"]) {
    if (!hasOwn(value, key)) continue;
    if (typeof value[key] !== "string" || !value[key] || value[key] !== value[key].trim()) return null;
    identity[key] = value[key];
  }
  if (hasOwn(value, "sourceIds")) {
    if (!Array.isArray(value.sourceIds)
      || value.sourceIds.some(id => typeof id !== "string" || !id || id !== id.trim())
      || new Set(value.sourceIds).size !== value.sourceIds.length) return null;
    identity.sourceIds = [...value.sourceIds];
  }
  return identity;
}

function withExactSourceIdentity(source, canonical) {
  const identity = exactSourceIdentity(source);
  return identity === null ? null : { ...canonical, ...identity };
}

function emptyApprovedActivityMaterial() {
  return {
    options: [], correctOptionId: "", correctAnswer: "", acceptedAnswers: [],
    pairs: [], contexts: [], categories: [], items: [], dialogue: [], dialogueOptions: [],
    dialogueCorrectOptionId: "", dialogueCorrectAnswer: "", dialogueSourceContentId: "", audio: null
  };
}

function localizedText(value, locale = "es", max = 320) {
  let selected = value;
  if (value && typeof value === "object" && !Array.isArray(value)) {
    selected = [locale, "es", "en", "pt", "fr", "it", "de"]
      .filter((key, index, keys) => keys.indexOf(key) === index)
      .map(key => Object.hasOwn(value, key) ? value[key] : undefined)
      .find(candidate => typeof candidate === "string");
  }
  if (typeof selected !== "string") return "";
  return selected.normalize("NFC").trim().slice(0, max);
}

function exactAudioShape(value, expectedKeys) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort();
  return actual.length === expectedKeys.length
    && expectedKeys.every(key => Object.hasOwn(value, key))
    && JSON.stringify(actual) === JSON.stringify([...expectedKeys].sort());
}

function validatedAudioComponent(value) {
  const rich = exactAudioShape(value, RICH_AUDIO_KEYS);
  const canonical = !rich && exactAudioShape(value, CANONICAL_AUDIO_KEYS);
  if (!rich && !canonical) return null;
  if (typeof value.audioId !== "string" || typeof value.audioPath !== "string" || typeof value.audioText !== "string"
    || value.audioAuthorized !== true || value.humanRecorded !== true || value.audioSource !== "manifest-human-recording") return null;
  if (rich && (typeof value.id !== "string" || typeof value.recordingId !== "string" || typeof value.path !== "string"
    || typeof value.text !== "string" || value.authorized !== true || value.source !== "manifest-human-recording")) return null;
  return value;
}

function declaresActivityAudioClaim(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const meaningfulCanonical = CANONICAL_AUDIO_KEYS.some(key => Object.hasOwn(value, key)
    && value[key] !== undefined && value[key] !== null && value[key] !== "" && value[key] !== false);
  const explicitAliases = ["recordingId", "path", "url", "text", "source", "authorized"]
    .some(key => Object.hasOwn(value, key));
  const nestedClaim = ["authorizedAudio", "audio"].some(key => Object.hasOwn(value, key)
    && value[key] !== undefined && value[key] !== null && value[key] !== "");
  return meaningfulCanonical || explicitAliases || nestedClaim;
}

export function trustedRecordedAudio(value = {}, targetText = "", { activityClaim = false } = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const components = [];
  let invalid = false;
  const visit = (candidate, { root = false } = {}) => {
    if (candidate === undefined || candidate === null || candidate === "") return;
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) { invalid = true; return; }
    let component = null;
    if (root && activityClaim) {
      const activityAliasKeys = ["recordingId", "path", "url", "text", "source", "authorized"];
      const hasTopAudio = CANONICAL_AUDIO_KEYS.some(key => Object.hasOwn(candidate, key)
        && candidate[key] !== undefined && candidate[key] !== null && candidate[key] !== "" && candidate[key] !== false);
      const hasTopAliases = activityAliasKeys.some(key => Object.hasOwn(candidate, key));
      if (hasTopAudio || hasTopAliases) {
        if (!CANONICAL_AUDIO_KEYS.every(key => Object.hasOwn(candidate, key))) invalid = true;
        else {
          component = Object.fromEntries(CANONICAL_AUDIO_KEYS.map(key => [key, candidate[key]]));
          if (hasTopAliases) {
            const richAliases = {
              id: component.audioId,
              audioId: component.audioId,
              recordingId: Object.hasOwn(candidate, "recordingId") ? candidate.recordingId : component.audioId,
              path: Object.hasOwn(candidate, "path") ? candidate.path : component.audioPath,
              audioPath: component.audioPath,
              text: Object.hasOwn(candidate, "text") ? candidate.text : component.audioText,
              audioText: component.audioText,
              source: Object.hasOwn(candidate, "source") ? candidate.source : component.audioSource,
              audioSource: component.audioSource,
              authorized: Object.hasOwn(candidate, "authorized") ? candidate.authorized : component.audioAuthorized,
              audioAuthorized: component.audioAuthorized,
              humanRecorded: component.humanRecorded
            };
            const validatedAliases = validatedAudioComponent(richAliases);
            if (!validatedAliases) invalid = true;
            else components.push(Object.hasOwn(candidate, "url")
              ? { ...validatedAliases, url: candidate.url }
              : validatedAliases);
          }
        }
      }
    } else {
      const hasDirectAudio = [...CANONICAL_AUDIO_KEYS, ...RICH_AUDIO_KEYS]
        .some(key => Object.hasOwn(candidate, key));
      if (hasDirectAudio) component = candidate;
    }
    if (component) {
      const validated = validatedAudioComponent(component);
      if (!validated) invalid = true;
      else components.push(validated);
    }
    for (const key of ["authorizedAudio", "audio"]) {
      if (Object.hasOwn(candidate, key)) visit(candidate[key]);
    }
  };
  visit(value, { root: true });
  if (invalid || !components.length) return null;
  const claim = components.reduce((envelope, component) => envelope
    ? { audio: envelope, authorizedAudio: component }
    : component, null);
  return authorizeRecordedAudioForTarget(claim, targetText);
}

function sanitizeActivity(activity = {}, targetText = "") {
  const recordedAudio = trustedRecordedAudio(activity, targetText, { activityClaim: true });
  return {
    id: safeId(activity.id, "activity"),
    conceptId: safeId(activity.conceptId || activity.conceptIds?.[0]),
    conceptIds: arrayOfIds(activity.conceptIds?.length ? activity.conceptIds : [activity.conceptId]),
    learningObjectiveId: safeId(activity.learningObjectiveId),
    type: ALLOWED_ACTIVITY_TYPES.has(activity.type) ? activity.type : "multiple-choice",
    skill: safeId(activity.skill, "vocabulary"),
    difficulty: truncate(activity.difficulty || "foundation", 40),
    contentValidationStatus: truncate(activity.contentValidationStatus, 40),
    allowedForMastery: activity.allowedForMastery === true,
    literalReuseOnly: activity.literalReuseOnly === true,
    prompt: activity.prompt,
    instruction: activity.instruction,
    options: (activity.options || []).slice(0, 8).map(option => ({ id: safeId(option?.id, "option"), label: option?.label ?? option?.value ?? option })),
    correctOptionId: safeId(activity.correctOptionId),
    acceptedAnswers: (activity.acceptedAnswers || []).slice(0, 10).map(item => truncate(item, 160)),
    lexemeIds: arrayOfIds(activity.lexemeIds),
    grammarRuleIds: arrayOfIds(activity.grammarRuleIds),
    sourceIds: arrayOfIds(activity.sourceIds),
    requiresStudentResponse: activity.requiresStudentResponse === true,
    correctOrder: (activity.correctOrder || []).slice(0, 16).map(item => safeId(item)),
    audioId: recordedAudio?.audioId || "",
    audioText: recordedAudio?.audioText || "",
    audioPath: recordedAudio?.audioPath || "",
    audioAuthorized: recordedAudio?.audioAuthorized === true,
    humanRecorded: recordedAudio?.humanRecorded === true,
    audioSource: recordedAudio?.audioSource || "",
    contextText: truncate(activity.contextText || activity.scenario || activity.lessonContext?.visibleContext, 500),
    contextAuthorized: activity.contextAuthorized === true,
    dialogueAuthorized: activity.dialogueAuthorized === true,
    image: truncate(activity.image || activity.imageUrl, 240),
    template: activity.template,
    context: activity.context
    ,pairs: (activity.pairs || []).slice(0, 5).map((pair, index) => ({ id: safeId(pair?.id, `pair-${index}`), left: truncate(pair?.left, 160), right: truncate(pair?.right, 160), authorized: pair?.authorized === true }))
    ,semanticPair: activity.semanticPair?.target && activity.semanticPair?.meaning ? { target: truncate(activity.semanticPair.target, 160), meaning: truncate(activity.semanticPair.meaning, 160), authorized: activity.semanticPair.authorized === true } : null
    ,categories: (activity.categories || []).slice(0, 3).map((category, index) => ({ id: safeId(category?.id, `category-${index}`), label: truncate(category?.label ?? category?.text ?? category, 120), authorized: category?.authorized === true }))
    ,items: (activity.items || []).slice(0, 10).map((item, index) => ({ id: safeId(item?.id, `item-${index}`), text: truncate(item?.text ?? item?.label ?? item, 120), categoryId: safeId(item?.categoryId), authorized: item?.authorized === true }))
    ,dialogue: (activity.dialogue || activity.turns || []).slice(0, 4).map((turn, index) => ({ id: safeId(turn?.id, `turn-${index}`), speaker: truncate(turn?.speaker || (index % 2 ? "B" : "A"), 40), text: truncate(turn?.text ?? turn, 240), authorized: turn?.authorized === true }))
    ,tokens: (activity.tokens || []).slice(0, 16).map((token, index) => ({ id: safeId(token?.id, `token-${index}`), label: truncate(token?.label ?? token?.text ?? token, 120) }))
    ,media: activity.media && typeof activity.media === "object" ? { type: truncate(activity.media.type, 12), value: truncate(activity.media.value, 240), alt: truncate(activity.media.alt, 200), sourceId: safeId(activity.media.sourceId) } : null
    ,helpLevel: Math.min(4, Math.max(0, Number(activity.helpLevel) || 0))
    ,answerExposure: ["HIDDEN", "PARTIAL_HINT", "WORKED_EXAMPLE", "EXPLICIT_SOLUTION"].includes(activity.answerExposure) ? activity.answerExposure : "HIDDEN"
  };
}

export function sanitizeApprovedActivityMaterial(material = {}, targetText = "", locale = "es") {
  const source = material && typeof material === "object" && !Array.isArray(material) ? material : {};
  const authorized = item => item && typeof item === "object" && !Array.isArray(item)
    && Object.hasOwn(item, "authorized") && item.authorized === true;
  const approvedId = value => typeof value === "string" ? safeId(value) : "";
  const withoutDuplicateIds = entries => {
    const counts = entries.reduce((result, entry) => result.set(entry.id, (result.get(entry.id) || 0) + 1), new Map());
    return entries.filter(entry => counts.get(entry.id) === 1);
  };
  const materialSourceIdentity = exactSourceIdentity(source);
  if (materialSourceIdentity === null) return emptyApprovedActivityMaterial();
  const recordedAudio = trustedRecordedAudio(source, targetText);
  const options = withoutDuplicateIds((Array.isArray(source.options) ? source.options : []).filter(authorized).slice(0, 4).map(option => withExactSourceIdentity(option, {
    id: approvedId(option.id), text: localizedText(option.text ?? option.label ?? option.value, locale, 160), authorized: true
  })).filter(option => option?.id && option.text));
  const requestedCorrectAnswer = localizedText(source.correctAnswer, locale, 240);
  const correctAnswer = requestedCorrectAnswer === localizedText(targetText, locale, 240) ? requestedCorrectAnswer : "";
  const requestedCorrectOptionId = approvedId(source.correctOptionId);
  const correctOption = options.find(option => option.id === requestedCorrectOptionId && option.text === correctAnswer);
  const correctOptionId = correctOption ? requestedCorrectOptionId : "";
  const acceptedAnswers = correctAnswer ? [...new Set((Array.isArray(source.acceptedAnswers) ? source.acceptedAnswers : [])
    .map(value => localizedText(value, locale, 160)).filter(Boolean))].slice(0, 10) : [];
  const pairs = withoutDuplicateIds((Array.isArray(source.pairs) ? source.pairs : []).filter(authorized).slice(0, 5).map(pair => withExactSourceIdentity(pair, {
    id: approvedId(pair.id), left: localizedText(pair.left, locale, 160), right: localizedText(pair.right, locale, 160), authorized: true
  })).filter(pair => pair?.id && pair.left && pair.right));
  const contexts = (Array.isArray(source.contexts) ? source.contexts : []).filter(authorized).slice(0, 4).map(context => ({
    text: localizedText(context.text ?? context.value, locale, 500), authorized: true
  })).filter(context => context.text);
  const categories = withoutDuplicateIds((Array.isArray(source.categories) ? source.categories : []).filter(authorized).slice(0, 3).map(category => withExactSourceIdentity(category, {
    id: approvedId(category.id), label: localizedText(category.label ?? category.text, locale, 120), authorized: true
  })).filter(category => category?.id && category.label));
  const categoryIds = new Set(categories.map(category => category.id));
  const items = withoutDuplicateIds((Array.isArray(source.items) ? source.items : []).filter(authorized).slice(0, 10).map(item => withExactSourceIdentity(item, {
    id: approvedId(item.id), text: localizedText(item.text ?? item.label, locale, 120), categoryId: approvedId(item.categoryId), authorized: true
  })).filter(item => item?.id && item.text && categoryIds.has(item.categoryId)));
  const dialogue = withoutDuplicateIds((Array.isArray(source.dialogue) ? source.dialogue : []).filter(authorized).slice(0, 4).map(turn => withExactSourceIdentity(turn, {
    id: approvedId(turn.id), speaker: localizedText(turn.speaker, locale, 40), text: localizedText(turn.text, locale, 240), authorized: true
  })).filter(turn => turn?.id && turn.speaker && turn.text));
  const dialogueOptions = withoutDuplicateIds((Array.isArray(source.dialogueOptions) ? source.dialogueOptions : []).filter(authorized).slice(0, 4).map(option => withExactSourceIdentity(option, {
    id: approvedId(option.id), text: localizedText(option.text ?? option.label ?? option.value, locale, 160), authorized: true
  })).filter(option => option?.id && option.text));
  const requestedDialogueCorrectOptionId = approvedId(source.dialogueCorrectOptionId);
  const dialogueCorrectOption = dialogueOptions.find(option => option.id === requestedDialogueCorrectOptionId);
  const requestedDialogueCorrectAnswer = localizedText(source.dialogueCorrectAnswer, locale, 240);
  const dialogueCorrectOptionId = dialogueCorrectOption ? requestedDialogueCorrectOptionId : "";
  const dialogueCorrectAnswer = dialogueCorrectOption?.text === requestedDialogueCorrectAnswer ? requestedDialogueCorrectAnswer : "";
  const dialogueSourceContentId = typeof source.dialogueSourceContentId === "string"
    && SAFE_ID.test(source.dialogueSourceContentId) ? source.dialogueSourceContentId : "";
  return {
    ...materialSourceIdentity,
    options,
    correctOptionId,
    correctAnswer,
    acceptedAnswers,
    pairs,
    contexts,
    categories,
    items,
    dialogue: dialogueSourceContentId ? dialogue : [],
    dialogueOptions: dialogueSourceContentId ? dialogueOptions : [],
    dialogueCorrectOptionId: dialogueSourceContentId ? dialogueCorrectOptionId : "",
    dialogueCorrectAnswer: dialogueSourceContentId ? dialogueCorrectAnswer : "",
    dialogueSourceContentId,
    audio: recordedAudio ? {
      audioId: recordedAudio.audioId,
      audioPath: recordedAudio.audioPath,
      audioText: recordedAudio.audioText,
      audioAuthorized: true,
      humanRecorded: true,
      audioSource: recordedAudio.audioSource
    } : null
  };
}

export function normalizeInterventionRequest(input = {}, { activityAuthority = defaultApprovedActivityAuthority } = {}) {
  const uiLocale = UI_LOCALES.has(input.uiLocale) ? input.uiLocale : "es";
  const rawActivity = input.activity && typeof input.activity === "object" && !Array.isArray(input.activity) ? input.activity : {};
  const claimedCorrectAnswer = localizedText(input.correctAnswer, uiLocale, 240);
  const claimedActivity = sanitizeActivity(rawActivity, claimedCorrectAnswer);
  const rawActivityAudioInvalid = declaresActivityAudioClaim(rawActivity)
    && !trustedRecordedAudio(rawActivity, claimedCorrectAnswer, { activityClaim: true });
  const claimedConceptId = safeId(input.conceptId || claimedActivity.conceptId);
  const claimedLearningObjectiveId = safeId(input.learningObjectiveId || claimedActivity.learningObjectiveId);
  const authoritative = activityAuthority?.resolve?.({ activityId: claimedActivity.id, uiLocale }) || null;
  if (!authoritative) throw new TypeError("UNAPPROVED_ACTIVITY_ID");
  const claimedOptions = (Array.isArray(rawActivity.options) ? rawActivity.options : []).map(option => ({
    id: typeof option?.id === "string" ? safeId(option.id) : "",
    label: localizedText(option?.label ?? option?.text ?? option?.value, uiLocale, 160)
  }));
  const sourceOptions = authoritative.sourceActivity.options || [];
  const sourceConceptIds = authoritative.sourceActivity?.conceptIds || [authoritative.sourceActivity?.conceptId].filter(Boolean);
  const authorityVerified = authoritative.sourceActivity?.conceptId === claimedConceptId
    && authoritative.sourceActivity?.learningObjectiveId === claimedLearningObjectiveId
    && safeId(input.conceptId) === authoritative.sourceActivity.conceptId
    && safeId(rawActivity.conceptId || rawActivity.conceptIds?.[0]) === authoritative.sourceActivity.conceptId
    && sameIds(rawActivity.conceptIds?.length ? rawActivity.conceptIds : [rawActivity.conceptId], sourceConceptIds)
    && safeId(input.learningObjectiveId) === authoritative.sourceActivity.learningObjectiveId
    && safeId(rawActivity.learningObjectiveId) === authoritative.sourceActivity.learningObjectiveId
    && authoritative.correctAnswer === claimedCorrectAnswer
    && (rawActivity.type || rawActivity.activityType) === authoritative.sourceActivity.type
    && (!rawActivity.activityType || rawActivity.activityType === authoritative.sourceActivity.activityType)
    && input.activityType === authoritative.sourceActivity.activityType
    && rawActivity.skill === authoritative.sourceActivity.skill
    && input.currentSkill === authoritative.sourceActivity.skill
    && rawActivity.difficulty === authoritative.sourceActivity.difficulty
    && input.difficulty === authoritative.sourceActivity.difficulty
    && rawActivity.correctOptionId === authoritative.sourceActivity.correctOptionId
    && JSON.stringify(claimedOptions) === JSON.stringify(sourceOptions)
    && sameIds(rawActivity.lexemeIds, authoritative.sourceActivity.lexemeIds)
    && sameIds(rawActivity.grammarRuleIds, authoritative.sourceActivity.grammarRuleIds)
    && sameIds(rawActivity.sourceIds, authoritative.sourceActivity.sourceIds)
    && sameIds(input.lexemeIds, authoritative.sourceActivity.lexemeIds)
    && sameIds(input.grammarRuleIds, authoritative.sourceActivity.grammarRuleIds)
    && sameIds(input.knowledgeIds, authoritative.knowledgeIds);
  if (!authorityVerified) throw new TypeError("UNAPPROVED_ACTIVITY_CONTEXT_DRIFT");
  const correctAnswer = authorityVerified ? authoritative.correctAnswer : claimedCorrectAnswer;
  const activity = authorityVerified ? sanitizeActivity({
    ...authoritative.sourceActivity,
    audioId: rawActivityAudioInvalid ? "" : claimedActivity.audioId,
    audioPath: rawActivityAudioInvalid ? "" : claimedActivity.audioPath,
    audioText: rawActivityAudioInvalid ? "" : claimedActivity.audioText,
    audioAuthorized: rawActivityAudioInvalid ? false : claimedActivity.audioAuthorized,
    humanRecorded: rawActivityAudioInvalid ? false : claimedActivity.humanRecorded,
    audioSource: rawActivityAudioInvalid ? "" : claimedActivity.audioSource
  }, correctAnswer) : claimedActivity;
  const conceptId = authorityVerified ? authoritative.sourceActivity.conceptId : claimedConceptId;
  if (!conceptId) throw new TypeError("conceptId es obligatorio.");
  if (input.correct !== false) throw new TypeError("La intervención requiere una respuesta incorrecta ya corregida localmente.");
  const learningObjectiveId = authorityVerified ? authoritative.sourceActivity.learningObjectiveId : claimedLearningObjectiveId;
  const serverApprovedMaterial = authorityVerified ? authoritative.approvedActivityMaterial : {};
  const approvedActivityMaterial = sanitizeApprovedActivityMaterial({
    ...serverApprovedMaterial,
    audio: rawActivityAudioInvalid ? null : input.approvedActivityMaterial?.audio,
    authorizedAudio: rawActivityAudioInvalid ? null : input.authorizedAudio
  }, correctAnswer, uiLocale);
  const canonicalAvailable = typeof activityAuthority?.listByLearningObjective === "function"
    ? activityAuthority.listByLearningObjective({ learningObjectiveId, uiLocale })
    : [authoritative.sourceActivity];
  const availableActivities = (Array.isArray(canonicalAvailable) ? canonicalAvailable : [])
    .filter(item => item && item.learningObjectiveId === learningObjectiveId)
    .slice(0, 24)
    .map(item => sanitizeActivity(item, authoritative.correctAnswer));
  const canonicalById = new Map(availableActivities.map(item => [item.id, item]));
  const recentActivities = (Array.isArray(input.recentActivities) ? input.recentActivities : [])
    .slice(-12)
    .map(item => canonicalById.get(safeId(typeof item === "string" ? item : item?.id)))
    .filter(Boolean);
  return {
    correct: false,
    conceptId,
    learningObjectiveId,
    currentSkill: authorityVerified ? activity.skill : safeId(input.currentSkill || activity.skill, "vocabulary"),
    activityType: activity.type,
    difficulty: authorityVerified ? activity.difficulty : truncate(input.difficulty || activity.difficulty, 40),
    studentAnswer: truncate(input.studentAnswer, 240),
    correctAnswer,
    attemptNumber: Math.min(12, Math.max(1, Number(input.attemptNumber) || 1)),
    recentErrors: (input.recentErrors || []).slice(-12).map(item => ({ conceptId: safeId(item.conceptId), errorType: ERROR_TYPES.includes(item.errorType) ? item.errorType : "UNKNOWN_ERROR" })),
    recentActivities,
    recentActivityFingerprints: (input.recentActivityFingerprints || []).slice(-16).map(item => truncate(item, 80)),
    modalitiesAlreadyUsed: (input.modalitiesAlreadyUsed || []).slice(-12).map(item => truncate(item, 40)),
    hintHistory: (input.hintHistory || []).slice(-12).map(item => truncate(item, 100)),
    retentionHistory: (input.retentionHistory || []).slice(-12).map(item => ({ result: truncate(item.result, 32), ageDays: Math.max(0, Number(item.ageDays) || 0) })),
    answerExposureHistory: (input.answerExposureHistory || []).slice(-12).map(item => truncate(item, 32)),
    strategyEffectiveness: Object.fromEntries(Object.entries(input.strategyEffectiveness || {}).slice(0, 24).map(([key, value]) => [truncate(key, 80), Math.max(0, Math.min(1, Number(value) || 0))])),
    prerequisiteGaps: arrayOfIds(input.prerequisiteGaps, 12),
    independentRetestQueue: arrayOfIds(input.independentRetestQueue, 12),
    recentInterventions: (input.recentInterventions || []).slice(-12).map(item => ({ strategy: STRATEGIES.includes(item.strategy) ? item.strategy : "", errorType: ERROR_TYPES.includes(item.errorType) ? item.errorType : "" })),
    uiLocale,
    grammarRuleIds: authorityVerified ? arrayOfIds(activity.grammarRuleIds) : [],
    lexemeIds: authorityVerified ? arrayOfIds(activity.lexemeIds) : [],
    sourceIds: authorityVerified ? arrayOfIds(activity.sourceIds) : [],
    knowledgeIds: authorityVerified ? arrayOfIds(authoritative.knowledgeIds) : [],
    authorizedAudio: approvedActivityMaterial.audio,
    masteryBefore: Number.isFinite(Number(input.masteryBefore)) ? Number(input.masteryBefore) : null,
    masteryAfter: Number.isFinite(Number(input.masteryAfter)) ? Number(input.masteryAfter) : null,
    activity,
    activityAuthorityVerified: authorityVerified,
    availableActivities,
    approvedActivityMaterial,
    previousActivityFingerprint: truncate(input.previousActivityFingerprint || input.previousFingerprint, 80),
    aiPolicy: {
      allowInterventionAI: input.aiPolicy?.allowInterventionAI !== false,
      AI_TUTOR_ON_EVERY_INCORRECT_ANSWER: input.aiPolicy?.AI_TUTOR_ON_EVERY_INCORRECT_ANSWER !== false
    }
  };
}

function allowedKnowledgeSummary(records) {
  return records.map(record => ({
    id: record.id,
    recordType: record.recordType,
    lemma: record.lemma,
    lexeme: record.lexeme,
    rule: record.rule,
    forms: record.forms,
    restrictions: record.restrictions
  }));
}

function extractOutputText(response) {
  if (typeof response?.output_text === "string") return response.output_text;
  for (const item of response?.output || []) for (const content of item?.content || []) {
    if (content?.type === "output_text" && typeof content.text === "string") return content.text;
  }
  return "";
}

function costEstimate(usage, env) {
  const inputPrice = Number(env.OPENAI_INPUT_COST_PER_1M), outputPrice = Number(env.OPENAI_OUTPUT_COST_PER_1M);
  if (!Number.isFinite(inputPrice) || !Number.isFinite(outputPrice)) return { estimatedCostUsd: null, costEstimateStatus: "modelPricingNotConfigured" };
  return {
    estimatedCostUsd: (Number(usage?.input_tokens || 0) * inputPrice + Number(usage?.output_tokens || 0) * outputPrice) / 1_000_000,
    costEstimateStatus: "estimatedFromConfiguredRates"
  };
}

function buildAIRequest({ context, plan, knowledge, model, userId }) {
  const schema = {
    type: "object", additionalProperties: false, required: ["errorType", "strategy", "rationale"],
    properties: {
      errorType: { type: "string", enum: ERROR_TYPES },
      strategy: { type: "string", enum: STRATEGIES },
      rationale: { type: "string", minLength: 1, maxLength: 320 }
    }
  };
  return {
    model,
    store: false,
    instructions: [
      "You are NALVI's private pedagogical intervention selector, not a chatbot.",
      "The response was already scored locally. Do not score it, change points, or invent Guarani.",
      "Select only an error type and pedagogical strategy from the schema.",
      "Use only the supplied normativeVerified or expertVerified knowledge authorized for generation. Do not output personal data, HTML, CSS, code, or navigation.",
      `Write rationale in interface locale ${context.uiLocale}.`
    ].join(" "),
    input: JSON.stringify({
      task: "improvePedagogicalIntervention",
      context: {
        conceptId: context.conceptId,
        learningObjectiveId: context.learningObjectiveId,
        currentSkill: context.currentSkill,
        activityType: context.activityType,
        difficulty: context.difficulty,
        studentAnswer: context.studentAnswer,
        correctAnswer: context.correctAnswer,
        attemptNumber: context.attemptNumber,
        recentErrors: context.recentErrors,
        modalitiesAlreadyUsed: context.modalitiesAlreadyUsed,
        grammarRuleIds: context.grammarRuleIds,
        lexemeIds: context.lexemeIds,
        uiLocale: context.uiLocale
      },
      localPlan: { errorType: plan.errorType, strategy: plan.strategy, nextActivityType: plan.nextActivityType },
      permittedKnowledge: allowedKnowledgeSummary(knowledge)
    }),
    max_output_tokens: 220,
    text: { format: { type: "json_schema", name: "nalvi_intervention_selection", strict: true, schema } },
    prompt_cache_key: `nalvi-p8-intervention-${createHash("sha256").update(JSON.stringify(knowledge.map(item => item.id))).digest("hex").slice(0, 24)}`,
    safety_identifier: userId ? createHash("sha256").update(`nalvi:${userId}`).digest("hex") : undefined
  };
}

export function createInterventionService({
  corpusRecords = [],
  fetchImpl = globalThis.fetch,
  env = process.env,
  activityAuthority = defaultApprovedActivityAuthority,
  persistEvent = async () => ({ status: "skipped", reason: "PERSISTENCE_NOT_CONFIGURED" }),
  timeoutMs = 10_000
} = {}) {
  const counters = { requests: 0, aiCalls: 0, aiErrors: 0, persisted: 0 };

  async function planIntervention(rawRequest, { verifiedUserId = "" } = {}) {
    let context;
    try { context = normalizeInterventionRequest(rawRequest, { activityAuthority }); }
    catch (error) { return { ok: false, reason: "INVALID_REQUEST", message: error.message }; }
    counters.requests += 1;

    const scoreLocally = canScoreWithoutAI(context);
    let plan = planPedagogicalIntervention(context);
    const improveWithAI = wouldAIImproveIntervention(context, plan);
    const knowledge = filterAllowedKnowledge(corpusRecords, context.knowledgeIds);
    const telemetry = { callCount: 0, inputTokens: 0, outputTokens: 0, latencyMs: 0, errors: 0, estimatedCostUsd: null, costEstimateStatus: "notApplicable" };
    let aiReason = improveWithAI ? "AI_NOT_CALLED" : "LOCAL_PLAN_SUFFICIENT";

    if (improveWithAI && knowledge.length && verifiedUserId && env.OPENAI_API_KEY) {
      telemetry.callCount = 1; counters.aiCalls += 1;
      const started = Date.now(), controller = new AbortController(), timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetchImpl("https://api.openai.com/v1/responses", {
          method: "POST",
          headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify(buildAIRequest({ context, plan, knowledge, model: env.OPENAI_MODEL || "gpt-4.1-mini", userId: verifiedUserId })),
          signal: controller.signal
        });
        if (!response.ok) throw new Error(`OPENAI_HTTP_${response.status}`);
        const payload = await response.json(), selection = JSON.parse(extractOutputText(payload));
        plan = applyAISelection(plan, selection);
        telemetry.inputTokens = Number(payload.usage?.input_tokens || 0);
        telemetry.outputTokens = Number(payload.usage?.output_tokens || 0);
        Object.assign(telemetry, costEstimate(payload.usage, env));
        aiReason = "VALIDATED_AI_SELECTION";
      } catch (error) {
        telemetry.errors = 1; counters.aiErrors += 1; aiReason = error?.name === "AbortError" ? "AI_TIMEOUT_LOCAL_FALLBACK" : "AI_FAILURE_LOCAL_FALLBACK";
      } finally {
        clearTimeout(timer); telemetry.latencyMs = Date.now() - started;
      }
    } else if (improveWithAI && !knowledge.length) aiReason = "NO_AUTHORIZED_KNOWLEDGE_LOCAL_FALLBACK";
    else if (improveWithAI && !verifiedUserId) aiReason = "ANONYMOUS_LOCAL_FALLBACK";
    else if (improveWithAI && !env.OPENAI_API_KEY) aiReason = "OPENAI_UNAVAILABLE_LOCAL_FALLBACK";

    const event = createInterventionEvent({ ...context, userId: verifiedUserId }, plan, telemetry);
    let persistence;
    try {
      persistence = await persistEvent({ userId: verifiedUserId, event });
      if (persistence?.status === "persisted") counters.persisted += 1;
    } catch {
      persistence = { status: "failed", reason: "PERSISTENCE_ERROR" };
    }
    return {
      ok: true,
      canScoreWithoutAI: scoreLocally,
      wouldAIImproveIntervention: improveWithAI,
      usedAI: Boolean(plan.usedAI),
      aiReason,
      plan,
      telemetry,
      persistence,
      event: { ...event, userId: undefined }
    };
  }

  return { planIntervention, audit: () => ({ ...counters }) };
}
