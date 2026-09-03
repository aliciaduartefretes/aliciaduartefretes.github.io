import { applyLearningEvent, createMasteryProfile } from "../mastery-engine/mastery-engine.mjs";
import { MASTERY_CONFIG } from "../mastery-engine/mastery-config.mjs";
import { normalizeAnswerSurface } from "../assessment/nalvi-answer-evaluator.mjs";
import { persistMasteryTransition, readUserMasteryProfile } from "./firestore-admin-rest.mjs";

const ALLOWED_LOCALES = new Set(["es", "en", "pt", "fr", "it", "de"]);
const APPROVED_CONTENT_STATUSES = new Set(["normativeVerified", "expertVerified"]);
const ACTIVITY_TYPES = new Set(Object.keys(MASTERY_CONFIG.activityEvidence));
const DIFFICULTIES = new Set(Object.keys(MASTERY_CONFIG.difficultyEvidence));
const OPTION_GRADED_ACTIVITY_TYPES = new Set(["multiple-choice", "listening"]);
const TEXT_GRADED_ACTIVITY_TYPES = new Set(["fill-blank", "writing"]);
const PAYLOAD_FIELDS = new Set(["attemptId", "response", "uiLocale"]);
const RESPONSE_FIELDS = new Set(["optionId", "text"]);
const AUTHORITY_FIELDS = new Set([
  "status", "userId", "attemptId", "activityVersion", "issuedAt", "expiresAt", "hintUsed", "activity"
]);
const AUTHORIZED_ACTIVITY_FIELDS = new Set([
  "id", "version", "conceptId", "learningObjectiveId", "activityType", "skill", "difficulty",
  "allowedForMastery", "contentValidationStatus", "correctOptionId", "optionIds", "acceptedAnswers"
]);
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;
const strictText = (value, maximum = 160) => (
  typeof value === "string" && value === value.trim() && value.length > 0 && value.length <= maximum ? value : ""
);
const strictId = (value, maximum = 160) => {
  const normalized = strictText(value, maximum);
  return normalized && SAFE_ID.test(normalized) ? normalized : "";
};

const productionDefaultAuthority = async () => ({
  status: "denied",
  reason: "ATTEMPT_AUTHORITY_NOT_CONFIGURED"
});
const productionDefaultClaim = async () => ({
  status: "denied",
  reason: "ATTEMPT_CLAIM_NOT_CONFIGURED"
});

function validatePayload(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, reason: "INVALID_ATTEMPT_PAYLOAD" };
  if (Object.keys(raw).some(field => !PAYLOAD_FIELDS.has(field))) return { ok: false, reason: "INVALID_ATTEMPT_PAYLOAD" };
  const attemptId = strictId(raw.attemptId, 160);
  if (!attemptId || !raw.response || typeof raw.response !== "object" || Array.isArray(raw.response)) {
    return { ok: false, reason: "INVALID_ATTEMPT_PAYLOAD" };
  }
  if (Object.keys(raw.response).some(field => !RESPONSE_FIELDS.has(field))) {
    return { ok: false, reason: "INVALID_ATTEMPT_PAYLOAD" };
  }
  return { ok: true, attemptId, response: raw.response };
}

