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
const cleanIndependentResponse = Object.freeze({
  requiresStudentResponse: true,
  helpLevel: 0,
  answerExposure: "HIDDEN",
  nalviGuided: false,
  hints: Object.freeze([]),
  explanation: ""
});
const cleanAdaptiveSpacedRetest = Object.freeze({
  ...cleanIndependentResponse,
  adaptivePlanId: "adaptive-independent-retest",
  spacedRetest: true,
  independentRetest: true,
  evidenceMode: "independent"
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
  assertGuidedEvidence(evaluate({
    id: "independent-claim-with-hint",
    ...cleanAdaptiveSpacedRetest
  }, { hintUsed: true }));
  assertGuidedEvidence(evaluate({
    id: "independent-claim-with-help-level",
    ...cleanAdaptiveSpacedRetest,
    helpLevel: 1
  }));
  assertGuidedEvidence(evaluate({
    id: "independent-claim-with-guided-flag",
    ...cleanAdaptiveSpacedRetest,
    nalviGuided: true
  }));
  assertGuidedEvidence(evaluate({
    id: "independent-claim-with-guided-mode",
    ...cleanAdaptiveSpacedRetest,
    evidenceMode: "guided",
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
      ...cleanIndependentResponse,
      adaptivePlanId: "adaptive-partial-independent-claim",
      ...partialClaim
    }));
  }
});

test("claims de plan con identidad ausente o inválida fallan cerrados", () => {
  const { adaptivePlanId: _omittedPlanId, ...retestWithoutPlanId } = cleanAdaptiveSpacedRetest;
  const invalidPlans = [
    { id: "missing-plan-id", activity: retestWithoutPlanId },
    { id: "undefined-plan-id", activity: { ...cleanAdaptiveSpacedRetest, adaptivePlanId: undefined } },
    { id: "null-plan-id", activity: { ...cleanAdaptiveSpacedRetest, adaptivePlanId: null } },
    { id: "empty-plan-id", activity: { ...cleanAdaptiveSpacedRetest, adaptivePlanId: "" } },
    { id: "whitespace-plan-id", activity: { ...cleanAdaptiveSpacedRetest, adaptivePlanId: "   " } },
    { id: "untrimmed-plan-id", activity: { ...cleanAdaptiveSpacedRetest, adaptivePlanId: " plan-id " } },
    { id: "numeric-plan-id", activity: { ...cleanAdaptiveSpacedRetest, adaptivePlanId: 7 } },
    { id: "orphan-plan-index", activity: { ...cleanIndependentResponse, adaptivePlanIndex: 0 } }
  ];
  for (const invalidPlan of invalidPlans) {
    assertGuidedEvidence(evaluate({ id: invalidPlan.id, ...invalidPlan.activity }));
  }
});

test("el retest adaptativo falla cerrado ante cada metadato de independencia inválido", () => {
  const invalidCases = [
    { id: "passive-response", activity: { requiresStudentResponse: false } },
    { id: "missing-response-contract", activity: { requiresStudentResponse: undefined } },
    { id: "negative-help-level", activity: { helpLevel: -1 } },
    { id: "string-help-level", activity: { helpLevel: "0" } },
    { id: "nan-help-level", activity: { helpLevel: Number.NaN } },
    { id: "missing-help-level", activity: { helpLevel: undefined } },
    { id: "partial-hint-exposure", activity: { answerExposure: "PARTIAL_HINT" } },
    { id: "worked-example-exposure", activity: { answerExposure: "WORKED_EXAMPLE" } },
    { id: "explicit-solution-exposure", activity: { answerExposure: "EXPLICIT_SOLUTION" } },
    { id: "missing-answer-exposure", activity: { answerExposure: undefined } },
    { id: "guided-flag", activity: { nalviGuided: true } },
    { id: "missing-guided-flag", activity: { nalviGuided: undefined } },
    { id: "visible-hint", activity: { hints: ["Ayuda visible"] } },
    { id: "non-array-hints", activity: { hints: "" } },
    { id: "missing-hints", activity: { hints: undefined } },
    { id: "visible-explanation", activity: { explanation: "Explicación visible" } },
    { id: "whitespace-explanation", activity: { explanation: " " } },
    { id: "missing-explanation", activity: { explanation: undefined } },
    { id: "result-used-hint", result: { hintUsed: true } }
  ];
  for (const invalidCase of invalidCases) {
    assertGuidedEvidence(evaluate({
      id: invalidCase.id,
      ...cleanAdaptiveSpacedRetest,
      ...invalidCase.activity
    }, invalidCase.result));
  }
});

test("sólo el retest espaciado con triple marca coherente puede aportar evidencia independiente al plan", () => {
  const evaluated = evaluate({
    id: "coherent-spaced-independent-retest",
    ...cleanAdaptiveSpacedRetest
  }, { hintUsed: false });
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

test("un rechazo 400 de persistencia remota no altera el resultado ni el feedback local", async () => {
  const originalFetch = globalThis.fetch;
  let submittedBody = null;
  window.GCA_FIREBASE_LIVE = {
    auth: { currentUser: { uid: "authenticated-test-user", getIdToken: async () => "test-token" } }
  };
  globalThis.fetch = async (_url, options) => {
    submittedBody = JSON.parse(options.body);
    return { ok: false, status: 400 };
  };
  try {
    const evaluated = evaluate({ id: "remote-denial-keeps-local-result" });
    const persistence = await evaluated.progression.persisted;

    assert.deepEqual(persistence, { status: "failed", reason: "HTTP_400" });
    assert.equal(evaluated.progression.event.correct, true);
    assert.equal(evaluated.progression.guided, false);
    assert.equal(progressionClient.getLocalEvents().length, 1);
    assert.equal(submittedBody.correct, true);
  } finally {
    window.GCA_FIREBASE_LIVE = null;
    globalThis.fetch = originalFetch;
  }
});
