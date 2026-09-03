import { applyLearningEvent, createMasteryProfile } from "../../mastery-engine/mastery-engine.mjs";
import { MASTERY_CONFIG } from "../../mastery-engine/mastery-config.mjs";
import { evaluateProgressionGate } from "../../progression-engine/progression-gate.mjs";
import { PROGRESSION_CONFIG } from "../../progression-engine/progression-config.mjs";

const VERSION = "NALVI-PRE8C-PROGRESSION-CLIENT-2";
const PROFILE_KEY = "nalvi.mastery.localProfiles.v1";
const EVENT_KEY = "nalvi.mastery.localEvents.v1";
const MAX_LOCAL_EVENTS = 80;
const supportedActivityTypes = new Set(Object.keys(MASTERY_CONFIG.activityEvidence));

const readJson = (key, fallback) => {
  try { return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback)); }
  catch { return fallback; }
};
const writeJson = (key, value) => {
  try { localStorage.setItem(key, JSON.stringify(value)); }
  catch { /* Guest/private browsing keeps the in-memory flow functional. */ }
};
const normalizeActivityType = value => {
  const type = String(value || "multiple-choice").toLowerCase();
  if (type === "guided-fill" || type === "complete") return "fill-blank";
  if (type === "choice") return "multiple-choice";
  if (type === "order" || type === "ordering") return "order-sentence";
  return supportedActivityTypes.has(type) ? type : "multiple-choice";
};
const normalizeDifficulty = value => value in MASTERY_CONFIG.difficultyEvidence ? value : "foundation-1";
const normalizeSkill = value => MASTERY_CONFIG.skillAliases?.[value] || (MASTERY_CONFIG.skills.includes(value) ? value : "vocabulary");
const localUserId = () => window.GCA_FIREBASE_LIVE?.auth?.currentUser?.uid || "guest-session";
const profileKey = (userId, conceptId) => `${userId}::${conceptId}`;

function diagnostic(type, detail = {}) {
  if (!PROGRESSION_CONFIG.diagnosticEvents.includes(type)) return;
  const safe = {
    activityId: String(detail.activityId || ""),
    conceptId: String(detail.conceptId || ""),
    correct: detail.correct === true,
    strategy: String(detail.strategy || ""),
    usedAI: Boolean(detail.usedAI),
    progressionDecision: String(detail.progressionDecision || ""),
    fingerprint: String(detail.fingerprint || "")
  };
  console.info(`[NALVI] ${type}`, safe);
  window.dispatchEvent(new CustomEvent(`nalvi:diagnostic:${type.toLowerCase()}`, { detail: safe }));
}

function readProfile(activity) {
  const userId = localUserId(), conceptId = activity.conceptId || activity.conceptIds?.[0] || "GG-C-001";
  const learningObjectiveId = activity.learningObjectiveId || "GG-LO-001";
  const profiles = readJson(PROFILE_KEY, {}), key = profileKey(userId, conceptId);
  const requiredSkills = [...new Set([...(activity.requiredSkills || []), activity.skill || "vocabulary"].map(normalizeSkill))];
  const profile = profiles[key] || createMasteryProfile({ userId, conceptId, learningObjectiveId, requiredSkills }, MASTERY_CONFIG);
  profile.requiredSkills = [...new Set([...(profile.requiredSkills || []), ...requiredSkills])];
  return { profiles, key, profile, userId, conceptId, learningObjectiveId };
}

