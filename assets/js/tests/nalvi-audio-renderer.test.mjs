import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const galleryHtml = readFileSync(new URL("../../../debug/activity-catalog.html", import.meta.url), "utf8");
const rendererSource = readFileSync(new URL("../nalvi-activity-catalog-renderer.mjs", import.meta.url), "utf8");

function deferred() {
  let resolve;
  const promise = new Promise(promiseResolve => { resolve = promiseResolve; });
  return { promise, resolve };
}

class FakeButton {
  constructor({ disabled = false } = {}) {
    this.disabled = disabled;
    this.hidden = false;
    this.dataset = {};
    this.attributes = new Map();
    this.listeners = new Map();
    this.classes = new Set();
    this.labelNode = { textContent: "" };
    this.iconNode = { textContent: "" };
    this.classList = {
      add: name => this.classes.add(name),
      remove: name => this.classes.delete(name),
      toggle: (name, force) => force ? this.classes.add(name) : this.classes.delete(name)
    };
  }
  addEventListener(name, listener) { this.listeners.set(name, listener); }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  querySelector(selector) {
    if (selector === "[data-audio-label]") return this.labelNode;
    if (selector === "[data-audio-icon]") return this.iconNode;
    return null;
  }
  async dispatchClick() {
    const listener = this.listeners.get("click");
    if (listener) await listener({ target: this });
  }
}

class FakeTarget {
  constructor() {
    this.dataset = {};
    this.audioCard = { hidden: true };
    this.audioButton = new FakeButton({ disabled: true });
    this.checkButton = new FakeButton({ disabled: true });
    this.resetButton = new FakeButton();
    this.choiceButtons = [new FakeButton(), new FakeButton(), new FakeButton()];
    this._innerHTML = "";
  }
  set innerHTML(value) { this._innerHTML = value; }
  get innerHTML() { return this._innerHTML; }
  querySelector(selector) {
    if (selector === "[data-catalog-audio]") return this.audioButton;
    if (selector === "[data-catalog-audio-card]") return this.audioCard;
    if (selector === "[data-catalog-check]") return this.checkButton;
    if (selector === "[data-catalog-reset]") return this.resetButton;
    return null;
  }
  querySelectorAll(selector) {
    if (selector === "[data-choice]") return this.choiceButtons;
    return [];
  }
}

async function audioRendererFor(registry, playPronunciation = () => false) {
  const renderers = new Map();
  globalThis.window = {
    KUAA_ACTIVITY_ENGINE: {
      registerActivityRenderer(type, renderer) { renderers.set(type, renderer); },
      submitActivityResult() {}
    },
    NALVI_RECORDED_AUDIO: registry,
    playPronunciation
  };
  await import(`../nalvi-activity-catalog-renderer.mjs?audio-test=${Date.now()}-${Math.random()}`);
  return renderers.get("AUDIO_SELECT");
}

function activity(overrides = {}) {
  return {
    id: "audio-test",
    activityType: "AUDIO_SELECT",
    instruction: "Escucha",
    prompt: "Selecciona",
    audioId: "NALVI-AUDIO-096",
    audioPath: "assets/audio/guarani/ali-2026/096-jagua.m4a",
    audioText: "Jagua",
    audioAuthorized: true,
    humanRecorded: true,
    audioSource: "manifest-human-recording",
    options: [
      { id: "one", text: "Jagua" },
      { id: "two", text: "Guavira" },
      { id: "three", text: "Itatí" }
    ],
    correctOptionId: "one",
    correctAnswer: "Jagua",
    ...overrides
  };
}

const AUDIO_KEYS = Object.freeze([
  "audioAuthorized", "audioId", "audioPath", "audioSource", "audioText", "humanRecorded"
]);
function authorizeCanonicalSelection(selection) {
  if (!selection || JSON.stringify(Object.keys(selection).sort()) !== JSON.stringify(AUDIO_KEYS)) return null;
  return selection.audioId === "NALVI-AUDIO-096"
    && selection.audioPath === "assets/audio/guarani/ali-2026/096-jagua.m4a"
    && selection.audioText === "Jagua"
    && selection.audioAuthorized === true
    && selection.humanRecorded === true
    && selection.audioSource === "manifest-human-recording"
    ? { id: selection.audioId }
    : null;
}

test("la galería carga el registry antes del renderer", () => {
  const registryPosition = galleryHtml.indexOf("nalvi-recorded-audio.js");
  const rendererPosition = galleryHtml.indexOf("nalvi-activity-catalog-renderer.mjs");
  const galleryPosition = galleryHtml.indexOf("./activity-catalog.mjs");

  assert.ok(registryPosition > 0);
  assert.ok(rendererPosition > registryPosition);
  assert.ok(galleryPosition > rendererPosition);
  assert.match(galleryHtml, /nalvi-recorded-audio\.js\?v=NALVI-AUDIO-4/);
  assert.match(galleryHtml, /nalvi-activity-catalog-renderer\.mjs\?v=NALVI-CATALOG-RENDERER-6/);
  assert.match(galleryHtml, /id="recordedAudioLibrary"/);
  assert.match(rendererSource, /NALVI-ACTIVITY-CATALOG-RENDERER-6/);
  assert.match(rendererSource, /nalvi-activity-catalog\.mjs\?v=NALVI-CATALOG-3/);
});

