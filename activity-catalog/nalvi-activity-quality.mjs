import {
  ACTIVITY_TYPES,
  SELECTION_ACTIVITY_TYPES,
  allowedTypesForError,
  cognitiveDemandFor,
  getCatalogEntry,
  isEnabledActivityType,
  isSupportedActivityType
} from "./nalvi-activity-catalog.mjs?v=NALVI-CATALOG-3";
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

const INTERVENTION_COPY = Object.freeze({
  es: Object.freeze({ CONTEXT_CHOICE: "Elige la opción que corresponde a esta situación.", ARROW_MATCH: "Relaciona cada elemento con su significado.", CATEGORY_SORT: "Clasifica las tarjetas en la categoría correcta.", DIALOGUE_NEXT_TURN: "Elige la respuesta que continúa la conversación.", AUDIO_SELECT: "Escucha y elige la opción correcta.", INDEPENDENT_RECALL: "Recuerda la expresión sin verla." }),
  en: Object.freeze({ CONTEXT_CHOICE: "Choose the option that fits this situation.", ARROW_MATCH: "Match each item with its meaning.", CATEGORY_SORT: "Sort the cards into the correct category.", DIALOGUE_NEXT_TURN: "Choose the reply that continues the conversation.", AUDIO_SELECT: "Listen and choose the correct option.", INDEPENDENT_RECALL: "Recall the expression without seeing it." }),
  pt: Object.freeze({ CONTEXT_CHOICE: "Escolha a opção que corresponde a esta situação.", ARROW_MATCH: "Relacione cada elemento ao seu significado.", CATEGORY_SORT: "Classifique os cartões na categoria correta.", DIALOGUE_NEXT_TURN: "Escolha a resposta que continua a conversa.", AUDIO_SELECT: "Escute e escolha a opção correta.", INDEPENDENT_RECALL: "Lembre a expressão sem vê-la." }),
  fr: Object.freeze({ CONTEXT_CHOICE: "Choisissez l’option qui correspond à cette situation.", ARROW_MATCH: "Associez chaque élément à sa signification.", CATEGORY_SORT: "Classez les cartes dans la bonne catégorie.", DIALOGUE_NEXT_TURN: "Choisissez la réponse qui poursuit la conversation.", AUDIO_SELECT: "Écoutez et choisissez la bonne option.", INDEPENDENT_RECALL: "Retrouvez l’expression sans la voir." }),
  it: Object.freeze({ CONTEXT_CHOICE: "Scegli l’opzione adatta a questa situazione.", ARROW_MATCH: "Abbina ogni elemento al suo significato.", CATEGORY_SORT: "Classifica le carte nella categoria corretta.", DIALOGUE_NEXT_TURN: "Scegli la risposta che continua la conversazione.", AUDIO_SELECT: "Ascolta e scegli l’opzione corretta.", INDEPENDENT_RECALL: "Ricorda l’espressione senza vederla." }),
  de: Object.freeze({ CONTEXT_CHOICE: "Wähle die Option, die zu dieser Situation passt.", ARROW_MATCH: "Ordne jedem Element seine Bedeutung zu.", CATEGORY_SORT: "Ordne die Karten der richtigen Kategorie zu.", DIALOGUE_NEXT_TURN: "Wähle die Antwort, die das Gespräch fortsetzt.", AUDIO_SELECT: "Höre zu und wähle die richtige Option.", INDEPENDENT_RECALL: "Erinnere dich an den Ausdruck, ohne ihn zu sehen." })
});

const normalize = value => String(value ?? "")
  .normalize("NFD")
  .replace(/[\p{M}\p{Cf}]+/gu, "")
  .toLocaleLowerCase()
  .replace(/[^a-z0-9\p{L}\p{N}]+/gu, " ")
  .trim();
const normalizeLeakage = value => String(value ?? "")
  .normalize("NFD")
  .replace(/[\p{M}\p{Cf}]+/gu, "")
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
const stringifySurface = value => {
  try { return String(value ?? ""); } catch { return ""; }
};
const allTextValues = (value, seen = new Set()) => {
  if (value == null) return [];
  if (typeof value !== "object") return [stringifySurface(value)];
  if (seen.has(value)) return [];
  seen.add(value);
  const values = Object.values(value);
  const renderedValues = Array.isArray(value)
    ? [stringifySurface(value)]
    : values.filter(item => item == null || typeof item !== "object").map(stringifySurface);
  return [...renderedValues, ...values.flatMap(item => allTextValues(item, seen))];
};
const normalizedSurfaceValues = value => unique(allTextValues(value).map(normalizeLeakage).filter(Boolean));
const rendererTextDeclarationIsSafe = value => {
  if (value == null || typeof value !== "object") return true;
  const values = Array.isArray(value) ? value : Object.values(value);
  return values.every(item => item == null || typeof item !== "object");
};
const countMarker = (value, expression) => (String(value || "").match(expression) || []).length;
const containsAnswer = (value, answer) => Boolean(value && answer && ` ${value} `.includes(` ${answer} `));
const hasMaterialValue = (value, seen = new Set()) => {
  if (value == null || value === false) return false;
  if (typeof value === "string") return Boolean(value.trim());
  if (typeof value !== "object") return true;
  if (seen.has(value)) return true;
  seen.add(value);
  return Object.values(value).some(item => hasMaterialValue(item, seen));
};
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
  const requiredStringKeys = richShape
    ? ["audioId", "id", "recordingId", "audioPath", "path", "audioText", "text", "audioSource", "source"]
    : ["audioId", "audioPath", "audioText", "audioSource"];
  if (requiredStringKeys.some(key => typeof audio[key] !== "string" || !audio[key].trim())) return null;
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

