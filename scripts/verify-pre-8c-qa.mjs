import { spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { delimiter, dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const ignoredDirectories = new Set([".git", ".firebase", "node_modules", "versions"]);
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
      tests.push(relative(root, join(directory, entry.name)));
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
  const pass = [...text.matchAll(/^(?:# )?PASS /gm)].length;
  const fail = [...text.matchAll(/^(?:# )?FAIL /gm)].length;
  return { tests: pass + fail, pass, fail };
}

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
  const executable = join(root, "node_modules", ".bin", process.platform === "win32" ? "firebase.cmd" : "firebase");
  if (!existsSync(executable)) {
    return { status: "BLOCKED", reason: "FIREBASE_CLI_NOT_INSTALLED", tests: 0, pass: 0, fail: 0, blocked: 1 };
  }
  const env = javaEnvironment();
  if (!env) return { status: "BLOCKED", reason: "JAVA_NOT_AVAILABLE", tests: 0, pass: 0, fail: 0, blocked: 1 };

  const result = run(executable, [
    "emulators:exec",
    "--only", "firestore",
    "--project", "demo-nalvi-paso-6",
    "--config", join(root, "firebase", "firebase.json"),
    "--non-interactive",
    "node --test --test-reporter=tap firebase/firestore-paso-6.test.mjs"
  ], {
    env: {
      ...env,
      FIREBASE_TOOLS_DISABLE_UPDATE_CHECK: "true",
      XDG_CONFIG_HOME: join(root, ".firebase", "config")
    }
  });
  const totals = firestoreCheckTotals(`${result.stdout || ""}\n${result.stderr || ""}`);
  if (totals.tests === 0) {
    return {
      status: "BLOCKED",
      reason: result.error ? String(result.error.message || result.error) : "FIRESTORE_EMULATOR_DID_NOT_START",
      tests: 0,
      pass: 0,
      fail: 0,
      blocked: 1
    };
  }
  if (result.status !== 0 && totals.fail === 0) {
    return {
      status: "BLOCKED",
      reason: result.error ? String(result.error.message || result.error) : "FIRESTORE_EMULATOR_PROCESS_FAILED",
      tests: totals.tests,
      pass: totals.pass,
      fail: 0,
      blocked: 1
    };
  }
  return {
    status: result.status === 0 && totals.fail === 0 ? "PASS" : "FAIL",
    reason: result.error ? String(result.error.message || result.error) : null,
    tests: totals.tests,
    pass: totals.pass,
    fail: totals.fail,
    blocked: 0
  };
}

const discoveredTests = discoverTests();
const firestoreTest = "firebase/firestore-paso-6.test.mjs";
const nodeTests = discoveredTests.filter(testPath => testPath !== firestoreTest);

console.log(`PRE-8C QA: ${discoveredTests.length} archivos de prueba descubiertos.`);
console.log("\n=== Pruebas Node (sin Firestore) ===");
const nodeResult = run(process.execPath, ["--test", "--test-reporter=tap", ...nodeTests]);
const parsedNodeTotals = tapTotals(`${nodeResult.stdout || ""}\n${nodeResult.stderr || ""}`);
const nodeTotals = {
  status: nodeResult.status === 0 ? "PASS" : "FAIL",
  tests: parsedNodeTotals.tests ?? 0,
  pass: parsedNodeTotals.pass ?? 0,
  fail: parsedNodeTotals.fail ?? (nodeResult.status === 0 ? 0 : 1),
  blocked: 0
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
  total: nodeTotals.tests + firestoreTotals.tests + firestoreTotals.blocked
};
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
  validators: validatorTotals,
  validatorResults,
  paso8CMayStart: false,
  firebaseDeploymentPerformed: false
};

console.log("\n=== Resumen PRE-8C QA ===");
console.log(JSON.stringify(summary, null, 2));
if (testTotals.fail > 0 || testTotals.blocked > 0 || validatorTotals.fail > 0 || validatorTotals.blocked > 0) {
  process.exitCode = 1;
}
