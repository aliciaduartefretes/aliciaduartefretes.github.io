import assert from "node:assert/strict";
import test from "node:test";

const CANONICAL_AUDIO = Object.freeze({
  audioId: "NALVI-AUDIO-096",
  audioPath: "assets/audio/guarani/ali-2026/096-jagua.m4a",
  audioText: "Jagua"
});
const PARENTHETICAL_AUDIO = Object.freeze({
  audioId: "NALVI-AUDIO-041",
  audioPath: "assets/audio/guarani/ali-2026/041-ake-duermo.m4a",
  audioText: "Ake (duermo)"
});
const CLOSED_AUDIO = Object.freeze({
  audioId: "",
  audioPath: "",
  audioText: "",
  audioAuthorized: false,
  humanRecorded: false,
  audioSource: ""
});

function serverAudioPlan(overrides = {}) {
  return {
    planId: `server-audio-${overrides.id || "candidate"}`,
    conceptId: "animal-dog",
    diagnosis: { errorType: "LISTENING_CONFUSION" },
    strategy: { primaryStrategy: "CHANGE_MODALITY" },
    activities: [{
      id: "server-audio-candidate",
      type: "AUDIO_SELECT",
      activityType: "AUDIO_SELECT",
      conceptId: "animal-dog",
      conceptIds: ["animal-dog"],
      lexemeIds: ["LEX-JAGUA"],
      instruction: "Escucha y elige.",
      prompt: "Selecciona la palabra del audio.",
      options: [
        { id: "jagua", text: "Jagua", authorized: true },
        { id: "guyra", text: "Guyra", authorized: true },
        { id: "mbarakaja", text: "Mbarakaja", authorized: true }
      ],
      correctOptionId: "jagua",
      correctAnswer: "Jagua",
      acceptedAnswers: ["Jagua"],
      audioId: CANONICAL_AUDIO.audioId,
      audioPath: CANONICAL_AUDIO.audioPath,
      audioText: CANONICAL_AUDIO.audioText,
      audioAuthorized: true,
      humanRecorded: true,
      audioSource: "manifest-human-recording",
      helpLevel: 0,
      answerExposure: "HIDDEN",
      requiresStudentResponse: true,
      ...overrides
    }]
  };
}

const renderableAudio = activity => ({
  audioId: activity.audioId,
  audioPath: activity.audioPath,
  audioText: activity.audioText,
  audioAuthorized: activity.audioAuthorized,
  humanRecorded: activity.humanRecorded,
  audioSource: activity.audioSource
});