const CANONICAL_AUDIO_KEYS = Object.freeze([
  "audioId", "audioPath", "audioText", "audioAuthorized", "humanRecorded", "audioSource"
]);
const RICH_AUDIO_KEYS = Object.freeze([
  "id", "audioId", "recordingId", "path", "audioPath", "text", "audioText", "source", "audioSource",
  "authorized", "audioAuthorized", "humanRecorded"
]);
const TOP_LEVEL_RICH_AUDIO_KEYS = Object.freeze(["recordingId", "path", "text", "source", "authorized"]);
const audioTextAliases = (value, locale) => unique([
  canonicalContent(value, locale),
  canonicalContent(value, locale).split("(")[0].trim()
].map(normalize));
const exactObjectShape = (value, keys) => Boolean(value && typeof value === "object" && !Array.isArray(value)
  && Object.keys(value).length === keys.length && keys.every(key => Object.prototype.hasOwnProperty.call(value, key)));
const audioComponentMatches = (value, approved, locale) => {
  const canonical = exactObjectShape(value, CANONICAL_AUDIO_KEYS);
  const rich = !canonical && exactObjectShape(value, RICH_AUDIO_KEYS);
  if (!canonical && !rich) return false;
  if (typeof value.audioId !== "string" || typeof value.audioPath !== "string" || typeof value.audioText !== "string"
    || typeof value.audioSource !== "string" || value.audioAuthorized !== true || value.humanRecorded !== true) return false;
  const approvedTextAliases = audioTextAliases(approved.audioText, locale);
  if (value.audioId !== approved.audioId || value.audioPath !== approved.audioPath
    || !approvedTextAliases.includes(normalize(canonicalContent(value.audioText, locale)))
    || value.audioSource !== approved.audioSource) return false;
  return !rich || (typeof value.id === "string" && typeof value.recordingId === "string"
    && typeof value.path === "string" && typeof value.text === "string" && typeof value.source === "string"
    && value.authorized === true && value.id === approved.audioId && value.recordingId === approved.audioId
    && value.path === approved.audioPath && approvedTextAliases.includes(normalize(canonicalContent(value.text, locale)))
    && value.source === approved.audioSource);
};
const activityAudioClaimsMatch = (activity, approved, locale) => {
  const topRichDeclared = TOP_LEVEL_RICH_AUDIO_KEYS.some(key => Object.prototype.hasOwnProperty.call(activity, key));
  if (topRichDeclared && (!TOP_LEVEL_RICH_AUDIO_KEYS.every(key => Object.prototype.hasOwnProperty.call(activity, key))
    || typeof activity.recordingId !== "string" || activity.recordingId !== approved.audioId
    || typeof activity.path !== "string" || activity.path !== approved.audioPath
    || typeof activity.text !== "string"
    || !audioTextAliases(approved.audioText, locale).includes(normalize(canonicalContent(activity.text, locale)))
    || activity.source !== approved.audioSource || activity.authorized !== true)) return false;
  for (const key of ["audio", "authorizedAudio"]) {
    if (Object.prototype.hasOwnProperty.call(activity, key) && !audioComponentMatches(activity[key], approved, locale)) return false;
  }
  return true;
};

const canonicalContent = (value, locale) => localize(value, locale).normalize("NFC").trim();
const canonicalDeclaration = (value, seen = new Set()) => {
  if (value == null) return ["null"];
  if (typeof value !== "object") return ["scalar", String(value).normalize("NFC").trim()];
  if (seen.has(value)) return ["cycle"];
  seen.add(value);
  if (Array.isArray(value)) return ["array", ...value.map(item => canonicalDeclaration(item, seen))];
  return ["object", ...Object.entries(value).map(([key, item]) => [key, canonicalDeclaration(item, seen)])];
};
const contentDeclarationSignature = value => signature(canonicalDeclaration(value));
const signature = values => JSON.stringify(values);
const isNonEmptyString = value => typeof value === "string" && Boolean(value.trim());
const isCanonicalSourceId = value => isNonEmptyString(value)
  && value === value.trim()
  && !/[\p{M}\p{Cf}\p{Cc}]/u.test(value.normalize("NFD"));
