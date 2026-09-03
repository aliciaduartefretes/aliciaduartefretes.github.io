import { spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { delimiter, dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveFirebaseToolsEntrypoint, runFirebaseTools } from "./firebase-tools-launcher.mjs";
import { evaluatePre8CTestInventory, normalizeDiscoveredTestPath } from "./pre-8c-test-inventory.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const ignoredDirectories = new Set([".git", ".firebase", "node_modules", "versions"]);
const expectedFirestoreChecks = Object.freeze([
  "Estudiante puede leer su propia memoria pedagógica",
  "Estudiante no puede leer la memoria de otro estudiante",
  "Docente autorizado puede leer y docente ajeno no",
  "Cliente no puede fabricar eventos, mastery, baseline ni repaso",
  "Estudiante no puede elevar su rol pero conserva progreso heredado",
  "Docente con membresía confiable puede conservar su rol de perfil",
  "Cliente no puede aprobar conocimiento ni emitir certificados"
]);
const expectedFirestoreCheckCount = expectedFirestoreChecks.length;
const validators = [
  "scripts/validate-paso-7B.mjs",
  "scripts/validate-paso-8.mjs",
  "scripts/validate-paso-8B.mjs",
  "scripts/validate-paso-8B-5-normative.mjs",
  "scripts/validate-pre-8C-grammar.mjs",
  "scripts/validate-pre-8c-progression.mjs"
];

function discoverTests(directory = root) {
  const tests = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!ignoredDirectories.has(entry.name)) tests.push(...discoverTests(join(directory, entry.name)));
    } else if (entry.isFile() && entry.name.endsWith(".test.mjs")) {
      tests.push(normalizeDiscoveredTestPath(relative(root, join(directory, entry.name))));
    }
  }
  return tests.sort();
}

function emit(result) {
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    env: options.env || process.env,
    maxBuffer: 20 * 1024 * 1024
  });
  emit(result);
  return result;
}

function tapTotals(output) {
  const values = key => [...String(output || "").matchAll(new RegExp(`^# ${key} (\\d+)$`, "gm"))];
  const last = key => {
    const matches = values(key);
    return matches.length ? Number(matches.at(-1)[1]) : null;
  };
  return { tests: last("tests"), pass: last("pass"), fail: last("fail") };
}

