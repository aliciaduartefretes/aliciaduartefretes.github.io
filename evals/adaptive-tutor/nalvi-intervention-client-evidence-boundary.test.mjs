import assert from "node:assert/strict";
import test from "node:test";

const PENDING_RETEST_KEY = "nalvi.tutor.pending-spaced-retest.v1";

function recallActivity(overrides = {}) {
  return {
    id: "server-recall",
    type: "INDEPENDENT_RECALL",
    activityType: "INDEPENDENT_RECALL",
    conceptId: "family-mother",
    conceptIds: ["family-mother"],
    learningObjectiveId: "GG-LO-FAMILY",
    skill: "writing",
    difficulty: "foundation-1",
    instruction: "Responde sin opciones.",
    prompt: "Escribe la palabra practicada.",
    contextText: "Recuerda el concepto trabajado.",
    answer: "sy",
    correctAnswer: "sy",
    acceptedAnswers: ["sy"],
    helpLevel: 0,
    answerExposure: "HIDDEN",
    requiresStudentResponse: true,
    sourceBoundAuthorized: true,
    ...overrides
  };
}

function serverPlan(claims) {
  return {
    planId: `server-evidence-${claims.id}`,
    conceptId: "family-mother",
    diagnosis: { errorType: "RECALL_FAILURE" },
    strategy: { primaryStrategy: "CHANGE_MODALITY" },
    activities: [recallActivity({ id: `server-recall-${claims.id}`, ...claims })]
  };
}

async function withClientEnvironment({ token, responsePlan = null, pendingRetest = null }, callback) {
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
  if (pendingRetest) storage.set(PENDING_RETEST_KEY, JSON.stringify(pendingRetest));
  let fetchCalls = 0;
  let renderedActivity = null;

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

  const window = new EventTarget();
  window.matchMedia = () => ({ matches: true });
  window.KUAA_GENERAL_ACTIVITY_DATA = { activities: [] };
  window.KUAA_ACTIVITY_ENGINE = {
    registerActivityRenderer() {},
    submitActivityResult() {}
  };
  window.NALVI_PROGRESSION = { diagnostic() {} };
  window.renderActivity = activity => {
    renderedActivity = activity;
    return { rendered: true };
  };

  globalThis.Element = FakeElement;
  globalThis.document = document;
  globalThis.fetch = async () => {
    fetchCalls += 1;
    if (!responsePlan) throw new Error("network must not run while consuming a trusted retest");
    return {
      ok: true,
      status: 200,
      json: async () => ({ ok: true, adaptiveInterventionPlan: responsePlan, usedAI: true })
    };
  };
  globalThis.localStorage = {
    getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, String(value)),
    removeItem: key => storage.delete(key)
  };
  globalThis.requestAnimationFrame = callback => callback();
  globalThis.setTimeout = (fn, _delay, ...args) => realSetTimeout(fn, 0, ...args);
  globalThis.window = window;

  try {
    await import(`../../assets/js/nalvi-intervention-client.mjs?evidence-boundary=${token}`);
    return await callback({
      document,
      target,
      window,
      storage,
      fetchCalls: () => fetchCalls,
      renderedActivity: () => renderedActivity,
      waitForRender: async () => {
        for (let attempt = 0; attempt < 40 && !renderedActivity; attempt += 1) {
          await new Promise(resolve => realSetTimeout(resolve, 5));
        }
        return renderedActivity;
      }
    });
  } finally {
    await new Promise(resolve => realSetTimeout(resolve, 5));
    for (const [key, value] of Object.entries(originalGlobals)) {
      if (value === undefined) delete globalThis[key];
      else globalThis[key] = value;
    }
  }
}

