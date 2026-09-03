import test from "node:test";
import assert from "node:assert/strict";
import { createMasteryAttemptService } from "../mastery-attempt-service.mjs";

const NOW = Date.parse("2026-09-03T12:00:00.000Z");
const USER_ID = "verified-user";

function approvedAuthority(overrides = {}) {
  return {
    status: "authorized",
    userId: USER_ID,
    attemptId: "attempt-approved-1",
    activityVersion: "approved-choice-v1",
    issuedAt: "2026-09-03T11:59:50.000Z",
    expiresAt: "2026-09-03T12:05:00.000Z",
    hintUsed: false,
    activity: {
      id: "approved-choice",
      version: "approved-choice-v1",
      conceptId: "approved-concept",
      learningObjectiveId: "approved-objective",
      activityType: "multiple-choice",
      skill: "vocabulary",
      difficulty: "foundation-1",
      allowedForMastery: true,
      contentValidationStatus: "normativeVerified",
      optionIds: ["wrong", "correct", "also-wrong"],
      correctOptionId: "correct"
    },
    ...overrides
  };
}

const approvedRequest = (overrides = {}) => ({
  attemptId: "attempt-approved-1",
  response: { optionId: "correct" },
  uiLocale: "es",
  ...overrides
});

function createHarness({ authority = approvedAuthority(), claimStatus = "claimed" } = {}) {
  const calls = { authority: 0, claim: 0, read: 0, persist: 0, stored: null, order: [] };
  const service = createMasteryAttemptService({
    now: () => NOW,
    resolveAuthorizedAttempt: async lookup => {
      calls.authority += 1;
      calls.order.push("authority");
      assert.deepEqual(lookup, { userId: USER_ID, attemptId: "attempt-approved-1" });
      return authority;
    },
    claimAuthorizedAttempt: async claim => {
      calls.claim += 1;
      calls.order.push("claim");
      assert.deepEqual(claim, {
        userId: USER_ID,
        attemptId: "attempt-approved-1",
        activityId: authority.activity.id,
        activityVersion: authority.activity.version
      });
      return { status: claimStatus };
    },
    readProfile: async () => {
      calls.read += 1;
      calls.order.push("read");
      return { status: "missing", profile: null };
    },
    persistTransition: async transition => {
      calls.persist += 1;
      calls.order.push("persist");
      calls.stored = transition;
      return { status: "persisted" };
    }
  });
  return { service, calls };
}

test("reproduce el POST forjado y lo rechaza antes de authority, lectura o persistencia", async () => {
  let authorityCalls = 0, readCalls = 0, persistCalls = 0;
  const service = createMasteryAttemptService({
    resolveAuthorizedAttempt: async () => { authorityCalls += 1; return approvedAuthority(); },
    readProfile: async () => { readCalls += 1; return { status: "missing" }; },
    persistTransition: async () => { persistCalls += 1; return { status: "persisted" }; }
  });
  const result = await service.recordAttempt({
    conceptId: "FORGED-C",
    learningObjectiveId: "FORGED-LO",
    activityId: "FORGED-A",
    activityType: "speaking",
    skill: "speaking",
    correct: true,
    hintUsed: false
  }, { verifiedUserId: USER_ID });

  assert.deepEqual(result, { ok: false, reason: "INVALID_ATTEMPT_PAYLOAD" });
  assert.deepEqual({ authorityCalls, readCalls, persistCalls }, { authorityCalls: 0, readCalls: 0, persistCalls: 0 });
});

test("el default productivo deniega incluso una identidad real sin leer ni persistir", async () => {
  let readCalls = 0, persistCalls = 0;
  const service = createMasteryAttemptService({
    readProfile: async () => { readCalls += 1; return { status: "missing" }; },
    persistTransition: async () => { persistCalls += 1; return { status: "persisted" }; }
  });
  const result = await service.recordAttempt({
    attemptId: "general-u01-elegir-aguyje-attempt",
    response: { optionId: "aguyje" }
  }, { verifiedUserId: USER_ID });

  assert.deepEqual(result, { ok: false, reason: "ATTEMPT_NOT_AUTHORIZED" });
  assert.deepEqual({ readCalls, persistCalls }, { readCalls: 0, persistCalls: 0 });
  assert.equal(service.audit().productionDefaultDeny, true);
});