async function captureContext({
  audioText,
  targetText,
  importToken,
  recording = CANONICAL_AUDIO,
  registryLabel = "Jagua",
  responsePlan = null,
  sourceAnswer = "Jagua",
  sourceOverrides = {},
  seedHistory = []
}) {
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
  const warnings = [];
  const lookups = [];
  let requestContext = null;
  let renderedActivity = null;
  const renderedActivities = [];

  class FakeElement {
    constructor() {
      this.dataset = {};
      this.feedback = { className: "", textContent: "", setAttribute() {} };
      this.innerHTML = '<div id="feedback"></div>';
    }
    querySelector(selector) { return selector === "#feedback" ? this.feedback : null; }
    scrollIntoView() {}
  }

  const lessonBody = new FakeElement();
  const document = new EventTarget();
  document.documentElement = { lang: "es" };
  document.baseURI = "https://example.test/lesson";
  document.querySelector = selector => selector === "#lessonBody" ? lessonBody : null;
  const storage = new Map();
  if (seedHistory.length) storage.set("nalvi.tutor.history.v2", JSON.stringify(seedHistory));
  const window = new EventTarget();
  window.matchMedia = () => ({ matches: true });
  window.KUAA_GENERAL_ACTIVITY_DATA = { activities: [] };
  window.KUAA_ACTIVITY_ENGINE = {
    registerActivityRenderer() {},
    submitActivityResult() {}
  };
  window.NALVI_PROGRESSION = { diagnostic() {} };
  window.NALVI_RECORDED_AUDIO = {
    ready: Promise.resolve({ count: 1 }),
    resolve(value) {
      lookups.push(String(value));
      if (String(value) !== recording.audioId) return null;
      return {
        id: recording.audioId,
        label: registryLabel,
        file: recording.audioPath.split("/").at(-1),
        path: recording.audioPath,
        audioPath: recording.audioPath,
        authorizedForPlayback: true,
        humanRecorded: true
      };
    }
  };
  window.renderActivity = activity => {
    renderedActivity = activity;
    renderedActivities.push(activity);
    return { rendered: true };
  };

  globalThis.Element = FakeElement;
  globalThis.document = document;
  globalThis.fetch = async (_url, options) => {
    requestContext = JSON.parse(options.body);
    return responsePlan
      ? { ok: true, status: 200, json: async () => ({ ok: true, adaptiveInterventionPlan: responsePlan }) }
      : { ok: false, status: 503, json: async () => ({}) };
  };
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
    await import(`../../assets/js/nalvi-intervention-client.mjs?audio-coherence=${importToken}`);
    document.dispatchEvent(new CustomEvent("nalvi:activity-scored", { detail: {
      activity: {
        id: `source-audio-${importToken}`,
        conceptId: "animal-dog",
        conceptIds: ["animal-dog"],
        learningObjectiveId: "GG-LO-ANIMALS",
        type: "listening",
        activityType: "listening",
        skill: "listening",
        difficulty: "foundation-1",
        prompt: "Escucha y elige la palabra practicada.",
        contextText: "Un animal doméstico aparece en una situación documentada.",
        contextAuthorized: true,
        options: [
          { id: "jagua", label: sourceAnswer },
          { id: "guyra", label: "Guyra" },
          { id: "mbarakaja", label: "Mbarakaja" }
        ],
        correctOptionId: "jagua",
        acceptedAnswers: [sourceAnswer],
        lexemeIds: ["LEX-JAGUA"],
        semanticPair: { target: targetText },
        audioId: recording.audioId,
        audioPath: recording.audioPath,
        audioText,
        lessonContext: { sourceAnswer },
        ...sourceOverrides
      },
      result: { correct: false, value: "Guyra" },
      uiLocale: "es"
    } }));

    for (let attempt = 0; attempt < 40 && (!requestContext || (responsePlan && !renderedActivity)); attempt += 1) {
      await new Promise(resolve => realSetTimeout(resolve, 5));
    }
    assert.ok(requestContext, "el cliente debe terminar de construir el contexto seguro");
    if (responsePlan) assert.ok(renderedActivity, `el cliente debe normalizar y renderizar el plan recibido: ${importToken}; ${warnings.join(" | ")}`);
    return {
      requestContext,
      lookups,
      renderedActivity,
      renderedActivities,
      storedHistory: JSON.parse(storage.get("nalvi.tutor.history.v2") || "[]")
    };
  } finally {
    console.warn = originalWarn;
    for (const [key, value] of Object.entries(originalGlobals)) {
      if (value === undefined) delete globalThis[key];
      else globalThis[key] = value;
    }
  }
}