const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const exactStringSet = (left, right) => {
  if (!Array.isArray(left) || !Array.isArray(right) || !left.every(isCanonicalSourceId) || !right.every(isCanonicalSourceId)) return false;
  if (new Set(left).size !== left.length || new Set(right).size !== right.length || left.length !== right.length) return false;
  const expected = [...right].sort();
  return [...left].sort().every((value, index) => value === expected[index]);
};
const sourceIdentityIsValid = value => {
  if (!value || typeof value !== "object") return false;
  for (const key of ["sourceActivityId", "sourceContentId"]) {
    if (hasOwn(value, key) && !isCanonicalSourceId(value[key])) return false;
  }
  return !hasOwn(value, "sourceIds")
    || (Array.isArray(value.sourceIds) && value.sourceIds.every(isCanonicalSourceId)
      && new Set(value.sourceIds).size === value.sourceIds.length);
};
const sourceIdentitySignature = value => signature([
  hasOwn(value, "sourceActivityId") ? value.sourceActivityId : null,
  hasOwn(value, "sourceContentId") ? value.sourceContentId : null,
  hasOwn(value, "sourceIds") ? [...value.sourceIds].sort() : null
]);
const topLevelSourceIdentityMatches = (activity, material, context) => {
  if (!sourceIdentityIsValid(activity) || !sourceIdentityIsValid(material)) return false;
  for (const key of ["sourceActivityId", "sourceContentId"]) {
    const candidateHas = hasOwn(activity, key);
    const approvedHas = hasOwn(material, key);
    if (candidateHas !== approvedHas || (candidateHas && activity[key] !== material[key])) return false;
    const trustedValue = key === "sourceActivityId"
      ? context.activity?.id
      : context.sourceContentId ?? context.activity?.sourceContentId;
    if (candidateHas && trustedValue != null
      && (!isCanonicalSourceId(trustedValue) || activity[key] !== trustedValue)) return false;
  }
  const approvedOrTrustedSources = [material, context, context.activity || {}]
    .filter(owner => hasOwn(owner, "sourceIds"))
    .map(owner => owner.sourceIds);
  const candidateHasSourceIds = hasOwn(activity, "sourceIds");
  if (approvedOrTrustedSources.length && !candidateHasSourceIds) return false;
  const sourceDeclarations = [
    ...(candidateHasSourceIds ? [activity.sourceIds] : []),
    ...approvedOrTrustedSources
  ];
  if (sourceDeclarations.some(value => !Array.isArray(value) || !value.every(isCanonicalSourceId)
    || new Set(value).size !== value.length)) return false;
  if (sourceDeclarations.some(value => !exactStringSet(value, sourceDeclarations[0] || []))) return false;
  const lessonSourceActivityId = activity.lessonContext?.sourceActivityId;
  if (lessonSourceActivityId != null) {
    const trustedActivityId = context.activity?.id;
    if (!isCanonicalSourceId(lessonSourceActivityId) || !isCanonicalSourceId(trustedActivityId)
      || lessonSourceActivityId !== trustedActivityId) return false;
  }
  return true;
};
const recordsHaveStringIdentity = (values, extraKeys = []) => Array.isArray(values)
  && values.every(value => value && typeof value === "object"
    && isNonEmptyString(value.id)
    && extraKeys.every(key => isNonEmptyString(value[key]))
    && sourceIdentityIsValid(value));
const authorizedSubset = (candidateValues, approvedValues, signatureFor) => {
  if (!Array.isArray(candidateValues) || !Array.isArray(approvedValues)) return false;
  const approved = new Set(approvedValues
    .filter(value => value?.authorized === true)
    .map(signatureFor));
  return Array.isArray(candidateValues)
    && candidateValues.every(value => value?.authorized === true && approved.has(signatureFor(value)));
};

const exactValueSet = (candidateValues, approvedValues, locale) => {
  if (candidateValues.some(value => typeof value !== "string") || approvedValues.some(value => typeof value !== "string")) return false;
  const candidate = candidateValues.map(value => canonicalContent(value, locale));
  const approved = approvedValues.map(value => canonicalContent(value, locale));
  if (candidate.some(value => !value) || approved.some(value => !value)) return false;
  return candidate.length === new Set(candidate).size
    && approved.length === new Set(approved).size
    && candidate.length === approved.length
    && candidate.every(value => approved.includes(value));
};

const authorizedSequenceEquals = (candidateValues, approvedValues, signatureFor) => {
  if (!Array.isArray(candidateValues) || !Array.isArray(approvedValues)) return false;
  const approved = approvedValues.filter(value => value?.authorized === true);
  return candidateValues.length === approved.length
    && candidateValues.every((value, index) => value?.authorized === true
      && signatureFor(value) === signatureFor(approved[index]));
};