function normalizeAuthorizedAttempt(authority, { attemptId, userId, nowMs }) {
  if (authority?.status !== "authorized") return { ok: false, reason: "ATTEMPT_NOT_AUTHORIZED" };
  const activity = authority.activity;
  if (!activity || typeof activity !== "object") return { ok: false, reason: "ATTEMPT_NOT_AUTHORIZED" };
  if (
    Object.keys(authority).some(field => !AUTHORITY_FIELDS.has(field))
    || Object.keys(activity).some(field => !AUTHORIZED_ACTIVITY_FIELDS.has(field))
  ) return { ok: false, reason: "ATTEMPT_NOT_AUTHORIZED" };
  if (authority.userId !== userId || authority.attemptId !== attemptId) {
    return { ok: false, reason: "ATTEMPT_NOT_AUTHORIZED" };
  }
  if (activity.allowedForMastery !== true || !APPROVED_CONTENT_STATUSES.has(activity.contentValidationStatus)) {
    return { ok: false, reason: "ACTIVITY_NOT_APPROVED_FOR_MASTERY" };
  }

  const authorityAttemptId = strictId(authority.attemptId, 160);
  const authorityUserId = strictId(authority.userId, 160);
  const authorityActivityVersion = strictId(authority.activityVersion, 100);
  const activityId = strictId(activity.id, 140);
  const activityVersion = strictId(activity.version, 100);
  const directConceptId = strictId(activity.conceptId, 100);
  const declaredActivityType = strictId(activity.activityType, 60);
  const rawOptionIds = activity.optionIds === undefined
    ? null
    : Array.isArray(activity.optionIds)
      ? activity.optionIds.map(value => strictId(value, 100))
      : [];
  const rawAcceptedAnswers = activity.acceptedAnswers === undefined
    ? []
    : Array.isArray(activity.acceptedAnswers)
      ? activity.acceptedAnswers.map(value => typeof value === "string" && value === value.trim() && value.length > 0 ? value : "")
      : [""];
  const invalidConceptId = !directConceptId;
  const invalidActivityType = !declaredActivityType;
  const invalidOptionIds = rawOptionIds !== null && (
    !Array.isArray(activity.optionIds)
    || rawOptionIds.length < 2
    || rawOptionIds.some(value => !value)
    || rawOptionIds.length !== new Set(rawOptionIds).size
  );
  const normalizedAnswers = rawAcceptedAnswers.map(normalizeAnswerSurface);
  const invalidAnswers = rawAcceptedAnswers.some(value => !value)
    || normalizedAnswers.some(value => !value)
    || normalizedAnswers.length !== new Set(normalizedAnswers).size;
  if (
    !authorityAttemptId
    || !authorityUserId
    || !authorityActivityVersion
    || !activityId
    || !activityVersion
    || authorityActivityVersion !== activityVersion
    || invalidConceptId
    || invalidActivityType
    || invalidOptionIds
    || invalidAnswers
    || (activity.correctOptionId !== undefined && !strictId(activity.correctOptionId, 100))
  ) return { ok: false, reason: "ATTEMPT_NOT_AUTHORIZED" };

  const issuedAtText = strictText(authority.issuedAt, 40);
  const expiresAtText = strictText(authority.expiresAt, 40);
  const issuedAt = Date.parse(issuedAtText);
  const expiresAt = Date.parse(expiresAtText);
  const optionIds = rawOptionIds ?? [];
  const normalized = {
    attemptId: authorityAttemptId,
    activity: {
      id: activityId,
      version: activityVersion,
      conceptId: directConceptId,
      learningObjectiveId: strictId(activity.learningObjectiveId, 100),
      activityType: ACTIVITY_TYPES.has(declaredActivityType) ? declaredActivityType : "",
      skill: MASTERY_CONFIG.skills.includes(activity.skill) ? activity.skill : "",
      difficulty: DIFFICULTIES.has(activity.difficulty) ? activity.difficulty : "",
      correctOptionId: strictId(activity.correctOptionId, 100),
      optionIds,
      acceptedAnswers: rawAcceptedAnswers
    },
    hintUsed: authority.hintUsed,
    issuedAt,
    expiresAt
  };
  const required = [
    normalized.attemptId,
    normalized.activity.id,
    normalized.activity.version,
    normalized.activity.conceptId,
    normalized.activity.learningObjectiveId,
    normalized.activity.activityType,
    normalized.activity.skill,
    normalized.activity.difficulty
  ];
  if (
    required.some(value => !value)
    || typeof normalized.hintUsed !== "boolean"
    || !Number.isFinite(issuedAt)
    || !Number.isFinite(expiresAt)
    || new Date(issuedAt).toISOString() !== issuedAtText
    || new Date(expiresAt).toISOString() !== expiresAtText
    || issuedAt > nowMs
    || expiresAt <= nowMs
  ) return { ok: false, reason: "ATTEMPT_NOT_AUTHORIZED" };

  const optionScored = normalized.activity.correctOptionId
    && normalized.activity.optionIds.length >= 2
    && new Set(normalized.activity.optionIds).size === normalized.activity.optionIds.length
    && normalized.activity.optionIds.includes(normalized.activity.correctOptionId);
  const textScored = normalized.activity.acceptedAnswers.length > 0;
  const choiceFieldsDeclared = activity.correctOptionId !== undefined
    || activity.optionIds !== undefined;
  if (choiceFieldsDeclared && (!optionScored || textScored)) {
    return { ok: false, reason: "ATTEMPT_NOT_AUTHORIZED" };
  }
  if (!choiceFieldsDeclared && !textScored) {
    return { ok: false, reason: "UNSUPPORTED_SERVER_SCORING" };
  }
  if (
    (optionScored && !OPTION_GRADED_ACTIVITY_TYPES.has(normalized.activity.activityType))
    || (textScored && !TEXT_GRADED_ACTIVITY_TYPES.has(normalized.activity.activityType))
  ) return { ok: false, reason: "UNSUPPORTED_SERVER_SCORING" };
  return { ok: true, authorized: normalized };
}

