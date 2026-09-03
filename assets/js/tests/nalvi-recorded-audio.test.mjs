import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const script = readFileSync(new URL("../nalvi-recorded-audio.js", import.meta.url), "utf8");
const manifest = JSON.parse(readFileSync(new URL("../../audio/guarani/ali-2026/manifest.json", import.meta.url), "utf8"));

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
}

function responseFor(value = manifest) {
  return { ok: true, status: 200, json: async () => clone(value) };
}

function loadClient({
  baseURI = "https://nalvi.test/",
  fetchImpl = async () => responseFor(),
  legacyPlay,
  rejectPlayback = false,
  scriptSrc = "https://nalvi.test/assets/js/nalvi-recorded-audio.js",
  setTimeoutImpl = setTimeout,
  clearTimeoutImpl = clearTimeout
} = {}) {
  const audioSources = [];
  const fetchRequests = [];
  const warnings = [];
  const infos = [];

  class ElementStub {
    constructor() {
      this.attributes = new Map();
      this.classList = { toggle() {} };
    }
    setAttribute(name, value) { this.attributes.set(name, value); }
  }

  class AudioStub {
    constructor(source) {
      this.source = source;
      this.listeners = new Map();
      audioSources.push(source);
    }
    addEventListener(name, listener) { this.listeners.set(name, listener); }
    async play() {
      if (rejectPlayback) throw new Error("MEDIA_NOT_FOUND");
    }
  }

  const window = {};
  if (legacyPlay) window.playPronunciation = legacyPlay;
  const context = vm.createContext({
    Audio: AudioStub,
    Element: ElementStub,
    URL,
    console: {
      warn: (...args) => warnings.push(args.join(" ")),
      info: (...args) => infos.push(args.join(" "))
    },
    document: { baseURI, currentScript: { src: scriptSrc } },
    fetch: (...args) => { fetchRequests.push(args[0]); return fetchImpl(...args); },
    setTimeout: setTimeoutImpl,
    clearTimeout: clearTimeoutImpl,
    window
  });
  vm.runInContext(script, context, { filename: "nalvi-recorded-audio.js" });
  return { audioSources, fetchRequests, infos, registry: window.NALVI_RECORDED_AUDIO, warnings, window };
}

const firstSelection = Object.freeze({
  audioId: "NALVI-AUDIO-001",
  audioPath: "assets/audio/guarani/ali-2026/001-adio.m4a",
  audioText: "ADIÓ",
  audioAuthorized: true,
  humanRecorded: true
});

test("la carga lenta no reproduce antes de que el manifiesto esté ready", async () => {
  const pendingFetch = deferred();
  const client = loadClient({ fetchImpl: () => pendingFetch.promise });
  const playResult = client.registry.playSelection(firstSelection);

  assert.equal(client.registry.audit().state, "loading");
  assert.equal(client.audioSources.length, 0);
  assert.equal(client.registry.resolve("ADIÓ"), null);

  pendingFetch.resolve(responseFor());
  assert.equal(await playResult, true);
  assert.equal(client.registry.audit().state, "ready");
  assert.deepEqual(client.audioSources, ["https://nalvi.test/assets/audio/guarani/ali-2026/001-adio.m4a"]);
});

test("un fetch eternamente pendiente resuelve ready fail-closed al vencer el timeout", async () => {
  const pendingFetch = deferred();
  const timers = [];
  const client = loadClient({
    fetchImpl: () => pendingFetch.promise,
    setTimeoutImpl: (callback, delay) => {
      timers.push({ callback, delay, cleared: false });
      return timers.length;
    },
    clearTimeoutImpl: id => { if (timers[id - 1]) timers[id - 1].cleared = true; }
  });
  const playResult = client.registry.playSelection(firstSelection);

  assert.equal(client.registry.audit().state, "loading");
  assert.equal(client.registry.audit().manifestTimeoutMs, 8000);
  assert.equal(timers.length, 1);
  assert.equal(timers[0].delay, 8000);
  assert.equal(client.audioSources.length, 0);

  timers[0].callback();
  const status = await client.registry.ready;
  assert.equal(status.ok, false);
  assert.match(status.error, /AUDIO_MANIFEST_TIMEOUT/);
  assert.equal(await playResult, false);
  assert.equal(client.registry.audit().state, "failed");
  assert.equal(client.audioSources.length, 0);
  assert.equal(timers[0].cleared, true);
});

test("la resolución conserva el contrato ID/ruta/autorización/origen humano", async () => {
  const client = loadClient();
  assert.equal((await client.registry.ready).ok, true);
  const recording = client.registry.resolve("NALVI-AUDIO-099");

  assert.equal(recording.audioId, "NALVI-AUDIO-099");
  assert.equal(recording.path, "assets/audio/guarani/ali-2026/099-nahaniri.m4a");
  assert.equal(recording.audioPath, recording.path);
  assert.equal(recording.url, "https://nalvi.test/assets/audio/guarani/ali-2026/099-nahaniri.m4a");
  assert.equal(recording.audioAuthorized, true);
  assert.equal(recording.humanRecorded, true);
  assert.equal(client.registry.audit().importedRecordings, 99);
});

