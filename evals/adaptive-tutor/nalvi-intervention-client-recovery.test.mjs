import assert from "node:assert/strict";
import test from "node:test";

test("un fallo total del refuerzo deja reintentar o continuar y muestra una referencia", async () => {
  const originalGlobals = {
    document: globalThis.document,
    Element: globalThis.Element,
    fetch: globalThis.fetch,
    localStorage: globalThis.localStorage,
    requestAnimationFrame: globalThis.requestAnimationFrame,
    setTimeout: globalThis.setTimeout,
    window: globalThis.window
  };
  const realSetTimeout = globalThis.setTimeout;
  const storage = new Map();
  const resumed = [];
  const retried = [];

  class FakeButton extends EventTarget {
    click() { this.dispatchEvent(new Event("click")); }
  }

  class FakeElement {
    constructor() {
      this.dataset = {};
      this.feedback = { className: "", textContent: "", setAttribute() {} };
      this.retry = null;
      this.continue = null;
      this._innerHTML = '<div id="feedback"></div>';
    }
    set innerHTML(value) {
      this._innerHTML = String(value);
      this.retry = this._innerHTML.includes("data-nalvi-tutor-retry") ? new FakeButton() : null;
      this.continue = this._innerHTML.includes("data-nalvi-tutor-continue") ? new FakeButton() : null;
    }
    get innerHTML() { return this._innerHTML; }
    querySelector(selector) {
      if (selector === "#feedback") return this.feedback;
      if (selector === "[data-nalvi-tutor-retry]") return this.retry;
      if (selector === "[data-nalvi-tutor-continue]") return this.continue;
      return null;
    }
    scrollIntoView() {}
  }

  const target = new FakeElement();
  const document = new EventTarget();
  document.documentElement = { lang: "es" };
  document.baseURI = "https://example.test/lesson";
  document.querySelector = selector => selector === "#lessonBody" ? target : null;
  const window = new EventTarget();
  window.matchMedia = () => ({ matches: true });
  window.KUAA_GENERAL_ACTIVITY_DATA = { activities: [] };
  window.KUAA_ACTIVITY_ENGINE = { registerActivityRenderer() {}, submitActivityResult() {} };
  window.NALVI_PROGRESSION = { diagnostic() {} };
  window.NALVI_RECORDED_AUDIO = { ready: Promise.resolve({ count: 0 }), resolve: () => null };
  window.renderActivity = () => { throw new Error("forced-render-failure"); };
  window.addEventListener("nalvi:resume-objective-practice", event => resumed.push(event.detail));
  window.addEventListener("nalvi:retry-objective-practice", event => retried.push(event.detail));

  globalThis.Element = FakeElement;
  globalThis.document = document;
  globalThis.fetch = async () => ({ ok: false, status: 503, json: async () => ({}) });
  globalThis.localStorage = {
    getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, String(value)),
    removeItem: key => storage.delete(key)
  };
  globalThis.requestAnimationFrame = callback => callback();
  globalThis.setTimeout = (callback, _delay, ...args) => realSetTimeout(callback, 0, ...args);
  globalThis.window = window;

  try {
    await import(`../../assets/js/nalvi-intervention-client.mjs?recovery=${Date.now()}`);
    document.dispatchEvent(new CustomEvent("nalvi:activity-scored", { detail: {
      activity: {
        id: "legacy-general-0-0",
        conceptId: "GG-C-001",
        learningObjectiveId: "GG-LO-001",
        type: "multiple-choice",
        activityType: "multiple-choice",
        skill: "vocabulary",
        difficulty: "foundation-1",
        prompt: "Elige una respuesta.",
        options: [{ id: "a", label: "A" }, { id: "b", label: "B" }],
        correctOptionId: "a",
        acceptedAnswers: ["A"],
        lessonContext: { sourceAnswer: "A" }
      },
      result: { correct: false, value: "B" },
      uiLocale: "es"
    } }));

    for (let attempt = 0; attempt < 40 && !target.retry; attempt += 1) {
      await new Promise(resolve => realSetTimeout(resolve, 5));
    }

    assert.ok(target.retry, "la recuperación debe ofrecer reintento");
    assert.ok(target.continue, "la recuperación debe ofrecer otro ejercicio");
    assert.match(target.innerHTML, /GG-1-1/);
    assert.match(target.innerHTML, /tu lección no se perdió/);

    target.retry.click();
    target.continue.click();
    assert.deepEqual(retried, [{ courseId: "general", sourceActivityId: "legacy-general-0-0" }]);
    assert.equal(resumed.length, 1);
    assert.deepEqual(resumed[0].excludedActivityIds, ["legacy-general-0-0"]);

    const diagnostics = JSON.parse(storage.get("nalvi.lesson.recovery.v1") || "[]");
    assert.equal(diagnostics.at(-1)?.reference, "GG-1-1");
    assert.match(diagnostics.at(-1)?.reason || "", /NALVI_TUTOR_SAFE_FALLBACK_RENDER_FAILED/);
  } finally {
    for (const [key, value] of Object.entries(originalGlobals)) {
      if (value === undefined) delete globalThis[key];
      else globalThis[key] = value;
    }
  }
});
