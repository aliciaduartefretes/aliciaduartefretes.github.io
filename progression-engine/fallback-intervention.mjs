import { ACTIVITY_TYPES, allowedTypesForError, cognitiveDemandFor } from "../activity-catalog/nalvi-activity-catalog.mjs";
import { authorizeBundledRecordedAudio } from "./recorded-audio-manifest-index.mjs";

const COPY = Object.freeze({
  es: { contextQuestion: "Elige la opción que corresponde a esta situación.", match: "Relaciona cada elemento con su significado.", sort: "Clasifica las tarjetas en la categoría correcta.", dialogue: "Elige la respuesta que continúa la conversación.", listen: "Escucha y elige la opción correcta.", recall: "Recuerda la expresión sin verla." },
  en: { contextQuestion: "Choose the option that fits this situation.", match: "Match each item with its meaning.", sort: "Sort the cards into the correct category.", dialogue: "Choose the reply that continues the conversation.", listen: "Listen and choose the correct option.", recall: "Recall the expression without seeing it." },
  pt: { contextQuestion: "Escolha a opção que corresponde a esta situação.", match: "Relacione cada elemento ao seu significado.", sort: "Classifique os cartões na categoria correta.", dialogue: "Escolha a resposta que continua a conversa.", listen: "Escute e escolha a opção correta.", recall: "Lembre a expressão sem vê-la." },
  fr: { contextQuestion: "Choisissez l’option qui correspond à cette situation.", match: "Associez chaque élément à sa signification.", sort: "Classez les cartes dans la bonne catégorie.", dialogue: "Choisissez la réponse qui poursuit la conversation.", listen: "Écoutez et choisissez la bonne option.", recall: "Retrouvez l’expression sans la voir." },
  it: { contextQuestion: "Scegli l’opzione adatta a questa situazione.", match: "Abbina ogni elemento al suo significato.", sort: "Classifica le carte nella categoria corretta.", dialogue: "Scegli la risposta che continua la conversazione.", listen: "Ascolta e scegli l’opzione corretta.", recall: "Ricorda l’espressione senza vederla." },
  de: { contextQuestion: "Wähle die Option, die zu dieser Situation passt.", match: "Ordne jedem Element seine Bedeutung zu.", sort: "Ordne die Karten der richtigen Kategorie zu.", dialogue: "Wähle die Antwort, die das Gespräch fortsetzt.", listen: "Höre zu und wähle die richtige Option.", recall: "Erinnere dich an den Ausdruck, ohne ihn zu sehen." }
});

export function deterministicInterventionCopy(activityType, locale = "es") {
  const copy = COPY[locale] || COPY.es;
  const byType = {
    CONTEXT_CHOICE: copy.contextQuestion,
    ARROW_MATCH: copy.match,
    CATEGORY_SORT: copy.sort,
    DIALOGUE_NEXT_TURN: copy.dialogue,
    AUDIO_SELECT: copy.listen,
    INDEPENDENT_RECALL: copy.recall
  };
  return byType[activityType] || "";
}

const localize = (value, locale) => value && typeof value === "object" && !Array.isArray(value)
  ? String(value[locale] ?? value.es ?? value.en ?? Object.values(value)[0] ?? "")
  : String(value ?? "");
