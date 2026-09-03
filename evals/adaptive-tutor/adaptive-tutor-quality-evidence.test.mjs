import test from "node:test";
import assert from "node:assert/strict";
import { planMetrics } from "../../server/adaptive-tutor-quality.mjs";

function metricsFor(activity, context = {}) {
  return planMetrics({ activities: [activity] }, context);
}

const independentActivity = {
  activityType: "INDEPENDENT_RECALL",
  independentRetest: true,
  spacedRetest: true,
  evidenceMode: "independent",
  nalviGuided: false,
  helpLevel: 0,
  hints: [],
  explanation: "",
  answerExposure: "HIDDEN"
};

test("un plan inmediato no convierte claims del modelo en evidencia independiente", () => {
  assert.equal(metricsFor(independentActivity).independentRetestCoverage, 0);
  assert.equal(metricsFor({
    ...independentActivity,
    spacedRetest: false
  }, { trustedSpacedRetest: true }).independentRetestCoverage, 0);
  assert.equal(metricsFor({
    ...independentActivity,
    independentRetest: false
  }, { trustedSpacedRetest: true }).independentRetestCoverage, 0);
  assert.equal(metricsFor({
    ...independentActivity,
    evidenceMode: "guided"
  }, { trustedSpacedRetest: true }).independentRetestCoverage, 0);
});

test("sólo una recuperación espaciada confiable, coherente y sin ayuda cuenta como evidencia", () => {
  const trustedContext = { trustedSpacedRetest: true };
  assert.equal(metricsFor(independentActivity, trustedContext).independentRetestCoverage, 1);

  for (const helpedActivity of [
    { ...independentActivity, nalviGuided: true },
    { ...independentActivity, helpLevel: 1 },
    { ...independentActivity, hints: ["Pista"] },
    { ...independentActivity, explanation: "Ayuda" },
    { ...independentActivity, answerExposure: "PARTIAL_HINT" }
  ]) {
    assert.equal(metricsFor(helpedActivity, trustedContext).independentRetestCoverage, 0);
  }
});
