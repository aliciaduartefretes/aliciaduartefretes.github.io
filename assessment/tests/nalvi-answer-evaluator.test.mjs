import test from "node:test";
import assert from "node:assert/strict";
import { ANSWER_STATUSES, evaluateAnswer, normalizeAnswerSurface } from "../nalvi-answer-evaluator.mjs";

test("normaliza mayúsculas, espacios, apóstrofos tipográficos y puntuación final sin borrar nasalización", () => {
  assert.equal(normalizeAnswerSurface("  Mba’eichapa? "), "mba'eichapa");
  assert.equal(normalizeAnswerSurface("ÑE'Ẽ."), "ñe'ẽ");
  assert.notEqual(normalizeAnswerSurface("porã"), normalizeAnswerSurface("pora"));
});

test("acepta únicamente equivalentes aprobados y vinculados al contexto", () => {
  const approved = [{ status: "APPROVED", activityId: "a-1", values: ["forma contextual"] }];
  const accepted = evaluateAnswer({ studentAnswer: "FORMA CONTEXTUAL.", canonicalAnswers: ["canónica"], approvedEquivalents: approved, activity: { id: "a-1" } });
  const rejectedElsewhere = evaluateAnswer({ studentAnswer: "forma contextual", canonicalAnswers: ["canónica"], approvedEquivalents: approved, activity: { id: "a-2" } });
  assert.equal(accepted.status, ANSWER_STATUSES.CORRECT_EQUIVALENT);
  assert.equal(accepted.answerStatus, ANSWER_STATUSES.CORRECT_EQUIVALENT);
  assert.equal(rejectedElsewhere.status, ANSWER_STATUSES.INCORRECT);
  assert.equal(rejectedElsewhere.answerStatus, ANSWER_STATUSES.INCORRECT);
});

test("una diferencia ortográfica cercana es near_miss, no correcta", () => {
  const result = evaluateAnswer({ studentAnswer: "mbaeichapa", canonicalAnswers: ["mba'eichapa"] });
  assert.equal(result.status, ANSWER_STATUSES.NEAR_MISS);
  assert.equal(result.answerStatus, ANSWER_STATUSES.NEAR_MISS);
  assert.equal(result.correct, false);
});

test("una forma abierta no registrada queda pendiente para Marcelo sin aprobarse", () => {
  const result = evaluateAnswer({
    studentAnswer: "posible variante",
    canonicalAnswers: ["forma validada"],
    activity: { id: "write-1", learningObjectiveId: "obj-1", prompt: "Escribe la forma" },
    allowPendingReview: true
  });
  assert.equal(result.status, ANSWER_STATUSES.PENDING_REVIEW);
  assert.equal(result.answerStatus, ANSWER_STATUSES.PENDING_REVIEW);
  assert.equal(result.correct, false);
  assert.equal(result.reviewRecord.reviewState, "PENDING_MARCELO");
});