test("un claim con la base parentética se canoniza al label completo del registro", async () => {
  const registryLabel = PARENTHETICAL_AUDIO.audioText;
  const responsePlan = serverAudioPlan({
    id: "server-audio-parenthetical-base",
    audioId: PARENTHETICAL_AUDIO.audioId,
    audioPath: PARENTHETICAL_AUDIO.audioPath,
    audioText: "Ake",
    options: [
      { id: "ake", text: "Ake", authorized: true },
      { id: "oke", text: "Oke", authorized: true },
      { id: "opu-a", text: "Opúa", authorized: true }
    ],
    correctOptionId: "ake",
    correctAnswer: "Ake",
    acceptedAnswers: ["Ake"],
    recordingId: PARENTHETICAL_AUDIO.audioId,
    path: PARENTHETICAL_AUDIO.audioPath,
    text: registryLabel,
    source: "manifest-human-recording",
    authorized: true,
    media: { type: "audio", value: PARENTHETICAL_AUDIO.audioPath },
    authorizedAudio: {
      id: PARENTHETICAL_AUDIO.audioId,
      audioId: PARENTHETICAL_AUDIO.audioId,
      recordingId: PARENTHETICAL_AUDIO.audioId,
      path: PARENTHETICAL_AUDIO.audioPath,
      audioPath: PARENTHETICAL_AUDIO.audioPath,
      text: registryLabel,
      audioText: registryLabel,
      source: "manifest-human-recording",
      audioSource: "manifest-human-recording",
      authorized: true,
      audioAuthorized: true,
      humanRecorded: true
    }
  });
  const { requestContext, renderedActivity } = await captureContext({
    audioText: "Ake",
    targetText: "Ake",
    sourceAnswer: "Ake",
    recording: PARENTHETICAL_AUDIO,
    registryLabel,
    responsePlan,
    importToken: "approved-parenthetical-base"
  });

  assert.deepEqual(requestContext.approvedActivityMaterial.audio, {
    id: PARENTHETICAL_AUDIO.audioId,
    audioId: PARENTHETICAL_AUDIO.audioId,
    recordingId: PARENTHETICAL_AUDIO.audioId,
    path: PARENTHETICAL_AUDIO.audioPath,
    audioPath: PARENTHETICAL_AUDIO.audioPath,
    text: registryLabel,
    audioText: registryLabel,
    source: "manifest-human-recording",
    audioSource: "manifest-human-recording",
    authorized: true,
    audioAuthorized: true,
    humanRecorded: true
  });
  assert.deepEqual(renderableAudio(renderedActivity), {
    audioId: PARENTHETICAL_AUDIO.audioId,
    audioPath: PARENTHETICAL_AUDIO.audioPath,
    audioText: registryLabel,
    audioAuthorized: true,
    humanRecorded: true,
    audioSource: "manifest-human-recording"
  });
  for (const alias of ["authorizedAudio", "audio", "recordingId", "path", "text", "source", "authorized"]) {
    assert.equal(Object.hasOwn(renderedActivity, alias), false, alias);
  }
  assert.equal(renderedActivity.media, null);
});

test("un AUDIO_SELECT de otro objetivo no llega al renderer y activa fallback local no-audio", async () => {
  const responsePlan = serverAudioPlan({
    id: "server-audio-guyra",
    correctOptionId: "guyra",
    correctAnswer: "Guyra",
    acceptedAnswers: ["Guyra"]
  });
  const { renderedActivity } = await captureContext({
    audioText: CANONICAL_AUDIO.audioText,
    targetText: CANONICAL_AUDIO.audioText,
    responsePlan,
    importToken: "server-wrong-audio-target"
  });

  assert.notEqual(renderedActivity.id, "server-audio-guyra");
  assert.notEqual(renderedActivity.activityType, "AUDIO_SELECT");
  assert.deepEqual(renderableAudio(renderedActivity), CLOSED_AUDIO);
});

test("el renderable rechaza IDs contradictorios entre nivel superior y authorizedAudio", async () => {
  const responsePlan = serverAudioPlan({
    id: "server-audio-id-conflict",
    authorizedAudio: {
      id: "NALVI-AUDIO-095",
      audioId: "NALVI-AUDIO-095",
      recordingId: "NALVI-AUDIO-095",
      path: CANONICAL_AUDIO.audioPath,
      audioPath: CANONICAL_AUDIO.audioPath,
      text: CANONICAL_AUDIO.audioText,
      audioText: CANONICAL_AUDIO.audioText,
      source: "manifest-human-recording",
      audioSource: "manifest-human-recording",
      authorized: true,
      audioAuthorized: true,
      humanRecorded: true
    }
  });
  const { renderedActivity } = await captureContext({
    audioText: CANONICAL_AUDIO.audioText,
    targetText: CANONICAL_AUDIO.audioText,
    responsePlan,
    importToken: "server-conflicting-audio-id"
  });

  assert.notEqual(renderedActivity.id, "server-audio-id-conflict");
  assert.notEqual(renderedActivity.activityType, "AUDIO_SELECT");
  assert.deepEqual(renderableAudio(renderedActivity), CLOSED_AUDIO);
});