async function persistAuthenticated(event) {
  const user = window.GCA_FIREBASE_LIVE?.auth?.currentUser;
  if (!user) return { status: "skipped", reason: "GUEST_LOCAL_ONLY" };
  try {
    const idToken = await user.getIdToken();
    const response = await fetch("/api/record-learning-attempt", {
      method: "POST",
      credentials: "same-origin",
      headers: { Authorization: `Bearer ${idToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(event)
    });
    if (!response.ok) return { status: "failed", reason: `HTTP_${response.status}` };
    return response.json();
  } catch {
    return { status: "failed", reason: "SERVER_UNAVAILABLE" };
  }
}

function evaluateActivityResult({ activity = {}, result = {}, uiLocale = "es", atObjectiveBoundary = false } = {}) {
  const resolved = readProfile(activity), activityType = normalizeActivityType(activity.type || activity.activityType);
  const adaptiveEvidenceClaimed = ["adaptivePlanId", "adaptivePlanIndex", "adaptivePlanLength", "spacedRetest", "independentRetest", "evidenceMode"]
    .some(field => Object.prototype.hasOwnProperty.call(activity, field));
  const validAdaptivePlanId = typeof activity.adaptivePlanId === "string"
    && activity.adaptivePlanId.length > 0
    && activity.adaptivePlanId === activity.adaptivePlanId.trim();
  const coherentSpacedRetest = validAdaptivePlanId
    && activity.spacedRetest === true
    && activity.independentRetest === true
    && activity.evidenceMode === "independent"
    && activity.requiresStudentResponse === true
    && activity.helpLevel === 0
    && activity.answerExposure === "HIDDEN"
    && activity.nalviGuided === false
    && Array.isArray(activity.hints)
    && activity.hints.length === 0
    && activity.explanation === ""
    && result.hintUsed !== true;
  const guided = Boolean(
    activity.evidenceMode === "guided"
    || activity.nalviGuided
    || result.hintUsed
    || Number(activity.helpLevel || 0) > 0
    || (adaptiveEvidenceClaimed && !coherentSpacedRetest)
  );
  const input = {
    userId: resolved.userId,
    conceptId: resolved.conceptId,
    learningObjectiveId: resolved.learningObjectiveId,
    activityId: String(activity.id || `${resolved.conceptId}-${activityType}`),
    activityType,
    skill: normalizeSkill(activity.skill),
    difficulty: normalizeDifficulty(activity.difficulty),
    correct: result.correct === true,
    attemptNumber: Math.max(1, Number(resolved.profile.attempts || 0) + 1),
    responseTime: Math.max(0, Number(result.responseTime || 0)),
    hintUsed: guided,
    timestamp: new Date().toISOString(),
    uiLocale: ["es", "en", "pt", "fr", "it", "de"].includes(uiLocale) ? uiLocale : "es"
  };
  const transition = applyLearningEvent(resolved.profile, input, MASTERY_CONFIG);
  resolved.profiles[resolved.key] = transition.profile;
  writeJson(PROFILE_KEY, resolved.profiles);
  const events = readJson(EVENT_KEY, []);
  events.push(transition.event);
  writeJson(EVENT_KEY, events.slice(-MAX_LOCAL_EVENTS));
  const gate = evaluateProgressionGate({ correct: input.correct, hintUsed: input.hintUsed }, {
    profile: transition.profile,
    guided,
    atObjectiveBoundary
  });
  const progression = {
    ...gate,
    profile: transition.profile,
    event: transition.event,
    guided,
    evidenceStrength: guided ? "partial" : "independent",
    persisted: persistAuthenticated({ ...input, eventId: transition.event.eventId })
  };
  diagnostic("ANSWER_EVALUATED", {
    activityId: input.activityId,
    conceptId: input.conceptId,
    correct: input.correct,
    progressionDecision: gate.decision
  });
  if (!input.correct) diagnostic("PROGRESSION_BLOCKED", {
    activityId: input.activityId,
    conceptId: input.conceptId,
    correct: false,
    progressionDecision: gate.decision
  });
  return progression;
}

function objectiveEvidenceFor(activity) {
  const resolved = readProfile(activity);
  const relevant = readJson(EVENT_KEY, []).filter(event => (
    event.userId === resolved.userId
    && event.conceptId === resolved.conceptId
    && event.learningObjectiveId === resolved.learningObjectiveId
  ));
  const independentCorrect = relevant.filter(event => event.correct === true && event.hintUsed !== true);
  const last = relevant[relevant.length - 1];
  return {
    independentCorrectEvents: independentCorrect.length,
    distinctActivityTypes: new Set(independentCorrect.map(event => event.activityType)).size,
    lastEvidenceIndependentCorrect: Boolean(last?.correct === true && last?.hintUsed !== true),
    hasPendingRetest: Boolean(window.NALVI_INTERVENTION?.hasPendingRetest?.())
  };
}

function evaluateObjectiveCompletion({ activity = {}, progression = null, objectiveEvidenceOverride = null } = {}) {
  const profile = progression?.profile || readProfile(activity).profile;
  const storedEvidence = objectiveEvidenceFor(activity);
  const override = objectiveEvidenceOverride && typeof objectiveEvidenceOverride === "object"
    ? objectiveEvidenceOverride
    : {};
  const objectiveEvidence = {
    ...storedEvidence,
    ...override,
    independentCorrectEvents: Math.max(
      Number(storedEvidence.independentCorrectEvents || 0),
      Number(override.independentCorrectEvents || 0)
    ),
    distinctActivityTypes: Math.max(
      Number(storedEvidence.distinctActivityTypes || 0),
      Number(override.distinctActivityTypes || 0)
    ),
    lastEvidenceIndependentCorrect: override.lastEvidenceIndependentCorrect === undefined
      ? storedEvidence.lastEvidenceIndependentCorrect
      : override.lastEvidenceIndependentCorrect === true,
    hasPendingRetest: override.hasPendingRetest === undefined
      ? storedEvidence.hasPendingRetest
      : override.hasPendingRetest === true
  };
  const gate = evaluateProgressionGate({ correct: true, hintUsed: Boolean(progression?.guided) }, {
    profile,
    guided: Boolean(progression?.guided),
    atObjectiveBoundary: true,
    objectiveEvidence
  });
  if (gate.decision === "COMPLETE_OBJECTIVE") diagnostic("OBJECTIVE_COMPLETED", {
    activityId: activity.id,
    conceptId: activity.conceptId || activity.conceptIds?.[0],
    correct: true,
    progressionDecision: gate.decision
  });
  return { ...gate, profile, objectiveEvidence };
}

window.NALVI_PROGRESSION = Object.freeze({
  version: VERSION,
  evaluateActivityResult,
  evaluateObjectiveCompletion,
  evaluateProgressionGate,
  diagnostic,
  getLocalEvents: () => readJson(EVENT_KEY, []),
  getLocalProfiles: () => readJson(PROFILE_KEY, {}),
  resetLocalDiagnostics: () => { localStorage.removeItem(EVENT_KEY); localStorage.removeItem(PROFILE_KEY); },
  audit: () => ({
    version: VERSION,
    singleProgressionGate: true,
    incorrectAlwaysBlocks: true,
    guidedEvidenceCannotComplete: true,
    completionRequiresMasteredOrIndependentPracticeCheckpoint: true,
    longTermMasteryStatusPreserved: true,
    serverPersistenceEndpoint: "/api/record-learning-attempt",
    firebaseClientWrites: false,
    interfaceLanguages: ["es", "en", "pt", "fr", "it", "de"]
  })
});
