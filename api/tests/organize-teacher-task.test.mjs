import test from "node:test";
import assert from "node:assert/strict";
import { createOrganizeTeacherTaskHandler } from "../organize-teacher-task.js";

const USER = "api-teacher-1";

function request(body, overrides = {}) {
  return {
    method: "POST",
    headers: { authorization: "Bearer valid-token", host: "nalvi.test" },
    body,
    ...overrides
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

const validMaterial = () => ({
  title: "Actividad del docente",
  questions: [
    { order: 1, question: "¿Moõgua nde?", answer: "Che ha’e Paraguaygua." },
    { order: 2, question: "¿Mba’éichapa reime?", answer: "Aime porã.", options: ["Aime porã.", "Aguyje."] }
  ]
});

function handler(overrides = {}) {
  return createOrganizeTeacherTaskHandler({
    verifyIdToken: async () => ({ uid: USER, isAnonymous: false }),
    rateLimit: () => true,
    ...overrides
  });
}

test("endpoint autenticado devuelve únicamente un borrador exacto sin persistir ni asignar", async () => {
  const body = validMaterial();
  const res = response();
  await handler()(request(body), res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.headers["Cache-Control"], "no-store");
  assert.equal(res.payload.ok, true);
  assert.equal(res.payload.persistence, "not_performed");
  assert.equal(res.payload.template.ownerUserId, USER);
  assert.equal(res.payload.template.canPublish, false);
  assert.equal(res.payload.template.canAssign, false);
  assert.deepEqual(res.payload.template.cards.map(card => card.question), body.questions.map(item => item.question));
  assert.deepEqual(res.payload.template.cards.map(card => card.answer), body.questions.map(item => item.answer));
});

test("method, same-origin, autenticación y rate limit se evalúan antes de organizar", async () => {
  let organizerCalls = 0;
  const taskOrganizer = {
    organizeDraft: async () => { organizerCalls += 1; return { ok: true, template: {} }; }
  };

  const methodRes = response();
  await handler({ taskOrganizer })({ method: "GET", headers: { host: "nalvi.test" } }, methodRes);
  assert.equal(methodRes.statusCode, 405);
  assert.equal(methodRes.headers.Allow, "POST");

  const originRes = response();
  await handler({ taskOrganizer })(request({}, {
    headers: { authorization: "Bearer valid-token", host: "nalvi.test", origin: "https://attacker.test" }
  }), originRes);
  assert.equal(originRes.statusCode, 403);

  const authRes = response();
  await handler({ taskOrganizer, verifyIdToken: async () => null })(request({}), authRes);
  assert.equal(authRes.statusCode, 401);

  const anonymousRes = response();
  await handler({ taskOrganizer, verifyIdToken: async () => ({ uid: USER, isAnonymous: true }) })(request({}), anonymousRes);
  assert.equal(anonymousRes.statusCode, 401);

  const rateRes = response();
  await handler({ taskOrganizer, rateLimit: () => false })(request({}), rateRes);
  assert.equal(rateRes.statusCode, 429);
  assert.equal(organizerCalls, 0);
});

test("rechaza JSON, shape y payload excesivo de forma cerrada", async () => {
  const malformedRes = response();
  await handler()(request("{"), malformedRes);
  assert.equal(malformedRes.statusCode, 400);
  assert.deepEqual(malformedRes.payload, { ok: false, reason: "INVALID_REQUEST" });

  const invalidRes = response();
  await handler()(request({ title: "Actividad", questions: [], addAnswer: true }), invalidRes);
  assert.equal(invalidRes.statusCode, 400);
  assert.equal(invalidRes.payload.reason, "INVALID_TASK_MATERIAL");

  const largeRes = response();
  await handler()(request(JSON.stringify({ title: "A", questions: [], padding: "x".repeat(61_000) })), largeRes);
  assert.equal(largeRes.statusCode, 413);
  assert.deepEqual(largeRes.payload, { ok: false, reason: "PAYLOAD_TOO_LARGE" });
});

test("una inconsistencia de opciones vuelve como revisión manual, sin respuesta inventada", async () => {
  const body = {
    title: "Elección",
    questions: [{ order: 1, question: "Pregunta literal", answer: "Respuesta literal", options: ["Uno", "Dos"] }]
  };
  const res = response();
  await handler()(request(body), res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.template.status, "needs_manual_review");
  assert.deepEqual(res.payload.template.cards[0].options, ["Uno", "Dos"]);
  assert.equal(res.payload.template.cards[0].activityType, null);
});

test("el endpoint no filtra detalles internos de errores inesperados", async () => {
  const res = response();
  await handler({
    taskOrganizer: { organizeDraft: async () => ({ ok: false, reason: "SECRET_INTERNAL_REASON", secret: "value" }) }
  })(request(validMaterial()), res);

  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.payload, { ok: false, reason: "INVALID_TASK_MATERIAL" });
});
