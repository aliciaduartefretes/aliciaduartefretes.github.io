import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";
import { createContext, runInContext } from "node:vm";

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,95}$/;
const LOCALES = Object.freeze(["es", "en", "pt", "fr", "it", "de"]);
const CURRENT_DATA_VERSION = "NALVI-P5-DATA-3";
const STABLE_DATA_VERSION = "NALVI-P5-DATA-1";
const COURSE_ID = "general";
const LEARNING_MODEL = "competency-route";
const KNOWN_ACTIVITY_IDS = Object.freeze([
  "general-u01-significado-mba-eichapa",
  "general-u01-elegir-aguyje",
  "general-u01-escuchar-jajotopata"
]);
const CURRENT_SOURCE_URL = new URL("../assets/js/kuaa-general-activities.js", import.meta.url);
const STABLE_ACTIVITY_SOURCE_URL = new URL("../versions/kuaa-general-activities-NALVI-P5-stable.js", import.meta.url);
const STABLE_P5_URL = new URL("../versions/index-NALVI-P5-stable.html", import.meta.url);
const CURRENT_SOURCE_SHA256 = "1000e98448051acc6b0e4d18a0d4584a7877ae95247841b59ff4dc47823fafe2";
const STABLE_ACTIVITY_SHA256 = "f4aa2098eaece6b79c0f5ceebfc07754749de905b8b1d32568a8166e7a668975";
const STABLE_P5_SHA256 = "889782f5605d6a17759ba593add3bad3af2602384023ccb663a97b82d3f38523";
const DIALOGUE_UNIT_BY_SOURCE_ID = Object.freeze({ "general-u01-dialogue-greetings": 0 });
const DIALOGUE_CONTRACT_BY_SOURCE_ID = Object.freeze({
  "general-u01-dialogue-greetings": Object.freeze({
    authorized: true,
    sourceContentId: "general-u01-dialogue-greetings",
    turns: Object.freeze([
      Object.freeze({ id: "greeting-turn-1", speaker: "A", text: "¿Mba’éichapa reime Ana?", authorized: true }),
      Object.freeze({ id: "greeting-turn-2", speaker: "B", text: "Aime porã, ¿ha nde?", authorized: true })
    ]),
    options: Object.freeze([
      Object.freeze({ id: "greeting-question", text: "¿Mba’éichapa reime Ana?", authorized: true }),
      Object.freeze({ id: "greeting-reply", text: "Aime porã, ¿ha nde?", authorized: true }),
      Object.freeze({ id: "greeting-close", text: "Aime porã avei. ¡Jajoechata!", authorized: true })
    ]),
    correctOptionId: "greeting-close",
    correctAnswer: "Aime porã avei. ¡Jajoechata!"
  })
});
const SEMANTIC_PAIRS = Object.freeze({
  "general-u01-significado-mba-eichapa": Object.freeze({
    target: "Mba’éichapa reime",
    adaptiveReuseAuthorized: true,
    meaning: Object.freeze({
      es: "¿Cómo estás?", en: "How are you?", pt: "Como você está?", fr: "Comment vas-tu ?",
      it: "Come stai?", de: "Wie geht es dir?"
    })
  }),
  "general-u01-elegir-aguyje": Object.freeze({
    target: "Aguyje",
    adaptiveReuseAuthorized: true,
    meaning: Object.freeze({ es: "Gracias", en: "Thank you", pt: "Obrigado/a", fr: "Merci", it: "Grazie", de: "Danke" })
  }),
  "general-u01-escuchar-jajotopata": Object.freeze({
    target: "Jajotopata",
    adaptiveReuseAuthorized: true,
    meaning: Object.freeze({
      es: "Nos vamos a encontrar", en: "We are going to meet", pt: "Nós vamos nos encontrar",
      fr: "Nous allons nous rencontrer", it: "Ci incontreremo", de: "Wir werden uns treffen"
    })
  })
});

const REVIEWED_CORE_OMISSIONS = Object.freeze({
  "general-u01-significado-mba-eichapa": Object.freeze(["prompt", "explanation", "options", "correctOptionId"]),
  "general-u01-escuchar-jajotopata": Object.freeze(["prompt"])
});

const normalizeEol = value => String(value ?? "").replace(/\r\n?/g, "\n");
const sha256 = value => createHash("sha256").update(normalizeEol(value)).digest("hex");
const plain = value => JSON.parse(JSON.stringify(value));

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}

