import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const galleryHtml = readFileSync(new URL("../../../debug/activity-catalog.html", import.meta.url), "utf8");

function deferred() {
  let resolve;
  const promise = new Promise(promiseResolve => { resolve = promiseResolve; });
  return { promise, resolve };
}

class FakeButton {
  constructor({ disabled = false } = {}) {
    this.disabled = disabled;
    this.dataset = {};
    this.attributes = new Map();
    this.listeners = new Map();
    this.classList = { add() {}, remove() {} };
  }
  addEventListener(name, listener) { this.listeners.set(name, listener); }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  async dispatchClick() {
    const listener = this.listeners.get("click");
    if (listener) await listener({ target: this });
  }
}

class FakeTarget {
  constructor() {
    this.dataset = {};
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

test("la galería carga el registry antes del renderer", () => {
  const registryPosition = galleryHtml.indexOf("nalvi-recorded-audio.js");
  const rendererPosition = galleryHtml.indexOf("nalvi-activity-catalog-renderer.mjs");
  const galleryPosition = galleryHtml.indexOf("./activity-catalog.mjs");

  assert.ok(registryPosition > 0);
  assert.ok(rendererPosition > registryPosition);
  assert.ok(galleryPosition > rendererPosition);
});

test("el botón AUDIO_SELECT de la galería pasa de loading a ready sin reproducir antes", async () => {
  const pending = deferred();
  let ready = false;
  const selections = [];
  const registry = {
    ready: pending.promise.then(value => { ready = true; return value; }),
    authorize: selection => ready ? { id: selection.audioId } : null,
    playSelection: async selection => { selections.push(selection); return true; }
  };
  const render = await audioRendererFor(registry);
  const target = new FakeTarget();
  render(target, activity(), { language: "es" });

  assert.equal(target.audioButton.disabled, true);
  await target.audioButton.dispatchClick();
  assert.equal(selections.length, 0);

  pending.resolve({ ok: true });
  await registry.ready;
  await Promise.resolve();
  assert.equal(target.audioButton.disabled, false);
  assert.equal(target.audioButton.dataset.audioState, "ready");

  await target.audioButton.dispatchClick();
  assert.deepEqual(selections, [{
    audioId: "NALVI-AUDIO-096",
    audioPath: "assets/audio/guarani/ali-2026/096-jagua.m4a",
    audioText: "Jagua",
    audioAuthorized: true,
    humanRecorded: true
  }]);
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
  assert.equal(target.audioButton.dataset.audioState, "unavailable");
  await target.audioButton.dispatchClick();
  assert.equal(playbackCalls, 0);
  assert.equal(legacyCalls, 0);
});

test("un fallo del reproductor deja AUDIO_SELECT cerrado", async () => {
  const registry = {
    ready: Promise.resolve({ ok: true }),
    authorize: selection => ({ id: selection.audioId }),
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
  assert.equal(target.audioButton.dataset.audioState, "unavailable");
});
