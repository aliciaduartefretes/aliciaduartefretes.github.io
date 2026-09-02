import {
  ANSWER_STATUSES,
  createPendingReviewRecord,
  evaluateAnswer,
  normalizeAnswerSurface
} from "../../assessment/nalvi-answer-evaluator.mjs";

const REVIEW_KEY = "nalvi.answerReview.pending.v1";

function queueReview(record) {
  if (!record) return false;
  try {
    const current = JSON.parse(localStorage.getItem(REVIEW_KEY) || "[]");
    const signature = [record.activityId, record.studentAnswer, record.expectedAnswers?.join("|")].join("::");
    if (!current.some(item => [item.activityId, item.studentAnswer, item.expectedAnswers?.join("|")].join("::") === signature)) current.push(record);
    localStorage.setItem(REVIEW_KEY, JSON.stringify(current.slice(-100)));
  } catch { /* La revisión sigue disponible en el resultado aunque localStorage falle. */ }
  window.dispatchEvent(new CustomEvent("nalvi:answer-pending-review", { detail: record }));
  return true;
}

window.NALVI_ANSWER_EVALUATOR = Object.freeze({
  version: "NALVI-ANSWER-EVALUATOR-1",
  ANSWER_STATUSES,
  normalizeAnswerSurface,
  createPendingReviewRecord,
  evaluateAnswer: input => {
    const result = evaluateAnswer(input);
    if (result.reviewRecord) queueReview(result.reviewRecord);
    return result;
  },
  queueReview,
  getPendingReviews: () => {
    try { return JSON.parse(localStorage.getItem(REVIEW_KEY) || "[]"); }
    catch { return []; }
  }
});
