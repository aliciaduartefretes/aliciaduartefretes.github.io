import test from "node:test";
import assert from "node:assert/strict";
import { createPremiumAcademyHandler, normalizePremiumCourse } from "../premium-academy-handler.mjs";

function request(operation, { method = "GET", body, courseId = "premium-a", token = "firebase-token" } = {}) {
  const params = new URLSearchParams({ operation });
  if (courseId) params.set("courseId", courseId);
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
    end(body) { this.payload = JSON.parse(body); }
  };
}

const premiumCourse = Object.freeze({
  courseId: "premium-a",
  title: "Guaraní grabado",
  summary: "Curso completo",
  description: "Contenido premium",
  status: "published",
  access: "premium",
  order: 2,
  lessons: [{
    lessonId: "lesson-1",
    title: "Abecedario",
    status: "published",
    videoProvider: "youtube",
    videoValue: "private-video-id",
    materials: [{ materialId: "material-1", title: "Libro", type: "ebook", url: "https://example.com/book.pdf" }]
  }]
});

const admin = Object.freeze({
  uid: "admin-1",
  email: "aliciaduartefretes@gmail.com",
  emailVerified: true,
  isAnonymous: false
});

const student = Object.freeze({ uid: "student-1", email: "student@example.com", emailVerified: true, isAnonymous: false });

test("el catálogo público solo devuelve metadatos y nunca filtra videos o e-books", async () => {
  const res = response();
  await createPremiumAcademyHandler({
    readCatalog: async () => ({ status: "found", document: { "premium-a": premiumCourse } })
  })(request("catalog", { token: "" }), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.courses.length, 1);
  assert.equal(res.payload.courses[0].lessonCount, 1);
  assert.equal("lessons" in res.payload.courses[0], false);
  assert.equal(JSON.stringify(res.payload).includes("private-video-id"), false);
  assert.equal(JSON.stringify(res.payload).includes("book.pdf"), false);
});

test("una cuenta sin suscripción no recibe el contenido premium", async () => {
  const res = response();
  await createPremiumAcademyHandler({
    verifyIdToken: async () => student,
    readCourse: async () => ({ status: "found", document: premiumCourse }),
    readEntitlement: async () => ({ status: "missing", document: null })
  })(request("course"), res);
  assert.equal(res.statusCode, 402);
  assert.equal(res.payload.reason, "SUBSCRIPTION_REQUIRED");
  assert.equal(JSON.stringify(res.payload).includes("private-video-id"), false);
});

test("la suscripción general desbloquea cualquier curso con courses:premium", async () => {
  const res = response();
  await createPremiumAcademyHandler({
    verifyIdToken: async () => student,
    readCourse: async () => ({ status: "found", document: premiumCourse }),
    readEntitlement: async () => ({
      status: "found",
      document: { userId: student.uid, active: true, entitlements: ["courses:premium"] }
    })
  })(request("course"), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.access, "subscription");
  assert.equal(res.payload.course.lessons[0].videoValue, "private-video-id");
  assert.equal(res.payload.course.lessons[0].materials[0].type, "ebook");
});

test("la administradora entra al estudio aunque el servicio de suscripciones no responda", async () => {
  const res = response();
  let entitlementWasRead = false;
  await createPremiumAcademyHandler({
    verifyIdToken: async () => admin,
    readEntitlement: async () => { entitlementWasRead = true; return { status: "error" }; }
  })(request("access"), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.administrator, true);
  assert.equal(res.payload.premium, true);
  assert.equal(entitlementWasRead, false);
});

test("solo la administradora verificada puede guardar y publicar contenido", async () => {
  let saved = null;
  const res = response();
  const draft = {
    title: "Curso nuevo",
    summary: "Resumen",
    access: "premium",
    status: "published",
    coverImageUrl: "javascript:alert(1)",
    lessons: [{
      title: "Clase uno",
      videoProvider: "external",
      videoValue: "https://videos.example.com/class-1",
      materials: [{ title: "E-book", type: "ebook", url: "https://files.example.com/book.pdf" }]
    }]
  };
  await createPremiumAcademyHandler({
    verifyIdToken: async () => admin,
    readCourse: async () => ({ status: "missing", document: null }),
    saveCourse: async ({ course }) => { saved = course; return { status: "persisted" }; },
    now: () => "2026-11-07T10:00:00.000Z"
  })(request("admin-save", { method: "POST", courseId: "", body: { course: draft } }), res);
  assert.equal(res.statusCode, 200);
  assert.equal(saved.courseId, "curso-nuevo");
  assert.equal(saved.coverImageUrl, "");
  assert.equal(saved.lessons[0].materials[0].url, "https://files.example.com/book.pdf");
  assert.equal(saved.updatedBy, admin.email);

  const denied = response();
  await createPremiumAcademyHandler({ verifyIdToken: async () => student })(
    request("admin-save", { method: "POST", courseId: "", body: { course: draft } }),
    denied
  );
  assert.equal(denied.statusCode, 403);
  assert.equal(denied.payload.reason, "ADMIN_REQUIRED");
});

test("los cursos gratuitos publicados siguen accesibles sin suscripción", async () => {
  const res = response();
  await createPremiumAcademyHandler({
    verifyIdToken: async () => null,
    readCourse: async () => ({ status: "found", document: { ...premiumCourse, access: "free" } })
  })(request("course", { token: "" }), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.access, "free");
  assert.equal(res.payload.course.lessons.length, 1);
});

test("la normalización impone límites editoriales y HTTPS", () => {
  const course = normalizePremiumCourse({
    title: "Ñe’ẽ básico",
    access: "premium",
    lessons: [{
      title: "Clase",
      videoProvider: "mux",
      videoValue: "https://evil.example/not-a-playback-id",
      materials: [
        { title: "Seguro", url: "https://example.com/a.pdf", type: "pdf" },
        { title: "Inseguro", url: "http://example.com/b.pdf", type: "pdf" }
      ]
    }]
  }, { user: admin, now: "2026-11-07T10:00:00.000Z" });
  assert.equal(course.courseId, "ne-e-basico");
  assert.equal(course.lessons[0].materials.length, 1);
  assert.equal(course.lessons[0].videoValue, "");
  assert.equal(course.access, "premium");
  assert.equal(course.status, "draft");
});