test("el renderable rechaza rutas contradictorias entre nivel superior y authorizedAudio", async () => {
  const responsePlan = serverAudioPlan({
    id: "server-audio-path-conflict",
    authorizedAudio: {
      id: CANONICAL_AUDIO.audioId,
      audioId: CANONICAL_AUDIO.audioId,
      recordingId: CANONICAL_AUDIO.audioId,
      path: "assets/audio/guarani/ali-2026/095-itati.m4a",
      audioPath: "assets/audio/guarani/ali-2026/095-itati.m4a",
      text: CANONICAL_AUDIO.audioText,
      audioText: CANONICAL_AUDIO.audioText,
      source: "manifest-human-recording",
      audioSource: "manifest-human-recording",
      authorized: true,
      audioAuthorized: true,
      humanRecorded: true
    }
  });
  const { renderedActivity } = await captureContext({
    audioText: CANONICAL_AUDIO.audioText,
    targetText: CANONICAL_AUDIO.audioText,
    responsePlan,
    importToken: "server-conflicting-audio-path"
  });

  assert.notEqual(renderedActivity.id, "server-audio-path-conflict");
  assert.notEqual(renderedActivity.activityType, "AUDIO_SELECT");
  assert.deepEqual(renderableAudio(renderedActivity), CLOSED_AUDIO);
});

test("un audioText ajeno al ID autorizado no se cura con el label del registro", async () => {
  const responsePlan = serverAudioPlan({
    id: "server-audio-text-conflict",
    authorizedAudio: {
      id: CANONICAL_AUDIO.audioId,
      audioId: CANONICAL_AUDIO.audioId,
      recordingId: CANONICAL_AUDIO.audioId,
      path: CANONICAL_AUDIO.audioPath,
      audioPath: CANONICAL_AUDIO.audioPath,
      text: "Guyra",
      audioText: "Guyra",
      source: "manifest-human-recording",
      audioSource: "manifest-human-recording",
      authorized: true,
      audioAuthorized: true,
      humanRecorded: true
    }
  });
  const { requestContext, lookups, renderedActivity } = await captureContext({
    audioText: "Guyra",
    targetText: "Jagua",
    responsePlan,
    importToken: "wrong-declared-text"
  });

  assert.ok(lookups.length >= 1);
  assert.ok(lookups.every(value => value === CANONICAL_AUDIO.audioId));
  assert.equal(requestContext.authorizedAudio, null);
  assert.equal(requestContext.approvedActivityMaterial.audio, null);
  assert.deepEqual({
    audioId: requestContext.activity.audioId,
    audioPath: requestContext.activity.audioPath,
    audioText: requestContext.activity.audioText,
    audioAuthorized: requestContext.activity.audioAuthorized,
    humanRecorded: requestContext.activity.humanRecorded,
    audioSource: requestContext.activity.audioSource
  }, CLOSED_AUDIO);
  assert.deepEqual(renderableAudio(renderedActivity), CLOSED_AUDIO);
});

test("declaraciones de audio localizadas no ocultan texto contradictorio", async () => {
  for (const [token, overrides] of [
    ["top-localized-audio", { audioText: { es: "Jagua", pt: "som" } }],
    ["nested-localized-audio", {
      authorizedAudio: {
        id: CANONICAL_AUDIO.audioId,
        audioId: CANONICAL_AUDIO.audioId,
        recordingId: CANONICAL_AUDIO.audioId,
        path: CANONICAL_AUDIO.audioPath,
        audioPath: CANONICAL_AUDIO.audioPath,
        text: { es: "Jagua", pt: "som" },
        audioText: CANONICAL_AUDIO.audioText,
        source: "manifest-human-recording",
        audioSource: "manifest-human-recording",
        authorized: true,
        audioAuthorized: true,
        humanRecorded: true
      }
    }]
  ]) {
    const responsePlan = serverAudioPlan({ id: `server-${token}`, ...overrides });
    const { renderedActivity } = await captureContext({
      audioText: CANONICAL_AUDIO.audioText,
      targetText: CANONICAL_AUDIO.audioText,
      responsePlan,
      importToken: token
    });
    assert.notEqual(renderedActivity.id, `server-${token}`);
    assert.notEqual(renderedActivity.activityType, "AUDIO_SELECT");
  }

  const { requestContext } = await captureContext({
    audioText: { es: "Jagua", pt: "som" },
    targetText: CANONICAL_AUDIO.audioText,
    importToken: "source-localized-audio"
  });
  assert.equal(requestContext.authorizedAudio, null);
  assert.equal(requestContext.approvedActivityMaterial.audio, null);
});

