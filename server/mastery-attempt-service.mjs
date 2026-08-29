import { applyLearningEvent, createMasteryProfile } from "../mastery-engine/mastery-engine.mjs";
import { MASTERY_CONFIG } from "../mastery-engine/mastery-config.mjs";
import { persistMasteryTransition, readUserMasteryProfile } from "./firestore-admin-rest.mjs";

const ALLOWED_LOCALES = new Set(["es", "en", "pt", "fr", "it", "de"]);
const ACTIVITY_TYPES = new Set(Object.keys(MASTERY_CONFIG.activityEvidence));
const DIFFICULTIES = new Set(Object.keys(MASTERY_CONFIG.difficultyEvidence));
const safeText = (value, maximum = 160) => String(value || "").trim().slice(0, maximum);

function sanitizeInput(raw = {}, userId) {
  const activityType = ACTIVITY_TYPES.has(raw.activityType) ? raw.activityType : "multiple-choice";
  const difficulty = DIFFICULTIES.has(raw.difficulty) ? raw.difficulty : "foundation-1";
  const skill = MASTERY_CONFIG.skillAliases?.[raw.skill] || (MASTERY_CONFIG.skills.includes(raw.skill) ? raw.skill : "vocabulary");
  return {
    userId,
    conceptId: safeText(raw.conceptId, 100),
    learningObjectiveId: safeText(raw.learningObjectiveId, 100),
    activityId: safeText(raw.activityId, 140),
    activityType,
    skill,
    difficulty,
    correct: raw.correct === true,
    responseTime: Math.max(0, Math.min(3_600_000, Number(raw.responseTime) || 0)),
    hintUsed: raw.hintUsed === true,
    timestamp: new Date().toISOString(),
    uiLocale: ALLOWED_LOCALES.has(raw.uiLocale) ? raw.uiLocale : "es"
  };
}

export function createMasteryAttemptService({ readProfile = readUserMasteryProfile, persistTransition = persistMasteryTransition } = {}) {
  async function recordAttempt(raw = {}, { verifiedUserId = "" } = {}) {
    if (!verifiedUserId) return { ok: false, reason: "AUTH_REQUIRED" };
    const input = sanitizeInput(raw, verifiedUserId);
    if (!input.conceptId || !input.learningObjectiveId || !input.activityId) return { ok: false, reason: "INVALID_ATTEMPT" };
    const stored = await readProfile({ userId: verifiedUserId, conceptId: input.conceptId });
    if (stored.status === "failed") return { ok: false, reason: stored.reason };
    const profile = stored.profile || createMasteryProfile({
      userId: verifiedUserId,
      conceptId: input.conceptId,
      learningObjectiveId: input.learningObjectiveId,
      requiredSkills: [input.skill]
    }, MASTERY_CONFIG);
    if (profile.userId !== verifiedUserId || profile.conceptId !== input.conceptId) return { ok: false, reason: "PROFILE_SCOPE_MISMATCH" };
    input.attemptNumber = Math.max(1, Number(profile.attempts || 0) + 1);
    const transition = applyLearningEvent(profile, input, MASTERY_CONFIG);
    const persistence = await persistTransition({ userId: verifiedUserId, event: transition.event, profile: transition.profile });
    return {
      ok: persistence.status === "persisted",
      reason: persistence.status === "persisted" ? "SERVER_MASTERY_RECORDED" : persistence.reason,
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
  return { recordAttempt, audit: () => ({ serverDerivedMastery: true, clientScoreIgnored: true, clientRoleIgnored: true, sixLocales: [...ALLOWED_LOCALES] }) };
}

export const __test = { sanitizeInput };
