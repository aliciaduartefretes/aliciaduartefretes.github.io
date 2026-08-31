const STATUSES = Object.freeze(["NEW", "LEARNING", "PRACTICING", "MASTERED", "REVIEW_DUE", "WEAK"]);
const DECISIONS = Object.freeze(["ADVANCE", "REVIEW", "REPEAT", "SIMPLIFY", "CHALLENGE", "REVIEW_LATER"]);

const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));
const round = value => Math.round(value * 100) / 100;
const hoursBetween = (later, earlier) => (new Date(later).getTime() - new Date(earlier).getTime()) / 3600000;
const asIso = value => new Date(value).toISOString();

function requireConfig(config) {
  if (!config || !Array.isArray(config.skills) || !config.activityEvidence || !config.thresholds) {
    throw new TypeError("Se requiere mastery-config.json válido.");
  }
  return config;
}

export function normalizeSkill(skill, config) {
  requireConfig(config);
  const normalized = config.skillAliases?.[skill] || skill;
  if (!config.skills.includes(normalized)) throw new RangeError(`Habilidad no admitida: ${skill}`);
  return normalized;
}

export function normalizeRequiredSkills(skills, config) {
  return [...new Set((skills || []).map(skill => normalizeSkill(skill, config)))];
}

export function createMasteryProfile({ userId, conceptId, learningObjectiveId, requiredSkills = [] }, config) {
  requireConfig(config);
  if (!userId || !conceptId || !learningObjectiveId) throw new TypeError("Faltan identificadores del perfil de dominio.");
  return {
    schemaVersion: "NALVI-P6-MASTERY-PROFILE-1",
    userId,
    conceptId,
    learningObjectiveId,
    masteryScore: 0,
    status: "NEW",
    requiredSkills: normalizeRequiredSkills(requiredSkills, config),
    skills: Object.fromEntries(config.skills.map(skill => [skill, { score: 0, evidenceCount: 0, lastPracticed: null }])),
    attempts: 0,
    correctAttempts: 0,
    consecutiveIncorrect: 0,
    evidenceByActivityType: {},
    recurringErrors: { incorrect: 0, hints: 0, immediateRepeats: 0, slowResponses: 0 },
    retentionEvidence: { delayedAttempts: 0, delayedCorrect: 0, score: config.retention.initialScore },
    lastPracticed: null,
    nextReviewAt: null,
    history: [],
    updatedAt: null
  };
}

function performanceFactors(profile, input, timestamp, config) {
  const attemptFactor = Math.max(
    config.penalties.minimumAttemptFactor,
    1 - Math.max(0, input.attemptNumber - 1) * config.penalties.attemptDecayPerExtraAttempt
  );
  const hintFactor = input.hintUsed ? config.penalties.hintFactor : 1;
  const hoursSincePrevious = profile.lastPracticed ? hoursBetween(timestamp, profile.lastPracticed) : null;
  const immediateRepeat = hoursSincePrevious !== null
    && hoursSincePrevious >= 0
    && hoursSincePrevious < config.penalties.immediateRepeatWindowHours;
  const repeatFactor = immediateRepeat ? config.penalties.immediateRepeatFactor : 1;
  const slowResponse = input.responseTime / 1000 > config.penalties.slowResponseThresholdSeconds;
  const responseFactor = slowResponse ? config.penalties.slowResponseFactor : 1;
  return { attemptFactor, hintFactor, repeatFactor, responseFactor, immediateRepeat, slowResponse, hoursSincePrevious };
}

function calculateMastery(profile, config) {
  const required = profile.requiredSkills.length
    ? profile.requiredSkills
    : config.skills.filter(skill => profile.skills[skill].evidenceCount > 0);
  const relevant = required.length ? required : config.skills;
  const skillAverage = relevant.reduce((sum, skill) => sum + profile.skills[skill].score, 0) / relevant.length;
  const diversity = Object.keys(profile.evidenceByActivityType).length;
  const diversityBonus = Math.min(
    config.scoring.maximumDiversityBonus,
    diversity * config.scoring.diversityBonusPerType
  );
  const retentionAdjustment = clamp(
    profile.retentionEvidence.score * config.scoring.retentionAdjustmentLimit,
    -config.scoring.retentionAdjustmentLimit,
    config.scoring.retentionAdjustmentLimit
  );
  return round(clamp(
    skillAverage + diversityBonus + retentionAdjustment,
    config.scoring.minimum,
    config.scoring.maximum
  ));
}