const readonlyCopy = value => deepFreeze(plain(value));
const approvedId = value => typeof value === "string" && value === value.trim() && SAFE_ID.test(value) ? value : "";

function exactText(value, locale = "es", max = 500) {
  let selected = value;
  if (value && typeof value === "object" && !Array.isArray(value)) {
    selected = [locale, "es", "en", "pt", "fr", "it", "de"]
      .filter((key, index, keys) => keys.indexOf(key) === index)
      .map(key => Object.hasOwn(value, key) ? value[key] : undefined)
      .find(candidate => typeof candidate === "string");
  }
  return typeof selected === "string"
    ? selected.normalize("NFC").trim().replace(/\s+/g, " ").slice(0, max)
    : "";
}

function exactObjectKeys(value, expectedKeys) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort();
  return actual.length === expectedKeys.length
    && JSON.stringify(actual) === JSON.stringify([...expectedKeys].sort());
}

function loadActivityData(source, filename) {
  if (typeof source !== "string" || !source.trim()) throw new Error("APPROVED_ACTIVITY_SOURCE_UNAVAILABLE");
  const sandbox = Object.create(null);
  sandbox.window = Object.create(null);
  sandbox.__nalviSerializedActivityData = "";
  const context = createContext(sandbox, {
    codeGeneration: { strings: false, wasm: false },
    microtaskMode: "afterEvaluate"
  });
  try {
    runInContext("const __nalviSafeStringify = JSON.stringify;", context, { filename, timeout: 1000 });
    runInContext(source, context, { filename, timeout: 1000 });
    runInContext(
      "__nalviSerializedActivityData = __nalviSafeStringify(window.KUAA_GENERAL_ACTIVITY_DATA);",
      context,
      { filename, timeout: 1000 }
    );
  } catch {
    throw new Error("APPROVED_ACTIVITY_SOURCE_INVALID");
  }
  if (typeof sandbox.__nalviSerializedActivityData !== "string"
    || !sandbox.__nalviSerializedActivityData) throw new Error("APPROVED_ACTIVITY_SOURCE_UNAVAILABLE");
  try {
    const value = JSON.parse(sandbox.__nalviSerializedActivityData);
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error();
    return value;
  } catch {
    throw new Error("APPROVED_ACTIVITY_SOURCE_INVALID");
  }
}

function validateWrapper(value, expectedVersion, label) {
  if (!exactObjectKeys(value, ["version", "courseId", "learningModel", "activities"])
    || value.version !== expectedVersion || value.courseId !== COURSE_ID
    || value.learningModel !== LEARNING_MODEL || !Array.isArray(value.activities)) {
    throw new Error(`APPROVED_ACTIVITY_${label}_WRAPPER_INVALID`);
  }
  const ids = value.activities.map(activity => approvedId(activity?.id));
  if (ids.some(id => !id) || new Set(ids).size !== ids.length
    || !isDeepStrictEqual([...ids].sort(), [...KNOWN_ACTIVITY_IDS].sort())) {
    throw new Error(`APPROVED_ACTIVITY_${label}_IDS_INVALID`);
  }
  for (const activity of value.activities) {
    if (activity.courseId !== COURSE_ID || activity.activityType !== activity.type
      || !approvedId(activity.learningObjectiveId) || !Array.isArray(activity.conceptIds)
      || !activity.conceptIds.length || activity.conceptIds.some(id => !approvedId(id))
      || !Array.isArray(activity.lexemeIds) || !activity.lexemeIds.length
      || activity.lexemeIds.some(id => !approvedId(id)) || !Array.isArray(activity.grammarRuleIds)
      || activity.grammarRuleIds.some(id => !approvedId(id)) || !Array.isArray(activity.options)
      || activity.options.length < 3) {
      throw new Error(`APPROVED_ACTIVITY_${label}_ACTIVITY_INVALID:${activity.id}`);
    }
    const optionIds = activity.options.map(option => approvedId(option?.id));
    if (optionIds.some(id => !id) || new Set(optionIds).size !== optionIds.length
      || !optionIds.includes(approvedId(activity.correctOptionId))) {
      throw new Error(`APPROVED_ACTIVITY_${label}_OPTIONS_INVALID:${activity.id}`);
    }
  }
}

