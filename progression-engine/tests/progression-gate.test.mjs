import test from "node:test";
import assert from "node:assert/strict";
import { selectFirstValidCandidate } from "../../activity-catalog/nalvi-activity-quality.mjs";
import { createActivityFingerprint } from "../../intervention-engine/intervention-engine.mjs";
import { buildDeterministicFallbackCandidates } from "../fallback-intervention.mjs";
import { evaluateProgressionGate } from "../progression-gate.mjs";

const mother = {
  id: "mother-question",
  conceptId: "family-mother",
  conceptIds: ["family-mother"],
  learningObjectiveId: "GG-LO-FAMILY",
  type: "multiple-choice",
  activityType: "multiple-choice",
  skill: "vocabulary",
  difficulty: "foundation-1",
  prompt: { es: "¿Cómo se dice mamá?", en: "How do you say mom?" },
  options: [{ id: "a", label: "sy" }, { id: "b", label: "túva" }, { id: "c", label: "óga" }],
  correctOptionId: "a"
};

test("respuesta incorrecta siempre bloquea, incluso sin OpenAI", () => {
  for (const activityType of ["multiple-choice", "listening", "matching", "order-sentence", "fill-blank", "writing"]) {
    const gate = evaluateProgressionGate({ correct: false }, { activityType, profile: { status: "MASTERED" }, atObjectiveBoundary: true });
    assert.equal(gate.decision, "BLOCK_AND_INTERVENE");
    assert.equal(gate.canAdvance, false);
    assert.equal(gate.canComplete, false);
  }
});

test("mamá: dos errores producen modalidades y huellas diferentes", () => {
  const context = {
    activity: mother,
    conceptId: mother.conceptId,
    learningObjectiveId: mother.learningObjectiveId,
    currentSkill: mother.skill,
    activityType: mother.type,
    difficulty: mother.difficulty,
    correctAnswer: "sy",
    uiLocale: "es",
    lexemeIds: [],
    grammarRuleIds: []
  };
  const original = createActivityFingerprint(mother, { uiLocale: "es" });
  const firstSelection = selectFirstValidCandidate(
    buildDeterministicFallbackCandidates(context, 1, "SEMANTIC_CONFUSION"),
    { ...context, errorType: "SEMANTIC_CONFUSION" }
  );
  assert.equal(firstSelection.accepted, true);
  const first = firstSelection.candidate.activity;
  const firstFingerprint = createActivityFingerprint(first, { uiLocale: "es" });
  const secondContext = {
    ...context,
    activityType: first.type,
    recentActivities: [{ activityType: first.activityType, fingerprint: firstFingerprint }],
    recentActivityFingerprints: [firstFingerprint],
    previousActivityFingerprint: firstFingerprint
  };
  const secondSelection = selectFirstValidCandidate(
    buildDeterministicFallbackCandidates(secondContext, 2, "SEMANTIC_CONFUSION"),
    { ...secondContext, errorType: "SEMANTIC_CONFUSION" }
  );
  assert.equal(secondSelection.accepted, true);
  const second = secondSelection.candidate.activity;
  const secondFingerprint = createActivityFingerprint(second, { uiLocale: "es" });
  assert.notEqual(first.prompt, mother.prompt.es);
  assert.notEqual(first.type, mother.type);
  assert.notEqual(firstFingerprint, original);
  assert.notEqual(secondFingerprint, firstFingerprint);
});

test("acierto guiado es evidencia parcial y no completa", () => {
  const gate = evaluateProgressionGate({ correct: true, hintUsed: true }, { guided: true, atObjectiveBoundary: true, profile: { status: "MASTERED" } });
  assert.equal(gate.decision, "CONTINUE_PRACTICE");
  assert.equal(gate.canComplete, false);
});

test("MASTERED completa y un checkpoint independiente puede cerrar práctica sin falsificar retención", () => {
  const incomplete = evaluateProgressionGate({ correct: true }, { atObjectiveBoundary: true, profile: { status: "PRACTICING" } });
  const mastered = evaluateProgressionGate({ correct: true }, { atObjectiveBoundary: true, profile: { status: "MASTERED" } });
  const checkpoint = evaluateProgressionGate({ correct: true }, {
    atObjectiveBoundary: true,
    profile: { status: "PRACTICING" },
    objectiveEvidence: {
      independentCorrectEvents: 1,
      distinctActivityTypes: 1,
      lastEvidenceIndependentCorrect: true,
      hasPendingRetest: false
    }
  });
  assert.equal(incomplete.decision, "CONTINUE_PRACTICE");
  assert.equal(mastered.decision, "COMPLETE_OBJECTIVE");
  assert.equal(mastered.canComplete, true);
  assert.equal(checkpoint.decision, "COMPLETE_OBJECTIVE");
  assert.equal(checkpoint.reason, "objectivePracticeCheckpointSatisfied");
  assert.equal(checkpoint.preservesLongTermMasteryStatus, true);
});

test("checkpoint no completa si la recuperación sigue pendiente o la última evidencia fue guiada", () => {
  const base = {
    atObjectiveBoundary: true,
    profile: { status: "PRACTICING" },
    objectiveEvidence: { independentCorrectEvents: 1, distinctActivityTypes: 1, lastEvidenceIndependentCorrect: true, hasPendingRetest: false }
  };
  assert.equal(evaluateProgressionGate({ correct: true }, { ...base, objectiveEvidence: { ...base.objectiveEvidence, hasPendingRetest: true } }).canComplete, false);
  assert.equal(evaluateProgressionGate({ correct: true }, { ...base, objectiveEvidence: { ...base.objectiveEvidence, lastEvidenceIndependentCorrect: false } }).canComplete, false);
});

test("salir nunca equivale a completar", () => {
  assert.equal(evaluateProgressionGate({ correct: true }, { intent: "leave", profile: { status: "MASTERED" } }).decision, "EXIT_WITHOUT_COMPLETION");
});