test("la galería debug carga el manifiesto desde assets y autoriza la ruta canónica", async () => {
  const client = loadClient({ baseURI: "https://nalvi.test/debug/activity-catalog.html" });
  assert.equal((await client.registry.ready).ok, true);

  assert.deepEqual(client.fetchRequests, ["https://nalvi.test/assets/audio/guarani/ali-2026/manifest.json"]);
  assert.equal(client.registry.authorize(firstSelection)?.id, "NALVI-AUDIO-001");
  assert.equal(client.registry.authorize({
    ...firstSelection,
    audioPath: "https://nalvi.test/assets/audio/guarani/ali-2026/001-adio.m4a"
  })?.id, "NALVI-AUDIO-001");
  assert.equal(client.registry.authorize({ ...firstSelection, audioPath: "../assets/audio/guarani/ali-2026/001-adio.m4a" }), null);

  const withoutCurrentScript = loadClient({
    baseURI: "https://nalvi.test/debug/activity-catalog.html",
    scriptSrc: ""
  });
  assert.equal((await withoutCurrentScript.registry.ready).ok, true);
  assert.deepEqual(withoutCurrentScript.fetchRequests, ["https://nalvi.test/assets/audio/guarani/ali-2026/manifest.json"]);
});

test("rechaza una ruta no incluida y una pareja ID/ruta incoherente", async () => {
  const client = loadClient();
  await client.registry.ready;

  assert.equal(await client.registry.playSelection({ ...firstSelection, audioPath: "assets/audio/guarani/ali-2026/no-existe.m4a" }), false);
  assert.equal(await client.registry.playSelection({ ...firstSelection, audioPath: "assets/audio/guarani/ali-2026/002-agaite.m4a" }), false);
  assert.equal(await client.registry.playSelection({ ...firstSelection, audioId: "NALVI-AUDIO-404" }), false);
  assert.equal(await client.registry.playSelection({ ...firstSelection, audioText: "Guavira" }), false);
  assert.equal(client.audioSources.length, 0);
});

test("los booleanos declarados no bastan y los campos de seguridad son obligatorios", async () => {
  const client = loadClient();
  await client.registry.ready;

  assert.equal(await client.registry.playSelection({ ...firstSelection, audioAuthorized: false }), false);
  assert.equal(await client.registry.playSelection({ ...firstSelection, humanRecorded: false }), false);
  assert.equal(await client.registry.playSelection({ ...firstSelection, audioId: "" }), false);
  assert.equal(await client.registry.playSelection({ ...firstSelection, audioPath: "" }), false);
  assert.equal(client.audioSources.length, 0);
});

test("una ruta con query, fragmento o credenciales falla cerrada", async () => {
  const client = loadClient();
  await client.registry.ready;

  assert.equal(await client.registry.playSelection({ ...firstSelection, audioPath: `${firstSelection.audioPath}?alternate=1` }), false);
  assert.equal(await client.registry.playSelection({ ...firstSelection, audioPath: `${firstSelection.audioPath}#clip` }), false);
  assert.equal(await client.registry.playSelection({ ...firstSelection, audioPath: "https://user:pass@nalvi.test/assets/audio/guarani/ali-2026/001-adio.m4a" }), false);
  assert.equal(client.audioSources.length, 0);
});

test("un alias ambiguo invalida toda la whitelist del cliente", async () => {
  const duplicate = clone(manifest);
  duplicate.recordings[1].label = `${duplicate.recordings[0].label} (variante)`;
  duplicate.recordings[1].sourceFile = `${duplicate.recordings[1].label}.m4a`;
  const client = loadClient({ fetchImpl: async () => responseFor(duplicate) });
  const status = await client.registry.ready;

  assert.equal(status.ok, false);
  assert.equal(client.registry.audit().state, "failed");
  assert.equal(client.registry.audit().importedRecordings, 0);
  assert.equal(await client.registry.playSelection(firstSelection), false);
  assert.equal(client.audioSources.length, 0);
});

test("el audio histórico conserva prioridad después de autorizar la selección", async () => {
  const legacyCalls = [];
  const client = loadClient({ legacyPlay: value => { legacyCalls.push(value); return value === "ADIÓ"; } });
  await client.registry.ready;

  assert.equal(await client.registry.playSelection({ ...firstSelection, audioText: "adio" }), true);
  assert.deepEqual(legacyCalls, ["ADIÓ"]);
  assert.equal(client.audioSources.length, 0);
});

test("playPath exige el contrato completo y conserva la ruta relativa separada de la URL", async () => {
  const client = loadClient();
  await client.registry.ready;

  assert.equal(await client.registry.playPath(firstSelection.audioPath), false);
  assert.equal(await client.registry.playPath(
    firstSelection.audioPath,
    null,
    firstSelection.audioId,
    true,
    true,
    firstSelection.audioText
  ), true);
  assert.deepEqual(client.audioSources, ["https://nalvi.test/assets/audio/guarani/ali-2026/001-adio.m4a"]);
});

test("un fallo real de reproducción se devuelve como false sin sintetizar ni sustituir", async () => {
  const client = loadClient({ rejectPlayback: true });
  await client.registry.ready;

  assert.equal(await client.registry.playSelection(firstSelection), false);
  assert.equal(client.audioSources.length, 1);
  assert.match(client.infos.join("\n"), /MEDIA_NOT_FOUND/);
});

test("si falla la descarga del manifiesto no se intenta reproducir", async () => {
  const client = loadClient({ fetchImpl: async () => ({ ok: false, status: 503 }) });
  const status = await client.registry.ready;

  assert.equal(status.ok, false);
  assert.equal(client.registry.audit().state, "failed");
  assert.equal(await client.registry.playSelection(firstSelection), false);
  assert.equal(client.audioSources.length, 0);
});
