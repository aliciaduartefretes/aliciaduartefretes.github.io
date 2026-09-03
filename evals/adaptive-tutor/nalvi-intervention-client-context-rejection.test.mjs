import assert from "node:assert/strict";
import test from "node:test";

test("un rechazo al preparar contexto abandona loading y usa fallback local seguro", async () => {
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
  const unhandled = [];
  const warnings = [];
  const onUnhandled = reason => unhandled.push(reason);
  process.on("unhandledRejection", onUnhandled);

  class FakeElement {
    constructor() {
      this.dataset = {};
      this.feedback = { className: "", textContent: "", setAttribute() {} };
      this.innerHTML = '<div id="feedback"></div>';
    }
    querySelector(selector) { return selector === "#feedback" ? this.feedback : null; }
    scrollIntoView() {}
  }

  const target = new FakeElement();
  const document = new EventTarget();
  document.documentElement = { lang: "es" };
  document.baseURI = "https://example.test/lesson";
  document.querySelector = selector => selector === "#lessonBody" ? target : null;
  const storage = new Map();
  let fetchCalls = 0;
  let renderedActivity = null;
  const window = new EventTarget();
  window.matchMedia = () => ({ matches: true });
  window.KUAA_GENERAL_ACTIVITY_DATA = { activities: [] };
  window.KUAA_ACTIVITY_ENGINE = {
    registerActivityRenderer() {},
    submitActivityResult() {}
  };
  window.NALVI_PROGRESSION = { diagnostic() {} };
  window.NALVI_RECORDED_AUDIO = {
    get ready() { return Promise.reject(new Error("registry-ready-rejected")); },
    resolve() { throw new Error("resolve must not run after rejected ready"); }
  };
  window.renderActivity = activity => {
    renderedActivity = activity;
    target.innerHTML = `<section data-rendered="${activity.activityType}"></section>`;
    return { rendered: true };
  };

  globalThis.Element = FakeElement;
  globalThis.document = document;
  globalThis.fetch = async () => { fetchCalls += 1; throw new Error("network must not run for context fallback"); };
  globalThis.localStorage = {
    getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, String(value)),
    removeItem: key => storage.delete(key)
  };
  globalThis.requestAnimationFrame = callback => callback();
  globalThis.setTimeout = (callback, _delay, ...args) => realSetTimeout(callback, 0, ...args);
  globalThis.window = window;
  const originalWarn = console.warn;
  console.warn = (...args) => warnings.push(args.map(String).join(" "));

  try {
    await import(`../../assets/js/nalvi-intervention-client.mjs?context-rejection=${Date.now()}`);
    document.dispatchEvent(new CustomEvent("nalvi:activity-scored", { detail: {
      activity: {
        id: "source-writing",
        conceptId: "family-mother",
        conceptIds: ["family-mother"],
        learningObjectiveId: "GG-LO-FAMILY",
        type: "writing",
        activityType: "writing",
        skill: "writing",
        difficulty: "foundation-1",
        prompt: "Escribe la palabra practicada.",
        acceptedAnswers: ["sy"],
        lessonContext: { sourceAnswer: "sy" }
      },
      result: { correct: false, value: "si" },
      uiLocale: "es"
    } }));

    for (let attempt = 0; attempt < 30 && !renderedActivity && /nalvi-tutor-loading/.test(target.innerHTML); attempt += 1) {
      await new Promise(resolve => realSetTimeout(resolve, 5));
    }
    await new Promise(resolve => realSetTimeout(resolve, 20));

    assert.equal(fetchCalls, 0, "el fallo de contexto debe forzar el fallback local");
    assert.equal(renderedActivity?.activityType, "INDEPENDENT_RECALL");
    assert.doesNotMatch(target.innerHTML, /nalvi-tutor-loading/);
    assert.ok(warnings.some(message => message.includes("NALVI_TUTOR_CONTEXT_BUILD_FALLBACK") && message.includes("registry-ready-rejected")));
    assert.deepEqual(unhandled, []);
  } finally {
    console.warn = originalWarn;
    process.off("unhandledRejection", onUnhandled);
    for (const [key, value] of Object.entries(originalGlobals)) {
      if (value === undefined) delete globalThis[key];
      else globalThis[key] = value;
    }
  }
});
