import test from "node:test";
import assert from "node:assert/strict";
import { createPremiumResourceHandler, __test } from "../premium-resource-handler.mjs";

const admin = Object.freeze({ uid: "admin-1", email: "aliciaduartefretes@gmail.com", emailVerified: true, isAnonymous: false });
const student = Object.freeze({ uid: "student-1", email: "student@example.com", emailVerified: true, isAnonymous: false });
const course = Object.freeze({
  courseId: "biblioteca-nalvi-plus",
  status: "published",
  access: "premium",
  lessons: [{
    lessonId: "libros",
    status: "published",
    materials: [{
      materialId: "gramatica",
      title: "Gramática guaraní",
      type: "pdf",
      privatePath: "nalvi-plus/library/biblioteca-nalvi-plus/gramatica-guarani.pdf"
    }]
  }]
});

function request(operation, { method = "GET", token = "firebase-token", query = {}, body } = {}) {
  const params = new URLSearchParams({ operation, ...query });
  return {
    method,
    url: `/api/premium-academy?${params}`,
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
    end(body) { this.payload = body ? JSON.parse(body) : null; }
  };
}

test("solo una administradora verificada puede emitir el token de carga privada", async () => {
  let generated;
  const handler = createPremiumResourceHandler({
    verifyIdToken: async () => admin,
    uploadHandler: async options => {
      generated = await options.onBeforeGenerateToken("nalvi-plus/library/biblioteca-nalvi-plus/gramatica-guarani.pdf");
      return { type: "blob.generate-client-token", clientToken: "temporary" };
    }
  });
  const allowed = response();
  await handler(request("resource-upload", { method: "POST", body: { type: "blob.generate-client-token" } }), allowed);
  assert.equal(allowed.statusCode, 200);
  assert.deepEqual(generated.allowedContentTypes, ["application/pdf"]);
  assert.equal(generated.addRandomSuffix, false);

  const denied = response();
  await createPremiumResourceHandler({
    verifyIdToken: async () => student,
    uploadHandler: async options => options.onBeforeGenerateToken("nalvi-plus/library/biblioteca-nalvi-plus/gramatica-guarani.pdf")
  })(request("resource-upload", { method: "POST", body: { type: "blob.generate-client-token" } }), denied);
  assert.equal(denied.statusCode, 403);
  assert.equal(denied.payload.reason, "ADMIN_REQUIRED");
});

test("la suscripción habilita el PDF mediante un proxy privado", async () => {
  let pathname = "";
  const res = response();
  await createPremiumResourceHandler({
    verifyIdToken: async () => student,
    readCourse: async () => ({ status: "found", document: course }),
    readEntitlement: async () => ({ status: "found", document: { userId: student.uid, active: true, entitlements: ["courses:premium"] } }),
    readPrivateBlob: async value => { pathname = value; return { statusCode: 200, stream: {} }; },
    streamBlob: (responseObject, result, title) => { responseObject.statusCode = 200; responseObject.payload = { streamed: Boolean(result.stream), title }; }
  })(request("resource", { query: { courseId: course.courseId, lessonId: "libros", materialId: "gramatica" } }), res);
  assert.equal(res.statusCode, 200);
  assert.equal(pathname, course.lessons[0].materials[0].privatePath);
  assert.deepEqual(res.payload, { streamed: true, title: "Gramática guaraní" });
});

test("una cuenta sin suscripción nunca llega al Blob privado", async () => {
  let read = false;
  const res = response();
  await createPremiumResourceHandler({
    verifyIdToken: async () => student,
    readCourse: async () => ({ status: "found", document: course }),
    readEntitlement: async () => ({ status: "missing", document: null }),
    readPrivateBlob: async () => { read = true; return null; }
  })(request("resource", { query: { courseId: course.courseId, lessonId: "libros", materialId: "gramatica" } }), res);
  assert.equal(res.statusCode, 402);
  assert.equal(res.payload.reason, "SUBSCRIPTION_REQUIRED");
  assert.equal(read, false);
});

test("la ruta privada solo admite PDF dentro del prefijo de NALVI Plus", () => {
  assert.equal(__test.privatePathAllowed("nalvi-plus/library/libros/manual.pdf"), true);
  assert.equal(__test.privatePathAllowed("public/manual.pdf"), false);
  assert.equal(__test.privatePathAllowed("nalvi-plus/library/../secret.pdf"), false);
  assert.equal(__test.privatePathAllowed("nalvi-plus/library/manual.exe"), false);
});