function stableCore(activity, omittedFields = []) {
  const copy = plain(activity);
  delete copy.semanticPair;
  delete copy.adaptiveDialogue;
  omittedFields.forEach(field => { delete copy[field]; });
  return copy;
}

function validateStableCore(currentData, stableData) {
  if (!isDeepStrictEqual(
    currentData.activities.map(activity => activity.id),
    stableData.activities.map(activity => activity.id)
  )) throw new Error("APPROVED_ACTIVITY_STABLE_ORDER_DRIFT");
  const stableById = new Map(stableData.activities.map(activity => [activity.id, activity]));
  for (const activity of currentData.activities) {
    const stable = stableById.get(activity.id);
    const omissions = REVIEWED_CORE_OMISSIONS[activity.id] || [];
    if (!stable || !isDeepStrictEqual(stableCore(activity, omissions), stableCore(stable, omissions))) {
      throw new Error(`APPROVED_ACTIVITY_STABLE_CORE_DRIFT:${activity.id}`);
    }
    const expectedPair = SEMANTIC_PAIRS[activity.id];
    if (!expectedPair || !isDeepStrictEqual(plain(activity.semanticPair), plain(expectedPair))) {
      throw new Error(`APPROVED_ACTIVITY_SEMANTIC_PAIR_DRIFT:${activity.id}`);
    }
  }
}

function parseStableUnits(stableDocument) {
  const source = normalizeEol(stableDocument);
  const prefix = "const U=";
  const start = source.indexOf(prefix);
  const end = start < 0 ? -1 : source.indexOf(";\nconst quizBase=", start + prefix.length);
  if (start < 0 || end < 0 || source.indexOf(prefix, start + prefix.length) >= 0) {
    throw new Error("APPROVED_DIALOGUE_STABLE_STRUCTURE_INVALID");
  }
  const literal = source.slice(start + prefix.length, end);
  const sandbox = Object.create(null);
  sandbox.__nalviSerializedUnits = "";
  const context = createContext(sandbox, {
    codeGeneration: { strings: false, wasm: false },
    microtaskMode: "afterEvaluate"
  });
  try {
    runInContext(
      `__nalviSerializedUnits = JSON.stringify((${literal}));`,
      context,
      { filename: "index-NALVI-P5-stable.html#U", timeout: 1000 }
    );
  } catch {
    throw new Error("APPROVED_DIALOGUE_STABLE_STRUCTURE_INVALID");
  }
  let units;
  try {
    units = JSON.parse(sandbox.__nalviSerializedUnits);
  } catch {
    throw new Error("APPROVED_DIALOGUE_STABLE_STRUCTURE_INVALID");
  }
  if (!Array.isArray(units) || units.length < 12) {
    throw new Error("APPROVED_DIALOGUE_STABLE_UNITS_INVALID");
  }
  return units;
}

const literalNfc = value => typeof value === "string" ? value.normalize("NFC") : "";
const DIALOGUE_SPEAKERS = new Set(["A", "B"]);

function uniqueObjects(values) {
  const counts = values.reduce((map, item) => map.set(item.id, (map.get(item.id) || 0) + 1), new Map());
  return values.filter(item => item.id && counts.get(item.id) === 1);
}

function optionsFor(activity, locale) {
  return uniqueObjects(activity.options.map(option => ({
    id: approvedId(option.id),
    text: exactText(option.label ?? option.text ?? option.value, locale, 160),
    authorized: true
  }))).filter(option => option.id && option.text);
}

function contextsFor(activity, locale) {
  return (Array.isArray(activity.approvedContexts) ? activity.approvedContexts : [])
    .filter(item => item && typeof item === "object" && Object.hasOwn(item, "authorized") && item.authorized === true)
    .map(item => ({ text: exactText(item.text ?? item.value, locale), authorized: true }))
    .filter(item => item.text).slice(0, 4);
}