function firestoreCheckTotals(output) {
  const text = String(output || "");
  const observedResults = [...text.matchAll(/^(?:# )?(PASS|FAIL) (.+)$/gm)].map(match => ({ status: match[1], detail: match[2].trim() }));
  const matchesExpectedName = (result, name) => result.detail === name || result.detail.startsWith(`${name}:`);
  const slotResults = expectedFirestoreChecks.map(name => {
    const matches = observedResults.filter(result => matchesExpectedName(result, name));
    if (matches.length === 0) return "BLOCKED";
    if (matches.length > 1) return "FAIL";
    return matches[0].status;
  });
  const unexpectedResults = observedResults.filter(result => !expectedFirestoreChecks.some(name => matchesExpectedName(result, name)));
  const duplicateExpectedResults = expectedFirestoreChecks.filter(name => observedResults.filter(result => matchesExpectedName(result, name)).length > 1);
  let pass = slotResults.filter(status => status === "PASS").length;
  let fail = slotResults.filter(status => status === "FAIL").length;
  let blocked = slotResults.filter(status => status === "BLOCKED").length;
  const inventoryMismatch = unexpectedResults.length > 0 || duplicateExpectedResults.length > 0;
  if (unexpectedResults.length > 0 && fail === 0) {
    if (pass > 0) pass -= 1;
    else blocked -= 1;
    fail += 1;
  }
  return {
    tests: expectedFirestoreCheckCount,
    expectedChecks: expectedFirestoreCheckCount,
    pass,
    fail,
    blocked,
    observed: observedResults.length,
    unexpectedResults: unexpectedResults.length,
    duplicateExpectedResults: duplicateExpectedResults.length,
    inventoryMismatch
  };
}

const blockedFirestoreTotals = reason => ({
  status: "BLOCKED",
  reason,
  tests: expectedFirestoreCheckCount,
  expectedChecks: expectedFirestoreCheckCount,
  pass: 0,
  fail: 0,
  blocked: expectedFirestoreCheckCount,
  observed: 0,
  unexpectedResults: 0,
  duplicateExpectedResults: 0,
  inventoryMismatch: false
});

function javaEnvironment() {
  const current = spawnSync("java", ["-version"], { encoding: "utf8" });
  if (current.status === 0) return process.env;

  const javaExecutable = process.platform === "win32" ? "java.exe" : "java";
  const configuredJavaHome = process.env.JAVA_HOME;
  if (configuredJavaHome && existsSync(join(configuredJavaHome, "bin", javaExecutable))) {
    return {
      ...process.env,
      PATH: `${join(configuredJavaHome, "bin")}${delimiter}${process.env.PATH || ""}`
    };
  }

  const androidStudioJavaHome = "/Applications/Android Studio.app/Contents/jbr/Contents/Home";
  if (!existsSync(join(androidStudioJavaHome, "bin", javaExecutable))) return null;
  return {
    ...process.env,
    JAVA_HOME: androidStudioJavaHome,
    PATH: `${join(androidStudioJavaHome, "bin")}${delimiter}${process.env.PATH || ""}`
  };
}

function runFirestoreTest() {
  const firebaseEntrypoint = resolveFirebaseToolsEntrypoint();
  if (!firebaseEntrypoint) {
    return blockedFirestoreTotals("FIREBASE_CLI_NOT_INSTALLED");
  }
  const env = javaEnvironment();
  if (!env) return blockedFirestoreTotals("JAVA_NOT_AVAILABLE");

  const result = runFirebaseTools([
    "emulators:exec",
    "--only", "firestore",
    "--project", "demo-nalvi-paso-6",
    "--config", join(root, "firebase", "firebase.json"),
    "--non-interactive",
    "node --test --test-reporter=tap firebase/firestore-paso-6.test.mjs"
  ], {
    cwd: root,
    encoding: "utf8",
    env: {
      ...env,
      FIREBASE_TOOLS_DISABLE_UPDATE_CHECK: "true",
      XDG_CONFIG_HOME: join(root, ".firebase", "config")
    },
    maxBuffer: 20 * 1024 * 1024
  }, {
    firebaseEntrypoint
  });
  emit(result);
  const totals = firestoreCheckTotals(`${result.stdout || ""}\n${result.stderr || ""}`);
  if (totals.observed === 0) {
    return blockedFirestoreTotals(result.error ? String(result.error.message || result.error) : "FIRESTORE_EMULATOR_DID_NOT_START");
  }
  if (result.status !== 0 && totals.fail === 0) {
    const processBlockedTotals = totals.blocked > 0
      ? totals
      : { ...totals, pass: Math.max(0, totals.pass - 1), blocked: 1 };
    return {
      status: "BLOCKED",
      reason: result.error ? String(result.error.message || result.error) : "FIRESTORE_EMULATOR_PROCESS_FAILED",
      ...processBlockedTotals
    };
  }
  return {
    status: result.status === 0 && totals.fail === 0 && totals.blocked === 0 && !totals.inventoryMismatch ? "PASS" : totals.fail > 0 ? "FAIL" : "BLOCKED",
    reason: totals.inventoryMismatch
      ? `FIRESTORE_CHECK_INVENTORY_MISMATCH:${totals.observed}/${expectedFirestoreCheckCount}`
      : result.error
        ? String(result.error.message || result.error)
        : totals.blocked > 0
          ? `FIRESTORE_CHECKS_NOT_OBSERVED:${totals.observed}/${expectedFirestoreCheckCount}`
          : null,
    ...totals
  };
}

const discoveredTests = discoverTests();
const firestoreTest = "firebase/firestore-paso-6.test.mjs";
const nodeTests = discoveredTests.filter(testPath => testPath !== firestoreTest);

console.log(`PRE-8C QA: ${discoveredTests.length} archivos de prueba descubiertos.`);
console.log("\n=== Pruebas Node (sin Firestore) ===");
const nodeResult = run(process.execPath, ["--test", "--test-reporter=tap", ...nodeTests]);
const parsedNodeTotals = tapTotals(`${nodeResult.stdout || ""}\n${nodeResult.stderr || ""}`);
const nodePass = parsedNodeTotals.pass ?? 0;
const nodeFail = parsedNodeTotals.fail ?? (nodeResult.status === 0 ? 0 : 1);
const nodeTestInventory = Math.max(parsedNodeTotals.tests ?? 0, nodePass + nodeFail);
const nodeTotals = {
  status: nodeResult.status === 0 ? "PASS" : "FAIL",
  tests: nodeTestInventory,
  pass: nodePass,
  fail: nodeFail,
  blocked: nodeTestInventory - nodePass - nodeFail
};

console.log("\n=== Reglas Firestore (emulador local, proyecto demo) ===");
const firestoreTotals = runFirestoreTest();
if (firestoreTotals.status === "BLOCKED") console.error(`BLOCKED Firestore: ${firestoreTotals.reason}`);

const validatorResults = [];
for (const validator of validators) {
  console.log(`\n=== ${validator} ===`);
  const result = run(process.execPath, [validator]);
  validatorResults.push({
    validator,
    status: result.status === 0 ? "PASS" : "FAIL",
    reason: result.error ? String(result.error.message || result.error) : null
  });
}

const testTotals = {
  pass: nodeTotals.pass + firestoreTotals.pass,
  fail: nodeTotals.fail + firestoreTotals.fail,
  blocked: nodeTotals.blocked + firestoreTotals.blocked,
  total: nodeTotals.tests + firestoreTotals.tests
};
if (testTotals.pass + testTotals.fail + testTotals.blocked !== testTotals.total) {
  throw new Error("PRE_8C_TEST_INVENTORY_MISMATCH");
}
const testInventory = evaluatePre8CTestInventory({
  discoveredTestFiles: discoveredTests,
  observedTestCount: testTotals.total
});
const validatorTotals = {
  pass: validatorResults.filter(result => result.status === "PASS").length,
  fail: validatorResults.filter(result => result.status === "FAIL").length,
  blocked: validatorResults.filter(result => result.status === "BLOCKED").length,
  total: validatorResults.length
};
const summary = {
  step: "PRE-8C-QA",
  discoveredTestFiles: discoveredTests.length,
  node: nodeTotals,
  firestore: firestoreTotals,
  tests: testTotals,
  testInventory,
  validators: validatorTotals,
  validatorResults,
  paso8CMayStart: false,
  firebaseDeploymentPerformed: false
};

console.log("\n=== Resumen PRE-8C QA ===");
console.log(JSON.stringify(summary, null, 2));
if (testInventory.status !== "PASS" || testTotals.fail > 0 || testTotals.blocked > 0 || validatorTotals.fail > 0 || validatorTotals.blocked > 0) {
  process.exitCode = 1;
}