test("material real no revisado y no apto para Mastery permanece rechazado", async () => {
  const unreviewed = approvedAuthority({
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
    resolveAuthorizedAttempt: async () => unreviewed,
    claimAuthorizedAttempt: async () => { claimCalls += 1; return { status: "claimed" }; },
    readProfile: async () => { readCalls += 1; return { status: "missing" }; },
    persistTransition: async () => { persistCalls += 1; return { status: "persisted" }; }
  });
  const request = { attemptId: unreviewed.attemptId, response: { optionId: "aguyje" } };

  assert.deepEqual(await service.recordAttempt(request, { verifiedUserId: USER_ID }), {
    ok: false,
    reason: "ACTIVITY_NOT_APPROVED_FOR_MASTERY"
  });
  assert.deepEqual({ claimCalls, readCalls, persistCalls }, { claimCalls: 0, readCalls: 0, persistCalls: 0 });
});

test("IDs, metadata, correct y hint del cliente no pueden entrar al contrato cerrado", async () => {
  const forbiddenClaims = {
    activityId: "approved-choice",
    activityVersion: "approved-choice-v1",
    conceptId: "approved-concept",
    learningObjectiveId: "approved-objective",
    activityType: "multiple-choice",
    skill: "vocabulary",
    difficulty: "foundation-1",
    correct: true,
    hintUsed: false,
    eventId: "client-event",
    timestamp: "2026-09-03T12:00:00.000Z"
  };
  for (const [field, value] of Object.entries(forbiddenClaims)) {
    const { service, calls } = createHarness();
    assert.deepEqual(await service.recordAttempt(approvedRequest({ [field]: value }), { verifiedUserId: USER_ID }), {
      ok: false,
      reason: "INVALID_ATTEMPT_PAYLOAD"
    }, field);
    assert.deepEqual({ authority: calls.authority, claim: calls.claim, read: calls.read, persist: calls.persist }, {
      authority: 0,
      claim: 0,
      read: 0,
      persist: 0
    }, field);
  }
});

test("IDs con separadores de ruta o controles se rechazan antes de claim y persistencia", async () => {
  for (const attemptId of ["attempt/child", "attempt\nchild"]) {
    const { service, calls } = createHarness();
    assert.deepEqual(await service.recordAttempt(approvedRequest({ attemptId }), { verifiedUserId: USER_ID }), {
      ok: false,
      reason: "INVALID_ATTEMPT_PAYLOAD"
    });
    assert.deepEqual({ authority: calls.authority, claim: calls.claim, read: calls.read, persist: calls.persist }, {
      authority: 0,
      claim: 0,
      read: 0,
      persist: 0
    });
  }

  for (const activity of [
    { ...approvedAuthority().activity, id: "approved/child" },
    { ...approvedAuthority().activity, conceptId: "concept\nchild" }
  ]) {
    const { service, calls } = createHarness({ authority: approvedAuthority({ activity }) });
    assert.deepEqual(await service.recordAttempt(approvedRequest(), { verifiedUserId: USER_ID }), {
      ok: false,
      reason: "ATTEMPT_NOT_AUTHORIZED"
    });
    assert.deepEqual({ claim: calls.claim, read: calls.read, persist: calls.persist }, { claim: 0, read: 0, persist: 0 });
  }
});

test("evalúa la respuesta en servidor y deriva todos los campos de Mastery", async () => {
  const { service, calls } = createHarness();
  const result = await service.recordAttempt(approvedRequest(), { verifiedUserId: USER_ID });

  assert.equal(result.ok, true);
  assert.equal(result.event.correct, true);
  assert.deepEqual(calls.order, ["authority", "claim", "read", "persist"]);
  assert.equal(calls.stored.userId, USER_ID);
  assert.equal(calls.stored.event.activityId, "approved-choice");
  assert.equal(calls.stored.event.activityVersion, "approved-choice-v1");
  assert.equal(calls.stored.event.authorityAttemptId, "attempt-approved-1");
  assert.equal(calls.stored.event.correct, true);
  assert.equal(calls.stored.event.hintUsed, false);
  assert.equal(calls.stored.event.responseTime, 10_000);
  assert.equal(calls.stored.event.timestamp, "2026-09-03T12:00:00.000Z");
  assert.equal("role" in calls.stored.profile, false);
});

test("una respuesta incorrecta legítima se persiste como incorrecta calculada en servidor", async () => {
  const { service, calls } = createHarness();
  const result = await service.recordAttempt(approvedRequest({ response: { optionId: "wrong" } }), { verifiedUserId: USER_ID });

  assert.equal(result.ok, true);
  assert.equal(result.event.correct, false);
  assert.equal(calls.stored.event.correct, false);
  assert.equal(calls.stored.profile.correctAttempts, 0);
  assert.equal(calls.stored.profile.consecutiveIncorrect, 1);
});

