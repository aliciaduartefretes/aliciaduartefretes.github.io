import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { selectFirstValidCandidate } from "../../activity-catalog/nalvi-activity-quality.mjs";
import { classifyError, createActivityFingerprint } from "../../intervention-engine/intervention-engine.mjs";
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

function approvedMaterialFor(activity) {
  const options = activity.options.map((option, index) => ({
    id: String(option.id || `option-${index + 1}`),
    text: String(option.label || option.text || option.value || ""),
    authorized: true
  }));
  return {
    options,
    pairs: options.map((option, index) => ({
      id: `approved-pair-${index + 1}`,
      left: option.text,
      right: `approved-meaning-${index + 1}`,
      authorized: true
    })),
    contexts: [{ es: "Situación aprobada para este objetivo." }]
  };
}

test("respuesta incorrecta siempre bloquea, incluso sin OpenAI", () => {
  for (const activityType of ["multiple-choice", "listening", "matching", "order-sentence", "fill-blank", "writing"]) {
    const gate = evaluateProgressionGate({ correct: false }, { activityType, profile: { status: "MASTERED" }, atObjectiveBoundary: true });
    assert.equal(gate.decision, "BLOCK_AND_INTERVENE");
    assert.equal(gate.canAdvance, false);
    assert.equal(gate.canComplete, false);
  }
});

test("mamá: dos errores permanecen bloqueados y producen actividades aceptadas distintas", () => {
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
    grammarRuleIds: [],
    approvedActivityMaterial: approvedMaterialFor(mother)
  };
  const original = createActivityFingerprint(mother, { uiLocale: "es" });
  const firstGate = evaluateProgressionGate({ correct: false }, {
    activityType: mother.type,
    profile: { status: "MASTERED" },
    atObjectiveBoundary: true
  });
  const firstSelection = selectFirstValidCandidate(
    buildDeterministicFallbackCandidates(context, 1, "SEMANTIC_CONFUSION"),
    { ...context, attemptNumber: 1, errorType: "SEMANTIC_CONFUSION" }
  );
  assert.equal(firstSelection.accepted, true);
  const first = firstSelection.candidate.activity;
  const firstFingerprint = createActivityFingerprint(first, { uiLocale: "es" });
  const secondContext = {
    ...context,
    activity: first,
    activityType: first.type,
    attemptNumber: 2,
    studentAnswer: "respuesta-incorrecta",
    recentActivities: [{ activityType: first.activityType, fingerprint: firstFingerprint }],
    recentActivityFingerprints: [firstFingerprint],
    previousActivityFingerprint: firstFingerprint
  };
  const secondErrorType = classifyError({ ...secondContext, correct: false }).errorType;
  const secondGate = evaluateProgressionGate({ correct: false }, {
    activityType: first.type,
    profile: { status: "MASTERED" },
    atObjectiveBoundary: true
  });
  const secondSelection = selectFirstValidCandidate(
    buildDeterministicFallbackCandidates(secondContext, 2, secondErrorType),
    { ...secondContext, errorType: secondErrorType }
  );
  assert.equal(secondSelection.accepted, true);
  const second = secondSelection.candidate.activity;
  const secondFingerprint = createActivityFingerprint(second, { uiLocale: "es" });

  for (const gate of [firstGate, secondGate]) {
    assert.equal(gate.decision, "BLOCK_AND_INTERVENE");
    assert.equal(gate.canAdvance, false);
    assert.equal(gate.canComplete, false);
  }
  assert.equal(first.learningObjectiveId, mother.learningObjectiveId);
  assert.equal(second.learningObjectiveId, mother.learningObjectiveId);
  assert.notEqual(first.prompt, mother.prompt.es);
  assert.notEqual(first.type, mother.type);
  assert.notEqual(second.type, first.type);
  assert.notEqual(firstFingerprint, original);
  assert.notEqual(secondFingerprint, firstFingerprint);

  const index = readFileSync(new URL("../../index.html", import.meta.url), "utf8");
  const answerFlowStart = index.indexOf("checkAnswer=function(precomputedProgression=null", index.indexOf("/* GCA45"));
  const answerFlowEnd = index.indexOf('window.addEventListener("nalvi:resume-objective-practice"', answerFlowStart);
  const answerFlow = index.slice(answerFlowStart, answerFlowEnd);
  const successBranchStart = answerFlow.indexOf("if(ok){");
  const incorrectBranchStart = answerFlow.indexOf("}else{", successBranchStart);
  assert.ok(answerFlowStart >= 0 && answerFlowEnd > answerFlowStart);
  assert.ok(successBranchStart >= 0 && incorrectBranchStart > successBranchStart);
  assert.match(answerFlow.slice(successBranchStart, incorrectBranchStart), /state\.xp\s*\+=\s*10/);
  assert.doesNotMatch(answerFlow.slice(incorrectBranchStart), /state\.xp\s*\+=/);
  assert.doesNotMatch(answerFlow.slice(incorrectBranchStart), /generalCompletionAuthorized\s*=\s*true/);
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
