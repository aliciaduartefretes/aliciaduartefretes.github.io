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
  playImpl,
  scriptSrc = "https://nalvi.test/assets/js/nalvi-recorded-audio.js",
  setTimeoutImpl = setTimeout,
  clearTimeoutImpl = clearTimeout
} = {}) {
  const audioSources = [];
  const audioInstances = [];
  const fetchRequests = [];
  const warnings = [];
  const infos = [];

  class ElementStub {
    constructor() {
      this.dataset = {};
      this.disabled = false;
      this.hidden = false;
      this.attributes = new Map();
      this.classes = new Set();
      this.labelNode = { textContent: "" };
      this.iconNode = { textContent: "" };
      this.classList = {
        toggle: (name, force) => force ? this.classes.add(name) : this.classes.delete(name)
      };
    }
    setAttribute(name, value) { this.attributes.set(name, value); }
    querySelector(selector) {
      if (selector === "[data-audio-label]") return this.labelNode;
      if (selector === "[data-audio-icon]") return this.iconNode;
      return null;
    }
  }

  class AudioStub {
    constructor(source) {
      this.source = source;
      this.listeners = new Map();
      this.currentTime = 0;
      this.paused = true;
      this.pauseCalls = 0;
      this.playCalls = 0;
      this.preload = "";
      audioSources.push(source);
      audioInstances.push(this);
    }
    addEventListener(name, listener) { this.listeners.set(name, listener); }
    async play() {
      this.playCalls += 1;
      if (rejectPlayback) throw new Error("MEDIA_NOT_FOUND");
      if (playImpl) await playImpl(this);
      this.paused = false;
    }
    pause() { this.pauseCalls += 1; this.paused = true; }
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
  return { audioInstances, audioSources, ElementStub, fetchRequests, infos, registry: window.NALVI_RECORDED_AUDIO, warnings, window };
}

const firstSelection = Object.freeze({
  audioId: "NALVI-AUDIO-001",
  audioPath: "assets/audio/guarani/ali-2026/001-adio.m4a",
  audioText: "ADIÓ",
  audioAuthorized: true,
  humanRecorded: true,
  audioSource: "manifest-human-recording"
});
const richFirstSelection = Object.freeze({
  id: firstSelection.audioId,
  audioId: firstSelection.audioId,
  recordingId: firstSelection.audioId,
  path: firstSelection.audioPath,
  audioPath: firstSelection.audioPath,
  text: firstSelection.audioText,
  audioText: firstSelection.audioText,
  source: firstSelection.audioSource,
  audioSource: firstSelection.audioSource,
  authorized: true,
  audioAuthorized: true,
  humanRecorded: true
});

function canonicalSelection(recording) {
  return {
    audioId: recording.audioId,
    audioPath: recording.audioPath,
    audioText: recording.audioText,
    audioAuthorized: true,
    humanRecorded: true,
    audioSource: "manifest-human-recording"
  };
}

test("la carga lenta no reproduce antes de que el manifiesto esté ready", async () => {
  const pendingFetch = deferred();
  const client = loadClient({ fetchImpl: () => pendingFetch.promise });
  const playResult = client.registry.playSelection(firstSelection);

  assert.equal(client.registry.audit().state, "loading");
  assert.equal(client.audioSources.length, 0);
  assert.equal(client.registry.resolve("ADIÓ"), null);
  assert.equal(client.registry.list().length, 0);

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

test("un response.json eternamente pendiente también resuelve ready fail-closed", async () => {
  const pendingJson = deferred();
  const timers = [];
  const client = loadClient({
    fetchImpl: async () => ({ ok: true, status: 200, json: () => pendingJson.promise }),
    setTimeoutImpl: (callback, delay) => {
      timers.push({ callback, delay, cleared: false });
      return timers.length;
    },
    clearTimeoutImpl: id => { if (timers[id - 1]) timers[id - 1].cleared = true; }
  });
  const playResult = client.registry.playSelection(firstSelection);

  await Promise.resolve();
  await Promise.resolve();
  assert.equal(client.registry.audit().state, "loading");
  assert.equal(client.audioSources.length, 0);
  assert.equal(timers.length, 1);

  timers[0].callback();
  const status = await client.registry.ready;
  assert.equal(status.ok, false);
  assert.match(status.error, /AUDIO_MANIFEST_TIMEOUT/);
  assert.equal(await playResult, false);
  assert.equal(client.registry.audit().state, "failed");
  assert.equal(client.registry.audit().importedRecordings, 0);
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
  assert.equal(recording.audioSource, "manifest-human-recording");
  assert.equal(client.registry.audit().version, "NALVI_RECORDED_AUDIO_CLIENT_V3");
  assert.equal(client.registry.audit().importedRecordings, 99);
});

test("list expone las 99 grabaciones validadas y las muestras inicial, media y final", async () => {
  const client = loadClient();
  assert.equal((await client.registry.ready).ok, true);
  const listed = client.registry.list();

  assert.equal(listed.length, 99);
  assert.equal(Object.isFrozen(listed), true);
  for (const [index, expectedId, expectedFile] of [
    [0, "NALVI-AUDIO-001", "001-adio.m4a"],
    [49, "NALVI-AUDIO-050", "050-amamo-aha.m4a"],
    [98, "NALVI-AUDIO-099", "099-nahaniri.m4a"]
  ]) {
    assert.equal(listed[index].audioId, expectedId);
    assert.equal(listed[index].file, expectedFile);
    assert.equal(listed[index].audioPath, `assets/audio/guarani/ali-2026/${expectedFile}`);
    assert.equal(listed[index].format, "audio/mp4");
    assert.equal(listed[index].humanRecorded, true);
    assert.equal(Object.isFrozen(listed[index]), true);
  }
});

test("la galería debug carga el manifiesto desde assets y autoriza la ruta canónica", async () => {
  const client = loadClient({ baseURI: "https://nalvi.test/debug/activity-catalog.html" });
  assert.equal((await client.registry.ready).ok, true);

  assert.deepEqual(client.fetchRequests, ["https://nalvi.test/assets/audio/guarani/ali-2026/manifest.json"]);
  assert.equal(client.registry.authorize(firstSelection)?.id, "NALVI-AUDIO-001");
  assert.equal(client.registry.authorize({
    ...firstSelection,
    audioPath: "https://nalvi.test/assets/audio/guarani/ali-2026/001-adio.m4a"
  }), null);
  assert.equal(client.registry.authorize({ ...firstSelection, audioPath: "../assets/audio/guarani/ali-2026/001-adio.m4a" }), null);

  const withoutCurrentScript = loadClient({
    baseURI: "https://nalvi.test/debug/activity-catalog.html",
    scriptSrc: ""
  });
  assert.equal((await withoutCurrentScript.registry.ready).ok, true);
  assert.deepEqual(withoutCurrentScript.fetchRequests, ["https://nalvi.test/assets/audio/guarani/ali-2026/manifest.json"]);
});

test("authorize acepta canonical6 o rich12 exactos y rechaza aliases contradictorios", async () => {
  const client = loadClient();
  await client.registry.ready;

  assert.equal(client.registry.authorize(firstSelection)?.id, firstSelection.audioId);
  assert.equal(client.registry.authorize(richFirstSelection)?.id, firstSelection.audioId);
  for (const contradiction of [
    { id: "NALVI-AUDIO-002" },
    { recordingId: "NALVI-AUDIO-002" },
    { path: "assets/audio/guarani/ali-2026/002-agaite.m4a" },
    { text: "ÁG̃AITE" },
    { source: "client-claimed-source" },
    { authorized: false }
  ]) {
    assert.equal(client.registry.authorize({ ...richFirstSelection, ...contradiction }), null);
  }
  assert.equal(client.registry.authorize({ ...firstSelection, url: "https://evil.invalid/x.m4a" }), null);
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
  assert.equal(await client.registry.playSelection({ ...firstSelection, audioText: "" }), false);
  assert.equal(await client.registry.playSelection({ ...firstSelection, audioSource: "client-claim" }), false);
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
    firstSelection.audioText,
    firstSelection.audioSource
  ), true);
  assert.deepEqual(client.audioSources, ["https://nalvi.test/assets/audio/guarani/ali-2026/001-adio.m4a"]);
});

test("un fallo real de reproducción se devuelve como false sin sintetizar ni sustituir", async () => {
  const client = loadClient({ rejectPlayback: true });
  const button = new client.ElementStub();
  await client.registry.ready;

  assert.equal(await client.registry.playSelection(firstSelection, button), false);
  assert.equal(client.audioSources.length, 1);
  assert.match(client.infos.join("\n"), /MEDIA_NOT_FOUND/);
  assert.equal(button.dataset.audioState, "error");
  assert.equal(button.disabled, true);
  assert.equal(client.registry.audit().playbackState, "idle");
});

test("un doble clic es idempotente, no crea reproducciones simultáneas y libera el estado accesible", async () => {
  const client = loadClient();
  const button = new client.ElementStub();
  await client.registry.ready;

  const firstPlay = client.registry.playSelection(firstSelection, button);
  const secondPlay = client.registry.playSelection(firstSelection, button);
  assert.equal(await firstPlay, true);
  assert.equal(await secondPlay, true);
  assert.equal(client.audioSources.length, 1);
  assert.equal(button.attributes.get("aria-pressed"), "true");
  assert.equal(button.dataset.audioState, "playing");

  client.audioInstances[0].listeners.get("ended")();
  assert.equal(button.attributes.get("aria-pressed"), "false");
  assert.equal(button.dataset.audioState, "ready");
  assert.equal(await client.registry.playSelection(firstSelection, button), true);
  assert.equal(client.audioSources.length, 2);
});

test("el control recorre loading, playing, paused y reinicia la misma pista desde cero", async () => {
  const firstPlay = deferred();
  const client = loadClient({
    playImpl: audio => audio.playCalls === 1 ? firstPlay.promise : Promise.resolve()
  });
  const button = new client.ElementStub();
  Object.assign(button.dataset, {
    audioLabelLoading: "Cargando audio",
    audioLabelReady: "Escuchar audio",
    audioLabelPlaying: "Pausar audio",
    audioLabelPaused: "Reiniciar audio",
    audioLabelError: "Audio no disponible"
  });
  await client.registry.ready;

  const pending = client.registry.playSelection(firstSelection, button);
  await Promise.resolve();
  assert.equal(button.dataset.audioState, "loading");
  assert.equal(button.disabled, true);
  firstPlay.resolve();
  assert.equal(await pending, true);
  assert.equal(button.dataset.audioState, "playing");
  assert.equal(button.labelNode.textContent, "Pausar audio");

  client.audioInstances[0].currentTime = 1.25;
  assert.equal(await client.registry.playSelection(firstSelection, button), true);
  assert.equal(button.dataset.audioState, "paused");
  assert.equal(client.audioInstances[0].currentTime, 1.25);
  assert.equal(button.labelNode.textContent, "Reiniciar audio");

  assert.equal(await client.registry.playSelection(firstSelection, button), true);
  assert.equal(button.dataset.audioState, "playing");
  assert.equal(client.audioInstances[0].currentTime, 0);
  assert.equal(client.audioInstances.length, 1);
  assert.equal(client.audioInstances[0].playCalls, 2);
});

test("las muestras inicial, media y final se reproducen de a una y reinician la anterior", async () => {
  const client = loadClient();
  const firstButton = new client.ElementStub();
  const middleButton = new client.ElementStub();
  const finalButton = new client.ElementStub();
  await client.registry.ready;
  const middle = client.registry.resolve("NALVI-AUDIO-050");
  const final = client.registry.resolve("NALVI-AUDIO-099");

  assert.equal(await client.registry.playSelection(firstSelection, firstButton), true);
  client.audioInstances[0].currentTime = 2;
  assert.equal(await client.registry.playSelection(canonicalSelection(middle), middleButton), true);

  assert.equal(client.audioInstances.length, 2);
  assert.equal(client.audioInstances[0].paused, true);
  assert.equal(client.audioInstances[0].currentTime, 0);
  assert.equal(firstButton.dataset.audioState, "ready");
  assert.equal(middleButton.dataset.audioState, "playing");
  assert.equal(await client.registry.playSelection(canonicalSelection(final), finalButton), true);
  assert.equal(client.audioInstances.length, 3);
  assert.equal(client.audioInstances[1].paused, true);
  assert.equal(middleButton.dataset.audioState, "ready");
  assert.equal(finalButton.dataset.audioState, "playing");
  assert.deepEqual(client.audioSources, [
    "https://nalvi.test/assets/audio/guarani/ali-2026/001-adio.m4a",
    "https://nalvi.test/assets/audio/guarani/ali-2026/050-amamo-aha.m4a",
    "https://nalvi.test/assets/audio/guarani/ali-2026/099-nahaniri.m4a"
  ]);
  assert.equal(client.registry.audit().activeRecordingId, "NALVI-AUDIO-099");
  assert.equal(client.registry.audit().playbackState, "playing");
});

test("si falla la descarga del manifiesto no se intenta reproducir", async () => {
  const client = loadClient({ fetchImpl: async () => ({ ok: false, status: 503 }) });
  const status = await client.registry.ready;

  assert.equal(status.ok, false);
  assert.equal(client.registry.audit().state, "failed");
  assert.equal(await client.registry.playSelection(firstSelection), false);
  assert.equal(client.audioSources.length, 0);
});
