import test from "node:test";
import assert from "node:assert/strict";
import {
  FIREBASE_TOOLS_ENTRYPOINT_MODULE,
  resolveFirebaseToolsEntrypoint,
  runFirebaseTools
} from "../firebase-tools-launcher.mjs";

test("resuelve el entrypoint JavaScript declarado por firebase-tools", () => {
  const expectedEntrypoint = "/tmp/NALVI QA/node_modules/firebase-tools/lib/bin/firebase.js";
  let requestedModule = null;
  const entrypoint = resolveFirebaseToolsEntrypoint({
    resolveModule(moduleId) {
      requestedModule = moduleId;
      return expectedEntrypoint;
    }
  });

  assert.equal(requestedModule, FIREBASE_TOOLS_ENTRYPOINT_MODULE);
  assert.equal(entrypoint, expectedEntrypoint);
  assert.doesNotMatch(entrypoint, /\.cmd$/i);
});

test("fuera de Windows conserva argv seguro sin activar windowsHide", () => {
  let invocation = null;
  runFirebaseTools(["--version"], {}, {
    platform: "linux",
    execPath: "/usr/bin/node",
    firebaseEntrypoint: "/repo with spaces/node_modules/firebase-tools/lib/bin/firebase.js",
    spawnSyncImpl(command, args, options) {
      invocation = { command, args, options };
      return { status: 0, stdout: "", stderr: "" };
    }
  });

  assert.equal(invocation.command, "/usr/bin/node");
  assert.deepEqual(invocation.args, [
    "/repo with spaces/node_modules/firebase-tools/lib/bin/firebase.js",
    "--version"
  ]);
  assert.equal(invocation.options.shell, false);
  assert.equal(invocation.options.windowsHide, false);
});

test("Windows ejecuta firebase-tools con Node y argv seguros aun cuando las rutas contienen espacios", () => {
  const root = "C:\\Worktrees\\NALVI QA Portability Regression Pre8C";
  const node = "C:\\Program Files\\nodejs\\node.exe";
  const firebaseEntrypoint = `${root}\\node_modules\\firebase-tools\\lib\\bin\\firebase.js`;
  const firebaseConfig = `${root}\\firebase\\firebase.json`;
  const firebaseArgs = [
    "emulators:exec",
    "--only", "firestore",
    "--project", "demo-nalvi-paso-6",
    "--config", firebaseConfig,
    "--non-interactive",
    "node --test --test-reporter=tap firebase/firestore-paso-6.test.mjs"
  ];
  const expectedResult = { status: 0, stdout: "", stderr: "" };
  let invocation = null;
  let requestedModule = null;
  const result = runFirebaseTools(firebaseArgs, {
    cwd: root,
    encoding: "utf8",
    shell: true
  }, {
    platform: "win32",
    execPath: node,
    resolveModule(moduleId) {
      requestedModule = moduleId;
      return firebaseEntrypoint;
    },
    spawnSyncImpl(command, args, options) {
      invocation = { command, args, options };
      return expectedResult;
    }
  });

  assert.equal(result, expectedResult);
  assert.equal(requestedModule, FIREBASE_TOOLS_ENTRYPOINT_MODULE);
  assert.equal(invocation.command, node);
  assert.deepEqual(invocation.args, [firebaseEntrypoint, ...firebaseArgs]);
  assert.equal(invocation.options.cwd, root);
  assert.equal(invocation.options.shell, false);
  assert.equal(invocation.options.windowsHide, true);
  assert.ok(invocation.args.includes(firebaseConfig));
  assert.ok(invocation.args.every(argument => !/^".*"$/.test(argument)));
  assert.doesNotMatch([invocation.command, ...invocation.args].join("\n"), /firebase\.cmd/i);
});

test("un fallo de resolución permanece bloqueado sin intentar spawn", () => {
  let spawnCalls = 0;
  const result = runFirebaseTools([], {}, {
    platform: "win32",
    resolveModule() { throw new Error("MODULE_NOT_FOUND"); },
    spawnSyncImpl() { spawnCalls += 1; }
  });
  assert.equal(spawnCalls, 0);
  assert.equal(result.status, null);
  assert.equal(result.error?.code, "FIREBASE_CLI_NOT_INSTALLED");
});
