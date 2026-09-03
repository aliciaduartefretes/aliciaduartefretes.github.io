import assert from "node:assert/strict";
import test from "node:test";
import { detectAnswerLeakage } from "../../activity-catalog/nalvi-activity-quality.mjs";
import { createActivityFingerprint } from "../../intervention-engine/intervention-engine.mjs";

const PENDING_RETEST_KEY = "nalvi.tutor.pending-spaced-retest.v2";
const LEGACY_PENDING_RETEST_KEY = "nalvi.tutor.pending-spaced-retest.v1";

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

function trustedSourceActivity(overrides = {}) {
  return {
    id: "source-trusted-spaced-retest",
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
    lessonContext: {
      sourceActivityId: "source-trusted-spaced-retest",
      sourceAnswer: "sy",
      sourcePrompt: "Escribe la palabra practicada.",
      sourceInstruction: "Escribe la palabra practicada."
    },
    ...overrides
  };
}

function authorityFingerprintFor({ sourceActivityId, conceptId, learningObjectiveId, uiLocale, activityType, correctAnswer, acceptedAnswers }) {
  return createActivityFingerprint({
    conceptId,
    type: `retest-authority-${activityType}`,
    prompt: sourceActivityId,
    instruction: learningObjectiveId,
    contextText: uiLocale,
    options: acceptedAnswers.map((answer, index) => ({ id: `approved-${index + 1}`, label: answer })),
    correctAnswer
  }, { uiLocale });
}

function pendingEnvelope(activityOverrides = {}, envelopeOverrides = {}) {
  const sourceActivity = trustedSourceActivity();
  const activity = recallActivity({
    id: "trusted-spaced-recall",
    independentRetest: true,
    spacedRetest: true,
    evidenceMode: "independent",
    nalviGuided: false,
    helpLevel: 0,
    hints: [],
    explanation: "",
    answerExposure: "HIDDEN",
    instruction: "Responde sin opciones.",
    prompt: "Responde sin opciones.",
    contextText: "",
    lessonContext: {
      sourceActivityId: "source-trusted-spaced-retest",
      sourceAnswer: "sy",
      sourcePrompt: "Responde sin opciones.",
      sourceInstruction: "Responde sin opciones.",
      visibleContext: ""
    },
    ...activityOverrides
  });
  activity.fingerprint = createActivityFingerprint(activity, { uiLocale: "es" });
  const envelope = {
    version: 2,
    sourceActivityId: "source-trusted-spaced-retest",
    sourceFingerprint: createActivityFingerprint(sourceActivity, { uiLocale: "es" }),
    conceptId: "family-mother",
    learningObjectiveId: "GG-LO-FAMILY",
    uiLocale: "es",
    bridgeFingerprints: ["bridge-one", "bridge-two"],
    minimumBridgeActivities: 2,
    approvedAnswers: [...activity.acceptedAnswers],
    activityFingerprint: activity.fingerprint,
    authorityFingerprint: authorityFingerprintFor({
      sourceActivityId: sourceActivity.id,
      conceptId: sourceActivity.conceptId,
      learningObjectiveId: sourceActivity.learningObjectiveId,
      uiLocale: "es",
      activityType: activity.activityType,
      correctAnswer: sourceActivity.correctAnswer,
      acceptedAnswers: sourceActivity.acceptedAnswers
    }),
    createdAt: "2026-09-03T00:00:00.000Z",
    plan: {
      planVersion: "NALVI-TUTOR-1",
      planId: "trusted-spaced-retest-plan",
      conceptId: "family-mother",
      strategy: { primaryStrategy: "DELAYED_RETEST" },
      activities: [activity]
    },
    ...envelopeOverrides
  };
  return envelope;
}

