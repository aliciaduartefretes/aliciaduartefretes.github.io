import test from "node:test";
import assert from "node:assert/strict";
import { createLiveCoursesHandler, LIVE_COURSE, normalizeLiveCourseInterest } from "../live-courses-handler.mjs";

function request(operation, { method = "GET", body, token = "" } = {}) {
  return {
    method,
    url: `/api/live-courses?operation=${operation}`,
    headers: {
      origin: "https://www.idiomaguarani.com.py",
      ...(token ? { authorization: `Bearer ${token}` } : {})
    },
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

const validInterest = Object.freeze({
  name: "Ana Pérez",
  email: "ANA@EXAMPLE.COM",
  country: "Paraguay",
  timezone: "America/Asuncion",
  schedule: "weekday-evenings",
  level: "new",
  goal: "Hablar con mi familia",
  consent: true
});

test("publica la propuesta sin exponer datos personales ni habilitar cobros", async () => {
  const res = response();
  await createLiveCoursesHandler()(request("catalog"), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.course.courseId, LIVE_COURSE.courseId);
  assert.equal(res.payload.course.paymentStatus, "waitlist_only");
  assert.equal(res.payload.course.capacity, 12);
});

test("registra el interés con un identificador determinista y evita duplicados", async () => {
  let saved = null;
  const first = response();
  await createLiveCoursesHandler({
    readDocument: async () => ({ status: "missing", document: null }),
    commitDocuments: async input => { saved = input.documents[0]; return { status: "persisted" }; },
    now: () => "2026-11-09T12:00:00.000Z"
  })(request("interest", { method: "POST", body: validInterest }), first);
  assert.equal(first.statusCode, 200);
  assert.equal(first.payload.status, "registered");
  assert.equal(saved.fields.email, "ana@example.com");
  assert.equal(saved.pathSegments[0], "liveCourseInterests");
  assert.match(saved.pathSegments[1], /^[a-f0-9]{48}$/);

  const duplicate = response();
  await createLiveCoursesHandler({
    readDocument: async () => ({ status: "found", document: { ...saved.fields, status: "waitlist", updateCount: 1 } }),
    commitDocuments: async () => ({ status: "persisted" }),
    now: () => "2026-11-09T13:00:00.000Z"
  })(request("interest", { method: "POST", body: validInterest }), duplicate);
  assert.equal(duplicate.statusCode, 200);
  assert.equal(duplicate.payload.status, "already_registered");
});

test("valida consentimiento, país, horario y nivel", () => {
  assert.throws(() => normalizeLiveCourseInterest({ ...validInterest, consent: false }), /CONSENT_REQUIRED/);
  assert.throws(() => normalizeLiveCourseInterest({ ...validInterest, country: "" }), /COUNTRY_REQUIRED/);
  assert.throws(() => normalizeLiveCourseInterest({ ...validInterest, schedule: "night" }), /SCHEDULE_REQUIRED/);
  assert.throws(() => normalizeLiveCourseInterest({ ...validInterest, level: "expert" }), /LEVEL_REQUIRED/);
});

test("rechaza formularios de otro origen y métodos incorrectos", async () => {
  const denied = response();
  const foreign = request("interest", { method: "POST", body: validInterest });
  foreign.headers.origin = "https://evil.example";
  await createLiveCoursesHandler()(foreign, denied);
  assert.equal(denied.statusCode, 403);

  const method = response();
  await createLiveCoursesHandler()(request("interest"), method);
  assert.equal(method.statusCode, 405);
});

test("la lista de inscriptos solo responde a administración verificada", async () => {
  const admin = { uid: "admin", email: "aliciaduartefretes@gmail.com", emailVerified: true, isAnonymous: false };
  const allowed = response();
  await createLiveCoursesHandler({
    verifyIdToken: async () => admin,
    listDocuments: async () => ({ status: "found", documents: [{ id: "lead-1", ...validInterest, email: "ana@example.com", status: "waitlist", createdAt: "2026-11-09T12:00:00.000Z" }] })
  })(request("admin-list", { token: "firebase-token" }), allowed);
  assert.equal(allowed.statusCode, 200);
  assert.equal(allowed.payload.total, 1);
  assert.equal(allowed.payload.interests[0].email, "ana@example.com");

  const denied = response();
  await createLiveCoursesHandler({ verifyIdToken: async () => ({ ...admin, email: "student@example.com" }) })(request("admin-list", { token: "student-token" }), denied);
  assert.equal(denied.statusCode, 403);
});