test("claims source y booleanos explícitamente contradictorios no autorizan audio", async () => {
  const { requestContext } = await captureContext({
    audioText: CANONICAL_AUDIO.audioText,
    targetText: CANONICAL_AUDIO.audioText,
    sourceOverrides: {
      audioSource: "tts",
      audioAuthorized: false,
      humanRecorded: false,
      source: "tts",
      authorized: false
    },
    importToken: "explicit-false-audio-claims"
  });

  assert.equal(requestContext.authorizedAudio, null);
  assert.equal(requestContext.approvedActivityMaterial.audio, null);
  assert.deepEqual(renderableAudio(requestContext.activity), CLOSED_AUDIO);
});

test("un formato no-audio elimina todos los claims y aliases de audio", async () => {
  const responsePlan = serverAudioPlan({
    id: "server-recall-with-audio-claims",
    type: "INDEPENDENT_RECALL",
    activityType: "INDEPENDENT_RECALL",
    skill: "writing",
    options: [],
    correctOptionId: "",
    recordingId: CANONICAL_AUDIO.audioId,
    path: CANONICAL_AUDIO.audioPath,
    text: CANONICAL_AUDIO.audioText,
    source: "manifest-human-recording",
    authorized: true,
    media: { type: "audio", value: CANONICAL_AUDIO.audioPath }
  });
  const { renderedActivity } = await captureContext({
    audioText: CANONICAL_AUDIO.audioText,
    targetText: CANONICAL_AUDIO.audioText,
    responsePlan,
    importToken: "non-audio-claims-closed"
  });

  assert.equal(renderedActivity.id, "server-recall-with-audio-claims");
  assert.deepEqual(renderableAudio(renderedActivity), CLOSED_AUDIO);
  for (const alias of ["authorizedAudio", "audio", "recordingId", "path", "text", "source", "authorized"]) {
    assert.equal(Object.hasOwn(renderedActivity, alias), false, alias);
  }
  assert.equal(renderedActivity.media, null);
});

test("history preserva IDs de fuente y plan y los transporta en la siguiente solicitud", async () => {
  const seedHistory = [{
    id: "prior-plan-activity",
    conceptId: "animal-dog",
    fingerprint: "prior-fingerprint",
    activityType: "CONTEXT_CHOICE",
    errorType: "SEMANTIC_CONFUSION",
    strategy: "CHANGE_MODALITY",
    answerExposure: "HIDDEN",
    timestamp: "2026-09-03T00:00:00.000Z"
  }];
  const responsePlan = serverAudioPlan({ id: "server-audio-history" });
  const { requestContext, storedHistory } = await captureContext({
    audioText: CANONICAL_AUDIO.audioText,
    targetText: CANONICAL_AUDIO.audioText,
    responsePlan,
    seedHistory,
    importToken: "history-ids"
  });

  assert.equal(requestContext.activity.id, "source-audio-history-ids");
  assert.equal(requestContext.recentActivities.find(item => item.fingerprint === "prior-fingerprint")?.id, "prior-plan-activity");
  assert.ok(storedHistory.some(item => item.id === "source-audio-history-ids"));
  assert.ok(storedHistory.some(item => item.id === "server-audio-history"));
});

test("un target semántico ajeno al ID autorizado no provoca fallback por texto", async () => {
  const { requestContext, lookups } = await captureContext({
    audioText: "Jagua",
    targetText: "Guyra",
    importToken: "wrong-semantic-target"
  });

  assert.deepEqual(lookups, [CANONICAL_AUDIO.audioId]);
  assert.equal(requestContext.authorizedAudio, null);
  assert.equal(requestContext.approvedActivityMaterial.audio, null);
});