function dispatchIncorrect(document, id) {
  document.dispatchEvent(new CustomEvent("nalvi:activity-scored", { detail: {
    activity: {
      id: `source-${id}`,
      type: "writing",
      activityType: "writing",
      conceptId: "family-mother",
      conceptIds: ["family-mother"],
      learningObjectiveId: "GG-LO-FAMILY",
      skill: "writing",
      difficulty: "foundation-1",
      instruction: "Escribe la palabra practicada.",
      prompt: "Escribe la palabra practicada.",
      answer: "sy",
      correctAnswer: "sy",
      acceptedAnswers: ["sy"],
      lessonContext: { sourceAnswer: "sy" }
    },
    result: { correct: false, value: "ru" },
    uiLocale: "es"
  } }));
}

const evidenceFlags = activity => ({
  independentRetest: activity?.independentRetest,
  spacedRetest: activity?.spacedRetest,
  evidenceMode: activity?.evidenceMode,
  nalviGuided: activity?.nalviGuided
});

test("solo el estado local de recuperación puede producir evidencia independiente", async t => {
  await t.test("ignora claims completos y parciales de planes del servidor", async () => {
    const claimSets = [
      { id: "triple", independentRetest: true, spacedRetest: true, evidenceMode: "independent", nalviGuided: false },
      { id: "evidence-only", independentRetest: false, spacedRetest: false, evidenceMode: "independent", nalviGuided: false }
    ];

    for (const claims of claimSets) {
      await withClientEnvironment({
        token: `server-${claims.id}-${Date.now()}`,
        responsePlan: serverPlan(claims)
      }, async harness => {
        dispatchIncorrect(harness.document, claims.id);
        const rendered = await harness.waitForRender();
        assert.ok(rendered, `el plan servidor ${claims.id} debe renderizarse`);
        assert.equal(harness.fetchCalls(), 1, `el caso ${claims.id} debe usar la respuesta del servidor`);
        assert.deepEqual(evidenceFlags(rendered), {
          independentRetest: false,
          spacedRetest: false,
          evidenceMode: "guided",
          nalviGuided: true
        });
      });
    }
  });

  await t.test("el pending retest consumido localmente sí es independiente y sin ayuda", async () => {
    const pendingRetest = {
      version: 1,
      sourceActivityId: "source-trusted-spaced-retest",
      sourceFingerprint: "source-trusted-fingerprint",
      conceptId: "family-mother",
      learningObjectiveId: "GG-LO-FAMILY",
      uiLocale: "es",
      bridgeFingerprints: [],
      minimumBridgeActivities: 2,
      createdAt: "2026-09-03T00:00:00.000Z",
      plan: {
        planVersion: "NALVI-TUTOR-1",
        planId: "trusted-spaced-retest-plan",
        conceptId: "family-mother",
        strategy: { primaryStrategy: "DELAYED_RETEST" },
        activities: [recallActivity({
          id: "trusted-spaced-recall",
          independentRetest: false,
          spacedRetest: false,
          evidenceMode: "guided",
          nalviGuided: true,
          helpLevel: 3,
          hints: ["Ayuda que no debe sobrevivir."],
          explanation: "Explicación que no debe sobrevivir.",
          answerExposure: "EXPLICIT_SOLUTION"
        })]
      }
    };

    await withClientEnvironment({
      token: `trusted-retest-${Date.now()}`,
      pendingRetest
    }, async harness => {
      const consumed = harness.window.NALVI_INTERVENTION.consumePendingRetestAtBoundary("#lessonBody");
      assert.equal(consumed, true);
      assert.equal(harness.fetchCalls(), 0);
      assert.equal(harness.storage.has(PENDING_RETEST_KEY), false);
      assert.deepEqual(evidenceFlags(harness.renderedActivity()), {
        independentRetest: true,
        spacedRetest: true,
        evidenceMode: "independent",
        nalviGuided: false
      });
      assert.deepEqual({
        helpLevel: harness.renderedActivity()?.helpLevel,
        hints: harness.renderedActivity()?.hints,
        explanation: harness.renderedActivity()?.explanation,
        answerExposure: harness.renderedActivity()?.answerExposure
      }, {
        helpLevel: 0,
        hints: [],
        explanation: "",
        answerExposure: "HIDDEN"
      });
    });
  });
});