function answersAreApproved(activity, material, context, locale, { dialogue = false } = {}) {
  if (typeof context.correctAnswer !== "string" || typeof material.correctAnswer !== "string"
    || typeof activity.correctAnswer !== "string"
    || !Array.isArray(activity.acceptedAnswers) || !Array.isArray(material.acceptedAnswers)
    || (dialogue && typeof material.dialogueCorrectAnswer !== "string")) return false;
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
  const approvedCollectionKeys = ["contexts", "options", "pairs", "categories", "items", "dialogue",
    "dialogueOptions", "acceptedAnswers", "hints", "tokens", "tiles"];
  if (approvedCollectionKeys.some(key => Object.prototype.hasOwnProperty.call(material, key)
    && !Array.isArray(material[key]))) return false;
  if (!topLevelSourceIdentityMatches(activity, material, context)) return false;
  const optionSignature = option => signature([option.id, contentDeclarationSignature(option?.text ?? option?.label ?? option?.value), sourceIdentitySignature(option)]);
  const pairSignature = pair => signature([pair.id, contentDeclarationSignature(pair?.left), contentDeclarationSignature(pair?.right), sourceIdentitySignature(pair)]);
  const categorySignature = category => signature([category.id, contentDeclarationSignature(category?.label ?? category?.text), sourceIdentitySignature(category)]);
  const itemSignature = item => signature([item.id, contentDeclarationSignature(item?.text ?? item?.label), item.categoryId, sourceIdentitySignature(item)]);
  const turnSignature = turn => signature([turn.id, contentDeclarationSignature(turn?.speaker), contentDeclarationSignature(turn?.text), sourceIdentitySignature(turn)]);
  const canonicalCopy = INTERVENTION_COPY[locale]?.[type] || INTERVENTION_COPY.es[type] || "";
  if (!canonicalCopy || activity.prompt !== canonicalCopy || activity.instruction !== canonicalCopy
    || activity.explanation !== "" || !Array.isArray(activity.hints) || activity.hints.length !== 0) return false;
  if (type !== ACTIVITY_TYPES.DIALOGUE_NEXT_TURN && hasOwn(activity, "dialogueSourceContentId")
    && activity.dialogueSourceContentId !== "") return false;
  const candidateContextDeclarations = [activity.contextText, activity.scenario, activity.lessonContext?.visibleContext];
  if (material.contexts != null && !Array.isArray(material.contexts)) return false;
  const approvedContextDeclarations = (material.contexts || [])
    .filter(value => value?.authorized === true)
    .map(value => value?.text ?? value?.value);
  if (candidateContextDeclarations.some(value => !rendererTextDeclarationIsSafe(value))
    || approvedContextDeclarations.some(value => !rendererTextDeclarationIsSafe(value))) return false;
  const candidateContexts = unique(candidateContextDeclarations
    .flatMap(value => allTextValues(value))
    .map(value => String(value).normalize("NFC").trim())
    .filter(Boolean));
  const approvedContexts = new Set(approvedContextDeclarations
    .flatMap(value => allTextValues(value))
    .map(value => String(value).normalize("NFC").trim())
    .filter(Boolean));
  if (candidateContexts.some(value => !approvedContexts.has(value))) return false;
  const standardOptionsApproved = () => recordsHaveStringIdentity(activity.options || [])
    && recordsHaveStringIdentity(material.options)
    && isNonEmptyString(activity.correctOptionId)
    && isNonEmptyString(material.correctOptionId)
    && authorizedSubset(activity.options || [], material.options, optionSignature)
    && activity.correctOptionId === material.correctOptionId
    && answersAreApproved(activity, material, context, locale);

  if (type === ACTIVITY_TYPES.CONTEXT_CHOICE) {
    return standardOptionsApproved() && candidateContexts.length > 0;
  }
  if (type === ACTIVITY_TYPES.ARROW_MATCH) {
    return recordsHaveStringIdentity(activity.pairs || [])
      && recordsHaveStringIdentity(material.pairs)
      && authorizedSubset(activity.pairs || [], material.pairs, pairSignature)
      && answersAreApproved(activity, material, context, locale);
  }
  if (type === ACTIVITY_TYPES.CATEGORY_SORT) {
    return recordsHaveStringIdentity(activity.categories || [])
      && recordsHaveStringIdentity(material.categories)
      && recordsHaveStringIdentity(activity.items || [], ["categoryId"])
      && recordsHaveStringIdentity(material.items, ["categoryId"])
      && authorizedSubset(activity.categories || [], material.categories, categorySignature)
      && authorizedSubset(activity.items || [], material.items, itemSignature)
      && answersAreApproved(activity, material, context, locale);
  }
  if (type === ACTIVITY_TYPES.DIALOGUE_NEXT_TURN) {
    const candidateDialogue = activity.dialogue || activity.turns || [];
    return recordsHaveStringIdentity(candidateDialogue)
      && recordsHaveStringIdentity(material.dialogue)
      && recordsHaveStringIdentity(activity.options || [])
      && recordsHaveStringIdentity(material.dialogueOptions)
      && isNonEmptyString(activity.correctOptionId)
      && isNonEmptyString(material.dialogueCorrectOptionId)
      && isCanonicalSourceId(activity.dialogueSourceContentId)
      && isCanonicalSourceId(material.dialogueSourceContentId)
      && activity.dialogueSourceContentId === material.dialogueSourceContentId
      && authorizedSequenceEquals(candidateDialogue, material.dialogue, turnSignature)
      && authorizedSubset(activity.options || [], material.dialogueOptions, optionSignature)
      && activity.correctOptionId === material.dialogueCorrectOptionId
      && answersAreApproved(activity, material, context, locale, { dialogue: true });
  }
  if (type === ACTIVITY_TYPES.AUDIO_SELECT) return standardOptionsApproved();
  if (type === ACTIVITY_TYPES.INDEPENDENT_RECALL) return answersAreApproved(activity, material, context, locale);
  return false;
}

