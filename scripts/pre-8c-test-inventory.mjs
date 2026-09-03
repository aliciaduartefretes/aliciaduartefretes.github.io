export const PRE_8C_TEST_INVENTORY = Object.freeze({
  version: "pre-8c-qa-v1",
  baselineCheckpoint: "3f3dd42",
  minimumTestCount: 151,
  requiredTestFiles: Object.freeze([
    "activity-catalog/tests/activity-catalog.test.mjs",
    "ai/tests/reinforcement-engine.test.mjs",
    "assessment/tests/nalvi-answer-evaluator.test.mjs",
    "curriculum/tests/guarani-general-route.test.mjs",
    "evals/adaptive-tutor/adaptive-tutor.eval.test.mjs",
    "firebase/firestore-paso-6.test.mjs",
    "grammar-engine/tests/grammar-engine.test.mjs",
    "intervention-engine/tests/intervention-engine.test.mjs",
    "mastery-engine/tests/mastery-engine.test.mjs",
    "progression-engine/tests/progression-client-evidence.test.mjs",
    "progression-engine/tests/progression-gate.test.mjs",
    "scripts/tests/firebase-tools-launcher.test.mjs",
    "scripts/tests/pre-8c-test-inventory.test.mjs",
    "server/tests/adaptive-intervention-plan.test.mjs",
    "server/tests/adaptive-tutor-orchestrator.test.mjs",
    "server/tests/firebase-id-token.test.mjs",
    "server/tests/mastery-attempt-service.test.mjs",
    "server/tests/normative-pilot-activation.test.mjs"
  ])
});

export const normalizeDiscoveredTestPath = value => String(value).replaceAll("\\", "/");

export function evaluatePre8CTestInventory({
  discoveredTestFiles,
  observedTestCount,
  inventory = PRE_8C_TEST_INVENTORY
}) {
  const discovered = new Set(discoveredTestFiles.map(normalizeDiscoveredTestPath));
  const missingRequiredTestFiles = inventory.requiredTestFiles.filter(file => !discovered.has(file));
  const testCountObserved = Number.isInteger(observedTestCount) && observedTestCount >= 0;
  const belowMinimumTestCount = testCountObserved && observedTestCount < inventory.minimumTestCount;

  return {
    status: missingRequiredTestFiles.length === 0 && testCountObserved && !belowMinimumTestCount ? "PASS" : "FAIL",
    version: inventory.version,
    baselineCheckpoint: inventory.baselineCheckpoint,
    requiredTestFiles: inventory.requiredTestFiles.length,
    discoveredTestFiles: discovered.size,
    minimumTestCount: inventory.minimumTestCount,
    observedTestCount: testCountObserved ? observedTestCount : null,
    missingRequiredTestFiles,
    belowMinimumTestCount
  };
}
