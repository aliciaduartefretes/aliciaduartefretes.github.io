import test from "node:test";
import assert from "node:assert/strict";
import { win32 } from "node:path";
import {
  PRE_8C_TEST_INVENTORY,
  evaluatePre8CTestInventory,
  normalizeDiscoveredTestPath
} from "../pre-8c-test-inventory.mjs";

const completeInventory = () => [...PRE_8C_TEST_INVENTORY.requiredTestFiles];

test("acepta el manifiesto versionado con al menos las 151 pruebas baseline", () => {
  assert.equal(PRE_8C_TEST_INVENTORY.version, "pre-8c-qa-v1");
  assert.equal(PRE_8C_TEST_INVENTORY.baselineCheckpoint, "3f3dd42");
  assert.equal(PRE_8C_TEST_INVENTORY.minimumTestCount, 151);
  const result = evaluatePre8CTestInventory({
    discoveredTestFiles: completeInventory(),
    observedTestCount: PRE_8C_TEST_INVENTORY.minimumTestCount
  });

  assert.equal(result.status, "PASS");
  assert.deepEqual(result.missingRequiredTestFiles, []);
  assert.equal(result.belowMinimumTestCount, false);
});

test("normaliza rutas Windows para excluir Firestore y contrastar el manifiesto", () => {
  const root = "C:\\Worktrees\\NALVI QA Portability Regression Pre8C";
  const firestore = win32.relative(root, win32.join(root, "firebase", "firestore-paso-6.test.mjs"));
  const normalized = normalizeDiscoveredTestPath(firestore);

  assert.equal(firestore, "firebase\\firestore-paso-6.test.mjs");
  assert.equal(normalized, "firebase/firestore-paso-6.test.mjs");
  assert.equal(normalized === "firebase/firestore-paso-6.test.mjs", true);
  const result = evaluatePre8CTestInventory({
    discoveredTestFiles: completeInventory().map(file => file.replaceAll("/", "\\")),
    observedTestCount: 151
  });
  assert.equal(result.status, "PASS");
});

test("omitir una suite obligatoria impide PASS aunque el conteo declarado sea alto", () => {
  const omitted = "progression-engine/tests/progression-gate.test.mjs";
  const discoveredTestFiles = completeInventory().filter(file => file !== omitted);
  const result = evaluatePre8CTestInventory({
    discoveredTestFiles,
    observedTestCount: PRE_8C_TEST_INVENTORY.minimumTestCount + 100
  });

  assert.equal(result.status, "FAIL");
  assert.deepEqual(result.missingRequiredTestFiles, [omitted]);
  assert.equal(result.belowMinimumTestCount, false);
});

test("un conteo inferior al baseline impide PASS aunque estén todas las suites", () => {
  const result = evaluatePre8CTestInventory({
    discoveredTestFiles: [...completeInventory(), "future/new-suite.test.mjs"],
    observedTestCount: PRE_8C_TEST_INVENTORY.minimumTestCount - 1
  });

  assert.equal(result.status, "FAIL");
  assert.deepEqual(result.missingRequiredTestFiles, []);
  assert.equal(result.belowMinimumTestCount, true);
});