test("el botón AUDIO_SELECT de la galería pasa de loading a ready sin reproducir antes", async () => {
  const pending = deferred();
  let ready = false;
  const selections = [];
  const registry = {
    ready: pending.promise.then(value => { ready = true; return value; }),
    authorize: selection => ready ? authorizeCanonicalSelection(selection) : null,
    playSelection: async selection => { selections.push(selection); return true; }
  };
  const render = await audioRendererFor(registry);
  const target = new FakeTarget();
  render(target, activity(), { language: "es" });

  assert.equal(target.audioButton.disabled, true);
  assert.equal(target.audioButton.hidden, true);
  assert.equal(target.audioCard.hidden, true);
  assert.equal(target.audioButton.dataset.audioState, "loading");
  await target.audioButton.dispatchClick();
  assert.equal(selections.length, 0);

  pending.resolve({ ok: true });
  await registry.ready;
  await Promise.resolve();
  assert.equal(target.audioButton.disabled, false);
  assert.equal(target.audioButton.hidden, false);
  assert.equal(target.audioCard.hidden, false);
  assert.equal(target.audioButton.dataset.audioState, "ready");
  assert.equal(target.audioButton.labelNode.textContent, "Escuchar audio");

  await target.audioButton.dispatchClick();
  assert.deepEqual(selections, [{
    audioId: "NALVI-AUDIO-096",
    audioPath: "assets/audio/guarani/ali-2026/096-jagua.m4a",
    audioText: "Jagua",
    audioAuthorized: true,
    humanRecorded: true,
    audioSource: "manifest-human-recording"
  }]);
  assert.equal(target.audioButton.dataset.audioState, "playing");
  assert.equal(target.audioButton.labelNode.textContent, "Pausar audio");
});

test("los cinco estados del botón tienen etiquetas completas en los seis idiomas", async () => {
  const expected = {
    es: ["Cargando audio", "Escuchar audio", "Pausar audio", "Reiniciar audio", "Audio no disponible"],
    en: ["Loading audio", "Play audio", "Pause audio", "Restart audio", "Audio unavailable"],
    pt: ["Carregando áudio", "Ouvir áudio", "Pausar áudio", "Reiniciar áudio", "Áudio indisponível"],
    fr: ["Chargement de l’audio", "Écouter l’audio", "Mettre l’audio en pause", "Recommencer l’audio", "Audio indisponible"],
    it: ["Caricamento audio", "Ascolta l’audio", "Metti in pausa l’audio", "Riavvia l’audio", "Audio non disponibile"],
    de: ["Audio wird geladen", "Audio abspielen", "Audio pausieren", "Audio neu starten", "Audio nicht verfügbar"]
  };
  for (const [locale, labels] of Object.entries(expected)) {
    const registry = {
      ready: Promise.resolve({ ok: true }),
      authorize: authorizeCanonicalSelection,
      playSelection: async () => true
    };
    const render = await audioRendererFor(registry);
    const target = new FakeTarget();
    render(target, activity(), { language: locale });
    await registry.ready;
    await Promise.resolve();
    assert.deepEqual([
      target.audioButton.dataset.audioLabelLoading,
      target.audioButton.dataset.audioLabelReady,
      target.audioButton.dataset.audioLabelPlaying,
      target.audioButton.dataset.audioLabelPaused,
      target.audioButton.dataset.audioLabelError
    ], labels, locale);
    assert.equal(target.audioButton.labelNode.textContent, labels[1], locale);
  }
});

test("la vista técnica publica exactamente 99 controles y filtra cualquier entrada no autorizada", async () => {
  const recordings = Array.from({ length: 100 }, (_, index) => {
    const ordinal = String(index + 1).padStart(3, "0");
    return {
      audioId: `NALVI-AUDIO-${ordinal}`,
      audioPath: `assets/audio/guarani/ali-2026/${ordinal}-sample.m4a`,
      audioText: `Muestra ${ordinal}`,
      audioAuthorized: true,
      humanRecorded: true,
      audioSource: "manifest-human-recording",
      file: `${ordinal}-sample.m4a`
    };
  });
  const registry = {
    ready: Promise.resolve({ ok: true }),
    list: () => recordings,
    authorize: selection => selection.audioId === "NALVI-AUDIO-100"
      ? null
      : recordings.find(item => item.audioId === selection.audioId),
    playSelection: async () => true,
    stop() {}
  };
  await audioRendererFor(registry);
  const target = {
    dataset: {},
    innerHTML: "",
    querySelectorAll() { return []; }
  };
  const result = await globalThis.window.NALVI_ACTIVITY_CATALOG.renderRecordedAudioLibrary(target, { language: "es" });

  assert.deepEqual(result, { ok: true, count: 99 });
  assert.equal(target.dataset.audioLibraryState, "ready");
  assert.equal((target.innerHTML.match(/data-recorded-audio-entry=/g) || []).length, 99);
  assert.match(target.innerHTML, /NALVI-AUDIO-001/);
  assert.match(target.innerHTML, /NALVI-AUDIO-099/);
  assert.doesNotMatch(target.innerHTML, /NALVI-AUDIO-100/);
});

