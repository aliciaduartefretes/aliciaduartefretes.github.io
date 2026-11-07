import test from "node:test";
import assert from "node:assert/strict";
import { createBillingCourseContentHandler } from "../billing-course-content-handler.mjs";
import { createBillingStatusHandler } from "../billing-status-handler.mjs";

const plan = Object.freeze({
  planKey: "nalvi_test_course_once",
  kind: "one_time",
  entitlements: ["course:test-one-time"]
});
const config = Object.freeze({ enabled: true, plans: new Map([[plan.planKey, plan]]) });

function request(operation) {
  return {
    method: "GET",
    url: `/api/billing?operation=${operation}&planKey=${plan.planKey}`,
    headers: { origin: "https://www.idiomaguarani.com.py", authorization: "Bearer firebase-token" }
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

const verifyIdToken = async () => ({ uid: "user-123", email: "student@example.com", isAnonymous: false });
const activeDocument = Object.freeze({
  userId: "user-123",
  planKey: plan.planKey,
  status: "paid",
  active: true,
  entitlements: ["course:test-one-time"],
  purchasedAt: "2026-11-05T12:00:00.000Z"
});

test("antes del pago el estado y el contenido permanecen bloqueados", async () => {
  const statusResponse = response();
  await createBillingStatusHandler({
    configReader: () => config,
    verifyIdToken,
    readEntitlement: async () => ({ status: "missing" }),
    readCourseEntitlement: async () => ({ status: "missing" })
  })(request("status"), statusResponse);
  assert.equal(statusResponse.statusCode, 200);
  assert.equal(statusResponse.payload.purchase.active, false);

  const contentResponse = response();
  await createBillingCourseContentHandler({
    configReader: () => config,
    verifyIdToken,
    readCourseEntitlement: async () => ({ status: "missing" })
  })(request("course-content"), contentResponse);
  assert.equal(contentResponse.statusCode, 402);
  assert.equal(contentResponse.payload.reason, "PURCHASE_REQUIRED");
});

test("acepta GET del mismo sitio cuando el navegador omite Origin", async () => {
  const contentResponse = response();
  const sameSiteRequest = request("course-content");
  delete sameSiteRequest.headers.origin;
  sameSiteRequest.headers.referer = "https://www.idiomaguarani.com.py/?billingTest=1";
  await createBillingCourseContentHandler({
    configReader: () => config,
    verifyIdToken,
    readCourseEntitlement: async () => ({ status: "missing" })
  })(sameSiteRequest, contentResponse);
  assert.equal(contentResponse.statusCode, 402);
  assert.equal(contentResponse.payload.reason, "PURCHASE_REQUIRED");
});

test("rechaza GET sin Origin cuando Referer pertenece a otro sitio", async () => {
  const contentResponse = response();
  const foreignRequest = request("course-content");
  delete foreignRequest.headers.origin;
  foreignRequest.headers.referer = "https://evil.example/steal";
  await createBillingCourseContentHandler({
    configReader: () => config,
    verifyIdToken,
    readCourseEntitlement: async () => ({ status: "missing" })
  })(foreignRequest, contentResponse);
  assert.equal(contentResponse.statusCode, 403);
  assert.equal(contentResponse.payload.reason, "CROSS_ORIGIN_DENIED");
});

test("después del webhook el mismo usuario recibe el contenido protegido", async () => {
  const statusResponse = response();
  await createBillingStatusHandler({
    configReader: () => config,
    verifyIdToken,
    readEntitlement: async () => ({ status: "missing" }),
    readCourseEntitlement: async () => ({ status: "found", document: activeDocument })
  })(request("status"), statusResponse);
  assert.equal(statusResponse.payload.purchase.active, true);

  const contentResponse = response();
  await createBillingCourseContentHandler({
    configReader: () => config,
    verifyIdToken,
    readCourseEntitlement: async () => ({ status: "found", document: activeDocument })
  })(request("course-content"), contentResponse);
  assert.equal(contentResponse.statusCode, 200);
  assert.equal(contentResponse.payload.course.courseId, "test-one-time");
  assert.equal(contentResponse.payload.course.lessons[0].vocabulary[0].guarani, "Maitei");
});

test("un permiso perteneciente a otro usuario no filtra el contenido", async () => {
  const res = response();
  await createBillingCourseContentHandler({
    configReader: () => config,
    verifyIdToken,
    readCourseEntitlement: async () => ({ status: "found", document: { ...activeDocument, userId: "other-user" } })
  })(request("course-content"), res);
  assert.equal(res.statusCode, 402);
});
