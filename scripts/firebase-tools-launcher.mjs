import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

export const FIREBASE_TOOLS_ENTRYPOINT_MODULE = "firebase-tools/lib/bin/firebase.js";

const defaultResolveModule = createRequire(import.meta.url).resolve;

export function resolveFirebaseToolsEntrypoint({ resolveModule = defaultResolveModule } = {}) {
  try {
    const entrypoint = resolveModule(FIREBASE_TOOLS_ENTRYPOINT_MODULE);
    return typeof entrypoint === "string" && entrypoint ? entrypoint : null;
  } catch {
    return null;
  }
}

export function runFirebaseTools(firebaseArgs, spawnOptions = {}, dependencies = {}) {
  const {
    platform = process.platform,
    execPath = process.execPath,
    spawnSyncImpl = spawnSync,
    resolveModule = defaultResolveModule
  } = dependencies;
  const firebaseEntrypoint = dependencies.firebaseEntrypoint === undefined
    ? resolveFirebaseToolsEntrypoint({ resolveModule })
    : dependencies.firebaseEntrypoint;
  if (!firebaseEntrypoint) {
    const error = new Error("FIREBASE_CLI_NOT_INSTALLED");
    error.code = "FIREBASE_CLI_NOT_INSTALLED";
    return { status: null, stdout: "", stderr: "", error };
  }
  return spawnSyncImpl(execPath, [firebaseEntrypoint, ...firebaseArgs], {
    ...spawnOptions,
    windowsHide: platform === "win32",
    shell: false
  });
}