function sortMaterialFor(activity, locale) {
  const categories = uniqueObjects((Array.isArray(activity.adaptiveCategories) ? activity.adaptiveCategories : [])
    .filter(item => item && typeof item === "object" && Object.hasOwn(item, "authorized") && item.authorized === true)
    .map(item => ({ id: approvedId(item.id), label: exactText(item.label ?? item.text, locale, 120), authorized: true })))
    .filter(item => item.id && item.label).slice(0, 3);
  const categoryIds = new Set(categories.map(item => item.id));
  const items = uniqueObjects((Array.isArray(activity.adaptiveCategoryItems) ? activity.adaptiveCategoryItems : [])
    .filter(item => item && typeof item === "object" && Object.hasOwn(item, "authorized") && item.authorized === true)
    .map(item => ({
      id: approvedId(item.id), text: exactText(item.text ?? item.label, locale, 120),
      categoryId: approvedId(item.categoryId), authorized: true
    }))).filter(item => item.id && item.text && categoryIds.has(item.categoryId)).slice(0, 10);
  return { categories, items };
}

function verifyDialogue(source, stableUnits, locale) {
  if (!exactObjectKeys(source, ["authorized", "sourceContentId", "turns", "options", "correctOptionId", "correctAnswer"])
    || source.authorized !== true) return null;
  const sourceContentId = approvedId(source.sourceContentId);
  const unitIndex = DIALOGUE_UNIT_BY_SOURCE_ID[sourceContentId];
  const unit = Number.isInteger(unitIndex) ? stableUnits[unitIndex] : null;
  const contract = DIALOGUE_CONTRACT_BY_SOURCE_ID[sourceContentId];
  if (!unit || !contract) return null;
  const rawTurns = Array.isArray(source.turns) ? source.turns : [];
  const rawOptions = Array.isArray(source.options) ? source.options : [];
  if (rawTurns.length < 2 || rawTurns.length > 4 || rawOptions.length < 3 || rawOptions.length > 4) return null;
  if (rawTurns.some(turn => !exactObjectKeys(turn, ["id", "speaker", "text", "authorized"])
      || turn.authorized !== true)
    || rawOptions.some(option => !exactObjectKeys(option, ["id", "text", "authorized"])
      || option.authorized !== true)) return null;
  const turns = rawTurns.map(turn => ({
    id: approvedId(turn.id), speaker: literalNfc(turn.speaker),
    text: literalNfc(turn.text), authorized: true
  }));
  const dialogueOptions = rawOptions.map(option => ({
    id: approvedId(option.id), text: literalNfc(option.text), authorized: true
  }));
  if (turns.some(turn => turn.speaker.length > 1 || turn.text.length > 240)
    || dialogueOptions.some(option => option.text.length > 160)
    || uniqueObjects(turns).length !== turns.length || uniqueObjects(dialogueOptions).length !== dialogueOptions.length
    || turns.some(turn => !turn.id || !DIALOGUE_SPEAKERS.has(turn.speaker)
      || !turn.text)
    || dialogueOptions.some(option => !option.id || !option.text)) return null;
  const dialogueCorrectOptionId = approvedId(source.correctOptionId);
  const dialogueCorrectAnswer = literalNfc(source.correctAnswer);
  const normalizedClaim = {
    authorized: true, sourceContentId, turns, options: dialogueOptions,
    correctOptionId: dialogueCorrectOptionId, correctAnswer: dialogueCorrectAnswer
  };
  if (!isDeepStrictEqual(normalizedClaim, plain(contract))) return null;
  const correct = dialogueOptions.find(option => option.id === dialogueCorrectOptionId);
  if (!correct || dialogueCorrectAnswer.length > 240 || correct.text !== dialogueCorrectAnswer) return null;
  return { dialogue: turns, dialogueOptions, dialogueCorrectOptionId, dialogueCorrectAnswer, dialogueSourceContentId: sourceContentId };
}

const emptyDialogue = () => ({
  dialogue: [], dialogueOptions: [], dialogueCorrectOptionId: "", dialogueCorrectAnswer: "", dialogueSourceContentId: ""
});

function dialogueFor(activity, records, stableUnits, locale) {
  for (const candidate of [activity, ...records.filter(item => item.id !== activity.id
    && item.learningObjectiveId === activity.learningObjectiveId)]) {
    const verified = verifyDialogue(candidate.adaptiveDialogue, stableUnits, locale);
    if (verified) return verified;
  }
  return emptyDialogue();
}

function pairsFor(records, learningObjectiveId, locale) {
  return records.filter(activity => activity.learningObjectiveId === learningObjectiveId).map(activity => ({
    id: activity.id,
    left: exactText(SEMANTIC_PAIRS[activity.id].target, locale, 160),
    right: exactText(SEMANTIC_PAIRS[activity.id].meaning, locale, 160),
    sourceActivityId: activity.id,
    authorized: true
  }));
}

