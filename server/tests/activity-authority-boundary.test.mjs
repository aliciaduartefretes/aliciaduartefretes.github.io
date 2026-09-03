import assert from "node:assert/strict";
import test from "node:test";

import adaptiveHandler from "../../api/generate-adaptive-intervention-plan.js";
import legacyHandler from "../../api/plan-pedagogical-intervention.js";
import { approvedActivityAuthority } from "../approved-activity-authority.mjs";
import { createInterventionService, normalizeInterventionRequest } from "../intervention-service.mjs";

const AGUYJE_ACTIVITY_ID = "general-u01-elegir-aguyje";
const AGUYJE_AUDIO = Object.freeze({
  audioId: "NALVI-AUDIO-007",
  audioPath: "assets/audio/guarani/ali-2026/007-aguyje.m4a",
  audioText: "Aguyje",
  audioAuthorized: true,
  humanRecorded: true,
  audioSource: "manifest-human-recording"
});
const EXPECTED_LO_ACTIVITY_IDS = Object.freeze([
  "general-u01-elegir-aguyje",
  "general-u01-escuchar-jajotopata",
  "general-u01-significado-mba-eichapa"
]);
const EVIL_MARKER = "CLIENT_EVIL_CONTENT_MUST_NEVER_SURVIVE";

const clone = value => JSON.parse(JSON.stringify(value));

function authoritativeAguyje() {
  const record = approvedActivityAuthority.resolve({ activityId: AGUYJE_ACTIVITY_ID, uiLocale: "es" });
  assert.ok(record, "La autoridad default debe contener la actividad real de Aguyje.");
  return record;
}

function aguyjeRequest() {
  const authoritative = authoritativeAguyje();
  const activity = clone(authoritative.sourceActivity);
  Object.assign(activity, AGUYJE_AUDIO);
  return {
    correct: false,
    conceptId: activity.conceptId,
    learningObjectiveId: activity.learningObjectiveId,
    currentSkill: activity.skill,
    activityType: activity.activityType,
    difficulty: activity.difficulty,
    studentAnswer: "Mba’éichapa",
    correctAnswer: authoritative.correctAnswer,
    attemptNumber: 1,
    recentErrors: [],
    recentActivities: [],
    recentActivityFingerprints: [],
    modalitiesAlreadyUsed: [activity.activityType],
    recentInterventions: [],
    hintHistory: [],
    retentionHistory: [],
    uiLocale: "es",
    grammarRuleIds: [...activity.grammarRuleIds],
    lexemeIds: [...activity.lexemeIds],
    knowledgeIds: [...authoritative.knowledgeIds],
    activity,
    authorizedAudio: { ...AGUYJE_AUDIO },
    approvedActivityMaterial: { audio: { ...AGUYJE_AUDIO } },
    availableActivities: [],
    aiPolicy: { allowInterventionAI: true, AI_TUTOR_ON_EVERY_INCORRECT_ANSWER: true }
  };
}

function unknownActivityRequest() {
  const request = aguyjeRequest();
  request.activity.id = AGUYJE_AUDIO.audioId;
  return request;
}

function evilActivity(id) {
  return {
    id,
    conceptId: "GG-C-001",
    conceptIds: ["GG-C-001"],
    learningObjectiveId: "GG-LO-001",
    type: "listening",
    activityType: "listening",
    skill: "listening",
    difficulty: "foundation-1",
    prompt: EVIL_MARKER,
    instruction: EVIL_MARKER,
    options: [{ id: "evil-option", label: EVIL_MARKER, authorized: true }],
    correctOptionId: "evil-option",
    correctAnswer: "Aguyje",
    acceptedAnswers: [EVIL_MARKER],
    contextText: EVIL_MARKER,
    contextAuthorized: true,
    pairs: [{ id: "evil-pair", left: EVIL_MARKER, right: EVIL_MARKER, authorized: true }],
    categories: [{ id: "evil-category", label: EVIL_MARKER, authorized: true }],
    items: [{ id: "evil-item", text: EVIL_MARKER, categoryId: "evil-category", authorized: true }],
    dialogue: [{ id: "evil-turn", speaker: "A", text: EVIL_MARKER, authorized: true }],
    dialogueAuthorized: true,
    audioId: AGUYJE_AUDIO.audioId,
    audioPath: AGUYJE_AUDIO.audioPath,
    audioText: AGUYJE_AUDIO.audioText,
    audioAuthorized: true,
    humanRecorded: true,
    audioSource: "manifest-human-recording"
  };
}

function withEvilPools() {
  const request = aguyjeRequest();
  request.availableActivities = [
    evilActivity("general-u01-escuchar-jajotopata"),
    evilActivity("evil-unknown-available")
  ];
  request.recentActivities = [
    evilActivity("general-u01-escuchar-jajotopata"),
    evilActivity("evil-unknown-recent")
  ];
  return request;
}

