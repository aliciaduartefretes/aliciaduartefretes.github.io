export const ANSWER_STATUSES = Object.freeze({
  CORRECT_CANONICAL: "correct_canonical",
  CORRECT_EQUIVALENT: "correct_equivalent",
  NEAR_MISS: "near_miss",
  INCORRECT: "incorrect",
  PENDING_REVIEW: "pending_review"
});

const APOSTROPHES = /[\u2018\u2019\u02BC\u02BB\uFF07`\u00B4]/g;
const FINAL_PUNCTUATION = /[.!?\u2026]+$/u;

export function normalizeAnswerSurface(value, { ignoreFinalPunctuation = true } = {}) {
  let normalized = String(value ?? "")
    .normalize("NFC")
    .replace(APOSTROPHES, "'")
    .trim()
    .replace(/\s+/gu, " ")
    .toLocaleLowerCase();
  if (ignoreFinalPunctuation) normalized = normalized.replace(FINAL_PUNCTUATION, "").trim();
  return normalized;
}

function contextualRecordApplies(record, context) {
  if (!record || record.status !== "APPROVED") return false;
  const checks = [
    [record.activityId, context.activityId],
    [record.learningObjectiveId, context.learningObjectiveId],
    [record.contextId, context.contextId]
  ];
  return checks.every(([required, actual]) => !required || String(required) === String(actual || ""));
}

function levenshtein(a, b) {
  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let row = 1; row <= a.length; row += 1) {
    let diagonal = previous[0];
    previous[0] = row;
    for (let column = 1; column <= b.length; column += 1) {
      const old = previous[column];
      previous[column] = Math.min(
        previous[column] + 1,
        previous[column - 1] + 1,
        diagonal + (a[row - 1] === b[column - 1] ? 0 : 1)
      );
      diagonal = old;
    }
  }
  return previous[b.length];
}

export function createPendingReviewRecord({ studentAnswer, canonicalAnswers = [], activity = {}, context = {}, reason = "POSSIBLE_CONTEXTUAL_EQUIVALENT" } = {}) {
  return {
    id: `MARCELO-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    activityId: String(activity.id || context.activityId || ""),
    learningObjectiveId: String(activity.learningObjectiveId || context.learningObjectiveId || ""),
    conceptId: String(activity.conceptId || activity.conceptIds?.[0] || context.conceptId || ""),
    contextId: String(activity.contextId || context.contextId || ""),
    studentAnswer: String(studentAnswer ?? ""),
    expectedAnswers: canonicalAnswers.map(String),
    prompt: activity.prompt || context.prompt || "",
    fullContext: activity.contextText || activity.scenario || context.fullContext || "",
    reason,
    reviewState: "PENDING_MARCELO",
    createdAt: new Date().toISOString()
  };
}

export function evaluateAnswer({ studentAnswer, canonicalAnswers = [], approvedEquivalents = [], approvedVariants = [], activity = {}, context = {}, allowPendingReview = false } = {}) {
  const normalizedStudent = normalizeAnswerSurface(studentAnswer);
  const canonical = canonicalAnswers.filter(value => value != null && String(value).trim()).map(value => ({ raw: String(value), normalized: normalizeAnswerSurface(value) }));
  if (canonical.some(item => item.normalized === normalizedStudent)) {
    return { status: ANSWER_STATUSES.CORRECT_CANONICAL, answerStatus: ANSWER_STATUSES.CORRECT_CANONICAL, correct: true, normalizedStudent, matchedAnswer: canonical.find(item => item.normalized === normalizedStudent)?.raw || "" };
  }

  const equivalents = [...approvedEquivalents, ...approvedVariants]
    .filter(record => contextualRecordApplies(record, { ...context, activityId: activity.id || context.activityId, learningObjectiveId: activity.learningObjectiveId || context.learningObjectiveId, contextId: activity.contextId || context.contextId }))
    .flatMap(record => record.values || [record.value || record.answer])
    .filter(Boolean)
    .map(String);
  const equivalent = equivalents.find(value => normalizeAnswerSurface(value) === normalizedStudent);
  if (equivalent) return { status: ANSWER_STATUSES.CORRECT_EQUIVALENT, answerStatus: ANSWER_STATUSES.CORRECT_EQUIVALENT, correct: true, normalizedStudent, matchedAnswer: equivalent };

  const nearest = canonical
    .map(item => ({ ...item, distance: levenshtein(normalizedStudent, item.normalized) }))
    .sort((a, b) => a.distance - b.distance)[0];
  const nearThreshold = nearest ? Math.max(1, Math.min(2, Math.floor(nearest.normalized.length / 5))) : 0;
  if (nearest && normalizedStudent && nearest.distance > 0 && nearest.distance <= nearThreshold) {
    return { status: ANSWER_STATUSES.NEAR_MISS, answerStatus: ANSWER_STATUSES.NEAR_MISS, correct: false, nearMiss: true, normalizedStudent, matchedAnswer: nearest.raw, distance: nearest.distance };
  }

  if (allowPendingReview && normalizedStudent && canonical.length) {
    const reviewRecord = createPendingReviewRecord({ studentAnswer, canonicalAnswers: canonical.map(item => item.raw), activity, context });
    return { status: ANSWER_STATUSES.PENDING_REVIEW, answerStatus: ANSWER_STATUSES.PENDING_REVIEW, correct: false, pendingReview: true, normalizedStudent, reviewRecord };
  }
  return { status: ANSWER_STATUSES.INCORRECT, answerStatus: ANSWER_STATUSES.INCORRECT, correct: false, normalizedStudent };
}

export default evaluateAnswer;
