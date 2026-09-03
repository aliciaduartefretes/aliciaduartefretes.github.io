import {
  approvedAudioAvailableForTarget,
  catalogQualityMetrics,
  detectAnswerLeakage,
  validateCatalogActivity
} from "../activity-catalog/nalvi-activity-quality.mjs";

export const TUTOR_REJECTION_REASONS = Object.freeze([
  "UNSUPPORTED_ACTIVITY_TYPE", "ACTIVITY_TYPE_DISABLED", "ANSWER_IN_PROMPT", "ANSWER_IN_CONTEXT",
  "ANSWER_IN_VISIBLE_HINT", "ANSWER_IN_SINGLE_PAIR", "ANSWER_ALREADY_ORDERED", "ANSWER_IN_IMAGE_LABEL",
  "EXACT_ACTIVITY_DUPLICATE", "SAME_MODALITY_WITHOUT_REASON", "UNRELATED_DISTRACTORS",
  "INVALID_LINGUISTIC_CONTENT", "INDEPENDENT_RETEST_REQUIRED", "UNSAFE_PROGRESSION_POLICY"
]);

const unique = values => [...new Set(values.filter(Boolean))];

function isTrustedIndependentRetest(activity = {}, context = {}) {
  if (context.trustedSpacedRetest !== true) return false;
  const hints = Array.isArray(activity.hints) ? activity.hints : [];
  return activity.spacedRetest === true
    && activity.independentRetest === true
    && activity.evidenceMode === "independent"
    && activity.nalviGuided === false
    && Number(activity.helpLevel || 0) === 0
    && hints.length === 0
    && !String(activity.explanation || "").trim()
    && activity.answerExposure === "HIDDEN";
}

function qualityContext(plan = {}, context = {}) {
  return {
    ...context,
    errorType: context.errorType || plan.diagnosis?.errorType,
    audioEnabled: approvedAudioAvailableForTarget(context),
    requireApprovedAudio: true,
    requireApprovedMaterial: true
  };
}

export function answerLeakageDetected(plan = {}, context = {}) {
  return (plan.activities || []).some(activity => detectAnswerLeakage(activity, context).leaked);
}

export function validatePedagogicalQuality(plan = {}, context = {}) {
  const reasons = [];
  const validationContext = qualityContext(plan, context);
  if (!Array.isArray(plan.activities) || !plan.activities.length || plan.activities.length > 4) reasons.push("INVALID_PLAN_LENGTH");
  for (const activity of plan.activities || []) {
    const validation = validateCatalogActivity(activity, validationContext);
    reasons.push(...validation.reasons);
  }
  const fingerprints = (plan.activities || []).map(activity => activity.fingerprint).filter(Boolean);
  if (new Set(fingerprints).size !== fingerprints.length) reasons.push("DUPLICATE_WITHIN_PLAN");
  if (plan.progressionPolicy?.onIncorrect !== "BLOCK_AND_INTERVENE") reasons.push("UNSAFE_PROGRESSION_POLICY");
  if (!plan.progressionPolicy?.requiresIndependentRetest) reasons.push("INDEPENDENT_RETEST_REQUIRED");
  return { valid: unique(reasons).length === 0, reasons: unique(reasons) };
}

export function planMetrics(plan = {}, context = {}) {
  const activities = plan.activities || [];
  const validationContext = qualityContext(plan, context);
  const hard = catalogQualityMetrics(activities, validationContext);
  const types = activities.map(activity => activity.activityType || activity.type);
  const demands = activities.map(activity => activity.cognitiveDemand).filter(Boolean);
  return {
    ...hard,
    answerLeakageRate: answerLeakageDetected(plan, context) ? 1 : 0,
    duplicateRate: hard.exactDuplicateAfterErrorRate,
    strategyDiversity: new Set(types).size,
    cognitiveDemandDiversity: new Set(demands).size,
    independentRetestCoverage: activities.some(activity => isTrustedIndependentRetest(activity, context)) ? 1 : 0
  };
}