test("respuesta inválida se rechaza antes del claim y de leer el perfil", async () => {
  const { service, calls } = createHarness();
  const result = await service.recordAttempt(approvedRequest({ response: { optionId: "invented" } }), { verifiedUserId: USER_ID });

  assert.deepEqual(result, { ok: false, reason: "INVALID_ATTEMPT_RESPONSE" });
  assert.deepEqual({ authority: calls.authority, claim: calls.claim, read: calls.read, persist: calls.persist }, {
    authority: 1,
    claim: 0,
    read: 0,
    persist: 0
  });
});

test("un claim repetido falla cerrado sin nueva lectura ni persistencia", async () => {
  const { service, calls } = createHarness({ claimStatus: "replayed" });
  const result = await service.recordAttempt(approvedRequest(), { verifiedUserId: USER_ID });

  assert.deepEqual(result, { ok: false, reason: "ATTEMPT_REPLAYED" });
  assert.deepEqual({ authority: calls.authority, claim: calls.claim, read: calls.read, persist: calls.persist }, {
    authority: 1,
    claim: 1,
    read: 0,
    persist: 0
  });
});

test("el segundo uso del mismo intento no modifica Mastery dos veces", async () => {
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

  assert.equal((await service.recordAttempt(approvedRequest(), { verifiedUserId: USER_ID })).ok, true);
  assert.deepEqual(await service.recordAttempt(approvedRequest(), { verifiedUserId: USER_ID }), {
    ok: false,
    reason: "ATTEMPT_REPLAYED"
  });
  assert.deepEqual({ readCalls, persistCalls }, { readCalls: 1, persistCalls: 1 });
});

test("autoridad expirada, futura, de otro usuario o con versión distinta falla cerrada", async () => {
  const invalidAuthorities = [
    approvedAuthority({ userId: "another-user" }),
    approvedAuthority({ activityVersion: "another-version" }),
    approvedAuthority({ issuedAt: "2026-09-03T12:00:01.000Z" }),
    approvedAuthority({ expiresAt: "2026-09-03T12:00:00.000Z" })
  ];
  for (const authority of invalidAuthorities) {
    const { service, calls } = createHarness({ authority });
    assert.deepEqual(await service.recordAttempt(approvedRequest(), { verifiedUserId: USER_ID }), {
      ok: false,
      reason: "ATTEMPT_NOT_AUTHORIZED"
    });
    assert.deepEqual({ claim: calls.claim, read: calls.read, persist: calls.persist }, { claim: 0, read: 0, persist: 0 });
  }
});

test("aliases contradictorios e inventarios inválidos de autoridad no se normalizan ni filtran", async () => {
  const baseActivity = approvedAuthority().activity;
  const { correctOptionId: _correctOptionId, optionIds: _optionIds, ...textActivity } = baseActivity;
  const invalidActivities = [
    { ...baseActivity, conceptIds: ["different-concept"] },
    { ...baseActivity, type: "listening" },
    { ...baseActivity, optionIds: ["wrong", "", "correct"] },
    { ...baseActivity, optionIds: ["wrong", "correct", "correct"] },
    { ...baseActivity, correctOptionId: "outside-inventory" },
    {
      ...baseActivity,
      options: [{ id: "wrong" }, { id: "different" }, { id: "other" }]
    },
    { ...baseActivity, acceptedAnswers: ["", "sy"] },
    { ...baseActivity, acceptedAnswers: ["Sy", "sy"] },
    { ...baseActivity, acceptedAnswers: ["sy"] },
    { ...textActivity, optionIds: ["wrong", "correct"], acceptedAnswers: ["sy"] },
    { ...textActivity, acceptedAnswers: ["."] },
    { ...textActivity, acceptedAnswers: ["server-accepted"], answer: "different", correctAnswer: "different" },
    {
      ...baseActivity,
      helpLevel: 4,
      nalviGuided: true,
      answerExposure: "EXPLICIT_SOLUTION",
      hints: ["correct"]
    },
    { ...baseActivity, validationStatus: "unreviewed" }
  ];
  for (const activity of invalidActivities) {
    const { service, calls } = createHarness({ authority: approvedAuthority({ activity }) });
    assert.deepEqual(await service.recordAttempt(approvedRequest(), { verifiedUserId: USER_ID }), {
      ok: false,
      reason: "ATTEMPT_NOT_AUTHORIZED"
    });
    assert.deepEqual({ claim: calls.claim, read: calls.read, persist: calls.persist }, { claim: 0, read: 0, persist: 0 });
  }
});

