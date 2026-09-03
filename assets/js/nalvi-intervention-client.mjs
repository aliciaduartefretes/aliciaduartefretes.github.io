import {
  canScoreWithoutAI,
  createActivityFingerprint,
  needsAdaptiveTutor,
  planPedagogicalIntervention,
  wouldAIImproveIntervention
} from "../../intervention-engine/intervention-engine.mjs?v=NALVI-TUTOR-4";
import { buildDeterministicFallbackCandidates } from "../../progression-engine/fallback-intervention.mjs?v=NALVI-CATALOG-5";
import { detectAnswerLeakage, selectFirstValidCandidate, validateCatalogActivity } from "../../activity-catalog/nalvi-activity-quality.mjs?v=NALVI-CATALOG-4";
import { ACTIVITY_TYPES, catalogAudit } from "../../activity-catalog/nalvi-activity-catalog.mjs?v=NALVI-CATALOG-3";
import "./nalvi-activity-catalog-renderer.mjs?v=NALVI-CATALOG-RENDERER-5";

const VERSION = "NALVI-TUTOR-CLIENT-CATALOG-12";
// Stable regression marker: scoring feedback is shown before any network result.
const IMMEDIATE_LOCAL_FEEDBACK = true;
const HISTORY_KEY = "nalvi.tutor.history.v2";
const ATTEMPT_KEY = "nalvi.tutor.attempts.v2";
const EFFECTIVENESS_KEY = "nalvi.tutor.strategy-effectiveness.v2";
const EXPOSURE_KEY = "nalvi.tutor.answer-exposure.v2";
const PENDING_RETEST_KEY = "nalvi.tutor.pending-spaced-retest.v2";
const LEGACY_PENDING_RETEST_KEY = "nalvi.tutor.pending-spaced-retest.v1";
const PENDING_RETEST_VERSION = 2;
const MINIMUM_BRIDGE_ACTIVITIES = 2;
const ATTEMPT_TTL_MS = 30 * 60 * 1000;
const LANGUAGES = new Set(["es", "en", "pt", "fr", "it", "de"]);
const activeRequests = new WeakMap();
const activeSequences = new WeakMap();
const renderedActivityIds = new Set();
let sessionHistory = [];
const COPY = Object.freeze({
  es: { wrong: "No del todo. Seguimos y lo practicaremos de otra forma.", loading: "Preparando otra forma de practicar…", complete: "Bien. Ahora seguiremos comprobando lo aprendido.", example: "Observa este ejemplo", deferred: "Guardamos este concepto para repasarlo más tarde.", match: "Relaciona cada expresión con su significado.", matchInstruction: "Une las expresiones que corresponden.", recall: "Responde sin opciones.", recallContext: "Recuerda el concepto que practicamos." },
  en: { wrong: "Not quite. Keep going; we’ll practise it another way.", loading: "Preparing another way to practise…", complete: "Good. We’ll keep checking what you learned.", example: "Study this example", deferred: "We saved this concept for a later review.", match: "Match each expression with its meaning.", matchInstruction: "Connect the expressions that belong together.", recall: "Answer without options.", recallContext: "Recall the concept you practised." },
  pt: { wrong: "Ainda não. Continue; vamos praticar de outra forma.", loading: "Preparando outra forma de praticar…", complete: "Bem. Continuaremos verificando o que você aprendeu.", example: "Observe este exemplo", deferred: "Guardamos este conceito para revisar mais tarde.", match: "Relacione cada expressão ao seu significado.", matchInstruction: "Una as expressões correspondentes.", recall: "Responda sem opções.", recallContext: "Lembre o conceito que você praticou." },
  fr: { wrong: "Pas tout à fait. Continuez : nous le reverrons autrement.", loading: "Préparation d’une autre façon de pratiquer…", complete: "Bien. Nous continuerons à vérifier vos acquis.", example: "Observez cet exemple", deferred: "Ce concept est prévu pour une révision ultérieure.", match: "Associez chaque expression à sa signification.", matchInstruction: "Reliez les expressions correspondantes.", recall: "Répondez sans choix.", recallContext: "Rappelez-vous le concept travaillé." },
  it: { wrong: "Non proprio. Continua: lo riprenderemo in un altro modo.", loading: "Preparazione di un altro modo per esercitarsi…", complete: "Bene. Continueremo a verificare ciò che hai imparato.", example: "Osserva questo esempio", deferred: "Abbiamo salvato questo concetto per un ripasso successivo.", match: "Abbina ogni espressione al suo significato.", matchInstruction: "Collega le espressioni corrispondenti.", recall: "Rispondi senza opzioni.", recallContext: "Ricorda il concetto che hai esercitato." },
  de: { wrong: "Noch nicht ganz. Mach weiter; wir üben es später anders.", loading: "Eine andere Übungsform wird vorbereitet…", complete: "Gut. Wir überprüfen das Gelernte weiter.", example: "Sieh dir dieses Beispiel an", deferred: "Dieses Konzept wurde für eine spätere Wiederholung vorgemerkt.", match: "Ordne jedem Ausdruck seine Bedeutung zu.", matchInstruction: "Verbinde die zusammengehörigen Ausdrücke.", recall: "Antworte ohne Auswahlmöglichkeiten.", recallContext: "Erinnere dich an das geübte Konzept." }
});