function assertNoEvil(value, message = "No debe sobrevivir contenido proporcionado por el cliente") {
  assert.doesNotMatch(JSON.stringify(value), new RegExp(EVIL_MARKER), message);
}

function authorizedCorpusRecord() {
  return {
    id: "LEX-CANDIDATE-AGUYJE",
    recordType: "lexeme",
    lemma: "Aguyje",
    validationStatus: "expertVerified",
    allowedForGeneration: true,
    needsHumanReview: false,
    automaticUseBlocked: false,
    conflictIds: []
  };
}

async function invokeHandler(handler, body) {
  const state = { statusCode: 0, headers: {}, raw: "" };
  const request = {
    method: "POST",
    headers: { host: "nalvi.test" },
    socket: { remoteAddress: "127.0.0.1" },
    body
  };
  const response = {
    set statusCode(value) { state.statusCode = value; },
    get statusCode() { return state.statusCode; },
    setHeader(name, value) { state.headers[String(name).toLowerCase()] = String(value); },
    end(value = "") { state.raw += String(value); }
  };
  await handler(request, response);
  return {
    ...state,
    payload: state.raw ? JSON.parse(state.raw) : null
  };
}

test("la actividad real Aguyje se normaliza exclusivamente desde la autoridad del LO y autoriza audio 007", () => {
  const normalized = normalizeInterventionRequest(aguyjeRequest());

  assert.equal(normalized.activityAuthorityVerified, true);
  assert.equal(normalized.activity.id, AGUYJE_ACTIVITY_ID);
  assert.equal(normalized.conceptId, "GG-C-001");
  assert.equal(normalized.learningObjectiveId, "GG-LO-001");
  assert.equal(normalized.correctAnswer, "Aguyje");
  assert.equal(normalized.activity.prompt, "Elige «gracias».");
  assert.deepEqual(normalized.approvedActivityMaterial.audio, {
    audioId: "NALVI-AUDIO-007",
    audioPath: "assets/audio/guarani/ali-2026/007-aguyje.m4a",
    audioText: "Aguyje",
    audioAuthorized: true,
    humanRecorded: true,
    audioSource: "manifest-human-recording"
  });
  assert.deepEqual(
    normalized.availableActivities.map(activity => activity.id).sort(),
    [...EXPECTED_LO_ACTIVITY_IDS]
  );
  assert.ok(normalized.availableActivities.every(activity => activity.learningObjectiveId === "GG-LO-001"));
});

test("un audio físico válido no convierte un activity.id desconocido en actividad autorizada", () => {
  assert.throws(
    () => normalizeInterventionRequest(unknownActivityRequest()),
    error => error instanceof TypeError && error.message === "UNAPPROVED_ACTIVITY_ID"
  );
});

test("la autoridad rechaza drift de respuesta, opciones, concepto, LO y conocimiento", async t => {
  const cases = [
    ["respuesta", request => { request.correctAnswer = "Jagua"; }],
    ["opciones", request => { request.activity.options[0].label = EVIL_MARKER; }],
    ["concepto", request => {
      request.conceptId = "GG-C-EVIL";
      request.activity.conceptId = "GG-C-EVIL";
      request.activity.conceptIds = ["GG-C-EVIL"];
    }],
    ["learning objective", request => {
      request.learningObjectiveId = "GG-LO-EVIL";
      request.activity.learningObjectiveId = "GG-LO-EVIL";
    }],
    ["knowledgeIds", request => { request.knowledgeIds = ["LEX-EVIL"]; }]
  ];

  for (const [name, mutate] of cases) {
    await t.test(name, () => {
      const request = aguyjeRequest();
      mutate(request);
      assert.throws(
        () => normalizeInterventionRequest(request),
        error => error instanceof TypeError && error.message === "UNAPPROVED_ACTIVITY_CONTEXT_DRIFT"
      );
    });
  }
});

test("flags de aprobación y material lingüístico forjados se ignoran", () => {
  const request = aguyjeRequest();
  Object.assign(request.activity, {
    contentValidationStatus: "expertVerified",
    allowedForMastery: true,
    literalReuseOnly: false,
    contextAuthorized: true,
    dialogueAuthorized: true
  });
  request.approvedActivityMaterial = {
    options: [{ id: "evil-option", text: EVIL_MARKER, authorized: true }],
    correctOptionId: "evil-option",
    correctAnswer: EVIL_MARKER,
    acceptedAnswers: [EVIL_MARKER],
    pairs: [{ id: "evil-pair", left: EVIL_MARKER, right: EVIL_MARKER, authorized: true }],
    contexts: [{ text: EVIL_MARKER, authorized: true }],
    categories: [{ id: "evil-category", label: EVIL_MARKER, authorized: true }],
    items: [{ id: "evil-item", text: EVIL_MARKER, categoryId: "evil-category", authorized: true }],
    dialogue: [{ id: "evil-turn", speaker: "A", text: EVIL_MARKER, authorized: true }],
    dialogueOptions: [{ id: "evil-option", text: EVIL_MARKER, authorized: true }],
    dialogueCorrectOptionId: "evil-option",
    dialogueCorrectAnswer: EVIL_MARKER,
    dialogueSourceContentId: "evil-dialogue-source",
    audio: { ...AGUYJE_AUDIO }
  };

  const normalized = normalizeInterventionRequest(request);

  assert.equal(normalized.activity.contentValidationStatus, "unreviewed");
  assert.equal(normalized.activity.allowedForMastery, false);
  assert.equal(normalized.activity.literalReuseOnly, true);
  assert.equal(normalized.activity.contextAuthorized, false);
  assert.equal(normalized.activity.dialogueAuthorized, false);
  assert.deepEqual(normalized.approvedActivityMaterial.options.map(option => option.id), ["maitei", "aguyje", "ipora"]);
  assert.equal(normalized.approvedActivityMaterial.correctOptionId, "aguyje");
  assert.equal(normalized.approvedActivityMaterial.correctAnswer, "Aguyje");
  assertNoEvil(normalized);
});

