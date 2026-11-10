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
  paymentPreference: "full",
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
  assert.equal(res.payload.course.currency, "USD");
  assert.equal(res.payload.course.fullPriceUsd, 79);
  assert.equal(res.payload.course.monthlyPriceUsd, 45);
});

test("acepta la ruta compartida de academia para no crear otra función de Vercel", async () => {
  const res = response();
  const req = request("catalog");
  req.url = "/api/premium-academy?operation=live-courses&action=catalog";
  await createLiveCoursesHandler()(req, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.course.courseId, LIVE_COURSE.courseId);
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
  assert.equal(saved.fields.paymentPreference, "full");
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

test("una reinscripción conserva el seguimiento interno del CRM", () => {
  const interest = normalizeLiveCourseInterest(validInterest, {
    existing: {
      createdAt: "2026-11-09T12:00:00.000Z",
      status: "contacted",
      notes: "Respondió por WhatsApp",
      followUpAt: "2026-11-12",
      crmUpdatedAt: "2026-11-10T12:00:00.000Z",
      crmUpdatedBy: "admin@example.com",
      updateCount: 2
    },
    now: "2026-11-10T14:00:00.000Z"
  });
  assert.equal(interest.status, "contacted");
  assert.equal(interest.notes, "Respondió por WhatsApp");
  assert.equal(interest.followUpAt, "2026-11-12");
  assert.equal(interest.crmUpdatedBy, "admin@example.com");
  assert.equal(interest.updateCount, 3);
});

test("valida consentimiento, país, horario y nivel", () => {
  assert.throws(() => normalizeLiveCourseInterest({ ...validInterest, consent: false }), /CONSENT_REQUIRED/);
  assert.throws(() => normalizeLiveCourseInterest({ ...validInterest, country: "" }), /COUNTRY_REQUIRED/);
  assert.throws(() => normalizeLiveCourseInterest({ ...validInterest, schedule: "night" }), /SCHEDULE_REQUIRED/);
  assert.throws(() => normalizeLiveCourseInterest({ ...validInterest, level: "expert" }), /LEVEL_REQUIRED/);
  assert.throws(() => normalizeLiveCourseInterest({ ...validInterest, paymentPreference: "" }), /PAYMENT_PREFERENCE_REQUIRED/);
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
    listDocuments: async () => ({ status: "found", documents: [{ id: "lead-1", ...validInterest, email: "ana@example.com", status: "waitlist", marketingConsent: true, createdAt: "2026-11-09T12:00:00.000Z" }] })
  })(request("admin-list", { token: "firebase-token" }), allowed);
  assert.equal(allowed.statusCode, 200);
  assert.equal(allowed.payload.total, 1);
  assert.equal(allowed.payload.interests[0].email, "ana@example.com");
  assert.equal(allowed.payload.interests[0].marketingConsent, true);
  assert.equal(allowed.payload.metrics.pendingContact, 1);
  assert.equal(allowed.payload.metrics.marketingEligible, 1);

  const denied = response();
  await createLiveCoursesHandler({ verifyIdToken: async () => ({ ...admin, email: "student@example.com" }) })(request("admin-list", { token: "student-token" }), denied);
  assert.equal(denied.statusCode, 403);
});

test("administración actualiza el estado y las notas del CRM sin perder la inscripción", async () => {
  const admin = { uid: "admin", email: "aliciaduartefretes@gmail.com", emailVerified: true, isAnonymous: false };
  let saved = null;
  const res = response();
  await createLiveCoursesHandler({
    verifyIdToken: async () => admin,
    readDocument: async () => ({ status: "found", document: { ...validInterest, email: "ana@example.com", status: "waitlist", createdAt: "2026-11-09T12:00:00.000Z", source: "home-live-course-banner" } }),
    commitDocuments: async input => { saved = input.documents[0]; return { status: "persisted" }; },
    now: () => "2026-11-10T12:00:00.000Z"
  })(request("admin-update", {
    method: "POST",
    token: "firebase-token",
    body: { id: "a".repeat(48), status: "contacted", notes: "Respondió por WhatsApp", followUpAt: "2026-11-12" }
  }), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.interest.status, "contacted");
  assert.equal(res.payload.interest.notes, "Respondió por WhatsApp");
  assert.equal(saved.fields.email, "ana@example.com");
  assert.equal(saved.fields.createdAt, "2026-11-09T12:00:00.000Z");
  assert.equal(saved.fields.crmUpdatedBy, admin.email);
});

test("administración no puede guardar estados desconocidos ni actualizar IDs ajenos", async () => {
  const admin = { uid: "admin", email: "aliciaduartefretes@gmail.com", emailVerified: true, isAnonymous: false };
  const invalidStatus = response();
  await createLiveCoursesHandler({ verifyIdToken: async () => admin })(request("admin-update", {
    method: "POST", token: "firebase-token", body: { id: "a".repeat(48), status: "anything" }
  }), invalidStatus);
  assert.equal(invalidStatus.statusCode, 400);
  assert.equal(invalidStatus.payload.reason, "INVALID_CRM_STATUS");

  const invalidId = response();
  await createLiveCoursesHandler({ verifyIdToken: async () => admin })(request("admin-update", {
    method: "POST", token: "firebase-token", body: { id: "lead-1", status: "contacted" }
  }), invalidId);
  assert.equal(invalidId.statusCode, 400);
  assert.equal(invalidId.payload.reason, "INVALID_INTEREST_ID");
});