const locale = value => LANGUAGES.has(value) ? value : "es";
const localize = (value, language, seen = new Set()) => {
  if (value == null) return "";
  if (typeof value !== "object") return String(value);
  if (seen.has(value)) return "";
  seen.add(value);
  if (Array.isArray(value)) return value.map(item => localize(item, language, seen)).filter(Boolean).join(" ");
  const localized = value[language] ?? value.es ?? value.en ?? value.text ?? value.label ?? value.value;
  return localized === undefined || localized === value ? "" : localize(localized, language, seen);
};
const canonicalAudioPath = value => {
  const path = String(value || "").trim();
  if (!path) return "";
  try { return new URL(path, document.baseURI).href; } catch { return ""; }
};
const audioIdFrom = value => String(value?.audioId || value?.id || value?.recordingId || "").trim();
const audioPathFrom = value => String(value?.path || value?.audioPath || "").trim();
const registryAudioPathFrom = value => {
  const declaredPath = audioPathFrom(value);
  if (declaredPath) return declaredPath;
  const file = String(value?.file || "").trim();
  return file && !file.includes("/") && !file.includes("\\")
    ? `assets/audio/guarani/ali-2026/${file}`
    : "";
};
const audioTextFrom = value => localize(value?.audioText ?? value?.text ?? value?.label, document.documentElement.lang).trim();
const normalizeAudioLookup = value => String(value || "")
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .replace(/[‘’`´ʼʹʻ]/g, "'")
  .replace(/[¿?¡!.,;:()\[\]{}]/g, " ")
  .replace(/\s+/g, " ")
  .trim()
  .toLocaleLowerCase("es");
const registryAudioAliases = recording => {
  const label = audioTextFrom(recording);
  const baseLabel = label.split("(")[0].trim();
  return new Set([label, baseLabel].map(normalizeAudioLookup).filter(Boolean));
};
const CLOSED_AUDIO = Object.freeze({
  audioId: "",
  audioPath: "",
  audioText: "",
  audioAuthorized: false,
  humanRecorded: false,
  audioSource: ""
});
const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const declaredClaims = entries => entries
  .filter(([owner, key]) => hasOwn(owner, key))
  .map(([owner, key]) => owner[key]);
const trimStringClaim = value => typeof value === "string" ? value.trim() : "";

function canonicalRenderableAudio(activity = {}, language = document.documentElement.lang) {
  const nested = activity.authorizedAudio && typeof activity.authorizedAudio === "object" ? activity.authorizedAudio : {};
  const idClaims = declaredClaims([[activity, "audioId"], [activity, "recordingId"], [nested, "audioId"], [nested, "id"], [nested, "recordingId"]]);
  const pathClaims = declaredClaims([[activity, "audioPath"], [activity, "path"], [nested, "path"], [nested, "audioPath"]]);
  const textClaims = declaredClaims([[activity, "audioText"], [activity, "text"], [nested, "audioText"], [nested, "text"]]);
  const rawSourceClaims = declaredClaims([[activity, "audioSource"], [activity, "source"], [nested, "audioSource"], [nested, "source"]]);
  const validScalarDeclarations = [...idClaims, ...pathClaims, ...textClaims, ...rawSourceClaims]
    .every(value => typeof value === "string");
  const declaredIds = idClaims.map(trimStringClaim).filter(Boolean);
  const declaredPaths = pathClaims.map(trimStringClaim).filter(Boolean);
  const declaredTexts = textClaims.map(trimStringClaim).filter(Boolean);
  const sourceClaims = rawSourceClaims.map(trimStringClaim);
  const authorizationClaims = [[activity, "audioAuthorized"], [activity, "authorized"], [nested, "audioAuthorized"], [nested, "authorized"]]
    .filter(([owner, key]) => hasOwn(owner, key))
    .map(([owner, key]) => owner[key]);
  const humanRecordingClaims = [[activity, "humanRecorded"], [nested, "humanRecorded"]]
    .filter(([owner, key]) => hasOwn(owner, key))
    .map(([owner, key]) => owner[key]);
  const audioId = declaredIds[0] || "";
  const audioPath = declaredPaths[0] || "";
  const audioText = declaredTexts[0] || "";
  const audioSource = sourceClaims[0] || "";
  const declarationsCoherent = validScalarDeclarations
    && new Set(declaredIds).size <= 1
    && declaredPaths.every(path => canonicalAudioPath(path) === canonicalAudioPath(audioPath))
    && sourceClaims.length > 0
    && sourceClaims.every(value => value === "manifest-human-recording")
    && authorizationClaims.length > 0
    && authorizationClaims.every(value => value === true)
    && humanRecordingClaims.length > 0
    && humanRecordingClaims.every(value => value === true);
  const registry = window.NALVI_RECORDED_AUDIO;
  const registered = declarationsCoherent && audioId && typeof registry?.resolve === "function" ? registry.resolve(audioId) : null;
  const registeredId = audioIdFrom(registered);
  const registeredPath = registryAudioPathFrom(registered);
  const registeredText = audioTextFrom(registered);
  const allowedAliases = registryAudioAliases(registered);
  const answerTargets = [activity.correctAnswer, activity.answer, ...(Array.isArray(activity.acceptedAnswers) ? activity.acceptedAnswers : [])]
    .map(value => localize(value, language).trim())
    .filter(Boolean);
  const coherent = Boolean(
    audioId
    && declarationsCoherent
    && audioPath
    && audioText
    && audioSource === "manifest-human-recording"
    && registered?.authorizedForPlayback === true
    && registered?.humanRecorded === true
    && registeredId === audioId
    && registeredText
    && declaredTexts.length > 0
    && declaredTexts.every(text => allowedAliases.has(normalizeAudioLookup(text)))
    && answerTargets.length > 0
    && answerTargets.every(target => allowedAliases.has(normalizeAudioLookup(target)))
    && canonicalAudioPath(registeredPath) === canonicalAudioPath(audioPath)
  );
  return coherent
    ? { audioId, audioPath: registeredPath, audioText: registeredText, audioAuthorized: true, humanRecorded: true, audioSource }
    : { ...CLOSED_AUDIO };
}

async function resolveApprovedAudio(activity, audioTerm, semanticAnswer) {
  const registry = window.NALVI_RECORDED_AUDIO;
  if (!registry || typeof registry.resolve !== "function") return null;
  await registry.ready;
  const nested = activity.authorizedAudio && typeof activity.authorizedAudio === "object" ? activity.authorizedAudio : {};
  const idClaims = declaredClaims([[activity, "audioId"], [activity, "recordingId"], [nested, "audioId"], [nested, "id"], [nested, "recordingId"]]);
  const pathClaims = declaredClaims([[activity, "audioPath"], [activity, "path"], [nested, "path"], [nested, "audioPath"]]);
  const textClaims = declaredClaims([[activity, "audioText"], [activity, "text"], [nested, "audioText"], [nested, "text"]]);
  const rawSourceClaims = declaredClaims([[activity, "audioSource"], [activity, "source"], [nested, "audioSource"], [nested, "source"]]);
  if ([...idClaims, ...pathClaims, ...textClaims, ...rawSourceClaims].some(value => typeof value !== "string")) return null;
  const sourceClaims = rawSourceClaims.map(value => value.trim());
  const authorizationClaims = [[activity, "audioAuthorized"], [activity, "authorized"], [nested, "audioAuthorized"], [nested, "authorized"]]
    .filter(([owner, key]) => hasOwn(owner, key))
    .map(([owner, key]) => owner[key]);
  const humanRecordingClaims = [[activity, "humanRecorded"], [nested, "humanRecorded"]]
    .filter(([owner, key]) => hasOwn(owner, key))
    .map(([owner, key]) => owner[key]);
  if (sourceClaims.some(value => value !== "manifest-human-recording")
    || authorizationClaims.some(value => value !== true)
    || humanRecordingClaims.some(value => value !== true)) return null;
  const suppliedIds = idClaims.map(value => value.trim()).filter(Boolean);
  if (new Set(suppliedIds).size > 1) return null;
  const requestedId = suppliedIds[0] || "";
  const lookup = requestedId || String(audioTerm || "").trim();
  if (!lookup) return null;
  const recording = registry.resolve(lookup);
  const audioId = audioIdFrom(recording);
  const audioPath = registryAudioPathFrom(recording);
  if (!recording || recording.authorizedForPlayback !== true || recording.humanRecorded !== true || !audioId || !audioPath) return null;
  if (requestedId && requestedId !== audioId) return null;
  const suppliedPaths = pathClaims.map(value => value.trim()).filter(Boolean);
  if (suppliedPaths.some(path => canonicalAudioPath(path) !== canonicalAudioPath(audioPath))) return null;
  const text = audioTextFrom(recording);
  if (!text || !canonicalAudioPath(audioPath)) return null;
  const suppliedTexts = textClaims.map(value => value.trim()).filter(Boolean);
  const allowedAliases = registryAudioAliases(recording);
  if (suppliedTexts.some(value => !allowedAliases.has(normalizeAudioLookup(value)))) return null;
  const semanticTerms = [audioTerm, semanticAnswer].map(value => localize(value, document.documentElement.lang).trim()).filter(Boolean);
  if (!semanticTerms.length || semanticTerms.some(value => !allowedAliases.has(normalizeAudioLookup(value)))) return null;
  return {
    id: audioId,
    audioId,
    recordingId: audioId,
    path: audioPath,
    audioPath,
    text,
    audioText: text,
    source: "manifest-human-recording",
    audioSource: "manifest-human-recording",
    authorized: true,
    audioAuthorized: true,
    humanRecorded: true
  };
}
const escapeHtml = value => String(value ?? "").replace(/[&<>'"]/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[character]));
const readJson = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback)); } catch { return fallback; } };
const writeJson = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* safe anonymous fallback */ } };
const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
const activityCatalog = () => (window.KUAA_GENERAL_ACTIVITY_DATA?.activities || []).map(activity => ({ ...activity, conceptId: activity.conceptId || activity.conceptIds?.[0] || "" }));

function retestAuthorityFingerprint({ sourceActivityId, conceptId, learningObjectiveId, uiLocale, activityType, correctAnswer, acceptedAnswers } = {}) {
  if (![sourceActivityId, conceptId, learningObjectiveId, activityType, correctAnswer]
    .every(value => typeof value === "string" && value.trim() === value && value)
    || !LANGUAGES.has(uiLocale)
    || !Array.isArray(acceptedAnswers) || !acceptedAnswers.length
    || acceptedAnswers.some(value => typeof value !== "string" || !value || value.trim() !== value)) return "";
  try {
    return createActivityFingerprint({
      conceptId,
      type: `retest-authority-${activityType}`,
      prompt: sourceActivityId,
      instruction: learningObjectiveId,
      contextText: uiLocale,
      options: acceptedAnswers.map((answer, index) => ({ id: `approved-${index + 1}`, label: answer })),
      correctAnswer
    }, { uiLocale });
  } catch { return ""; }
}

function pendingRetest() {
  try { localStorage.removeItem(LEGACY_PENDING_RETEST_KEY); } catch { /* discard unsafe legacy state */ }
  const value = readJson(PENDING_RETEST_KEY, null);
  const bridgeFingerprints = value?.bridgeFingerprints;
  const storedActivity = value?.plan?.activities?.[0];
  const storedConceptIds = storedActivity?.conceptIds;
  const approvedAnswers = value?.approvedAnswers;
  const activityAnswers = storedActivity?.acceptedAnswers;
  const canonicalString = candidate => typeof candidate === "string"
    && Boolean(candidate) && candidate.trim() === candidate;
  const exactStringSequence = (left, right) => Array.isArray(left) && Array.isArray(right)
    && left.length === right.length
    && left.every((item, index) => canonicalString(item) && item === right[index]);
  let recomputedFingerprint = "";
  try {
    recomputedFingerprint = storedActivity && LANGUAGES.has(value?.uiLocale)
      ? createActivityFingerprint(storedActivity, { uiLocale: value.uiLocale })
      : "";
  } catch { /* malformed persisted activity stays invalid */ }
  const recomputedAuthorityFingerprint = retestAuthorityFingerprint({
    sourceActivityId: value?.sourceActivityId,
    conceptId: value?.conceptId,
    learningObjectiveId: value?.learningObjectiveId,
    uiLocale: value?.uiLocale,
    activityType: storedActivity?.activityType || storedActivity?.type,
    correctAnswer: storedActivity?.correctAnswer,
    acceptedAnswers: approvedAnswers
  });
  const valid = value?.version === PENDING_RETEST_VERSION
    && canonicalString(value.sourceActivityId)
    && canonicalString(value.sourceFingerprint)
    && canonicalString(value.conceptId)
    && canonicalString(value.learningObjectiveId)
    && LANGUAGES.has(value.uiLocale)
    && typeof value.createdAt === "string" && Number.isFinite(Date.parse(value.createdAt))
    && value.minimumBridgeActivities === MINIMUM_BRIDGE_ACTIVITIES
    && Array.isArray(bridgeFingerprints)
    && bridgeFingerprints.every(canonicalString)
    && new Set(bridgeFingerprints).size === bridgeFingerprints.length
    && value.plan && typeof value.plan === "object"
    && canonicalString(value.plan.planId)
    && value.plan.conceptId === value.conceptId
    && Array.isArray(value.plan.activities) && value.plan.activities.length === 1
    && storedActivity?.conceptId === value.conceptId
    && exactStringSequence(storedConceptIds, [value.conceptId])
    && storedActivity?.learningObjectiveId === value.learningObjectiveId
    && storedActivity?.lessonContext?.sourceActivityId === value.sourceActivityId
    && canonicalString(storedActivity?.fingerprint)
    && value.activityFingerprint === storedActivity.fingerprint
    && storedActivity.fingerprint === recomputedFingerprint
    && canonicalString(value.authorityFingerprint)
    && value.authorityFingerprint === recomputedAuthorityFingerprint
    && exactStringSequence(approvedAnswers, activityAnswers);
  if (!valid) {
    writePendingRetest(null);
    return null;
  }
  return value;
}

function writePendingRetest(value) {
  if (!value) {
    try { localStorage.removeItem(PENDING_RETEST_KEY); } catch { /* safe anonymous fallback */ }
    return;
  }
  writeJson(PENDING_RETEST_KEY, value);
}

function semanticPairsForObjective(context) {
  const expected = localize(context.correctAnswer, context.uiLocale).normalize("NFC").trim().toLocaleLowerCase();
  const seenLeft = new Set();
  const seenRight = new Set();
  const pairs = activityCatalog()
    .filter(activity => activity.learningObjectiveId === context.learningObjectiveId
      && activity.semanticPair?.adaptiveReuseAuthorized === true
      && activity.semanticPair?.target
      && activity.semanticPair?.meaning)
    .map((activity, index) => ({
      id: `lesson-pair-${index + 1}`,
      left: localize(activity.semanticPair.target, context.uiLocale).trim(),
      right: localize(activity.semanticPair.meaning, context.uiLocale),
      sourceActivityId: activity.id,
      authorized: true
    }))
    .filter(pair => {
      const left = pair.left.normalize("NFC").trim().toLocaleLowerCase();
      const right = pair.right.normalize("NFC").trim().toLocaleLowerCase();
      if (!left || !right || left === right || seenLeft.has(left) || seenRight.has(right)) return false;
      seenLeft.add(left);
      seenRight.add(right);
      return true;
    });
  const targetsExpected = pair => [pair.left, pair.right]
    .some(value => String(value).normalize("NFC").trim().toLocaleLowerCase() === expected);
  const requiredPair = expected ? pairs.find(targetsExpected) : null;
  if (expected && !requiredPair) return [];
  const limited = pairs.slice(0, 5);
  if (requiredPair && !limited.includes(requiredPair)) limited.splice(Math.max(0, limited.length - 1), 1, requiredPair);
  return limited;
}

function buildSpacedRetestPlan(context) {
  const pairs = semanticPairsForObjective(context);
  const copy = COPY[context.uiLocale] || COPY.es;
  const approvedCorrectAnswer = context.approvedActivityMaterial?.correctAnswer;
  const rawAcceptedAnswers = context.approvedActivityMaterial?.acceptedAnswers;
  if (typeof approvedCorrectAnswer !== "string" || typeof context.correctAnswer !== "string"
    || !Array.isArray(rawAcceptedAnswers)
    || rawAcceptedAnswers.some(value => typeof value !== "string" || !value.trim())) return null;
  const correctAnswer = approvedCorrectAnswer.trim();
  const contextAnswer = context.correctAnswer.normalize("NFC").trim();
  const acceptedAnswers = [...new Set(rawAcceptedAnswers.map(value => value.trim()))];
  if (!correctAnswer || correctAnswer.normalize("NFC") !== contextAnswer
    || !acceptedAnswers.includes(correctAnswer)) return null;
  const activityDefinition = pairs.length >= 3 ? {
    id: `spaced-match-${context.learningObjectiveId}-${Date.now()}`,
    type: ACTIVITY_TYPES.ARROW_MATCH,
    activityType: ACTIVITY_TYPES.ARROW_MATCH,
    conceptId: context.conceptId,
    conceptIds: [context.conceptId],
    learningObjectiveId: context.learningObjectiveId,
    skill: "comprehension",
    difficulty: context.difficulty,
    instruction: copy.matchInstruction,
    prompt: copy.match,
    contextText: "",
    pairs: pairs.map(({ id, left, right, sourceActivityId }) => ({ id, left, right, sourceActivityId, authorized: true })),
    answer: correctAnswer,
    correctAnswer,
    acceptedAnswers,
    lexemeIds: context.lexemeIds,
    grammarRuleIds: context.grammarRuleIds,
    requiresStudentResponse: true,
    helpLevel: 0,
    answerExposure: "HIDDEN",
    hints: [],
    explanation: "",
    cognitiveDemand: "DISCRIMINATION",
    reasonCode: "JUSTIFIED_INTERLEAVED_RETRIEVAL",
    independentRetest: true,
    spacedRetest: true,
    lessonContext: {
      // La recuperación espaciada mezcla varios conceptos. No revelar en la UI
      // cuál fue la pregunta fallada ni presentarla como un refuerzo técnico.
      sourcePrompt: copy.match,
      sourceInstruction: copy.matchInstruction,
      sourceAnswer: correctAnswer,
      visibleContext: "",
      sourceActivityId: context.activity?.id || ""
    }
  } : {
    id: `spaced-recall-${context.learningObjectiveId}-${Date.now()}`,
    type: ACTIVITY_TYPES.INDEPENDENT_RECALL,
    activityType: ACTIVITY_TYPES.INDEPENDENT_RECALL,
    conceptId: context.conceptId,
    conceptIds: [context.conceptId],
    learningObjectiveId: context.learningObjectiveId,
    skill: context.currentSkill || "vocabulary",
    difficulty: context.difficulty,
    instruction: copy.recall,
    prompt: copy.recall,
    contextText: "",
    answer: correctAnswer,
    correctAnswer,
    acceptedAnswers,
    lexemeIds: context.lexemeIds,
    grammarRuleIds: context.grammarRuleIds,
    requiresStudentResponse: true,
    helpLevel: 0,
    answerExposure: "HIDDEN",
    hints: [],
    explanation: "",
    cognitiveDemand: "RECALL",
    reasonCode: "JUSTIFIED_INDEPENDENT_RETEST",
    independentRetest: true,
    spacedRetest: true,
    lessonContext: {
      sourcePrompt: copy.recall,
      sourceInstruction: copy.recall,
      sourceAnswer: correctAnswer,
      visibleContext: "",
      sourceActivityId: context.activity?.id || ""
    }
  };
  if (detectAnswerLeakage(activityDefinition, { uiLocale: context.uiLocale }).leaked) return null;
  const activity = normalizeRenderableActivity(activityDefinition, context);
  if (detectAnswerLeakage(activity, { uiLocale: context.uiLocale }).leaked) return null;
  if (!validateCatalogActivity(activity, { uiLocale: context.uiLocale }).valid) return null;
  activity.fingerprint = createActivityFingerprint(activity, { uiLocale: context.uiLocale });
  return {
    planVersion: "NALVI-TUTOR-1",
    planId: `spaced-${context.conceptId}-${Date.now()}`,
    conceptId: context.conceptId,
    linguisticMode: "LESSON_BOUNDED",
    diagnosis: { errorType: "RECALL_FAILURE", likelyDifficulty: "delayed-retrieval", confidence: 1, prerequisiteGap: null, skillAffected: context.currentSkill },
    pedagogicalGoal: pairs.length >= 3
      ? "Revisit the failed concept after intervening practice, embedded among other documented expressions."
      : "Revisit the failed concept independently after intervening practice.",
    strategy: { primaryStrategy: "DELAYED_RETEST", secondaryStrategy: "CHANGE_MODALITY", reasonCode: `spaced-after-${MINIMUM_BRIDGE_ACTIVITIES}-activities` },
    studentFeedback: { locale: context.uiLocale, shortMessage: copy.wrong },
    activities: [activity],
    progressionPolicy: { onIncorrect: "BLOCK_AND_INTERVENE", onGuidedCorrect: "CONTINUE_PRACTICE", requiresIndependentRetest: true, maxInterventionsBeforeDefer: 4 },
    fallbackPolicy: { strategy: pairs.length >= 3 ? "LESSON_MATCHING" : "INDEPENDENT_RECALL", reason: "SPACED_INTERLEAVING" },
    validationMetadata: { sourceIds: [], knowledgeIds: context.knowledgeIds, claimedRiskLevel: "GREEN", lessonBounded: true }
  };
}

function scheduleSpacedRetest(context, plan) {
  if (!Array.isArray(plan?.activities) || plan.activities.length !== 1) return false;
  const activity = plan.activities[0];
  if (!Array.isArray(activity?.acceptedAnswers) || !activity.fingerprint) return false;
  const authorityFingerprint = retestAuthorityFingerprint({
    sourceActivityId: context.activity?.id || "",
    conceptId: context.conceptId,
    learningObjectiveId: context.learningObjectiveId,
    uiLocale: context.uiLocale,
    activityType: activity.activityType || activity.type,
    correctAnswer: activity.correctAnswer,
    acceptedAnswers: activity.acceptedAnswers
  });
  if (!authorityFingerprint) return false;
  writePendingRetest({
    version: PENDING_RETEST_VERSION,
    sourceActivityId: context.activity?.id || "",
    sourceFingerprint: context.previousActivityFingerprint,
    conceptId: context.conceptId,
    learningObjectiveId: context.learningObjectiveId,
    uiLocale: context.uiLocale,
    bridgeFingerprints: [],
    minimumBridgeActivities: MINIMUM_BRIDGE_ACTIVITIES,
    approvedAnswers: [...activity.acceptedAnswers],
    activityFingerprint: activity.fingerprint,
    authorityFingerprint,
    createdAt: new Date().toISOString(),
    plan
  });
  remember(context, { ...plan, activities: [] });
  return true;
}

function noteBridgeActivity(activity, language = document.documentElement.lang) {
  const pending = pendingRetest();
  if (!pending || !activity?.id || activity.id === pending.sourceActivityId || activity.spacedRetest || activity.adaptivePlanId) return false;
  if (activity.learningObjectiveId && pending.learningObjectiveId && activity.learningObjectiveId !== pending.learningObjectiveId) return false;
  const fingerprint = createActivityFingerprint(activity, { uiLocale: locale(language) });
  if (!fingerprint || pending.bridgeFingerprints.includes(fingerprint)) return false;
  pending.bridgeFingerprints.push(fingerprint);
  pending.lastBridgeAt = new Date().toISOString();
  writePendingRetest(pending);
  return true;
}

function consumeDueRetest(targetSelector = "#lessonBody", options = {}) {
  const pending = pendingRetest();
  const force = options.force === true;
  if (!pending || (!force && pending.bridgeFingerprints.length < MINIMUM_BRIDGE_ACTIVITIES)) return false;
  const storedActivity = pending.plan.activities[0];
  const storedType = storedActivity?.activityType || storedActivity?.type;
  const language = locale(document.documentElement.lang || pending.uiLocale);
  const correctAnswer = typeof storedActivity?.correctAnswer === "string" ? storedActivity.correctAnswer.trim() : "";
  const acceptedAnswers = storedActivity?.acceptedAnswers;
  const sourceMatches = activityCatalog().filter(activity => activity.id === pending.sourceActivityId);
  const sourceActivity = sourceMatches.length === 1 ? sourceMatches[0] : null;
  const sourceConceptId = sourceActivity?.conceptId || sourceActivity?.conceptIds?.[0] || "";
  const sourceCorrectAnswer = sourceActivity
    ? (localize(sourceActivity.lessonContext?.sourceAnswer, language).trim() || answerFor(sourceActivity, language).trim())
    : "";
  const sourceOptions = sourceActivity ? approvedOptions(sourceActivity, language) : [];
  const sourceAcceptedAnswers = sourceActivity
    ? approvedAnswerList(sourceActivity, sourceOptions, sourceCorrectAnswer, language)
    : [];
  let sourceFingerprint = "";
  try {
    sourceFingerprint = sourceActivity ? createActivityFingerprint(sourceActivity, { uiLocale: language }) : "";
  } catch { /* malformed source authority stays invalid */ }
  const exactSequence = (left, right) => Array.isArray(left) && Array.isArray(right)
    && left.length === right.length && left.every((value, index) => value === right[index]);
  const sourcePairs = semanticPairsForObjective({
    correctAnswer: sourceCorrectAnswer,
    learningObjectiveId: pending.learningObjectiveId,
    uiLocale: language
  });
  const expectedType = sourcePairs.length >= 3 ? ACTIVITY_TYPES.ARROW_MATCH : ACTIVITY_TYPES.INDEPENDENT_RECALL;
  const copy = COPY[language] || COPY.es;
  const expectedPrompt = expectedType === ACTIVITY_TYPES.ARROW_MATCH ? copy.match : copy.recall;
  const expectedInstruction = expectedType === ACTIVITY_TYPES.ARROW_MATCH ? copy.matchInstruction : copy.recall;
  const expectedPairs = expectedType === ACTIVITY_TYPES.ARROW_MATCH
    ? sourcePairs.map(({ id, left, right, sourceActivityId }) => ({ id, left, right, sourceActivityId, authorized: true }))
    : [];
  const sourceAuthorityFingerprint = retestAuthorityFingerprint({
    sourceActivityId: sourceActivity?.id,
    conceptId: sourceConceptId,
    learningObjectiveId: sourceActivity?.learningObjectiveId,
    uiLocale: language,
    activityType: expectedType,
    correctAnswer: sourceCorrectAnswer,
    acceptedAnswers: sourceAcceptedAnswers
  });
  const sourceAuthorityIsTrusted = Boolean(sourceActivity
    && sourceActivity.id === pending.sourceActivityId
    && sourceConceptId === pending.conceptId
    && sourceActivity.learningObjectiveId === pending.learningObjectiveId
    && sourceFingerprint === pending.sourceFingerprint
    && sourceCorrectAnswer === correctAnswer
    && exactSequence(sourceAcceptedAnswers, pending.approvedAnswers)
    && exactSequence(sourceAcceptedAnswers, acceptedAnswers)
    && sourceAuthorityFingerprint
    && sourceAuthorityFingerprint === pending.authorityFingerprint);
  const activityMatchesRetestAuthority = activity => {
    const activityType = activity?.activityType || activity?.type;
    const pairsAreAuthorized = activityType === ACTIVITY_TYPES.ARROW_MATCH
      ? Array.isArray(activity?.pairs) && JSON.stringify(activity.pairs) === JSON.stringify(expectedPairs)
      : (!hasOwn(activity || {}, "pairs") || (Array.isArray(activity.pairs) && activity.pairs.length === 0));
    const noUnapprovedScoringAliases = ["approvedEquivalents", "approvedVariants"]
      .every(key => !hasOwn(activity || {}, key)
        || (Array.isArray(activity[key]) && activity[key].length === 0))
      && !hasOwn(activity || {}, "allowPendingReview");
    const optionsAreEmpty = !hasOwn(activity || {}, "options")
      || (Array.isArray(activity.options) && activity.options.length === 0);
    return activityType === expectedType
      && activity?.conceptId === pending.conceptId
      && exactSequence(activity?.conceptIds, [pending.conceptId])
      && activity?.learningObjectiveId === pending.learningObjectiveId
      && activity?.lessonContext?.sourceActivityId === pending.sourceActivityId
      && activity?.prompt === expectedPrompt
      && activity?.instruction === expectedInstruction
      && activity?.contextText === ""
      && (!hasOwn(activity || {}, "scenario") || activity.scenario === "")
      && activity?.lessonContext?.sourcePrompt === expectedPrompt
      && activity?.lessonContext?.sourceInstruction === expectedInstruction
      && activity?.lessonContext?.sourceAnswer === correctAnswer
      && activity?.lessonContext?.visibleContext === ""
      && optionsAreEmpty
      && (!hasOwn(activity || {}, "correctOptionId") || activity.correctOptionId === "")
      && pairsAreAuthorized
      && noUnapprovedScoringAliases;
  };
  const leakageProbe = activity => ({
    ...activity,
    prompt: [activity?.prompt, activity?.lessonContext?.sourcePrompt],
    instruction: [activity?.instruction, activity?.lessonContext?.sourceInstruction],
    contextText: [activity?.contextText, activity?.scenario, activity?.lessonContext?.visibleContext]
  });
  const storedActivityIsTrusted = sourceAuthorityIsTrusted
    && activityMatchesRetestAuthority(storedActivity)
    && typeof storedActivity?.id === "string" && Boolean(storedActivity.id.trim())
    && storedActivity.requiresStudentResponse === true
    && storedActivity.independentRetest === true
    && storedActivity.spacedRetest === true
    && correctAnswer
    && typeof storedActivity.answer === "string" && storedActivity.answer.trim() === correctAnswer
    && Array.isArray(acceptedAnswers) && acceptedAnswers.length > 0
    && acceptedAnswers.every(answer => typeof answer === "string" && Boolean(answer.trim()))
    && acceptedAnswers.includes(correctAnswer)
    && Number(storedActivity.helpLevel) === 0
    && Array.isArray(storedActivity.hints) && storedActivity.hints.length === 0
    && storedActivity.explanation === ""
    && storedActivity.answerExposure === "HIDDEN"
    && !detectAnswerLeakage(leakageProbe(storedActivity), { uiLocale: pending.uiLocale }).leaked
    && validateCatalogActivity(storedActivity, { uiLocale: pending.uiLocale }).valid;
  if (!storedActivityIsTrusted) {
    writePendingRetest(null);
    console.warn("NALVI_UNSAFE_PENDING_RETEST_DISCARDED", pending.sourceActivityId);
    return false;
  }
  const target = typeof targetSelector === "string" ? document.querySelector(targetSelector) : targetSelector;
  if (!target) return false;
  const context = { uiLocale: language, correctAnswer, activity: storedActivity };
  const normalizedPlan = normalizePlanForRenderer(pending.plan, context);
  const normalizedActivity = normalizedPlan.activities[0];
  const independentActivity = normalizedActivity ? {
    ...normalizedActivity,
    independentRetest: true,
    spacedRetest: true,
    evidenceMode: "independent",
    nalviGuided: false,
    helpLevel: 0,
    hints: [],
    explanation: "",
    answerExposure: "HIDDEN"
  } : null;
  const finalActivityIsTrusted = Boolean(sourceAuthorityIsTrusted
    && independentActivity
    && activityMatchesRetestAuthority(independentActivity)
    && !detectAnswerLeakage(leakageProbe(independentActivity), { uiLocale: language }).leaked
    && validateCatalogActivity(independentActivity, { uiLocale: language }).valid);
  if (!finalActivityIsTrusted) {
    writePendingRetest(null);
    console.warn("NALVI_UNSAFE_NORMALIZED_RETEST_DISCARDED", pending.sourceActivityId);
    return false;
  }
  const plan = { ...normalizedPlan, activities: [independentActivity] };
  const candidateId = String(plan.activities[0]?.id || "");
  const candidateFingerprint = plan.activities[0]?.fingerprint || createActivityFingerprint(plan.activities[0], { uiLocale: language });
  const recentFingerprints = history().slice(-5).map(item => item.fingerprint).filter(Boolean);
  if (!plan.activities.length || (candidateId && renderedActivityIds.has(candidateId)) || (candidateFingerprint && recentFingerprints.includes(candidateFingerprint))) {
    // Una recuperación ya practicada no puede volver a secuestrar el botón
    // Siguiente. La evidencia existente seguirá siendo evaluada por la compuerta
    // central de progreso; si todavía no basta, la práctica normal se reinicia.
    writePendingRetest(null);
    console.info("[NALVI] STALE_RETEST_DISCARDED", {
      sourceActivityId: pending.sourceActivityId,
      reason: !plan.activities.length ? "EMPTY_PLAN" : renderedActivityIds.has(candidateId) ? "ALREADY_RENDERED_ACTIVITY" : "RECENT_FINGERPRINT"
    });
    return false;
  }
  const rendered = renderSequenceActivity(target, {
    plan,
    language,
    index: 0,
    usedAI: false,
    sourceActivityId: pending.sourceActivityId,
    spacedRetest: true
  }, 0);
  if (!rendered) {
    writePendingRetest(null);
    console.warn("NALVI_SPACED_RETEST_RENDER_FAILED", pending.sourceActivityId);
    return false;
  }
  writePendingRetest(null);
  remember({
    conceptId: pending.conceptId,
    previousActivityFingerprint: pending.sourceFingerprint,
    activityType: "spaced-retrieval",
    uiLocale: language
  }, plan);
  window.dispatchEvent(new CustomEvent("nalvi:adaptive-plan-ready", { detail: { plan, usedAI: false, spacedRetest: true } }));
  return true;
}

function answerFor(activity, language) {
  if (activity.correctOptionId != null) {
    const option = (activity.options || []).find(item => String(item.id) === String(activity.correctOptionId));
    const answer = localize(option?.label ?? option?.text ?? option?.value, language);
    if (answer) return answer;
  }
  if (Array.isArray(activity.acceptedAnswers)) {
    const answer = localize(activity.acceptedAnswers.find(value => localize(value, language).trim()), language);
    if (answer) return answer;
  }
  if (Array.isArray(activity.correctOrder)) return activity.correctOrder.join(" ");
  return localize(activity.correctAnswer ?? activity.answer, language);
}

function history() {
  const persisted = readJson(HISTORY_KEY, []).filter(item => item?.fingerprint);
  const combined = [...persisted, ...sessionHistory].filter((item, index, items) =>
    items.findIndex(candidate => candidate.fingerprint === item.fingerprint) === index);
  sessionHistory = combined.slice(-32);
  return sessionHistory;
}
function nextAttempt(activity) {
  const attempts = readJson(ATTEMPT_KEY, {}), key = activity.conceptId || activity.conceptIds?.[0] || activity.id || "activity";
  const now = Date.now(), stored = attempts[key];
  const previous = stored && typeof stored === "object" && now - Number(stored.updatedAt || 0) <= ATTEMPT_TTL_MS
    ? Math.max(0, Number(stored.count) || 0)
    : 0;
  const count = Math.min(12, previous + 1);
  attempts[key] = { count, updatedAt: now };
  writeJson(ATTEMPT_KEY, attempts); return count;
}

function normalizeRenderableActivity(activity = {}, context) {
  const language = context.uiLocale, type = activity.activityType || activity.type || ACTIVITY_TYPES.INDEPENDENT_RECALL;
  const canonicalAudio = type === ACTIVITY_TYPES.AUDIO_SELECT
    ? canonicalRenderableAudio(activity, language)
    : { ...CLOSED_AUDIO };
  const correctAnswer = localize(activity.correctAnswer || activity.answer || context.correctAnswer, language);
  const sourcePrompt = localize(activity.lessonContext?.sourcePrompt || context.activity?.lessonContext?.sourcePrompt || context.activity?.prompt || context.activity?.instruction, language).trim();
  const sourceInstruction = localize(activity.lessonContext?.sourceInstruction || context.activity?.lessonContext?.sourceInstruction || context.activity?.instruction, language).trim();
  const options = (activity.options || []).map((option, index) => {
    const label = localize(option?.label ?? option?.text ?? option?.value ?? option, language);
    return { ...option, id: String(option?.id ?? `option-${index}`), label, value: localize(option?.value ?? option?.text ?? option?.label ?? option, language) };
  }).filter(option => option.label);
  const correct = options.find(option => String(option.id) === String(activity.correctOptionId) || option.value.normalize("NFC").trim().toLocaleLowerCase() === correctAnswer.normalize("NFC").trim().toLocaleLowerCase());
  const tiles = (activity.tiles || activity.tokens || []).map((token, index) => ({ ...token, id: String(token?.id ?? index), text: localize(token?.text ?? token?.label ?? token?.value ?? token, language), label: localize(token?.label ?? token?.text ?? token?.value ?? token, language) }));
  const tokens = tiles;
  const template = localize(activity.template, language);
  const {
    authorizedAudio: _discardedAuthorizedAudio,
    audio: _discardedAudio,
    recordingId: _discardedRecordingId,
    path: _discardedPath,
    text: _discardedText,
    source: _discardedSource,
    authorized: _discardedAuthorized,
    ...activityWithoutAudioAliases
  } = activity;
  const media = activity.media?.type === "audio" ? null : activity.media;
  return {
    ...activityWithoutAudioAliases, type, activityType: type, options, tokens, tiles, template,
    correctOptionId: activity.correctOptionId ?? correct?.id ?? "",
    acceptedAnswers: activity.acceptedAnswers?.length ? activity.acceptedAnswers : correctAnswer ? [correctAnswer] : [],
    answer: activity.answer || correctAnswer,
    audioId: canonicalAudio.audioId,
    audioPath: canonicalAudio.audioPath,
    audioText: canonicalAudio.audioText,
    audioAuthorized: canonicalAudio.audioAuthorized,
    humanRecorded: canonicalAudio.humanRecorded,
    audioSource: canonicalAudio.audioSource,
    media,
    image: activity.image || (activity.media?.type === "image" ? activity.media.value : ""),
    imageAlt: activity.imageAlt || activity.media?.alt || "",
    lessonContext: {
      ...(context.activity?.lessonContext || {}),
      ...(activity.lessonContext || {}),
      sourcePrompt,
      sourceInstruction,
      sourceAnswer: localize(activity.lessonContext?.sourceAnswer || context.activity?.lessonContext?.sourceAnswer || context.correctAnswer, language),
      sourceOptions: activity.lessonContext?.sourceOptions || context.activity?.lessonContext?.sourceOptions || context.activity?.options || [],
      sourceCorrectOptionId: activity.lessonContext?.sourceCorrectOptionId || context.activity?.lessonContext?.sourceCorrectOptionId || context.activity?.correctOptionId || ""
    }
  };
}

function normalizePlanForRenderer(plan, context) {
  const activities = (plan?.activities || [])
    .map(activity => normalizeRenderableActivity(activity, context))
    .filter(activity => activity.requiresStudentResponse === true)
    .filter(activity => activity.activityType !== ACTIVITY_TYPES.AUDIO_SELECT || (
      activity.audioId
      && activity.audioPath
      && activity.audioText
      && activity.audioAuthorized === true
      && activity.humanRecorded === true
      && activity.audioSource === "manifest-human-recording"
    ));
  return { ...plan, activities };
}

function isPedagogicallyClear(activity, language) {
  if (!activity) return false;
  return Boolean(localize(activity.prompt || activity.instruction || activity.lessonContext?.sourcePrompt, language).trim());
}

function targetsFailedKnowledge(activity, context) {
  if (!activity) return false;
  const expected = localize(context.correctAnswer, context.uiLocale).normalize("NFC").trim().toLocaleLowerCase();
  const candidateConcepts = [activity.conceptId, ...(activity.conceptIds || [])].filter(Boolean).map(String);
  if ((activity.sourceBoundAuthorized === true || activity.validatedAgainstApprovedMaterial === true)
    && context.conceptId
    && candidateConcepts.includes(String(context.conceptId))) return true;
  if (!expected) return Boolean(context.conceptId && candidateConcepts.includes(String(context.conceptId)));
  const candidateAnswers = [
    activity.correctAnswer,
    activity.answer,
    ...(activity.acceptedAnswers || [])
  ].map(value => localize(value, context.uiLocale).normalize("NFC").trim().toLocaleLowerCase()).filter(Boolean);
  if ((activity.activityType || activity.type) === ACTIVITY_TYPES.ARROW_MATCH) {
    return (activity.pairs || []).some(pair => [pair.left, pair.right].some(value => localize(value, context.uiLocale).normalize("NFC").trim().toLocaleLowerCase() === expected));
  }
  return candidateAnswers.includes(expected);
}
function remember(context, plan) {
  const current = history();
  if (context.previousActivityFingerprint) current.push({
    id: context.activity?.id || "",
    conceptId: context.conceptId,
    fingerprint: context.previousActivityFingerprint,
    activityType: context.activityType,
    errorType: plan.diagnosis?.errorType || plan.diagnosis || "UNKNOWN_ERROR",
    strategy: "SOURCE_ACTIVITY_FAILED",
    answerExposure: "HIDDEN",
    timestamp: new Date().toISOString()
  });
  for (const activity of plan.activities || []) current.push({ id: activity.id || "", conceptId: context.conceptId,
    fingerprint: activity.fingerprint || createActivityFingerprint(activity, { uiLocale: context.uiLocale }),
    activityType: activity.type || activity.activityType, errorType: plan.diagnosis?.errorType || plan.diagnosis || "UNKNOWN_ERROR",
    strategy: plan.strategy?.primaryStrategy || plan.strategy || "CHANGE_MODALITY", answerExposure: activity.answerExposure || "HIDDEN", timestamp: new Date().toISOString() });
  sessionHistory = current.filter((item, index, items) =>
    items.findIndex(candidate => candidate.fingerprint === item.fingerprint) === index).slice(-32);
  writeJson(HISTORY_KEY, sessionHistory);
  const exposure = readJson(EXPOSURE_KEY, []); exposure.push(...(plan.activities || []).map(activity => ({ conceptId: context.conceptId, answerExposure: activity.answerExposure || "HIDDEN", timestamp: new Date().toISOString() })));
  writeJson(EXPOSURE_KEY, exposure.slice(-32));
}

function updateStrategyEffectiveness(strategy, correct) {
  if (!strategy) return;
  const state = readJson(EFFECTIVENESS_KEY, {}), item = state[strategy] || { successes: 0, attempts: 0, score: 0.5 };
  item.attempts += 1; if (correct) item.successes += 1; item.score = item.successes / item.attempts; state[strategy] = item;
  writeJson(EFFECTIVENESS_KEY, state);
}

function professionalLocalPlan(context, localPlan, reason = "PROFESSIONAL_LOCAL_FALLBACK") {
  const errorType = localPlan?.errorType || "UNKNOWN_ERROR";
  const candidates = buildDeterministicFallbackCandidates(context, context.attemptNumber, errorType);
  const selected = selectFirstValidCandidate(candidates, { ...context, errorType });
  const activity = selected.accepted ? normalizeRenderableActivity(selected.candidate.activity, context) : null;
  const fingerprint = activity ? createActivityFingerprint(activity, { uiLocale: context.uiLocale }) : "";
  const language = context.uiLocale, copy = COPY[language] || COPY.es;
  return { ok: true, usedAI: false, mode: "fallback", reason, adaptiveInterventionPlan: {
    planVersion: "NALVI-TUTOR-1", planId: `local-${context.conceptId}-${Date.now()}`, conceptId: context.conceptId, linguisticMode: "LESSON_BOUNDED",
    diagnosis: { errorType, likelyDifficulty: "local-rule", confidence: Number(localPlan?.diagnosis?.confidence || 0), prerequisiteGap: null, skillAffected: context.currentSkill },
    pedagogicalGoal: "Continue the same concept through a different exercise.",
    strategy: { primaryStrategy: localPlan?.strategy || "CHANGE_MODALITY", secondaryStrategy: null, reasonCode: `local-attempt-${context.attemptNumber}` },
    studentFeedback: { locale: language, shortMessage: copy.wrong }, activities: activity ? [{ ...activity, fingerprint }] : [],
    progressionPolicy: { onIncorrect: "BLOCK_AND_INTERVENE", onGuidedCorrect: "CONTINUE_PRACTICE", requiresIndependentRetest: true, maxInterventionsBeforeDefer: 4 },
    fallbackPolicy: { strategy: "OFFICIAL_CATALOG_FALLBACK", reason, rejectedCandidates: selected.rejected || [] }, validationMetadata: { sourceIds: [], knowledgeIds: context.knowledgeIds, claimedRiskLevel: "GREEN", catalogVersion: catalogAudit().version }
  }};
}

async function serverPlan(context) {
  try {
    const user = window.GCA_FIREBASE_LIVE?.auth?.currentUser;
    const headers = { "Content-Type": "application/json" };
    if (user) headers.Authorization = `Bearer ${await user.getIdToken()}`;
    const response = await fetch("/api/generate-adaptive-intervention-plan", { method: "POST", credentials: "same-origin", headers, body: JSON.stringify(context) });
    if (!response.ok) throw new Error(`SERVER_${response.status}`);
    const payload = await response.json();
    if (!payload?.ok || !payload.adaptiveInterventionPlan?.activities?.length) throw new Error(payload?.reason || "INVALID_SERVER_PLAN");
    return payload;
  } catch (error) { return { ok: false, reason: String(error?.message || "SERVER_UNAVAILABLE") }; }
}

function shortFeedback(target, language, message) {
  const feedback = target.querySelector("#feedback");
  if (!feedback) return;
  feedback.className = "feedback no reaction-pop nalvi-tutor-feedback";
  feedback.textContent = message || (COPY[language] || COPY.es).wrong;
  feedback.setAttribute("aria-live", "polite");
}

function loadingState(target, language) {
  const copy = COPY[language] || COPY.es;
  target.innerHTML = `<section class="nalvi-tutor-loading" aria-live="polite"><span class="nalvi-tutor-loading__mark" aria-hidden="true"></span><p>${escapeHtml(copy.loading)}</p><i aria-hidden="true"></i></section>`;
}

function scrollToActivity(target) {
  const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
  requestAnimationFrame(() => target.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" }));
}

function renderPassiveExample(target, state, activity, index) {
  const copy = COPY[state.language] || COPY.es;
  target.innerHTML = `<section class="kuaa-activity nalvi-tutor-example" aria-live="polite"><small class="kuaa-activity-kicker"><span class="kuaa-activity-mark" aria-hidden="true"></span>${escapeHtml(copy.example)}</small><h3>${escapeHtml(activity.instruction || copy.example)}</h3><p>${escapeHtml(activity.explanation || "")}</p></section>`;
  scrollToActivity(target);
  setTimeout(() => {
    const next = index + 1;
    if (activeSequences.get(target) !== state) return;
    if (next < state.plan.activities.length) renderSequenceActivity(target, state, next);
    else finishSequence(target, state, activity);
  }, window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ? 1800 : 1500);
}

function renderSequenceActivity(target, state, index) {
  const activity = state.plan.activities[index];
  if (!activity) {
    finishSequence(target, state, null);
    return false;
  }
  state.index = index; activeSequences.set(target, state);
  if (activity.requiresStudentResponse === false) {
    renderPassiveExample(target, state, activity, index);
    return true;
  }
  const independentRetest = state.spacedRetest === true;
  const renderedActivity = {
    ...activity,
    independentRetest,
    spacedRetest: independentRetest,
    evidenceMode: independentRetest ? "independent" : "guided",
    nalviGuided: !independentRetest,
    ...(independentRetest ? { helpLevel: 0, hints: [], explanation: "", answerExposure: "HIDDEN" } : {}),
    adaptivePlanId: state.plan.planId,
    adaptivePlanIndex: index,
    adaptivePlanLength: state.plan.activities.length
  };
  let renderResult;
  try {
    renderResult = window.renderActivity(renderedActivity, {
      target,
      language: state.language,
      onAdaptiveSubmit(result, submittedActivity) {
        const detail = { activity: submittedActivity, result, progression: result.progression, uiLocale: state.language };
        if (continueSequence(detail, target)) return;
        if (result.correct === false) handleIncorrect(detail, target);
      }
    });
  } catch (error) {
    activeSequences.delete(target);
    console.warn("NALVI_TUTOR_ACTIVITY_RENDER_FAILED", String(error?.message || error));
    return false;
  }
  if (renderResult?.rendered !== true) {
    activeSequences.delete(target);
    return false;
  }
  target.dataset.nalviActiveActivityId = String(activity.id || "");
  target.dataset.nalviActiveActivityFingerprint = String(activity.fingerprint || createActivityFingerprint(activity, { uiLocale: state.language }));
  if (activity.id) {
    renderedActivityIds.add(String(activity.id));
    if (renderedActivityIds.size > 64) renderedActivityIds.delete(renderedActivityIds.values().next().value);
  }
  scrollToActivity(target);
  window.NALVI_PROGRESSION?.diagnostic?.("INTERVENTION_RENDERED", { activityId: activity.id, conceptId: activity.conceptId || activity.conceptIds?.[0], correct: false,
    strategy: state.plan.strategy?.primaryStrategy, usedAI: state.usedAI, progressionDecision: "BLOCK_AND_INTERVENE", fingerprint: activity.fingerprint || createActivityFingerprint(activity, { uiLocale: state.language }) });
  return true;
}

function finishSequence(target, state, activity) {
  activeSequences.delete(target);
  delete target.dataset.nalviActiveActivityId;
  delete target.dataset.nalviActiveActivityFingerprint;
  updateStrategyEffectiveness(state.plan.strategy?.primaryStrategy, true);
  const copy = COPY[state.language] || COPY.es;
  const excludedActivityIds = [...new Set([state.sourceActivityId, ...(state.plan.activities || []).map(item => item.id)].filter(Boolean))];
  target.innerHTML = `<div class="feedback ok nalvi-tutor-feedback" aria-live="polite">${escapeHtml(copy.complete)}</div>`;
  window.dispatchEvent(new CustomEvent("nalvi:adaptive-plan-completed", { detail: {
    planId: state.plan.planId, conceptId: activity?.conceptId || activity?.conceptIds?.[0] || state.plan.conceptId,
    sourceActivityId: state.sourceActivityId || "", completionIsMastery: false,
    independentRetestRequired: !state.spacedRetest, spacedRetestCompleted: Boolean(state.spacedRetest)
  } }));
  setTimeout(() => window.dispatchEvent(new CustomEvent("nalvi:resume-objective-practice", { detail: { courseId: "general", planId: state.plan.planId,
    conceptId: activity?.conceptId || activity?.conceptIds?.[0] || state.plan.conceptId, sourceActivityId: state.sourceActivityId || "",
    completionIsMastery: false, excludedActivityIds,
    independentRetestRequired: !state.spacedRetest, spacedRetestCompleted: Boolean(state.spacedRetest) } })), 600);
}

function approvedOptions(activity, language) {
  const options = (activity.options || []).filter(option => option?.authorized !== false).map((option, index) => ({
    id: String(option?.id ?? `approved-option-${index + 1}`),
    text: localize(option?.label ?? option?.text ?? option?.value ?? option, language),
    authorized: true
  })).filter(option => option.text);
  const expectedAnswer = localize(answerFor(activity, language), language).normalize("NFC").trim().toLocaleLowerCase();
  const correct = options.find(option => String(option.id) === String(activity.correctOptionId))
    || options.find(option => option.text.normalize("NFC").trim().toLocaleLowerCase() === expectedAnswer);
  const limited = options.slice(0, 4);
  if (correct && !limited.includes(correct)) limited.splice(Math.max(0, limited.length - 1), 1, correct);
  return limited;
}

function approvedAnswerList(activity, options, correctAnswer, language) {
  const normalizedAnswer = String(correctAnswer || "").normalize("NFC").trim().toLocaleLowerCase();
  const correctOption = options.find(option => String(option.id) === String(activity.correctOptionId))
    || options.find(option => option.text.normalize("NFC").trim().toLocaleLowerCase() === normalizedAnswer);
  return [...new Set([
    ...(Array.isArray(activity.acceptedAnswers)
      ? activity.acceptedAnswers.map(value => localize(value, language).trim())
      : []),
    correctOption?.text,
    correctAnswer
  ].filter(Boolean))].slice(0, 10);
}

function approvedDialogueForObjective(activity, language) {
  const source = [activity, ...activityCatalog().filter(candidate => candidate.learningObjectiveId === activity.learningObjectiveId)]
    .map(candidate => candidate?.adaptiveDialogue)
    .find(dialogue => dialogue?.authorized === true);
  if (!source) return { turns: [], options: [], correctOptionId: "", correctAnswer: "" };
  const turns = (source.turns || []).filter(turn => turn?.authorized === true).slice(0, 4).map((turn, index) => ({
    id: String(turn.id ?? `approved-turn-${index + 1}`),
    speaker: localize(turn.speaker || (index % 2 ? "B" : "A"), language),
    text: localize(turn.text, language),
    authorized: true
  })).filter(turn => turn.text);
  const options = (source.options || []).filter(option => option?.authorized === true).map((option, index) => ({
    id: String(option.id ?? `approved-dialogue-option-${index + 1}`),
    text: localize(option.text ?? option.label ?? option.value, language),
    authorized: true
  })).filter(option => option.text);
  const declaredCorrectAnswer = localize(source.correctAnswer, language).normalize("NFC").trim().toLocaleLowerCase();
  const correct = options.find(option => String(option.id) === String(source.correctOptionId))
    || options.find(option => option.text.normalize("NFC").trim().toLocaleLowerCase() === declaredCorrectAnswer);
  const limitedOptions = options.slice(0, 4);
  if (correct && !limitedOptions.includes(correct)) limitedOptions.splice(Math.max(0, limitedOptions.length - 1), 1, correct);
  return {
    turns,
    options: limitedOptions,
    correctOptionId: String(correct?.id || ""),
    correctAnswer: correct?.text || "",
    sourceContentId: String(source.sourceContentId || "")
  };
}

function buildApprovedActivityMaterial(activity, context, authorizedAudio) {
  const language = context.uiLocale;
  const dialogue = approvedDialogueForObjective(activity, language);
  const options = approvedOptions(activity, language);
  const directContext = activity.contextAuthorized === true
    ? { text: activity.contextText ?? activity.scenario ?? activity.lessonContext?.visibleContext ?? activity.prompt, authorized: true }
    : null;
  const contexts = [...(activity.approvedContexts || []), directContext]
    .filter(item => item?.authorized === true)
    .map(item => ({ text: localize(item.text ?? item.value, language), authorized: true }))
    .filter((item, index, all) => item.text && all.findIndex(candidate => candidate.text === item.text) === index)
    .slice(0, 4);
  const categories = (activity.adaptiveCategories || []).filter(item => item?.authorized === true).slice(0, 3).map((item, index) => ({
    id: String(item.id ?? `approved-category-${index + 1}`),
    label: localize(item.label ?? item.text, language),
    authorized: true
  })).filter(item => item.label);
  const items = (activity.adaptiveCategoryItems || []).filter(item => item?.authorized === true).slice(0, 10).map((item, index) => ({
    id: String(item.id ?? `approved-item-${index + 1}`),
    text: localize(item.text ?? item.label, language),
    categoryId: String(item.categoryId || ""),
    authorized: true
  })).filter(item => item.text && item.categoryId);
  const correctAnswer = localize(context.correctAnswer, language).trim();
  const correctOption = options.find(option => String(option.id) === String(activity.correctOptionId))
    || options.find(option => option.text.normalize("NFC").trim().toLocaleLowerCase() === correctAnswer.normalize("NFC").trim().toLocaleLowerCase());
  const acceptedAnswers = approvedAnswerList(activity, options, correctAnswer, language);
  const audioId = audioIdFrom(authorizedAudio);
  const audioPath = audioPathFrom(authorizedAudio);
  const audioText = localize(authorizedAudio?.audioText ?? authorizedAudio?.text, language).trim();
  const audio = authorizedAudio?.authorized === true
    && authorizedAudio?.audioAuthorized === true
    && authorizedAudio?.humanRecorded === true
    && authorizedAudio?.source === "manifest-human-recording"
    && audioId
    && audioPath ? {
      id: audioId,
      audioId,
      recordingId: audioId,
      path: audioPath,
      audioPath,
      text: audioText,
      audioText,
      source: "manifest-human-recording",
      audioSource: "manifest-human-recording",
      authorized: true,
      audioAuthorized: true,
      humanRecorded: true
    } : null;
  return {
    options,
    correctOptionId: String(correctOption?.id || ""),
    correctAnswer,
    acceptedAnswers,
    pairs: semanticPairsForObjective(context),
    contexts,
    categories,
    items,
    dialogue: dialogue.turns,
    dialogueOptions: dialogue.options,
    dialogueCorrectOptionId: dialogue.correctOptionId,
    dialogueCorrectAnswer: dialogue.correctAnswer,
    dialogueSourceContentId: dialogue.sourceContentId,
    audio
  };
}

async function buildContext(detail, { skipAudio = false } = {}) {
  const activity = detail.activity || {}, language = locale(detail.uiLocale || document.documentElement.lang);
  const recent = history(), conceptId = activity.conceptId || activity.conceptIds?.[0] || "GG-C-001";
  const previousFingerprint = createActivityFingerprint(activity, { uiLocale: language });
  const semanticAnswer = localize(activity.lessonContext?.sourceAnswer, language).trim() || answerFor(activity, language);
  const audioTerm = localize(activity.semanticPair?.target ?? activity.audioText ?? semanticAnswer, language).trim();
  const authorizedAudio = skipAudio ? null : await resolveApprovedAudio(activity, audioTerm, semanticAnswer);
  const attemptNumber = nextAttempt(activity);
  const context = { correct: false, conceptId, learningObjectiveId: activity.learningObjectiveId || "GG-LO-001", currentSkill: activity.skill || "vocabulary",
    activityType: activity.activityType || activity.type || "multiple-choice", difficulty: activity.difficulty || "foundation-1",
    studentAnswer: typeof detail.result?.value === "string" ? detail.result.value : JSON.stringify(detail.result?.value || ""), correctAnswer: semanticAnswer, attemptNumber,
    recentErrors: recent.filter(item => item.conceptId === conceptId).map(item => ({ conceptId, errorType: item.errorType })),
    recentActivities: recent.map(item => ({ id: item.id || "", conceptId: item.conceptId, activityType: item.activityType, fingerprint: item.fingerprint, strategy: item.strategy })),
    recentActivityFingerprints: recent.map(item => item.fingerprint), modalitiesAlreadyUsed: recent.map(item => item.activityType),
    recentInterventions: recent.map(item => ({ strategy: item.strategy, errorType: item.errorType })), hintHistory: [], retentionHistory: [],
    answerExposureHistory: readJson(EXPOSURE_KEY, []).filter(item => item.conceptId === conceptId).map(item => item.answerExposure),
    strategyEffectiveness: Object.fromEntries(Object.entries(readJson(EFFECTIVENESS_KEY, {})).map(([key, value]) => [key, Number(value.score || 0)])),
    prerequisiteGaps: [], independentRetestQueue: [], uiLocale: language, grammarRuleIds: activity.grammarRuleIds || [], lexemeIds: activity.lexemeIds || [],
    knowledgeIds: [...(activity.grammarRuleIds || []), ...(activity.lexemeIds || [])], authorizedAudio,
    activity: {
      ...activity,
      conceptId,
      audioId: authorizedAudio?.audioId || "",
      audioPath: authorizedAudio?.audioPath || "",
      audioText: authorizedAudio?.audioText || "",
      audioAuthorized: authorizedAudio?.audioAuthorized === true,
      humanRecorded: authorizedAudio?.humanRecorded === true,
      audioSource: authorizedAudio?.source || "",
      authorizedAudio
    }, availableActivities: activityCatalog(),
    previousActivityFingerprint: previousFingerprint, aiPolicy: { allowInterventionAI: true, AI_TUTOR_ON_EVERY_INCORRECT_ANSWER: true } };
  context.approvedActivityMaterial = buildApprovedActivityMaterial(activity, context, authorizedAudio);
  return context;
}

async function handleIncorrect(detail, target) {
  const language = locale(detail.uiLocale || document.documentElement.lang);
  const requestState = { id: `${Date.now()}-${Math.random()}` };
  activeSequences.delete(target);
  activeRequests.set(target, requestState);
  try {
    shortFeedback(target, language, (COPY[language] || COPY.es).wrong);
    const contextPromise = buildContext(detail).then(
      context => ({ context, error: null }),
      error => ({ context: null, error })
    );
    await sleep(750);
    if (activeRequests.get(target) !== requestState) return;
    loadingState(target, language);
    const contextResult = await contextPromise;
    if (activeRequests.get(target) !== requestState) return;
    const forceLocalFallback = !contextResult.context;
    if (contextResult.error) console.warn("NALVI_TUTOR_CONTEXT_BUILD_FALLBACK", String(contextResult.error?.message || contextResult.error));
    const context = contextResult.context || await buildContext(detail, { skipAudio: true });
    if (activeRequests.get(target) !== requestState) return;
    const shouldSpaceRetest = !forceLocalFallback && !context.activity?.adaptivePlanId && !context.activity?.spacedRetest && !pendingRetest();
    const spacedPlan = shouldSpaceRetest ? buildSpacedRetestPlan(context) : null;
    if (spacedPlan && scheduleSpacedRetest(context, spacedPlan)) {
      window.NALVI_PROGRESSION?.diagnostic?.("INTERVENTION_REQUESTED", {
        activityId: context.activity.id,
        conceptId: context.conceptId,
        correct: false,
        strategy: "DELAYED_RETEST",
        usedAI: false,
        progressionDecision: detail.progression?.decision || "BLOCK_AND_INTERVENE",
        fingerprint: context.previousActivityFingerprint,
        minimumBridgeActivities: MINIMUM_BRIDGE_ACTIVITIES
      });
    }
    let localPlan;
    try {
      localPlan = planPedagogicalIntervention(context);
    } catch (error) {
      console.warn("NALVI_TUTOR_LOCAL_PLANNER_FALLBACK", String(error?.message || error));
      localPlan = { errorType: "UNKNOWN_ERROR", strategy: "CHANGE_MODALITY", diagnosis: { confidence: 0 } };
    }
    const localResponse = professionalLocalPlan(context, localPlan, forceLocalFallback ? "CONTEXT_BUILD_FAILED_LOCAL_FALLBACK" : "PROFESSIONAL_LOCAL_FALLBACK");
    window.NALVI_PROGRESSION?.diagnostic?.("INTERVENTION_REQUESTED", { activityId: context.activity.id, conceptId: context.conceptId, correct: false,
      strategy: localPlan?.strategy || "CHANGE_MODALITY", usedAI: false, progressionDecision: detail.progression?.decision || "BLOCK_AND_INTERVENE", fingerprint: context.previousActivityFingerprint });
    const requestPromise = forceLocalFallback || context.activity?.spacedRetest ? Promise.resolve(null) : serverPlan(context);
    const winner = await Promise.race([requestPromise, sleep(1500).then(() => null)]);
    if (activeRequests.get(target) !== requestState) return;
    let response = winner?.ok ? winner : localResponse;
    response.adaptiveInterventionPlan = normalizePlanForRenderer(response.adaptiveInterventionPlan, context);
    let plan = response.adaptiveInterventionPlan;
    if (!plan.activities?.length) {
      const noAudioContext = {
        ...context,
        authorizedAudio: null,
        approvedActivityMaterial: { ...context.approvedActivityMaterial, audio: null },
        activity: {
          ...context.activity,
          audioId: "",
          audioPath: "",
          audioText: "",
          audioAuthorized: false,
          humanRecorded: false,
          audioSource: "",
          authorizedAudio: null
        }
      };
      response = professionalLocalPlan(noAudioContext, localPlan, "INVALID_AUDIO_OR_PASSIVE_PLAN_BLOCKED");
      response.adaptiveInterventionPlan = normalizePlanForRenderer(response.adaptiveInterventionPlan, noAudioContext);
      plan = response.adaptiveInterventionPlan;
    }
    if (!plan.activities?.length) throw new Error("NALVI_TUTOR_EMPTY_SAFE_FALLBACK");
    const fingerprints = plan.activities.map(activity => activity.fingerprint || createActivityFingerprint(activity, { uiLocale: context.uiLocale }));
    const sourceBoundRequired = String(context.activity?.id || "").startsWith("legacy-general-") || !(context.knowledgeIds || []).length;
    const unrelated = sourceBoundRequired && plan.activities.some(activity => activity.requiresStudentResponse !== false && !targetsFailedKnowledge(activity, context));
    if (unrelated || fingerprints.includes(context.previousActivityFingerprint) || new Set(fingerprints).size !== fingerprints.length) {
      console.warn(unrelated ? "NALVI_TUTOR_UNRELATED_ACTIVITY_BLOCKED" : "NALVI_TUTOR_DUPLICATE_BLOCKED");
      const safe = professionalLocalPlan({ ...context, attemptNumber: context.attemptNumber + 1 }, null, "DUPLICATE_BLOCKED");
      response.adaptiveInterventionPlan = normalizePlanForRenderer(safe.adaptiveInterventionPlan, context);
      plan = response.adaptiveInterventionPlan;
      if (!plan.activities?.length) throw new Error("NALVI_TUTOR_EMPTY_SAFE_FALLBACK");
    }
    if (context.attemptNumber > 4) {
      remember(context, response.adaptiveInterventionPlan);
      target.innerHTML = `<div class="feedback no nalvi-tutor-feedback" aria-live="polite">${escapeHtml((COPY[context.uiLocale] || COPY.es).deferred)}</div>`;
      setTimeout(() => window.dispatchEvent(new CustomEvent("nalvi:resume-objective-practice", { detail: { courseId: "general", planId: response.adaptiveInterventionPlan.planId,
        conceptId: context.conceptId, completionIsMastery: false, excludedActivityIds: [context.activity.id].filter(Boolean), independentRetestRequired: true,
        markWeak: true, reviewDue: true } })), 900);
      return;
    }
    remember(context, response.adaptiveInterventionPlan);
    window.dispatchEvent(new CustomEvent("nalvi:adaptive-plan-ready", { detail: { plan: response.adaptiveInterventionPlan, persistence: response.persistence, usedAI: Boolean(response.usedAI), telemetry: response.telemetry } }));
    if (!renderSequenceActivity(target, { plan: response.adaptiveInterventionPlan, language: context.uiLocale, index: 0, usedAI: Boolean(response.usedAI), sourceActivityId: context.activity.id || "" }, 0)) {
      throw new Error("NALVI_TUTOR_SAFE_FALLBACK_RENDER_FAILED");
    }
  } catch (error) {
    if (activeRequests.get(target) !== requestState) return;
    activeRequests.delete(target);
    activeSequences.delete(target);
    console.warn("NALVI_TUTOR_INTERVENTION_FALLBACK_FAILED", String(error?.message || error));
    target.innerHTML = `<div class="feedback no nalvi-tutor-feedback" aria-live="polite">${escapeHtml((COPY[language] || COPY.es).deferred)}</div>`;
  }
}

function continueSequence(detail, target) {
  const activity = detail.activity || {}, state = activeSequences.get(target);
  if (!state || !activity.adaptivePlanId || activity.adaptivePlanId !== state.plan.planId) return false;
  if (detail.result?.correct !== true) { updateStrategyEffectiveness(state.plan.strategy?.primaryStrategy, false); return false; }
  const next = Number(activity.adaptivePlanIndex ?? state.index) + 1;
  setTimeout(() => next < state.plan.activities.length ? renderSequenceActivity(target, state, next) : finishSequence(target, state, activity), 420);
  return true;
}

document.addEventListener("nalvi:activity-scored", event => {
  const target = event.target instanceof Element ? event.target : document.querySelector("#lessonBody"); if (!target) return;
  if (event.detail?.adaptiveSubmitHandled) return;
  if (continueSequence(event.detail || {}, target)) return;
  if (event.detail?.result?.correct === true) noteBridgeActivity(event.detail.activity, event.detail.uiLocale);
  if (event.detail?.result?.correct === false) handleIncorrect(event.detail, target);
});
window.addEventListener("nalvi:legacy-answer-scored", event => {
  if (event.detail?.result?.correct !== false) return;
  const target = document.querySelector(event.detail.target || "#lessonBody"); if (target) handleIncorrect(event.detail, target);
});

window.NALVI_INTERVENTION = Object.freeze({
  version: VERSION, canScoreWithoutAI, needsAdaptiveTutor, wouldAIImproveIntervention, createActivityFingerprint, planPedagogicalIntervention,
  noteBridgeActivity,
  hasPendingRetest: () => Boolean(pendingRetest()),
  pendingRetestStatus: () => {
    const value = pendingRetest();
    return value ? { sourceActivityId: value.sourceActivityId, bridgeCount: value.bridgeFingerprints.length, minimumBridgeActivities: value.minimumBridgeActivities } : null;
  },
  consumeDueRetest,
  consumePendingRetestAtBoundary: targetSelector => consumeDueRetest(targetSelector, { force: true }),
  clearLocalHistory: () => {
    sessionHistory = [];
    [HISTORY_KEY, ATTEMPT_KEY, EFFECTIVENESS_KEY, EXPOSURE_KEY, PENDING_RETEST_KEY, LEGACY_PENDING_RETEST_KEY]
      .forEach(key => localStorage.removeItem(key));
  },
  audit: () => ({ version: VERSION, automaticIntervention: true, technicalStudentUi: false, everyIncorrectRequestsTutor: true,
    immediateLocalFeedback: IMMEDIATE_LOCAL_FEEDBACK, adaptivePlanSequence: { min: 1, max: 4 }, exactRepeatBlocked: true,
    spacedRetrieval: { enabled: true, minimumBridgeActivities: MINIMUM_BRIDGE_ACTIVITIES, immediateSemanticRepeatBlocked: true },
    officialActivityCatalog: catalogAudit(),
    interfaceLanguages: [...LANGUAGES], endpoint: "/api/generate-adaptive-intervention-plan", clientApiKeyPresent: false, firestoreClientWrite: false })
});
window.NALVI_PROGRESSION?.diagnostic?.("INTERVENTION_CLIENT_READY", { version: VERSION, event: "nalvi:activity-scored" });