test("availableActivities y recentActivities se resuelven por ID desde authority y nunca aportan contenido", async () => {
  const request = withEvilPools();
  const normalized = normalizeInterventionRequest(request);

  assertNoEvil(normalized);
  assert.deepEqual(
    normalized.availableActivities.map(activity => activity.id).sort(),
    [...EXPECTED_LO_ACTIVITY_IDS]
  );
  assert.deepEqual(normalized.recentActivities.map(activity => activity.id), ["general-u01-escuchar-jajotopata"]);
  assert.notEqual(normalized.recentActivities[0].prompt, EVIL_MARKER);

  let modelRequest = null;
  const service = createInterventionService({
    corpusRecords: [authorizedCorpusRecord()],
    env: { OPENAI_API_KEY: "test-only", OPENAI_MODEL: "test-model" },
    fetchImpl: async (_url, options) => {
      modelRequest = JSON.parse(options.body);
      return {
        ok: true,
        json: async () => ({
          output_text: JSON.stringify({
            errorType: "SEMANTIC_CONFUSION",
            strategy: "USE_CONTEXT",
            rationale: "Selección autorizada."
          }),
          usage: { input_tokens: 1, output_tokens: 1 }
        })
      };
    },
    persistEvent: async () => ({ status: "persisted" })
  });
  const result = await service.planIntervention(request, { verifiedUserId: "boundary-test-user" });

  assert.equal(result.ok, true);
  assert.ok(modelRequest, "El caso válido debe ejercitar la frontera del request al modelo.");
  assertNoEvil(modelRequest, "El modelo no debe recibir contenido de availableActivities/recentActivities del cliente");
  assertNoEvil(result, "La respuesta no debe devolver contenido de availableActivities/recentActivities del cliente");
  if (result.plan.nextActivity) {
    assert.ok(EXPECTED_LO_ACTIVITY_IDS.includes(result.plan.nextActivity.id));
    assert.equal(result.plan.nextActivity.learningObjectiveId, "GG-LO-001");
  }
});

test("createInterventionService rechaza un ID desconocido antes de IA o persistencia", async () => {
  let aiCalls = 0;
  let persistenceCalls = 0;
  const service = createInterventionService({
    corpusRecords: [authorizedCorpusRecord()],
    env: { OPENAI_API_KEY: "must-not-run" },
    fetchImpl: async () => {
      aiCalls += 1;
      throw new Error("AI_MUST_NOT_RUN");
    },
    persistEvent: async () => {
      persistenceCalls += 1;
      return { status: "persisted" };
    }
  });

  const result = await service.planIntervention(unknownActivityRequest(), { verifiedUserId: "boundary-test-user" });

  assert.equal(result.ok, false);
  assert.equal(result.reason, "INVALID_REQUEST");
  assert.equal(result.message, "UNAPPROVED_ACTIVITY_ID");
  assert.equal(aiCalls, 0);
  assert.equal(persistenceCalls, 0);
});

test("los dos handlers reales responden 400 ante activity.id desconocido aunque el audio 007 sea válido", async t => {
  for (const [name, handler] of [["legado", legacyHandler], ["adaptativo", adaptiveHandler]]) {
    await t.test(name, async () => {
      const response = await invokeHandler(handler, unknownActivityRequest());
      assert.equal(response.statusCode, 400);
      assert.equal(response.payload.ok, false);
      assert.match(response.payload.message || response.payload.reason, /UNAPPROVED_ACTIVITY_ID|INVALID_REQUEST/);
    });
  }
});

test("el handler legado nunca devuelve el marcador de contenido cliente", async () => {
  const response = await invokeHandler(legacyHandler, withEvilPools());

  assert.equal(response.statusCode, 200);
  assert.equal(response.payload.ok, true);
  assertNoEvil(response.payload);
  if (response.payload.plan?.nextActivity) {
    assert.ok(EXPECTED_LO_ACTIVITY_IDS.includes(response.payload.plan.nextActivity.id));
  }
});