test("tipos sin grader canónico, incluido speaking, no producen evidencia", async () => {
  const speakingText = {
    ...approvedAuthority().activity,
    id: "unsupported-speaking",
    version: "unsupported-speaking-v1",
    activityType: "speaking",
    skill: "speaking",
    acceptedAnswers: ["spoken-answer"]
  };
  delete speakingText.correctOptionId;
  delete speakingText.optionIds;
  const multipleChoiceText = { ...speakingText, id: "choice-as-text", version: "choice-as-text-v1", activityType: "multiple-choice", skill: "vocabulary" };
  const writingChoice = { ...approvedAuthority().activity, id: "writing-as-choice", version: "writing-as-choice-v1", activityType: "writing", skill: "writing" };
  for (const { activity, response } of [
    { activity: speakingText, response: { text: "spoken-answer" } },
    { activity: multipleChoiceText, response: { text: "spoken-answer" } },
    { activity: writingChoice, response: { optionId: "correct" } }
  ]) {
    const authority = approvedAuthority({ activityVersion: activity.version, activity });
    const { service, calls } = createHarness({ authority });
    assert.deepEqual(await service.recordAttempt(approvedRequest({ response }), { verifiedUserId: USER_ID }), {
      ok: false,
      reason: "UNSUPPORTED_SERVER_SCORING"
    });
    assert.deepEqual({ claim: calls.claim, read: calls.read, persist: calls.persist }, { claim: 0, read: 0, persist: 0 });
  }
});

test("el grader textual permitido compara la respuesta normalizada en servidor", async () => {
  const writingActivity = {
    ...approvedAuthority().activity,
    id: "approved-writing",
    version: "approved-writing-v1",
    activityType: "writing",
    skill: "writing",
    acceptedAnswers: ["Aguyje"]
  };
  delete writingActivity.correctOptionId;
  delete writingActivity.optionIds;
  const authority = approvedAuthority({
    activityVersion: writingActivity.version,
    activity: writingActivity
  });
  const { service, calls } = createHarness({ authority });
  const result = await service.recordAttempt(approvedRequest({ response: { text: "  aguyje. " } }), { verifiedUserId: USER_ID });

  assert.equal(result.ok, true);
  assert.equal(result.event.correct, true);
  assert.equal(calls.stored.event.activityType, "writing");
  assert.equal(calls.stored.event.correct, true);
});

test("throws de lectura y persistencia se convierten en razones públicas estables", async () => {
  const readFailure = createMasteryAttemptService({
    now: () => NOW,
    resolveAuthorizedAttempt: async () => approvedAuthority(),
    claimAuthorizedAttempt: async () => ({ status: "claimed" }),
    readProfile: async () => { throw new Error("sensitive read detail"); }
  });
  assert.deepEqual(await readFailure.recordAttempt(approvedRequest(), { verifiedUserId: USER_ID }), {
    ok: false,
    reason: "MASTERY_READ_FAILED"
  });

  const persistFailure = createMasteryAttemptService({
    now: () => NOW,
    resolveAuthorizedAttempt: async () => approvedAuthority(),
    claimAuthorizedAttempt: async () => ({ status: "claimed" }),
    readProfile: async () => ({ status: "missing", profile: null }),
    persistTransition: async () => { throw new Error("sensitive persist detail"); }
  });
  assert.deepEqual(await persistFailure.recordAttempt(approvedRequest(), { verifiedUserId: USER_ID }), {
    ok: false,
    reason: "MASTERY_PERSISTENCE_FAILED"
  });
});

test("el audit declara default deny, correct ignorado y protección replay obligatoria", () => {
  const audit = createMasteryAttemptService().audit();
  assert.equal(audit.productionDefaultDeny, true);
  assert.equal(audit.clientCorrectIgnored, true);
  assert.equal(audit.replayProtectionRequired, true);
  assert.equal(audit.atomicClaimRequiredBeforeProfileRead, true);
});

test("sin sesión verificada no se consulta authority", async () => {
  let authorityCalls = 0;
  const service = createMasteryAttemptService({
    resolveAuthorizedAttempt: async () => { authorityCalls += 1; return approvedAuthority(); }
  });
  assert.deepEqual(await service.recordAttempt({}, { verifiedUserId: "" }), { ok: false, reason: "AUTH_REQUIRED" });
  assert.equal(authorityCalls, 0);
});