export function detectAnswerLeakage(activity = {}, { uiLocale = "es" } = {}) {
  const answers = unique(effectiveAnswers(activity, uiLocale).map(normalizeLeakage));
  const codes = [];
  if (!answers.length) return { leaked: false, codes };
  const prompts = normalizedSurfaceValues(activity.prompt);
  const instructions = normalizedSurfaceValues(activity.instruction);
  const explanations = normalizedSurfaceValues(activity.explanation);
  const contexts = [activity.contextText, activity.scenario, activity.lessonContext?.visibleContext]
    .flatMap(value => normalizedSurfaceValues(value));
  const hints = normalizedSurfaceValues(Array.isArray(activity.hints) ? activity.hints : []);
  const dialogueSource = Array.isArray(activity.dialogue)
    ? activity.dialogue
    : Array.isArray(activity.turns) ? activity.turns : [];
  const dialogueSpeakerValues = dialogueSource.flatMap(turn => allTextValues(turn?.speaker));
  const dialogueTextValues = dialogueSource.flatMap(turn => allTextValues(turn?.text ?? turn));
  const dialogueSurfaceValues = dialogueSource.flatMap(turn => [turn?.speaker, turn?.text ?? turn]
    .flatMap(value => allTextValues(value)));
  const dialogue = unique([
    ...dialogueSurfaceValues.map(normalizeLeakage),
    ...dialogueSource.map(turn => normalizeLeakage([
      ...allTextValues(turn?.speaker), ...allTextValues(turn?.text ?? turn)
    ].join(" "))),
    normalizeLeakage(dialogueSpeakerValues.join(" ")),
    normalizeLeakage(dialogueTextValues.join(" ")),
    normalizeLeakage(dialogueSurfaceValues.join(" "))
  ]);
  if (answers.some(answer => prompts.some(prompt => containsAnswer(prompt, answer)))) codes.push("ANSWER_IN_PROMPT");
  if (answers.some(answer => instructions.some(instruction => containsAnswer(instruction, answer)))) codes.push("ANSWER_IN_INSTRUCTION");
  if (answers.some(answer => explanations.some(explanation => containsAnswer(explanation, answer)))) codes.push("ANSWER_IN_EXPLANATION");
  if (answers.some(answer => contexts.some(context => containsAnswer(context, answer)))) codes.push("ANSWER_IN_CONTEXT");
  if (answers.some(answer => hints.some(hint => containsAnswer(hint, answer))) && activity.answerExposure !== "EXPLICIT_SOLUTION") codes.push("ANSWER_IN_VISIBLE_HINT");
  if (answers.some(answer => dialogue.some(turn => containsAnswer(turn, answer)))) codes.push("ANSWER_IN_DIALOGUE");
  if (Array.isArray(activity.pairs) && activity.pairs.length === 1) codes.push("ANSWER_IN_SINGLE_PAIR");
  const tokenSource = Array.isArray(activity.tokens)
    ? activity.tokens
    : Array.isArray(activity.tiles) ? activity.tiles : [];
  const tokenIds = tokenSource.map((item, index) => String(item?.id ?? index));
  const expectedOrder = Array.isArray(activity.correctOrder) ? activity.correctOrder.map(String) : [];
  if (expectedOrder.length > 1 && tokenIds.length === expectedOrder.length && tokenIds.every((id, index) => id === expectedOrder[index])) codes.push("ANSWER_ALREADY_ORDERED");
  const imageLeak = (Array.isArray(activity.options) ? activity.options : []).some(option =>
    (answers.includes(normalizeLeakage(optionText(option, uiLocale))) || String(option?.id) === String(activity.correctOptionId))
    && answers.some(answer => [option.alt, option.imageAlt]
      .flatMap(value => normalizedSurfaceValues(value))
      .some(label => containsAnswer(label, answer))));
  if (imageLeak) codes.push("ANSWER_IN_IMAGE_LABEL");
  return { leaked: codes.length > 0, codes: unique(codes) };
}

