import test from "node:test";
import assert from "node:assert/strict";
import { createRecordLearningAttemptHandler } from "../record-learning-attempt.js";
import { createMasteryAttemptService } from "../../server/mastery-attempt-service.mjs";

const NOW = Date.parse("2026-09-03T12:00:00.000Z");
const USER_ID = "endpoint-user";

function approvedAuthority(overrides = {}) {
  return {
    status: "authorized",
    userId: USER_ID,
    attemptId: "endpoint-attempt-1",
    activityVersion: "endpoint-approved-choice-v1",
    issuedAt: "2026-09-03T11:59:55.000Z",
    expiresAt: "2026-09-03T12:05:00.000Z",
    hintUsed: false,
    activity: {
      id: "endpoint-approved-choice",
      version: "endpoint-approved-choice-v1",
      conceptId: "endpoint-concept",
      learningObjectiveId: "endpoint-objective",
      activityType: "multiple-choice",
      skill: "vocabulary",
      difficulty: "foundation-1",
      allowedForMastery: true,
      contentValidationStatus: "normativeVerified",
      optionIds: ["wrong", "correct", "other"],
      correctOptionId: "correct"
    },
    ...overrides
  };
}

function request(body) {
  return {
    method: "POST",
    headers: { authorization: "Bearer test-token", host: "nalvi.test" },
    body
  };
}

function response() {
  return {
    statusCode: 0,
    headers: {},
    payload: null,
    setHeader(name, value) { this.headers[name] = value; },
    end(body) { this.payload = JSON.parse(body); }
  };
}

function handlerFor(masteryService) {
  return createRecordLearningAttemptHandler({
    masteryService,
    verifyIdToken: async () => ({ uid: USER_ID }),
    rateLimit: () => true
  });
}

test("el handler devuelve 400 al POST forjado exacto y no toca el perfil", async () => {
  let readCalls = 0, persistCalls = 0;
  const service = createMasteryAttemptService({
    readProfile: async () => { readCalls += 1; return { status: "missing" }; },
    persistTransition: async () => { persistCalls += 1; return { status: "persisted" }; }
  });
  const res = response();
  await handlerFor(service)(request({
    conceptId: "FORGED-C",
    learningObjectiveId: "FORGED-LO",
    activityId: "FORGED-A",
    activityType: "speaking",
    skill: "speaking",
    correct: true,
    hintUsed: false
  }), res);

  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.payload, { ok: false, reason: "INVALID_ATTEMPT_PAYLOAD" });
  assert.deepEqual({ readCalls, persistCalls }, { readCalls: 0, persistCalls: 0 });
});

test("metadata, correct o hint añadidos producen 400 determinista antes de authority", async () => {
  for (const [field, value] of Object.entries({
    activityId: "endpoint-approved-choice",
    activityVersion: "endpoint-approved-choice-v1",
    conceptId: "endpoint-concept",
    learningObjectiveId: "endpoint-objective",
    activityType: "multiple-choice",
    skill: "vocabulary",
    difficulty: "foundation-1",
    correct: true,
    hintUsed: false
  })) {
    let authorityCalls = 0, readCalls = 0, persistCalls = 0;
    const service = createMasteryAttemptService({
      now: () => NOW,
      resolveAuthorizedAttempt: async () => { authorityCalls += 1; return approvedAuthority(); },
      claimAuthorizedAttempt: async () => ({ status: "claimed" }),
      readProfile: async () => { readCalls += 1; return { status: "missing" }; },
      persistTransition: async () => { persistCalls += 1; return { status: "persisted" }; }
    });
    const res = response();
    await handlerFor(service)(request({
      attemptId: "endpoint-attempt-1",
      response: { optionId: "correct" },
      [field]: value
    }), res);
    assert.equal(res.statusCode, 400, field);
    assert.deepEqual(res.payload, { ok: false, reason: "INVALID_ATTEMPT_PAYLOAD" }, field);
    assert.deepEqual({ authorityCalls, readCalls, persistCalls }, { authorityCalls: 0, readCalls: 0, persistCalls: 0 }, field);
  }
});

test("una actividad real no revisada se rechaza dos veces sin claim, lectura ni persistencia", async () => {
  const authority = approvedAuthority({
    attemptId: "general-u01-elegir-aguyje-attempt",
    activityVersion: "NALVI-P5-DATA-2",
    activity: {
      id: "general-u01-elegir-aguyje",
      version: "NALVI-P5-DATA-2",
      conceptId: "GG-C-001",
      learningObjectiveId: "GG-LO-001",
      activityType: "multiple-choice",
      skill: "comprehension",
      difficulty: "foundation-1",
      allowedForMastery: false,
      contentValidationStatus: "unreviewed",
      optionIds: ["maitei", "aguyje", "ipora"],
      correctOptionId: "aguyje"
    }
  });
  let claimCalls = 0, readCalls = 0, persistCalls = 0;
  const service = createMasteryAttemptService({
    now: () => NOW,
    resolveAuthorizedAttempt: async () => authority,
    claimAuthorizedAttempt: async () => { claimCalls += 1; return { status: "claimed" }; },
    readProfile: async () => { readCalls += 1; return { status: "missing" }; },
    persistTransition: async () => { persistCalls += 1; return { status: "persisted" }; }
  });
  const handler = handlerFor(service);
  for (let index = 0; index < 2; index += 1) {
    const res = response();
    await handler(request({ attemptId: authority.attemptId, response: { optionId: "aguyje" } }), res);
    assert.equal(res.statusCode, 400);
    assert.deepEqual(res.payload, { ok: false, reason: "ACTIVITY_NOT_APPROVED_FOR_MASTERY" });
  }
  assert.deepEqual({ claimCalls, readCalls, persistCalls }, { claimCalls: 0, readCalls: 0, persistCalls: 0 });
});

