import { PROGRESSION_CONFIG } from "./progression-config.mjs";

export const PROGRESSION_DECISIONS = Object.freeze([...PROGRESSION_CONFIG.decisions]);

export function evaluateProgressionGate(result = {}, masteryContext = {}) {
  if (masteryContext.intent === "leave") {
    return { decision: "EXIT_WITHOUT_COMPLETION", reason: "leaveIsNotCompletion", canAdvance: false, canComplete: false };
  }

  if (result.correct !== true) {
    return { decision: "BLOCK_AND_INTERVENE", reason: "incorrectAnswer", canAdvance: false, canComplete: false };
  }

  if (masteryContext.guided || result.hintUsed) {
    return { decision: "CONTINUE_PRACTICE", reason: "guidedEvidenceIsPartial", canAdvance: true, canComplete: false };
  }

  if (!masteryContext.atObjectiveBoundary) {
    return { decision: "CONTINUE_PRACTICE", reason: "objectiveStillInProgress", canAdvance: true, canComplete: false };
  }

  const status = String(masteryContext.profile?.status || masteryContext.status || "NEW");
  if (status === PROGRESSION_CONFIG.completion.requiredMasteryStatus) {
    return { decision: "COMPLETE_OBJECTIVE", reason: "masteryPolicySatisfied", canAdvance: true, canComplete: true };
  }
  if (status === "REVIEW_DUE") {
    return { decision: "REVIEW_LATER", reason: "retentionReviewDue", canAdvance: false, canComplete: false };
  }
  return { decision: "CONTINUE_PRACTICE", reason: "insufficientMasteryEvidence", canAdvance: true, canComplete: false };
}

export function canCompleteObjective(profile, options = {}) {
  return evaluateProgressionGate({ correct: true, hintUsed: Boolean(options.hintUsed) }, {
    profile,
    guided: Boolean(options.guided),
    atObjectiveBoundary: true
  }).decision === "COMPLETE_OBJECTIVE";
}