function componentRules(activity, locale) {
  const type = activity.activityType || activity.type;
  const reasons = [];
  const entry = getCatalogEntry(type);
  const collectionDeclarations = [activity.contexts, activity.options, activity.pairs, activity.tiles, activity.tokens,
    activity.categories, activity.items, activity.dialogue, activity.dialogueOptions, activity.turns, activity.hints,
    activity.acceptedAnswers, activity.correctOrder, activity.conflictIds].filter(value => value != null);
  if (collectionDeclarations.some(value => !Array.isArray(value))) reasons.push("INVALID_COLLECTION_SHAPE");
  const options = Array.isArray(activity.options) ? activity.options : [];
  const pairs = Array.isArray(activity.pairs) ? activity.pairs : [];
  const tiles = Array.isArray(activity.tiles) ? activity.tiles : Array.isArray(activity.tokens) ? activity.tokens : [];
  const categories = Array.isArray(activity.categories) ? activity.categories : [];
  const items = Array.isArray(activity.items) ? activity.items : [];
  const dialogue = Array.isArray(activity.dialogue) ? activity.dialogue : Array.isArray(activity.turns) ? activity.turns : [];
  const hints = Array.isArray(activity.hints) ? activity.hints : [];
  const conflictIds = Array.isArray(activity.conflictIds) ? activity.conflictIds : [];
  const answers = effectiveAnswers(activity, locale);
  const answer = localize(activity.correctAnswer, locale).trim();
  const expectedOrder = Array.isArray(activity.correctOrder) ? activity.correctOrder : [];

  if (!entry) return ["UNSUPPORTED_ACTIVITY_TYPE"];
  if (!entry.enabled) return [entry.disabledReason || "ACTIVITY_TYPE_DISABLED"];
  const visibleTextDeclarations = [activity.instruction, activity.prompt, activity.explanation,
    activity.contextText, activity.scenario, activity.lessonContext?.visibleContext,
    ...hints,
    ...options.map(option => option?.text ?? option?.label ?? option?.value),
    ...pairs.flatMap(pair => [pair?.left, pair?.right]),
    ...categories.map(category => category?.label ?? category?.text),
    ...items.map(item => item?.text ?? item?.label),
    ...dialogue.flatMap(turn => [turn?.speaker, turn?.text])];
  if (visibleTextDeclarations.some(value => !rendererTextDeclarationIsSafe(value))) reasons.push("INVALID_VISIBLE_TEXT_DECLARATION");
  if (![activity.instruction, activity.prompt].some(value => normalize(localize(value, locale)))) reasons.push("MISSING_ACTIVITY_PROMPT");
  if (activity.requiresStudentResponse !== true) reasons.push("STUDENT_RESPONSE_REQUIRED");
  if (typeof activity.correctAnswer !== "string" || !normalize(answer)) reasons.push("CORRECT_ANSWER_MISSING");
  if ((activity.answer != null && typeof activity.answer !== "string")
    || (activity.acceptedAnswers != null && (!Array.isArray(activity.acceptedAnswers)
      || activity.acceptedAnswers.some(value => typeof value !== "string" || !value.trim())))) reasons.push("INVALID_ANSWER_DECLARATION");
  if (activity.conflictIds != null && (!Array.isArray(activity.conflictIds)
    || activity.conflictIds.some(id => !isCanonicalSourceId(id)
      || /[\p{M}\p{Cf}\p{Cc}]/u.test(id.normalize("NFD")))
    || new Set(activity.conflictIds).size !== activity.conflictIds.length)) reasons.push("INVALID_CONFLICT_ID_DECLARATION");
  if (hasOwn(activity, "hasOpenConflict") && typeof activity.hasOpenConflict !== "boolean") {
    reasons.push("INVALID_CONFLICT_DECLARATION");
  }
  if (!sourceIdentityIsValid(activity)) reasons.push("INVALID_SOURCE_ID_DECLARATION");
  if (activity.hasOpenConflict === true || conflictIds.length > 0) reasons.push("OPEN_LINGUISTIC_CONFLICT");
  if ([...options, ...pairs, ...items, ...tiles].some(item => item && typeof item === "object" && item.authorized === false)) reasons.push("UNAUTHORIZED_CONTENT");
  if (activity.cognitiveDemand && activity.cognitiveDemand !== entry.cognitiveDemand) reasons.push("COGNITIVE_DEMAND_MISMATCH");
  if (type !== ACTIVITY_TYPES.AUDIO_SELECT) {
    const legacyAudioAliasDeclared = ["audio", "authorizedAudio", ...TOP_LEVEL_RICH_AUDIO_KEYS]
      .some(key => hasOwn(activity, key));
    const invalidCanonicalAudioPlaceholder = [
      ["audioId", value => typeof value !== "string" || value !== ""],
      ["audioPath", value => typeof value !== "string" || value !== ""],
      ["audioText", value => typeof value !== "string" || value !== ""],
      ["audioSource", value => typeof value !== "string" || value !== ""],
      ["audioAuthorized", value => value !== false],
      ["humanRecorded", value => value !== false]
    ].some(([key, invalid]) => hasOwn(activity, key) && invalid(activity[key]));
    if (legacyAudioAliasDeclared || invalidCanonicalAudioPlaceholder
      || hasMaterialValue(activity.media?.type === "audio" ? activity.media : null)) {
      reasons.push("UNEXPECTED_AUDIO_MATERIAL");
    }
  }

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
    const rawPairIds = pairs.map(pair => pair?.id);
    const pairIds = rawPairIds.map(id => typeof id === "string" ? id.trim() : "");
    const pairContent = pairs.map(pair => ({
      left: normalize(localize(pair?.left, locale)),
      right: normalize(localize(pair?.right, locale))
    }));
    const pairTuples = pairContent.map(pair => `${pair.left}\u0000${pair.right}`);
    if (pairs.length < 3 || pairs.length > 5) reasons.push("INVALID_PAIR_COUNT");
    if (rawPairIds.some((id, index) => typeof id !== "string" || !pairIds[index])) reasons.push("MISSING_PAIR_ID");
    if (new Set(pairIds).size !== pairIds.length) reasons.push("DUPLICATE_PAIR_IDS");
    if (pairContent.some(pair => !pair.left || !pair.right)) reasons.push("MISSING_PAIR_CONTENT");
    if (new Set(pairTuples).size !== pairTuples.length) reasons.push("DUPLICATE_PAIRS");
    if (pairContent.some(pair => pair.left && pair.left === pair.right)) reasons.push("TRIVIAL_SELF_PAIR");
    if (new Set(pairContent.map(pair => pair.left)).size !== pairContent.length
      || new Set(pairContent.map(pair => pair.right)).size !== pairContent.length) reasons.push("AMBIGUOUS_PAIR_MAPPING");
    if (pairs.some(pair => pair?.authorized !== true)) reasons.push("UNAUTHORIZED_PAIR");
  }
  if (type === ACTIVITY_TYPES.CATEGORY_SORT) {
    const rawCategoryIds = categories.map(category => category?.id);
    const rawItemIds = items.map(item => item?.id);
    const categoryIds = rawCategoryIds.map(id => typeof id === "string" ? id.trim() : "");
    const itemIds = rawItemIds.map(id => typeof id === "string" ? id.trim() : "");
    const categoryLabels = categories.map(category => normalize(localize(category?.label ?? category?.text, locale)));
    const itemTexts = items.map(item => normalize(localize(item?.text ?? item?.label, locale)));
    if (items.length < 6 || items.length > 10) reasons.push("INVALID_SORT_ITEM_COUNT");
    if (categories.length < 2 || categories.length > 3) reasons.push("INVALID_CATEGORY_COUNT");
    if (rawCategoryIds.some((id, index) => typeof id !== "string" || !categoryIds[index])) reasons.push("MISSING_CATEGORY_ID");
    if (new Set(categoryIds).size !== categoryIds.length) reasons.push("DUPLICATE_CATEGORY_IDS");
    if (categoryLabels.some(label => !label)) reasons.push("MISSING_CATEGORY_LABEL");
    if (new Set(categoryLabels).size !== categoryLabels.length) reasons.push("DUPLICATE_CATEGORY_LABELS");
    if (rawItemIds.some((id, index) => typeof id !== "string" || !itemIds[index])) reasons.push("MISSING_ITEM_ID");
    if (new Set(itemIds).size !== itemIds.length) reasons.push("DUPLICATE_ITEM_IDS");
    if (itemTexts.some(text => !text)) reasons.push("MISSING_ITEM_CONTENT");
    if (new Set(itemTexts).size !== itemTexts.length) reasons.push("DUPLICATE_SORT_ITEMS");
    if (items.some(item => {
      const categoryId = item?.categoryId;
      return typeof categoryId !== "string" || !categoryId.trim()
        || categories.filter(category => typeof category?.id === "string" && category.id === categoryId && category?.authorized === true).length !== 1;
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
    const rawTurnIds = dialogue.map(turn => turn?.id);
    const turnIds = rawTurnIds.map(id => typeof id === "string" ? id.trim() : "");
    const speakers = dialogue.map(turn => normalize(localize(turn?.speaker, locale)));
    const turnTexts = dialogue.map(turn => normalize(localize(turn?.text, locale)));
    if (dialogue.length < 2 || dialogue.length > 4) reasons.push("INVALID_DIALOGUE_LENGTH");
    if (rawTurnIds.some((id, index) => typeof id !== "string" || !turnIds[index])) reasons.push("MISSING_DIALOGUE_TURN_ID");
    if (new Set(turnIds).size !== turnIds.length) reasons.push("DUPLICATE_DIALOGUE_TURN_IDS");
    if (speakers.some(speaker => !speaker)) reasons.push("MISSING_DIALOGUE_SPEAKER");
    if (turnTexts.some(text => !text)) reasons.push("MISSING_DIALOGUE_TEXT");
    if (activity.dialogueAuthorized !== true || dialogue.some(turn => turn?.authorized !== true)) reasons.push("UNAUTHORIZED_DIALOGUE");
  }
  if (type === ACTIVITY_TYPES.AUDIO_SELECT) {
    const canonicalStringFields = [activity.audioId, activity.audioPath, activity.audioText, activity.audioSource];
    if (canonicalStringFields.some(value => typeof value !== "string")) reasons.push("INVALID_AUDIO_DECLARATION");
    const audioAliases = unique([
      typeof activity.audioText === "string" ? activity.audioText : "",
      typeof activity.audioText === "string" ? activity.audioText.split("(")[0].trim() : ""
    ].map(normalize));
    if (options.length < 3 || options.length > 4) reasons.push("INVALID_OPTION_COUNT");
    if (activity.audioAuthorized !== true || activity.humanRecorded !== true) reasons.push("UNAUTHORIZED_AUDIO");
    if (!canonicalStringFields.slice(0, 3).every(value => typeof value === "string" && value.trim())) reasons.push("MISSING_AUDIO_SOURCE");
    if (activity.audioSource !== "manifest-human-recording") reasons.push("UNAUTHORIZED_AUDIO_SOURCE");
    if (answers.map(normalize).some(value => value && !audioAliases.includes(value))) reasons.push("AUDIO_TARGET_MISMATCH");
    const declaredCanonicalAudio = {
      audioId: activity.audioId,
      audioPath: activity.audioPath,
      audioText: activity.audioText,
      audioAuthorized: activity.audioAuthorized,
      humanRecorded: activity.humanRecorded,
      audioSource: activity.audioSource
    };
    if (!activityAudioClaimsMatch(activity, declaredCanonicalAudio, locale)) reasons.push("CONFLICTING_AUDIO_DECLARATION");
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
    if (hints.length) reasons.push("INDEPENDENT_RECALL_HAS_HINTS");
  }
  if (options.length) {
    const rawOptionIds = options.map(option => option?.id);
    const optionIds = rawOptionIds.map(id => typeof id === "string" ? id : "");
    const values = options.map(option => normalize(optionText(option, locale)));
    if (rawOptionIds.some((id, index) => typeof id !== "string" || !optionIds[index].trim())) reasons.push("MISSING_OPTION_ID");
    if (new Set(optionIds.map(id => id.trim())).size !== optionIds.length) reasons.push("DUPLICATE_OPTION_IDS");
    if (values.some(value => !value)) reasons.push("MISSING_OPTION_CONTENT");
    if (options.some(option => option?.authorized !== true)) reasons.push("UNAUTHORIZED_OPTION");
    if (new Set(values).size !== values.length) reasons.push("DUPLICATE_OPTIONS");
    const correctOptionId = typeof activity.correctOptionId === "string" ? activity.correctOptionId : "";
    const correctOptions = options.filter(option => typeof option?.id === "string" && option.id === correctOptionId);
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
  const fingerprintable = {
    ...activity,
    options: Array.isArray(activity.options) ? activity.options : [],
    pairs: Array.isArray(activity.pairs) ? activity.pairs : [],
    tiles: Array.isArray(activity.tiles) ? activity.tiles : [],
    tokens: Array.isArray(activity.tokens) ? activity.tokens : [],
    categories: Array.isArray(activity.categories) ? activity.categories : [],
    dialogue: Array.isArray(activity.dialogue) ? activity.dialogue : [],
    turns: Array.isArray(activity.turns) ? activity.turns : [],
    acceptedAnswers: Array.isArray(activity.acceptedAnswers) ? activity.acceptedAnswers : []
  };
  return createActivityFingerprint(fingerprintable, { uiLocale: activity.uiLocale || "es" });
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
      && typeof activity.audioId === "string" && activity.audioId === approvedAudio.audioId
      && typeof activity.audioPath === "string" && activity.audioPath === approvedAudio.audioPath
      && canonicalContent(activity.audioText, context.uiLocale || "es") === canonicalContent(approvedAudio.audioText, context.uiLocale || "es")
      && activity.audioAuthorized === true
      && activity.humanRecorded === true
      && activity.audioSource === approvedAudio.audioSource
      && activityAudioClaimsMatch(activity, approvedAudio, context.uiLocale || "es");
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