export function deriveStatus(profile, config, now = new Date()) {
  requireConfig(config);
  if (profile.attempts === 0) return "NEW";
  const due = profile.nextReviewAt && new Date(profile.nextReviewAt).getTime() <= new Date(now).getTime();
  if (due && profile.masteryScore >= config.thresholds.practicingAt) return "REVIEW_DUE";
  if (profile.attempts >= config.thresholds.minimumEventsForWeak && profile.masteryScore < config.thresholds.weakBelow) return "WEAK";

  const activityDiversity = Object.keys(profile.evidenceByActivityType).length;
  const requiredSkills = profile.requiredSkills.length ? profile.requiredSkills : config.skills.filter(skill => profile.skills[skill].evidenceCount > 0);
  const requiredSkillsReady = requiredSkills.length > 0 && requiredSkills.every(skill => (
    profile.skills[skill].evidenceCount > 0
    && profile.skills[skill].score >= config.thresholds.minimumRequiredSkillForMastered
  ));
  const canBeMastered = profile.masteryScore >= config.thresholds.masteredAt
    && profile.attempts >= config.thresholds.minimumEventsForMastered
    && activityDiversity >= config.thresholds.minimumActivityTypesForMastered
    && requiredSkillsReady
    && profile.retentionEvidence.score >= config.thresholds.minimumRetentionForMastered;
  if (canBeMastered) return "MASTERED";
  if (profile.masteryScore >= config.thresholds.practicingAt) return "PRACTICING";
  return "LEARNING";
}

function scheduleNextReview(status, timestamp, config) {
  const hours = config.retention.reviewIntervalsHours[status];
  if (!hours) return null;
  return new Date(new Date(timestamp).getTime() + hours * 3600000).toISOString();
}

export function applyLearningEvent(currentProfile, input, config, now = new Date()) {
  requireConfig(config);
  const profile = structuredClone(currentProfile);
  const timestamp = asIso(input.timestamp || now);
  const required = ["userId", "conceptId", "learningObjectiveId", "activityId", "activityType", "skill", "difficulty", "correct", "attemptNumber", "responseTime", "hintUsed"];
  for (const field of required) {
    if (input[field] === undefined || input[field] === null || input[field] === "") throw new TypeError(`Falta el campo ${field}.`);
  }
  if (input.userId !== profile.userId || input.conceptId !== profile.conceptId || input.learningObjectiveId !== profile.learningObjectiveId) {
    throw new RangeError("El evento no pertenece al perfil indicado.");
  }
  if (!(input.activityType in config.activityEvidence)) throw new RangeError(`Tipo de actividad no configurado: ${input.activityType}`);
  if (!(input.difficulty in config.difficultyEvidence)) throw new RangeError(`Dificultad no configurada: ${input.difficulty}`);
  const skill = normalizeSkill(input.skill, config);
  const factors = performanceFactors(profile, input, timestamp, config);
  const evidenceWeight = round(config.activityEvidence[input.activityType] * config.difficultyEvidence[input.difficulty]);
  const effectiveEvidence = evidenceWeight * factors.attemptFactor * factors.hintFactor * factors.repeatFactor * factors.responseFactor;
  const masteryBefore = profile.masteryScore;
  const delta = (input.correct ? config.scoring.correctDelta : -config.scoring.incorrectDelta) * effectiveEvidence;

  profile.skills[skill].score = round(clamp(
    profile.skills[skill].score + delta,
    config.scoring.minimum,
    config.scoring.maximum
  ));
  profile.skills[skill].evidenceCount += 1;
  profile.skills[skill].lastPracticed = timestamp;
  profile.attempts += 1;
  profile.correctAttempts += input.correct ? 1 : 0;
  profile.consecutiveIncorrect = input.correct ? 0 : profile.consecutiveIncorrect + 1;
  profile.evidenceByActivityType[input.activityType] = (profile.evidenceByActivityType[input.activityType] || 0) + 1;
  profile.recurringErrors.incorrect += input.correct ? 0 : 1;
  profile.recurringErrors.hints += input.hintUsed ? 1 : 0;
  profile.recurringErrors.immediateRepeats += factors.immediateRepeat ? 1 : 0;
  profile.recurringErrors.slowResponses += factors.slowResponse ? 1 : 0;

  if (factors.hoursSincePrevious !== null && factors.hoursSincePrevious >= config.retention.delayedEvidenceAfterHours) {
    const retentionMultiplier = factors.hoursSincePrevious >= config.retention.strongDelayedEvidenceAfterHours ? 1.25 : 1;
    profile.retentionEvidence.delayedAttempts += 1;
    profile.retentionEvidence.delayedCorrect += input.correct ? 1 : 0;
    profile.retentionEvidence.score = round(clamp(
      profile.retentionEvidence.score + (input.correct ? config.retention.correctGain : -config.retention.incorrectLoss) * retentionMultiplier,
      -1,
      1
    ));
  }

  profile.masteryScore = calculateMastery(profile, config);
  profile.lastPracticed = timestamp;
  profile.updatedAt = timestamp;
  profile.status = deriveStatus(profile, config, timestamp);
  profile.nextReviewAt = scheduleNextReview(profile.status, timestamp, config);

  const event = {
    schemaVersion: "NALVI-P6-LEARNING-EVENT-1",
    eventId: input.eventId || `${input.userId}__${input.activityId}__${new Date(timestamp).getTime()}__${input.attemptNumber}`,
    userId: input.userId,
    conceptId: input.conceptId,
    learningObjectiveId: input.learningObjectiveId,
    activityId: input.activityId,
    activityType: input.activityType,
    skill,
    difficulty: input.difficulty,
    correct: Boolean(input.correct),
    attemptNumber: Number(input.attemptNumber),
    responseTime: Number(input.responseTime),
    hintUsed: Boolean(input.hintUsed),
    timestamp,
    evidenceWeight,
    masteryBefore,
    masteryAfter: profile.masteryScore,
    performanceFactors: {
      attempt: round(factors.attemptFactor),
      hint: round(factors.hintFactor),
      repetition: round(factors.repeatFactor),
      responseTime: round(factors.responseFactor)
    }
  };
  profile.history.push({
    eventId: event.eventId,
    timestamp,
    skill,
    activityType: input.activityType,
    correct: event.correct,
    masteryAfter: event.masteryAfter
  });
  profile.history = profile.history.slice(-config.scoring.historyLimit);
  return { profile, event };
}