function unavailableAuthority(error) {
  const message = String(error?.message || error || "APPROVED_ACTIVITY_AUTHORITY_UNAVAILABLE");
  return Object.freeze({
    resolve: () => null,
    resolveById: () => null,
    listByLearningObjective: () => Object.freeze([]),
    listApprovedActivityIds: () => Object.freeze([]),
    has: () => false,
    audit: () => Object.freeze({ ready: false, error: message, activities: 0, failClosed: true })
  });
}

export function createApprovedActivityAuthority({
  currentSource,
  stableActivitySource,
  stableDocument,
  expectedCurrentSha256 = CURRENT_SOURCE_SHA256,
  expectedStableActivitySha256 = STABLE_ACTIVITY_SHA256,
  expectedStableP5Sha256 = STABLE_P5_SHA256
} = {}) {
  const currentText = currentSource === undefined ? readFileSync(CURRENT_SOURCE_URL, "utf8") : currentSource;
  const stableActivityText = stableActivitySource === undefined
    ? readFileSync(STABLE_ACTIVITY_SOURCE_URL, "utf8") : stableActivitySource;
  const stableP5Text = stableDocument === undefined ? readFileSync(STABLE_P5_URL, "utf8") : stableDocument;
  const acceptedCurrentHashes = Array.isArray(expectedCurrentSha256)
    ? expectedCurrentSha256 : [expectedCurrentSha256];
  const currentSourceSha256 = sha256(currentText);
  if (!acceptedCurrentHashes.includes(currentSourceSha256)) throw new Error("APPROVED_ACTIVITY_CURRENT_SOURCE_DRIFT");
  if (sha256(stableActivityText) !== expectedStableActivitySha256) throw new Error("APPROVED_ACTIVITY_STABLE_SOURCE_DRIFT");
  if (sha256(stableP5Text) !== expectedStableP5Sha256) throw new Error("APPROVED_DIALOGUE_STABLE_SOURCE_DRIFT");
  const currentData = loadActivityData(currentText, "kuaa-general-activities.js");
  const stableData = loadActivityData(stableActivityText, "kuaa-general-activities-NALVI-P5-stable.js");
  validateWrapper(currentData, CURRENT_DATA_VERSION, "CURRENT");
  validateWrapper(stableData, STABLE_DATA_VERSION, "STABLE");
  validateStableCore(currentData, stableData);
  const stableUnits = parseStableUnits(stableP5Text);
  const records = currentData.activities.map(plain);
  const byId = new Map(records.map(activity => [activity.id, activity]));

  function descriptorFor(activity, uiLocale = "es") {
    const locale = LOCALES.includes(uiLocale) ? uiLocale : "es";
    const conceptIds = activity.conceptIds.map(approvedId).filter(Boolean);
    const conceptId = conceptIds[0];
    const learningObjectiveId = approvedId(activity.learningObjectiveId);
    const options = optionsFor(activity, locale);
    const correctOptionId = approvedId(activity.correctOptionId);
    const correctOption = options.find(option => option.id === correctOptionId);
    const correctAnswer = correctOption?.text || "";
    if (!conceptId || !learningObjectiveId || options.length !== activity.options.length || !correctAnswer) return null;
    const acceptedAnswers = [correctAnswer];
    const dialogue = dialogueFor(activity, records, stableUnits, locale);
    const sortMaterial = sortMaterialFor(activity, locale);
    const sourceActivity = {
      id: activity.id,
      courseId: COURSE_ID,
      unitId: approvedId(activity.unitId),
      conceptId,
      conceptIds,
      learningObjectiveId,
      type: activity.type,
      activityType: activity.activityType,
      skill: approvedId(activity.skill),
      difficulty: exactText(activity.difficulty, locale, 40),
      prompt: exactText(activity.prompt, locale, 320),
      instruction: exactText(activity.instruction ?? activity.prompt, locale, 320),
      options: options.map(option => ({ id: option.id, label: option.text })),
      correctOptionId,
      acceptedAnswers,
      requiresStudentResponse: true,
      lexemeIds: activity.lexemeIds.map(approvedId).filter(Boolean),
      grammarRuleIds: activity.grammarRuleIds.map(approvedId).filter(Boolean),
      sourceIds: (activity.sourceIds || []).map(approvedId).filter(Boolean),
      contentValidationStatus: exactText(activity.contentValidationStatus, locale, 40),
      allowedForMastery: activity.allowedForMastery === true,
      literalReuseOnly: true,
      lessonContext: {
        sourceActivityId: activity.id,
        sourceAnswer: correctAnswer,
        sourceOptions: options.map(option => ({ id: option.id, label: option.text })),
        sourceCorrectOptionId: correctOptionId,
        sourcePrompt: exactText(activity.prompt, locale, 320),
        sourceInstruction: exactText(activity.instruction ?? activity.prompt, locale, 320)
      }
    };
    const knowledgeIds = [...new Set([...sourceActivity.grammarRuleIds, ...sourceActivity.lexemeIds])];
    return readonlyCopy({
      sourceActivity,
      correctAnswer,
      knowledgeIds,
      approvedActivityMaterial: {
        options,
        correctOptionId,
        correctAnswer,
        acceptedAnswers,
        pairs: pairsFor(records, learningObjectiveId, locale),
        contexts: contextsFor(activity, locale),
        ...sortMaterial,
        ...dialogue,
        audio: null
      }
    });
  }

  function resolve(claim = {}) {
    if (!claim || typeof claim !== "object" || Array.isArray(claim)) return null;
    const hasActivityId = Object.hasOwn(claim, "activityId");
    const hasSourceActivityId = Object.hasOwn(claim, "sourceActivityId");
    if (!hasActivityId && !hasSourceActivityId) return null;
    const activityId = hasActivityId ? approvedId(claim.activityId) : "";
    const sourceActivityId = hasSourceActivityId ? approvedId(claim.sourceActivityId) : "";
    if ((hasActivityId && !activityId) || (hasSourceActivityId && !sourceActivityId)
      || (hasActivityId && hasSourceActivityId && activityId !== sourceActivityId)) return null;
    const requested = activityId || sourceActivityId;
    const uiLocale = claim.uiLocale ?? "es";
    const activity = byId.get(requested);
    return activity ? descriptorFor(activity, uiLocale) : null;
  }

  function listByLearningObjective(claim = {}) {
    if (!claim || typeof claim !== "object" || Array.isArray(claim)) return Object.freeze([]);
    const requested = approvedId(claim.learningObjectiveId);
    const uiLocale = claim.uiLocale ?? "es";
    if (!requested) return Object.freeze([]);
    return deepFreeze(records.filter(activity => activity.learningObjectiveId === requested)
      .map(activity => descriptorFor(activity, uiLocale)?.sourceActivity).filter(Boolean));
  }

  const approvedIds = deepFreeze(records.map(activity => activity.id));
  const verifiedDialogueRecords = records.filter(activity => verifyDialogue(activity.adaptiveDialogue, stableUnits, "es")).length;
  const audit = Object.freeze({
    ready: true,
    error: "",
    source: "assets/js/kuaa-general-activities.js",
    currentSourceSha256,
    currentDataVersion: CURRENT_DATA_VERSION,
    stableActivitySource: "versions/kuaa-general-activities-NALVI-P5-stable.js",
    stableDataVersion: STABLE_DATA_VERSION,
    stableActivitySha256: STABLE_ACTIVITY_SHA256,
    stableDialogueSource: "versions/index-NALVI-P5-stable.html",
    stableDialogueSha256: STABLE_P5_SHA256,
    courseId: COURSE_ID,
    learningModel: LEARNING_MODEL,
    activities: records.length,
    verifiedDialogueRecords,
    rejectsClientAuthorizationClaims: true,
    literalReuseOnly: true,
    failClosed: true
  });

  return Object.freeze({
    resolve,
    resolveById: (sourceActivityId, options = {}) => resolve({
      sourceActivityId,
      uiLocale: options && typeof options === "object" && !Array.isArray(options) ? options.uiLocale ?? "es" : "es"
    }),
    listByLearningObjective,
    listApprovedActivityIds: () => approvedIds,
    has: activityId => byId.has(approvedId(activityId)),
    audit: () => audit
  });
}

let defaultAuthority;
try {
  defaultAuthority = createApprovedActivityAuthority();
} catch (error) {
  defaultAuthority = unavailableAuthority(error);
}

export const approvedActivityAuthority = defaultAuthority;