const normalize = value => String(value ?? "").normalize("NFC").trim().toLocaleLowerCase();
const normalizeAudioTarget = value => String(value ?? "")
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .replace(/[‘’`´ʼʹʻ]/g, "'")
  .replace(/[¿?¡!.,;:()\[\]{}]/g, " ")
  .replace(/\s+/g, " ")
  .trim()
  .toLocaleLowerCase("es");
const uniqueBy = (values, key) => values.filter((value, index, array) => array.findIndex(candidate => key(candidate) === key(value)) === index);
const optionText = (option, locale) => localize(option?.text ?? option?.label ?? option?.value ?? option, locale);

function lessonOptions(context, locale) {
  const source = context.approvedActivityMaterial?.options;
  return uniqueBy((Array.isArray(source) ? source : [])
    .filter(option => option?.authorized === true)
    .map(option => ({ id: String(option?.id || "").trim(), text: optionText(option, locale), authorized: true }))
    .filter(option => option.id && option.text), option => normalize(option.text));
}

function semanticPairs(context, locale) {
  const answer = normalize(context.correctAnswer);
  const source = context.approvedActivityMaterial?.pairs;
  const pairs = uniqueBy((Array.isArray(source) ? source : [])
    .filter(pair => pair?.authorized === true)
    .map(pair => ({
      id: String(pair.id || "").trim(),
      left: localize(pair.left, locale),
      right: localize(pair.right, locale),
      authorized: true
    }))
    .filter(pair => pair.id && pair.left && pair.right), pair => `${normalize(pair.left)}:${normalize(pair.right)}`);
  if (answer && !pairs.some(pair => normalize(pair.left) === answer || normalize(pair.right) === answer)) return [];
  return pairs;
}

function safeContextText(context, locale) {
  const source = context.approvedActivityMaterial?.contexts;
  return (Array.isArray(source) ? source : [])
    .filter(value => value?.authorized === true)
    .map(value => localize(value?.text, locale).trim())
    .find(Boolean) || "";
}

function safeDialogue(context, locale) {
  const source = context.approvedActivityMaterial?.dialogue || [];
  const optionSource = context.approvedActivityMaterial?.dialogueOptions || [];
  if (!Array.isArray(source) || source.length < 2 || source.length > 4) return null;
  const turns = source.map(turn => ({
    id: String(turn?.id || "").trim(),
    speaker: localize(turn?.speaker, locale),
    text: localize(turn?.text ?? turn, locale),
    authorized: turn?.authorized === true
  }));
  const options = uniqueBy(optionSource
    .filter(option => option?.authorized === true)
    .map(option => ({ id: String(option?.id || "").trim(), text: optionText(option, locale), authorized: true }))
    .filter(option => option.id && option.text), option => normalize(option.text));
  const correctOptionId = String(context.approvedActivityMaterial?.dialogueCorrectOptionId || "");
  const correctAnswer = localize(context.approvedActivityMaterial?.dialogueCorrectAnswer, locale).trim();
  const sourceContentId = String(context.approvedActivityMaterial?.dialogueSourceContentId || "").trim();
  const correct = options.find(option => option.id === correctOptionId && option.text === correctAnswer);
  return turns.every(turn => turn.id && turn.speaker && turn.text && turn.authorized)
    && options.length >= 3 && options.length <= 4 && correct && sourceContentId
    ? { turns, options, correctOptionId: correct.id, correctAnswer: correct.text, sourceContentId }
    : null;
}

function safeSortData(context, locale) {
  const rawCategories = context.approvedActivityMaterial?.categories || [];
  const rawItems = context.approvedActivityMaterial?.items || [];
  if (!Array.isArray(rawCategories) || !Array.isArray(rawItems)) return null;
  const categories = rawCategories.map(category => ({
    id: String(category?.id || "").trim(),
    label: localize(category?.label ?? category?.text ?? category, locale),
    authorized: category?.authorized === true
  })).filter(category => category.id && category.label && category.authorized);
  const items = rawItems.map(item => ({
    id: String(item?.id || "").trim(),
    text: localize(item?.text ?? item?.label ?? item, locale),
    categoryId: String(item?.categoryId || ""),
    authorized: item?.authorized === true
  })).filter(item => item.id && item.text && item.categoryId && item.authorized);
  if (categories.length < 2 || categories.length > 3 || items.length < 6 || items.length > 10) return null;
  if (categories.some(category => items.filter(item => item.categoryId === category.id).length < 2)) return null;
  return { categories, items };
}

function validatedSafeAudio(source, targetText) {
  if (!source || typeof source !== "object" || Array.isArray(source)) return null;
  const canonicalKeys = ["audioId", "audioPath", "audioText", "audioAuthorized", "humanRecorded", "audioSource"];
  const richKeys = ["id", "audioId", "recordingId", "path", "audioPath", "text", "audioText", "source", "audioSource", "authorized", "audioAuthorized", "humanRecorded"];
  const keys = Object.keys(source).sort();
  const exactShape = expected => keys.length === expected.length
    && expected.every(key => Object.hasOwn(source, key))
    && JSON.stringify(keys) === JSON.stringify([...expected].sort());
  const rich = exactShape(richKeys);
  if (!rich && !exactShape(canonicalKeys)) return null;
  if (source.audioAuthorized !== true || source.humanRecorded !== true
    || source.audioSource !== "manifest-human-recording") return null;
  if (rich && (source.authorized !== true || source.source !== "manifest-human-recording"
    || source.id !== source.audioId || source.recordingId !== source.audioId)) return null;
  const normalizePath = value => {
    if (typeof value !== "string") return "";
    const raw = value.trim().replace(/^\.\//, "").replace(/^\//, "");
    if (!raw.startsWith("assets/audio/guarani/ali-2026/") || /[\\?#\0]/.test(raw)
      || /^[a-z][a-z0-9+.-]*:/i.test(raw)) return "";
    const file = raw.slice("assets/audio/guarani/ali-2026/".length);
    return /^\d{3}-[a-z0-9]+(?:-[a-z0-9]+)*\.m4a$/.test(file) ? raw : "";
  };
  const audioId = typeof source.audioId === "string" ? source.audioId.trim() : "";
  const audioPath = normalizePath(source.audioPath);
  const audioText = typeof source.audioText === "string" ? source.audioText.normalize("NFC").trim() : "";
  if (!/^NALVI-AUDIO-\d{3}$/.test(audioId) || !audioPath || !audioText) return null;
  const idOrdinal = /^NALVI-AUDIO-(\d{3})$/.exec(audioId)?.[1] || "";
  const fileOrdinal = /\/(\d{3})-[^/]+\.m4a$/.exec(audioPath)?.[1] || "";
  if (!idOrdinal || idOrdinal !== fileOrdinal) return null;
  if (rich && (normalizePath(source.path) !== audioPath || typeof source.text !== "string" || !source.text.trim())) return null;
  const normalizedTarget = normalizeAudioTarget(targetText);
  const declaredTexts = rich ? [source.text, audioText] : [audioText];
  const textMatchesTarget = value => {
    const aliases = [value, String(value).split("(")[0]].map(normalizeAudioTarget).filter(Boolean);
    return aliases.includes(normalizedTarget);
  };
  if (!normalizedTarget || !declaredTexts.every(textMatchesTarget)) return null;
  const authorizedAudio = authorizeBundledRecordedAudio({
    audioId,
    audioPath,
    audioText,
  }, targetText);
  if (!authorizedAudio) return null;
  if (rich) {
    const authorizedAliases = [authorizedAudio.audioText, authorizedAudio.audioText.split("(")[0].trim()]
      .map(normalizeAudioTarget).filter(Boolean);
    if (!authorizedAliases.includes(normalizeAudioTarget(source.text))) return null;
  }
  return authorizedAudio;
}

function safeAudio(context) {
  const declared = [context.approvedActivityMaterial?.audio, context.authorizedAudio]
    .filter(value => value !== undefined && value !== null);
  if (!declared.length) return null;
  const validated = declared.map(value => validatedSafeAudio(value, context.correctAnswer));
  if (validated.some(value => !value)) return null;
  const first = validated[0];
  const tuple = value => JSON.stringify([
    value.audioId, value.audioPath, value.audioText, value.audioAuthorized, value.humanRecorded, value.audioSource
  ]);
  return validated.every(value => tuple(value) === tuple(first)) ? first : null;
}

function shuffled(values, seed = 1) {
  return [...values].sort((left, right) => `${String(right.id)}-${seed}`.localeCompare(`${String(left.id)}-${seed}`));
}

function base(context, type, attempt, overrides = {}) {
  const correctAnswer = String(context.correctAnswer || "").trim();
  return {
    id: `catalog-${String(context.conceptId || "concept")}-${attempt}-${type.toLocaleLowerCase()}`,
    type,
    activityType: type,
    conceptId: context.conceptId,
    conceptIds: [context.conceptId].filter(Boolean),
    learningObjectiveId: context.learningObjectiveId,
    skill: context.currentSkill || "vocabulary",
    difficulty: context.difficulty || "foundation-1",
    helpLevel: Math.min(2, Math.max(0, attempt - 1)),
    answerExposure: "HIDDEN",
    requiresStudentResponse: true,
    instruction: "",
    prompt: "",
    contextText: "",
    audioId: "",
    audioPath: "",
    audioText: "",
    audioAuthorized: false,
    humanRecorded: false,
    audioSource: "",
    options: [],
    pairs: [],
    tiles: [],
    categories: [],
    items: [],
    dialogue: [],
    dialogueSourceContentId: "",
    hints: [],
    explanation: "",
    correctAnswer,
    acceptedAnswers: correctAnswer ? [correctAnswer] : [],
    correctOptionId: "",
    lexemeIds: context.lexemeIds || [],
    grammarRuleIds: context.grammarRuleIds || [],
    sourceIds: context.activity?.sourceIds || [],
    conflictIds: [],
    hasOpenConflict: false,
    distractorQuality: "PLAUSIBLE",
    cognitiveDemand: cognitiveDemandFor(type),
    lessonContext: {
      ...(context.activity?.lessonContext || {}),
      sourceActivityId: context.activity?.id || "",
      sourceAnswer: correctAnswer
    },
    deterministicFallback: true,
    ...overrides
  };
}

function candidate(activity, errorType, reasonCode, goal) {
  return {
    activityType: activity.activityType,
    pedagogicalGoal: goal,
    errorType,
    helpLevel: activity.helpLevel,
    reasonCode,
    estimatedCognitiveDemand: activity.cognitiveDemand,
    requiresIndependentRetest: activity.activityType !== ACTIVITY_TYPES.INDEPENDENT_RECALL,
    activity
  };
}

export function buildDeterministicFallbackCandidates(context = {}, attempt = 1, errorType = "UNKNOWN_ERROR") {
  const uiLocale = COPY[context.uiLocale] ? context.uiLocale : "es";
  const copy = COPY[uiLocale];
  const answer = String(context.correctAnswer || "").trim();
  if (!answer) return [];
  const options = lessonOptions(context, uiLocale);
  const correct = options.find(option => normalize(option.text) === normalize(answer));
  const pairs = semanticPairs(context, uiLocale);
  const sortData = safeSortData(context, uiLocale);
  const dialogue = safeDialogue(context, uiLocale);
  const contextText = safeContextText(context, uiLocale);
  const audio = safeAudio(context);
  const candidates = [];

  if (pairs.length >= 3) {
    candidates.push(candidate(base(context, ACTIVITY_TYPES.ARROW_MATCH, attempt, {
      instruction: copy.match,
      prompt: copy.match,
      pairs: pairs.slice(0, 5)
    }), errorType, "MULTI_PAIR_SEMANTIC_CONNECTION", "Connect several approved expressions and meanings."));
  }

  if (sortData) {
    candidates.push(candidate(base(context, ACTIVITY_TYPES.CATEGORY_SORT, attempt, {
      instruction: copy.sort,
      prompt: copy.sort,
      categories: sortData.categories,
      items: shuffled(sortData.items, attempt)
    }), errorType, "APPROVED_CATEGORY_DISCRIMINATION", "Classify several approved items into documented categories."));
  }

  if (audio && options.length >= 3 && correct) {
    candidates.push(candidate(base(context, ACTIVITY_TYPES.AUDIO_SELECT, attempt, {
      instruction: copy.listen,
      prompt: copy.listen,
      options: shuffled(options, attempt),
      correctOptionId: correct.id,
      ...audio
    }), errorType, "HUMAN_AUDIO_DISCRIMINATION", "Listen to an approved human recording and identify the expression."));
  }

  if (dialogue) {
    candidates.push(candidate(base(context, ACTIVITY_TYPES.DIALOGUE_NEXT_TURN, attempt, {
      instruction: copy.dialogue,
      prompt: copy.dialogue,
      dialogue: dialogue.turns,
      dialogueAuthorized: true,
      dialogueSourceContentId: dialogue.sourceContentId,
      options: shuffled(dialogue.options, attempt),
      correctOptionId: dialogue.correctOptionId,
      correctAnswer: dialogue.correctAnswer,
      acceptedAnswers: [dialogue.correctAnswer],
      sourceBoundAuthorized: true
    }), errorType, "APPROVED_DIALOGUE_APPLICATION", "Apply the concept in an existing approved dialogue."));
  }

  if (contextText && options.length >= 3 && correct) {
    candidates.push(candidate(base(context, ACTIVITY_TYPES.CONTEXT_CHOICE, attempt, {
      instruction: copy.contextQuestion,
      prompt: copy.contextQuestion,
      contextText,
      contextAuthorized: true,
      options: shuffled(options, attempt),
      correctOptionId: correct.id
    }), errorType, "APPROVED_CONTEXT_APPLICATION", "Apply the concept in an existing approved context."));
  }

  candidates.push(candidate(base(context, ACTIVITY_TYPES.INDEPENDENT_RECALL, attempt, {
    skill: "writing",
    helpLevel: 0,
    instruction: copy.recall,
    prompt: copy.recall,
    answerExposure: "HIDDEN",
    hints: []
  }), errorType, "INDEPENDENT_RETRIEVAL", "Check retrieval without showing the answer or inventing new linguistic content."));

  const uniqueCandidates = uniqueBy(candidates, value => value.activityType);
  const preferredTypes = allowedTypesForError(errorType, { audioEnabled: Boolean(audio) });
  const preferred = preferredTypes.flatMap(type => uniqueCandidates.filter(value => value.activityType === type));
  const remaining = uniqueCandidates.filter(value => !preferredTypes.includes(value.activityType));
  let ordered = [...preferred, ...remaining];
  const lastType = (context.recentActivities || []).at(-1)?.activityType || (context.recentActivities || []).at(-1)?.type || "";
  if (ordered.length > 1 && ordered[0]?.activityType === lastType) ordered = [...ordered.slice(1), ordered[0]];
  return ordered.slice(0, 3);
}

export function buildDeterministicFallbackActivity(context = {}, attempt = 1, errorType = "UNKNOWN_ERROR") {
  return buildDeterministicFallbackCandidates(context, attempt, errorType)[0]?.activity || null;
}

export default buildDeterministicFallbackActivity;
