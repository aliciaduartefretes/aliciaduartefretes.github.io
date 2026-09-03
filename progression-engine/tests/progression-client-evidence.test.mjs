import test from "node:test";
import assert from "node:assert/strict";

const stored = new Map();
globalThis.localStorage = {
  getItem: key => stored.get(key) || null,
  setItem: (key, value) => stored.set(key, value),
  removeItem: key => stored.delete(key)
};
globalThis.CustomEvent = class {
  constructor(type, init = {}) {
    this.type = type;
    this.detail = init.detail;
  }
};
globalThis.window = {
  GCA_FIREBASE_LIVE: null,
  NALVI_INTERVENTION: { hasPendingRetest: () => false },
  dispatchEvent: () => true
};

await import("../../assets/js/nalvi-progression-client.mjs?progression-evidence-harness");
const progressionClient = window.NALVI_PROGRESSION;

const baseActivity = Object.freeze({
  id: "progression-evidence-harness",
  conceptId: "qa-guided-evidence",
  learningObjectiveId: "QA-LO-GUIDED-EVIDENCE",
  type: "multiple-choice",
  skill: "vocabulary",
  difficulty: "foundation-1"
});

function evaluate(activityOverrides = {}, resultOverrides = {}) {
  progressionClient.resetLocalDiagnostics();
  const activity = { ...baseActivity, ...activityOverrides };
  const progression = progressionClient.evaluateActivityResult({
    activity,
    result: { correct: true, ...resultOverrides },
    atObjectiveBoundary: true
  });
  return { activity, progression };
}

function assertGuidedEvidence({ activity, progression }) {
  assert.equal(progression.guided, true);
  assert.equal(progression.evidenceStrength, "partial");
  assert.equal(progression.event.hintUsed, true);
  assert.equal(progression.event.performanceFactors.hint, 0.72);
  assert.equal(progression.decision, "CONTINUE_PRACTICE");
  assert.equal(progression.reason, "guidedEvidenceIsPartial");
  assert.equal(progression.canComplete, false);

  const completion = progressionClient.evaluateObjectiveCompletion({ activity, progression });
  assert.equal(completion.objectiveEvidence.independentCorrectEvents, 0);
  assert.equal(completion.objectiveEvidence.lastEvidenceIndependentCorrect, false);
  assert.equal(completion.decision, "CONTINUE_PRACTICE");
  assert.equal(completion.canComplete, false);
}

test("plan adaptativo no-retest con helpLevel 0 conserva evidencia guiada", () => {
  assertGuidedEvidence(evaluate({
    adaptivePlanId: "adaptive-guided-help-zero",
    adaptivePlanIndex: 0,
    evidenceMode: "guided",
    independentRetest: false,
    nalviGuided: false,
    helpLevel: 0
  }));
});

test("el plan adaptativo y evidenceMode guided son señales guiadas independientes del nivel de ayuda", () => {
  assertGuidedEvidence(evaluate({
    id: "adaptive-plan-default-guided",
    adaptivePlanId: "adaptive-plan-default-guided",
    helpLevel: 0
  }));
  assertGuidedEvidence(evaluate({
    id: "explicit-guided-mode",
    evidenceMode: "guided",
    helpLevel: 0
  }));
});

test("una ayuda real no puede elevarse a independiente mediante metadatos contradictorios", () => {
  const spacedRetest = {
    adaptivePlanId: "adaptive-spaced-retest-with-help",
    spacedRetest: true,
    independentRetest: true,
    evidenceMode: "independent"
  };
  assertGuidedEvidence(evaluate({
    id: "independent-claim-with-hint",
    ...spacedRetest,
    helpLevel: 0
  }, { hintUsed: true }));
  assertGuidedEvidence(evaluate({
    id: "independent-claim-with-help-level",
    ...spacedRetest,
    helpLevel: 1
  }));
  assertGuidedEvidence(evaluate({
    id: "independent-claim-with-guided-flag",
    ...spacedRetest,
    nalviGuided: true,
    helpLevel: 0
  }));
  assertGuidedEvidence(evaluate({
    id: "independent-claim-with-guided-mode",
    ...spacedRetest,
    independentRetest: true,
    evidenceMode: "guided",
    nalviGuided: false,
    helpLevel: 0
  }));
});

test("claims parciales e INDEPENDENT_RECALL inmediato no elevan evidencia dentro del plan", () => {
  for (const partialClaim of [
    { id: "isolated-independent-retest", independentRetest: true },
    { id: "isolated-independent-mode", evidenceMode: "independent" },
    { id: "isolated-spaced-retest", spacedRetest: true },
    { id: "missing-independent-mode", spacedRetest: true, independentRetest: true },
    { id: "missing-independent-retest", spacedRetest: true, evidenceMode: "independent" },
    { id: "missing-spaced-retest", independentRetest: true, evidenceMode: "independent" },
    {
      id: "immediate-independent-recall",
      type: "INDEPENDENT_RECALL",
      activityType: "INDEPENDENT_RECALL",
      spacedRetest: false,
      independentRetest: true,
      evidenceMode: "independent"
    }
  ]) {
    assertGuidedEvidence(evaluate({
      adaptivePlanId: "adaptive-partial-independent-claim",
      nalviGuided: false,
      helpLevel: 0,
      ...partialClaim
    }));
  }
});

test("sólo el retest espaciado con triple marca coherente puede aportar evidencia independiente al plan", () => {
  const evaluated = evaluate({
    id: "coherent-spaced-independent-retest",
    adaptivePlanId: "adaptive-independent-retest",
    spacedRetest: true,
    independentRetest: true,
    evidenceMode: "independent",
    nalviGuided: false,
    helpLevel: 0
  });
  assert.equal(evaluated.progression.guided, false);
  assert.equal(evaluated.progression.evidenceStrength, "independent");
  assert.equal(evaluated.progression.event.hintUsed, false);
  assert.equal(evaluated.progression.event.performanceFactors.hint, 1);

  const completion = progressionClient.evaluateObjectiveCompletion(evaluated);
  assert.equal(completion.objectiveEvidence.independentCorrectEvents, 1);
  assert.equal(completion.objectiveEvidence.lastEvidenceIndependentCorrect, true);
  assert.equal(completion.decision, "COMPLETE_OBJECTIVE");
  assert.equal(completion.canComplete, true);
});

test("una actividad ordinaria limpia conserva evidencia independiente", () => {
  const evaluated = evaluate({ id: "ordinary-independent-activity" });
  assert.equal(evaluated.progression.guided, false);
  assert.equal(evaluated.progression.evidenceStrength, "independent");
  assert.equal(evaluated.progression.event.hintUsed, false);
});