test("el handler acepta únicamente el fixture aprobado y el segundo uso devuelve replay", async () => {
  const claimed = new Set();
  let readCalls = 0, persistCalls = 0;
  const service = createMasteryAttemptService({
    now: () => NOW,
    resolveAuthorizedAttempt: async () => approvedAuthority(),
    claimAuthorizedAttempt: async ({ attemptId }) => {
      if (claimed.has(attemptId)) return { status: "replayed" };
      claimed.add(attemptId);
      return { status: "claimed" };
    },
    readProfile: async () => { readCalls += 1; return { status: "missing", profile: null }; },
    persistTransition: async () => { persistCalls += 1; return { status: "persisted" }; }
  });
  const handler = handlerFor(service);
  const body = { attemptId: "endpoint-attempt-1", response: { optionId: "correct" } };

  const accepted = response();
  await handler(request(body), accepted);
  assert.equal(accepted.statusCode, 200);
  assert.equal(accepted.payload.ok, true);
  assert.equal(accepted.payload.event.correct, true);

  const replayed = response();
  await handler(request(body), replayed);
  assert.equal(replayed.statusCode, 400);
  assert.deepEqual(replayed.payload, { ok: false, reason: "ATTEMPT_REPLAYED" });
  assert.deepEqual({ readCalls, persistCalls }, { readCalls: 1, persistCalls: 1 });
});

test("el handler no expone razones internas de una denegación", async () => {
  const res = response();
  await handlerFor({
    recordAttempt: async () => ({ ok: false, reason: "INTERNAL_PROJECT_SECRET", detail: "sensitive" })
  })(request({ attemptId: "attempt", response: { optionId: "answer" } }), res);

  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.payload, { ok: false, reason: "ATTEMPT_NOT_AUTHORIZED" });
});

test("cada razón pública del servicio se traduce de forma determinista a 400", async () => {
  const publicReasons = [
    "INVALID_ATTEMPT_PAYLOAD",
    "ATTEMPT_NOT_AUTHORIZED",
    "ACTIVITY_NOT_APPROVED_FOR_MASTERY",
    "UNSUPPORTED_SERVER_SCORING",
    "INVALID_ATTEMPT_RESPONSE",
    "ATTEMPT_REPLAYED",
    "ATTEMPT_CLAIM_FAILED",
    "PROFILE_SCOPE_MISMATCH",
    "MASTERY_READ_FAILED",
    "MASTERY_PERSISTENCE_FAILED"
  ];
  for (const reason of publicReasons) {
    const res = response();
    await handlerFor({ recordAttempt: async () => ({ ok: false, reason, internal: "not-public" }) })(
      request({ attemptId: "attempt", response: { optionId: "answer" } }),
      res
    );
    assert.equal(res.statusCode, 400, reason);
    assert.deepEqual(res.payload, { ok: false, reason }, reason);
  }
});

test("method, origin y auth conservan sus barreras antes del servicio", async () => {
  let serviceCalls = 0;
  const masteryService = { recordAttempt: async () => { serviceCalls += 1; return { ok: true }; } };
  const authenticated = createRecordLearningAttemptHandler({
    masteryService,
    verifyIdToken: async () => ({ uid: USER_ID }),
    rateLimit: () => true
  });

  const methodResponse = response();
  await authenticated({ method: "GET", headers: { host: "nalvi.test" } }, methodResponse);
  assert.equal(methodResponse.statusCode, 405);
  assert.equal(methodResponse.headers.Allow, "POST");
  assert.deepEqual(methodResponse.payload, { ok: false, reason: "METHOD_NOT_ALLOWED" });

  const originResponse = response();
  await authenticated({
    method: "POST",
    headers: { host: "nalvi.test", origin: "https://attacker.test" },
    body: {}
  }, originResponse);
  assert.equal(originResponse.statusCode, 403);
  assert.deepEqual(originResponse.payload, { ok: false, reason: "CROSS_ORIGIN_DENIED" });

  const unauthenticated = createRecordLearningAttemptHandler({
    masteryService,
    verifyIdToken: async () => null,
    rateLimit: () => true
  });
  const authResponse = response();
  await unauthenticated(request({}), authResponse);
  assert.equal(authResponse.statusCode, 401);
  assert.deepEqual(authResponse.payload, { ok: false, reason: "AUTH_REQUIRED" });
  assert.equal(serviceCalls, 0);
});