function deriveCorrect(response, activity) {
  if (activity.correctOptionId) {
    if (Object.keys(response).some(field => field !== "optionId")) {
      return { ok: false, reason: "INVALID_ATTEMPT_RESPONSE" };
    }
    const optionId = strictId(response.optionId, 100);
    if (!optionId || !activity.optionIds.includes(optionId)) {
      return { ok: false, reason: "INVALID_ATTEMPT_RESPONSE" };
    }
    return { ok: true, correct: optionId === activity.correctOptionId };
  }
  if (Object.keys(response).some(field => field !== "text") || typeof response.text !== "string" || !response.text.trim()) {
    return { ok: false, reason: "INVALID_ATTEMPT_RESPONSE" };
  }
  const submitted = normalizeAnswerSurface(response.text);
  return {
    ok: true,
    correct: activity.acceptedAnswers.some(answer => normalizeAnswerSurface(answer) === submitted)
  };
}

function masteryInput(raw, authorized, correct, userId, nowMs) {
  return {
    userId,
    conceptId: authorized.activity.conceptId,
    learningObjectiveId: authorized.activity.learningObjectiveId,
    activityId: authorized.activity.id,
    activityType: authorized.activity.activityType,
    skill: authorized.activity.skill,
    difficulty: authorized.activity.difficulty,
    correct,
    responseTime: Math.min(3_600_000, Math.max(0, nowMs - authorized.issuedAt)),
    hintUsed: authorized.hintUsed,
    timestamp: new Date(nowMs).toISOString(),
    uiLocale: ALLOWED_LOCALES.has(raw.uiLocale) ? raw.uiLocale : "es"
  };
}