test("AUDIO_SELECT no usa fallback textual cuando ID/ruta no están autorizados", async () => {
  let playbackCalls = 0;
  let legacyCalls = 0;
  const registry = {
    ready: Promise.resolve({ ok: true }),
    authorize: () => null,
    playSelection: async () => { playbackCalls += 1; return true; }
  };
  const render = await audioRendererFor(registry, () => { legacyCalls += 1; return true; });
  const target = new FakeTarget();
  render(target, activity({ audioPath: "assets/audio/no-autorizado.m4a" }), { language: "es" });
  await registry.ready;
  await Promise.resolve();

  assert.equal(target.audioButton.disabled, true);
  assert.equal(target.audioButton.hidden, true);
  assert.equal(target.audioCard.hidden, true);
  assert.equal(target.audioButton.dataset.audioState, "error");
  await target.audioButton.dispatchClick();
  assert.equal(playbackCalls, 0);
  assert.equal(legacyCalls, 0);
});

test("un fallo del reproductor deja AUDIO_SELECT cerrado", async () => {
  const registry = {
    ready: Promise.resolve({ ok: true }),
    authorize: authorizeCanonicalSelection,
    playSelection: async () => false
  };
  const render = await audioRendererFor(registry);
  const target = new FakeTarget();
  render(target, activity(), { language: "es" });
  await registry.ready;
  await Promise.resolve();

  assert.equal(target.audioButton.disabled, false);
  await target.audioButton.dispatchClick();
  assert.equal(target.audioButton.disabled, true);
  assert.equal(target.audioButton.hidden, false);
  assert.equal(target.audioCard.hidden, false);
  assert.equal(target.audioButton.dataset.audioState, "error");
  assert.equal(target.audioButton.labelNode.textContent, "Audio no disponible");
});

test("un segundo clic mientras reproduce no deshabilita ni desincroniza AUDIO_SELECT", async () => {
  const playing = deferred();
  let active = false;
  let audioInstances = 0;
  const registry = {
    ready: Promise.resolve({ ok: true }),
    authorize: authorizeCanonicalSelection,
    playSelection: async (_selection, button) => {
      if (active) return false;
      active = true;
      audioInstances += 1;
      button.setAttribute("aria-pressed", "true");
      await playing.promise;
      return true;
    }
  };
  const render = await audioRendererFor(registry);
  const target = new FakeTarget();
  render(target, activity(), { language: "es" });
  await registry.ready;
  await Promise.resolve();

  const firstClick = target.audioButton.dispatchClick();
  const secondClick = target.audioButton.dispatchClick();
  await secondClick;
  assert.equal(audioInstances, 1);
  assert.equal(target.audioButton.disabled, true);
  assert.equal(target.audioButton.dataset.audioState, "loading");
  assert.equal(target.audioButton.getAttribute("aria-pressed"), "true");

  playing.resolve();
  await firstClick;
  assert.equal(target.audioButton.disabled, false);
  assert.equal(target.audioButton.dataset.audioState, "playing");
});

test("AUDIO_SELECT permanece cerrado si falta o difiere cualquiera de los seis campos canónicos", async t => {
  const cases = [
    ["audioId", { audioId: "NALVI-AUDIO-095" }],
    ["audioPath", { audioPath: "assets/audio/guarani/ali-2026/095-itati.m4a" }],
    ["audioText sin fallback", { audioText: "" }],
    ["audioAuthorized", { audioAuthorized: false }],
    ["humanRecorded", { humanRecorded: false }],
    ["audioSource", { audioSource: "client-claimed-source" }]
  ];
  for (const [name, override] of cases) {
    await t.test(name, async () => {
      let playbackCalls = 0;
      const registry = {
        ready: Promise.resolve({ ok: true }),
        authorize: authorizeCanonicalSelection,
        playSelection: async () => { playbackCalls += 1; return true; }
      };
      const render = await audioRendererFor(registry);
      const target = new FakeTarget();
      render(target, activity(override), { language: "es" });
      await registry.ready;
      await Promise.resolve();
      assert.equal(target.audioButton.disabled, true);
      assert.equal(target.audioButton.hidden, true);
      assert.equal(target.audioCard.hidden, true);
      assert.equal(target.audioButton.dataset.audioState, "error");
      await target.audioButton.dispatchClick();
      assert.equal(playbackCalls, 0);
    });
  }
});