async function withClientEnvironment({ token, responsePlan = null, pendingRetest = null, legacyPendingRetest = null, catalogActivities = [trustedSourceActivity()] }, callback) {
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
  if (legacyPendingRetest) storage.set(LEGACY_PENDING_RETEST_KEY, JSON.stringify(legacyPendingRetest));
  let fetchCalls = 0;
  let renderedActivity = null;
  const renderedActivities = [];
  let adaptiveReadyEvents = 0;

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
  window.addEventListener("nalvi:adaptive-plan-ready", () => { adaptiveReadyEvents += 1; });
  window.matchMedia = () => ({ matches: true });
  window.KUAA_GENERAL_ACTIVITY_DATA = { activities: catalogActivities };
  window.KUAA_ACTIVITY_ENGINE = {
    registerActivityRenderer() {},
    submitActivityResult() {}
  };
  window.NALVI_PROGRESSION = { diagnostic() {} };
  window.renderActivity = activity => {
    renderedActivity = activity;
    renderedActivities.push(activity);
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
      renderedActivities: () => renderedActivities,
      adaptiveReadyEvents: () => adaptiveReadyEvents,
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

function dispatchIncorrect(document, id, overrides = {}) {
  const activity = {
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
      lessonContext: { sourceAnswer: "sy" },
      ...overrides
    };
  const catalog = globalThis.window?.KUAA_GENERAL_ACTIVITY_DATA?.activities;
  if (Array.isArray(catalog) && !catalog.some(candidate => candidate?.id === activity.id)) {
    catalog.push(structuredClone(activity));
  }
  document.dispatchEvent(new CustomEvent("nalvi:activity-scored", { detail: {
    activity,
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

  await t.test("el recall espaciado no copia un prompt fuente que expone la respuesta", async () => {
    await withClientEnvironment({
      token: `safe-recall-${Date.now()}`,
      responsePlan: serverPlan({ id: "safe-recall-source" })
    }, async harness => {
      dispatchIncorrect(harness.document, "leaking-source", {
        prompt: "Escribe sy",
        instruction: "Escribe sy",
        lessonContext: { sourceAnswer: "sy", sourcePrompt: "Escribe sy", visibleContext: "Escribe sy" }
      });
      await harness.waitForRender();
      const pending = JSON.parse(harness.storage.get(PENDING_RETEST_KEY) || "null");
      const recall = pending?.plan?.activities?.[0];
      assert.equal(recall?.activityType, "INDEPENDENT_RECALL");
      assert.equal(recall?.contextText, "");
      assert.doesNotMatch(recall?.prompt || "", /\bsy\b/i);
      assert.doesNotMatch(recall?.lessonContext?.sourcePrompt || "", /\bsy\b/i);
      assert.equal(recall?.lessonContext?.visibleContext, "");
      assert.equal(detectAnswerLeakage(recall, { uiLocale: "es" }).leaked, false);
      assert.equal(harness.window.NALVI_INTERVENTION.consumePendingRetestAtBoundary("#lessonBody"), true);
      const rendered = harness.renderedActivities().at(-1);
      assert.equal(rendered.activityType, "INDEPENDENT_RECALL");
      assert.equal(rendered.contextText, "");
      assert.equal(rendered.lessonContext?.visibleContext, "");
      assert.doesNotMatch(rendered.prompt, /\bsy\b/i);
      assert.equal(detectAnswerLeakage(rendered, { uiLocale: "es" }).leaked, false);
    });
  });

  await t.test("pares semánticos ambiguos no se persisten como ARROW_MATCH", async () => {
    const catalogActivities = [
      { id: "pair-sy", learningObjectiveId: "GG-LO-FAMILY", semanticPair: { target: "sy", meaning: "mamá", adaptiveReuseAuthorized: true } },
      { id: "pair-sy-duplicate", learningObjectiveId: "GG-LO-FAMILY", semanticPair: { target: "sy", meaning: "madre", adaptiveReuseAuthorized: true } },
      { id: "pair-tuva", learningObjectiveId: "GG-LO-FAMILY", semanticPair: { target: "túva", meaning: "papá", adaptiveReuseAuthorized: true } }
    ];
    await withClientEnvironment({
      token: `ambiguous-pairs-${Date.now()}`,
      responsePlan: serverPlan({ id: "ambiguous-pairs-source" }),
      catalogActivities
    }, async harness => {
      dispatchIncorrect(harness.document, "ambiguous-pairs");
      await harness.waitForRender();
      const pending = JSON.parse(harness.storage.get(PENDING_RETEST_KEY) || "null");
      assert.equal(pending?.plan?.activities?.[0]?.activityType, "INDEPENDENT_RECALL");
      assert.equal(pending?.plan?.activities?.[0]?.pairs, undefined);
    });
  });

  await t.test("el ARROW_MATCH espaciado conserva correctAnswer canónico explícito", async () => {
    const catalogActivities = [
      { id: "pair-sy", learningObjectiveId: "GG-LO-FAMILY", semanticPair: { target: "sy", meaning: "mamá", adaptiveReuseAuthorized: true } },
      { id: "pair-tuva", learningObjectiveId: "GG-LO-FAMILY", semanticPair: { target: "túva", meaning: "papá", adaptiveReuseAuthorized: true } },
      { id: "pair-mita", learningObjectiveId: "GG-LO-FAMILY", semanticPair: { target: "mitã", meaning: "niño", adaptiveReuseAuthorized: true } }
    ];
    await withClientEnvironment({
      token: `safe-arrow-${Date.now()}`,
      responsePlan: serverPlan({ id: "safe-arrow-source" }),
      catalogActivities
    }, async harness => {
      dispatchIncorrect(harness.document, "arrow-source");
      await harness.waitForRender();
      const pending = JSON.parse(harness.storage.get(PENDING_RETEST_KEY) || "null");
      const arrow = pending?.plan?.activities?.[0];
      assert.equal(arrow?.activityType, "ARROW_MATCH");
      assert.equal(arrow?.correctAnswer, "sy");
      assert.equal(arrow?.answer, "sy");
      assert.deepEqual(arrow?.acceptedAnswers, ["sy"]);
      assert.equal(harness.window.NALVI_INTERVENTION.consumePendingRetestAtBoundary("#lessonBody"), true);
      const rendered = harness.renderedActivities().at(-1);
      assert.equal(rendered.activityType, "ARROW_MATCH");
      assert.equal(rendered.correctAnswer, "sy");
    });
  });

  await t.test("el pending retest consumido localmente sí es independiente y sin ayuda", async () => {
    const pendingRetest = pendingEnvelope();

    await withClientEnvironment({
      token: `trusted-retest-${Date.now()}`,
      pendingRetest
    }, async harness => {
      const consumed = harness.window.NALVI_INTERVENTION.consumeDueRetest("#lessonBody");
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

  await t.test("descarta pending v1 y envelopes v2 con versión legada sin producir evidencia", async () => {
    const leakingLegacy = pendingEnvelope({
      lessonContext: { sourceAnswer: "sy", sourcePrompt: "Escribe sy", visibleContext: "Escribe sy" }
    }, { version: 1 });
    for (const [label, stored] of [
      ["legacy-key", { legacyPendingRetest: leakingLegacy }],
      ["legacy-envelope", { pendingRetest: leakingLegacy }]
    ]) {
      await withClientEnvironment({ token: `${label}-${Date.now()}`, ...stored }, async harness => {
        assert.equal(harness.window.NALVI_INTERVENTION.hasPendingRetest(), false, label);
        assert.equal(harness.window.NALVI_INTERVENTION.consumeDueRetest("#lessonBody"), false, label);
        assert.equal(harness.renderedActivities().length, 0, label);
        assert.equal(harness.adaptiveReadyEvents(), 0, label);
        assert.equal(harness.storage.has(PENDING_RETEST_KEY), false, label);
        assert.equal(harness.storage.has(LEGACY_PENDING_RETEST_KEY), false, label);
      });
    }
  });

  await t.test("descarta v2 con fuga heredada o actividad inválida antes de renderizar", async () => {
    const unsafeCases = [
      pendingEnvelope({
        lessonContext: { sourceAnswer: "sy", sourcePrompt: "Escribe sy", visibleContext: "Escribe sy" }
      }),
      pendingEnvelope({ correctAnswer: "", answer: "", acceptedAnswers: [] }),
      pendingEnvelope({}, { minimumBridgeActivities: -1 })
    ];
    for (const [index, pendingRetest] of unsafeCases.entries()) {
      await withClientEnvironment({ token: `unsafe-v2-${index}-${Date.now()}`, pendingRetest }, async harness => {
        assert.equal(harness.window.NALVI_INTERVENTION.consumeDueRetest("#lessonBody"), false);
        assert.equal(harness.renderedActivities().length, 0);
        assert.equal(harness.adaptiveReadyEvents(), 0);
        assert.equal(harness.storage.has(PENDING_RETEST_KEY), false);
      });
    }
  });

  await t.test("ata identidades, respuestas aprobadas y fingerprint del envelope v2", async () => {
    const mutations = [
      pending => { pending.plan.conceptId = "other-concept"; },
      pending => { pending.plan.activities[0].conceptId = "other-concept"; },
      pending => { pending.plan.activities[0].conceptIds = ["other-concept"]; },
      pending => { pending.plan.activities[0].learningObjectiveId = "OTHER-LO"; },
      pending => { pending.plan.activities[0].lessonContext.sourceActivityId = "other-source"; },
      pending => { pending.plan.activities[0].acceptedAnswers.push("túva"); },
      pending => { pending.approvedAnswers.push("túva"); },
      pending => { pending.plan.activities[0].fingerprint = "nalvi-afp-forged"; },
      pending => { pending.activityFingerprint = "nalvi-afp-forged"; }
    ];
    for (const [index, mutate] of mutations.entries()) {
      const pendingRetest = pendingEnvelope();
      mutate(pendingRetest);
      await withClientEnvironment({ token: `identity-v2-${index}-${Date.now()}`, pendingRetest }, async harness => {
        assert.equal(harness.window.NALVI_INTERVENTION.consumeDueRetest("#lessonBody"), false, String(index));
        assert.equal(harness.renderedActivities().length, 0, String(index));
        assert.equal(harness.adaptiveReadyEvents(), 0, String(index));
        assert.equal(harness.storage.has(PENDING_RETEST_KEY), false, String(index));
      });
    }
  });

  await t.test("ancla el envelope v2 a la autoridad viva de la actividad fuente", async () => {
    const forgedAnswer = pendingEnvelope();
    const forgedActivity = forgedAnswer.plan.activities[0];
    forgedActivity.answer = "túva";
    forgedActivity.correctAnswer = "túva";
    forgedActivity.acceptedAnswers = ["túva"];
    forgedActivity.lessonContext.sourceAnswer = "túva";
    forgedActivity.fingerprint = createActivityFingerprint(forgedActivity, { uiLocale: "es" });
    forgedAnswer.approvedAnswers = ["túva"];
    forgedAnswer.activityFingerprint = forgedActivity.fingerprint;
    forgedAnswer.authorityFingerprint = authorityFingerprintFor({
      sourceActivityId: forgedAnswer.sourceActivityId,
      conceptId: forgedAnswer.conceptId,
      learningObjectiveId: forgedAnswer.learningObjectiveId,
      uiLocale: forgedAnswer.uiLocale,
      activityType: forgedActivity.activityType,
      correctAnswer: forgedActivity.correctAnswer,
      acceptedAnswers: forgedAnswer.approvedAnswers
    });

    for (const [label, pendingRetest, catalogActivities] of [
      ["source-missing", pendingEnvelope(), []],
      ["answer-rehashed-but-not-authorized", forgedAnswer, [trustedSourceActivity()]]
    ]) {
      await withClientEnvironment({
        token: `live-authority-${label}-${Date.now()}`,
        pendingRetest,
        catalogActivities
      }, async harness => {
        assert.equal(harness.window.NALVI_INTERVENTION.consumeDueRetest("#lessonBody"), false, label);
        assert.equal(harness.renderedActivities().length, 0, label);
        assert.equal(harness.adaptiveReadyEvents(), 0, label);
        assert.equal(harness.storage.has(PENDING_RETEST_KEY), false, label);
      });
    }
  });
});
