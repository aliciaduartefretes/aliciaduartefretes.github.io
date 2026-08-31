import { createActivityFingerprint } from "../intervention-engine/intervention-engine.mjs";

export const TUTOR_REJECTION_REASONS = Object.freeze([
  "ANSWER_VISIBLE_TOO_EARLY", "SINGLE_PAIR_MATCHING", "ONLY_ONE_POSSIBLE_OPTION",
  "EXACT_ACTIVITY_DUPLICATE", "NEAR_DUPLICATE", "SAME_MODALITY_WITHOUT_REASON",
  "UNRELATED_DISTRACTORS", "INVALID_LINGUISTIC_CONTENT", "UNSUPPORTED_ACTIVITY_TYPE",
  "MISSING_INDEPENDENT_RETEST", "TECHNICAL_TEXT_VISIBLE", "OVERLY_LONG_FEEDBACK",
  "NO_COGNITIVE_DEMAND"
]);

const SUPPORTED_TYPES = new Set(["multiple-choice", "listening", "order-sentence", "fill-blank", "writing", "matching"]);
const TECHNICAL_TEXT = /\b(?:openai|chatgpt|endpoint|json|schema|fallback|debug|simpli(?:fy|ficar)|strategy|fingerprint|intervention engine|mastery score|api key|modelo de ia)\b/i;
const normalize = value => String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase().replace(/[^a-z0-9\p{L}\p{N}]+/gu, " ").trim();
const words = value => new Set(normalize(value).split(/\s+/).filter(Boolean));
const overlap = (left, right) => {
  const a = words(left), b = words(right);
  if (!a.size || !b.size) return 0;
  const intersection = [...a].filter(value => b.has(value)).length;
  return intersection / Math.max(a.size, b.size);
};
const visibleText = activity => [activity.instruction, activity.prompt, activity.explanation, ...(activity.hints || [])].join(" ");
const exposureRank = value => ({ HIDDEN: 0, PARTIAL_HINT: 1, WORKED_EXAMPLE: 2, EXPLICIT_SOLUTION: 3 }[value] ?? 0);

export function validatePedagogicalQuality(plan, context = {}) {
  const reasons = [];
  const activities = Array.isArray(plan?.activities) ? plan.activities : [];
  const feedback = typeof plan?.studentFeedback === "object" ? plan.studentFeedback.shortMessage : plan?.studentFeedback;
  if (!activities.some(activity => activity.requiresStudentResponse !== false)) reasons.push("NO_COGNITIVE_DEMAND");
  if (String(feedback || "").length > 220) reasons.push("OVERLY_LONG_FEEDBACK");
  if (TECHNICAL_TEXT.test([feedback, ...activities.map(visibleText)].join(" "))) reasons.push("TECHNICAL_TEXT_VISIBLE");

  const recent = new Set([context.previousActivityFingerprint, ...(context.recentActivityFingerprints || [])].filter(Boolean));
  const fingerprints = new Set();
  const previousPrompt = context.activity?.prompt || "";
  for (const [index, activity] of activities.entries()) {
    const type = activity.activityType || activity.type;
    if (!SUPPORTED_TYPES.has(type)) reasons.push("UNSUPPORTED_ACTIVITY_TYPE");
    if (type === "matching" && (activity.pairs || []).length < 3) reasons.push("SINGLE_PAIR_MATCHING");
    if (["multiple-choice", "listening"].includes(type) && (activity.options || []).length < 2) reasons.push("ONLY_ONE_POSSIBLE_OPTION");
    const fingerprint = activity.fingerprint || createActivityFingerprint({ ...activity, type }, { uiLocale: context.uiLocale });
    if (recent.has(fingerprint) || fingerprints.has(fingerprint)) reasons.push("EXACT_ACTIVITY_DUPLICATE");
    fingerprints.add(fingerprint);
    if (index === 0 && overlap(previousPrompt, activity.prompt) >= 0.86 && type === context.activityType) reasons.push("NEAR_DUPLICATE");
    if (index === 0 && type === context.activityType && !String(plan?.strategy?.reasonCode || "").trim()) reasons.push("SAME_MODALITY_WITHOUT_REASON");
    if (Number(context.attemptNumber || 1) === 1 && exposureRank(activity.answerExposure) >= 2) reasons.push("ANSWER_VISIBLE_TOO_EARLY");
  }

  const solutionIndex = activities.findIndex(activity => exposureRank(activity.answerExposure) >= 2);
  if (solutionIndex >= 0) {
    const independent = activities.slice(solutionIndex + 1).some(activity =>
      activity.requiresStudentResponse !== false
      && Number(activity.helpLevel) === 0
      && activity.answerExposure === "HIDDEN"
    );
    if (!independent) reasons.push("MISSING_INDEPENDENT_RETEST");
  }
  const unique = [...new Set(reasons)];
  return { valid: unique.length === 0, reasons: unique };
}

export function answerLeakageDetected(plan, context = {}) {
  const answer = normalize(context.correctAnswer);
  if (!answer || answer.length < 2) return false;
  const first = plan?.activities?.[0];
  if (!first || Number(context.attemptNumber || 1) > 1) return false;
  if (first.answerExposure !== "HIDDEN") return true;
  const visible = normalize([plan?.studentFeedback?.shortMessage || plan?.studentFeedback, visibleText(first)].join(" "));
  return visible.includes(answer) && !["multiple-choice", "listening"].includes(first.activityType || first.type);
}

export function planMetrics(plan, context = {}) {
  const activities = plan?.activities || [];
  return {
    answerLeakageRate: answerLeakageDetected(plan, context) ? 1 : 0,
    duplicateRate: validatePedagogicalQuality(plan, context).reasons.some(reason => reason.includes("DUPLICATE")) ? 1 : 0,
    firstErrorExplicitSolutionRate: Number(context.attemptNumber || 1) === 1 && activities.some(activity => activity.answerExposure === "EXPLICIT_SOLUTION") ? 1 : 0,
    singlePairMatchingRate: activities.some(activity => (activity.activityType || activity.type) === "matching" && (activity.pairs || []).length < 3) ? 1 : 0,
    independentRetestCoverage: activities.some(activity => Number(activity.helpLevel) === 0 && activity.answerExposure === "HIDDEN") ? 1 : 0,
    strategyDiversity: new Set(activities.map(activity => activity.activityType || activity.type)).size
  };
}