export function createMasteryAttemptService({
  readProfile = readUserMasteryProfile,
  persistTransition = persistMasteryTransition,
  resolveAuthorizedAttempt = productionDefaultAuthority,
  claimAuthorizedAttempt = productionDefaultClaim,
  now = () => Date.now()
} = {}) {
  async function recordAttempt(raw = {}, { verifiedUserId = "" } = {}) {
    if (!verifiedUserId) return { ok: false, reason: "AUTH_REQUIRED" };
    const payload = validatePayload(raw);
    if (!payload.ok) return payload;
    const nowMs = Number(now());
    if (!Number.isFinite(nowMs)) return { ok: false, reason: "ATTEMPT_NOT_AUTHORIZED" };

    let authority;
    try {
      authority = await resolveAuthorizedAttempt({ userId: verifiedUserId, attemptId: payload.attemptId });
    } catch {
      return { ok: false, reason: "ATTEMPT_NOT_AUTHORIZED" };
    }
    const normalizedAuthority = normalizeAuthorizedAttempt(authority, {
      attemptId: payload.attemptId,
      userId: verifiedUserId,
      nowMs
    });
    if (!normalizedAuthority.ok) return normalizedAuthority;
    const authorized = normalizedAuthority.authorized;
    const evaluation = deriveCorrect(payload.response, authorized.activity);
    if (!evaluation.ok) return evaluation;

    let claim;
    try {
      // The authority layer must implement this as an atomic, one-time claim.
      claim = await claimAuthorizedAttempt({
        userId: verifiedUserId,
        attemptId: authorized.attemptId,
        activityId: authorized.activity.id,
        activityVersion: authorized.activity.version
      });
    } catch {
      return { ok: false, reason: "ATTEMPT_CLAIM_FAILED" };
    }
    if (claim?.status !== "claimed") {
      return { ok: false, reason: claim?.status === "replayed" ? "ATTEMPT_REPLAYED" : "ATTEMPT_CLAIM_FAILED" };
    }

    const input = masteryInput(raw, authorized, evaluation.correct, verifiedUserId, nowMs);
    let stored;
    try { stored = await readProfile({ userId: verifiedUserId, conceptId: input.conceptId }); }
    catch { return { ok: false, reason: "MASTERY_READ_FAILED" }; }
    if (stored.status === "failed") return { ok: false, reason: "MASTERY_READ_FAILED" };
    const profile = stored.profile || createMasteryProfile({
      userId: verifiedUserId,
      conceptId: input.conceptId,
      learningObjectiveId: input.learningObjectiveId,
      requiredSkills: [input.skill]
    }, MASTERY_CONFIG);
    if (
      profile.userId !== verifiedUserId
      || profile.conceptId !== input.conceptId
      || profile.learningObjectiveId !== input.learningObjectiveId
    ) return { ok: false, reason: "PROFILE_SCOPE_MISMATCH" };
    input.attemptNumber = Math.max(1, Number(profile.attempts || 0) + 1);
    const transition = applyLearningEvent(profile, input, MASTERY_CONFIG);
    transition.event.authorityAttemptId = authorized.attemptId;
    transition.event.activityVersion = authorized.activity.version;
    let persistence;
    try {
      persistence = await persistTransition({ userId: verifiedUserId, event: transition.event, profile: transition.profile });
    } catch {
      return { ok: false, reason: "MASTERY_PERSISTENCE_FAILED" };
    }
    return {
      ok: persistence.status === "persisted",
      reason: persistence.status === "persisted" ? "SERVER_MASTERY_RECORDED" : "MASTERY_PERSISTENCE_FAILED",
      event: {
        eventId: transition.event.eventId,
        conceptId: transition.event.conceptId,
        correct: transition.event.correct,
        masteryBefore: transition.event.masteryBefore,
        masteryAfter: transition.event.masteryAfter
      },
      profile: {
        conceptId: transition.profile.conceptId,
        masteryScore: transition.profile.masteryScore,
        status: transition.profile.status,
        attempts: transition.profile.attempts,
        consecutiveIncorrect: transition.profile.consecutiveIncorrect,
        nextReviewAt: transition.profile.nextReviewAt
      },
      persistence
    };
  }

  return {
    recordAttempt,
    audit: () => ({
      serverDerivedMastery: true,
      clientScoreIgnored: true,
      clientRoleIgnored: true,
      clientCorrectIgnored: true,
      productionDefaultDeny: resolveAuthorizedAttempt === productionDefaultAuthority,
      replayProtectionRequired: true,
      atomicClaimRequiredBeforeProfileRead: true,
      approvedContentStatuses: [...APPROVED_CONTENT_STATUSES],
      sixLocales: [...ALLOWED_LOCALES]
    })
  };
}

export const __test = {
  validatePayload,
  normalizeAuthorizedAttempt,
  deriveCorrect,
  masteryInput
};