export function findWeakestSkill(profile, config) {
  requireConfig(config);
  const candidates = profile.requiredSkills.length ? profile.requiredSkills : config.skills;
  return candidates.reduce((weakest, skill) => (
    profile.skills[skill].score < profile.skills[weakest].score ? skill : weakest
  ), candidates[0]);
}

export function selectRecommendedActivityType(profile, config) {
  const weakestSkill = findWeakestSkill(profile, config);
  const activityTypes = config.activitySelection[weakestSkill];
  return { weakestSkill, activityType: activityTypes[0], alternatives: activityTypes.slice(1) };
}

export function getAdaptiveDecision(profile, config, now = new Date()) {
  requireConfig(config);
  const status = deriveStatus(profile, config, now);
  const recommendation = selectRecommendedActivityType(profile, config);
  const recognitionScore = Math.max(profile.skills.reading.score, profile.skills.vocabulary.score, profile.skills.listening.score);
  const productionGap = recognitionScore >= config.thresholds.recognitionStrongAt
    && (profile.skills.writing.score < config.thresholds.productionGapBelow || profile.skills.application.score < config.thresholds.productionGapBelow);

  if (profile.consecutiveIncorrect >= config.thresholds.consecutiveIncorrectForSimplify) {
    return { decision: "SIMPLIFY", reason: "consecutiveIncorrect", ...recommendation };
  }
  if (status === "REVIEW_DUE") return { decision: "REVIEW", reason: "reviewDue", ...recommendation };
  if (productionGap) return { decision: "REVIEW", reason: "productionGap", ...recommendation };
  if (status === "WEAK") return { decision: "REPEAT", reason: "weakEvidence", ...recommendation };
  if (status === "MASTERED" && profile.masteryScore >= config.thresholds.challengeAt) {
    return { decision: "CHALLENGE", reason: "strongMastery", ...recommendation };
  }
  if (status === "MASTERED") return { decision: "REVIEW_LATER", reason: "mastered", ...recommendation };
  if (profile.masteryScore >= config.thresholds.advanceAt && profile.consecutiveIncorrect === 0) {
    return { decision: "ADVANCE", reason: "sufficientEvidence", ...recommendation };
  }
  return { decision: "REPEAT", reason: "insufficientEvidence", ...recommendation };
}

export function createBaseline({ userId, routeId, profiles, timestamp = new Date() }) {
  if (!userId || !routeId || !Array.isArray(profiles)) throw new TypeError("Baseline incompleto.");
  return {
    schemaVersion: "NALVI-P6-BASELINE-1",
    userId,
    routeId,
    capturedAt: asIso(timestamp),
    concepts: Object.fromEntries(profiles.map(profile => [profile.conceptId, {
      masteryScore: profile.masteryScore,
      status: profile.status,
      skills: Object.fromEntries(Object.entries(profile.skills).map(([skill, value]) => [skill, value.score]))
    }]))
  };
}

export { STATUSES, DECISIONS };
