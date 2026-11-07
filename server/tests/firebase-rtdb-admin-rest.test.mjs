import test from "node:test";
import assert from "node:assert/strict";
import { commitAdminJson, readAdminJson, __test } from "../firebase-rtdb-admin-rest.mjs";

const auth = async () => ({
  ok: true,
  token: "test-oauth-token",
  projectId: "guaraniconali",
  databaseUrl: "https://guaraniconali-default-rtdb.firebaseio.com"
});

test("acepta únicamente una URL HTTPS de Realtime Database", () => {
  const account = { project_id: "guaraniconali" };
  assert.equal(__test.databaseUrlFor(account, {}), "https://guaraniconali-default-rtdb.firebaseio.com");
  assert.equal(__test.databaseUrlFor(account, { FIREBASE_DATABASE_URL: "http://example.com" }), "");
  assert.equal(__test.databaseUrlFor(account, { FIREBASE_DATABASE_URL: "https://evil.example.com" }), "");
});

test("lee un permiso sin enviar el token en la URL", async () => {
  let request;
  const result = await readAdminJson({
    pathSegments: ["billingCourseEntitlements", "abc123"],
    tokenReader: auth,
    fetchImpl: async (url, options) => {
      request = { url, options };
      return { ok: true, json: async () => ({ active: true }) };
    }
  });
  assert.equal(result.status, "found");
  assert.deepEqual(result.document, { active: true });
  assert.equal(request.url, "https://guaraniconali-default-rtdb.firebaseio.com/billingCourseEntitlements/abc123.json");
  assert.equal(request.options.headers.Authorization, "Bearer test-oauth-token");
  assert.equal(request.url.includes("test-oauth-token"), false);
});

test("null representa un permiso inexistente", async () => {
  const result = await readAdminJson({
    pathSegments: ["billingCourseEntitlements", "missing"],
    tokenReader: auth,
    fetchImpl: async () => ({ ok: true, json: async () => null })
  });
  assert.deepEqual(result, { status: "missing", document: null });
});

test("persiste el webhook, la orden y el permiso en una actualización atómica", async () => {
  let request;
  const result = await commitAdminJson({
    tokenReader: auth,
    documents: [
      { pathSegments: ["billingOrders", "42"], fields: { status: "paid" } },
      { pathSegments: ["billingCourseEntitlements", "abc123"], fields: { active: true } },
      { pathSegments: ["billingWebhookEvents", "event123"], fields: { status: "processed" } }
    ],
    fetchImpl: async (url, options) => {
      request = { url, options };
      return { ok: true };
    }
  });
  assert.equal(result.status, "persisted");
  assert.equal(request.url, "https://guaraniconali-default-rtdb.firebaseio.com/.json");
  assert.equal(request.options.method, "PATCH");
  assert.deepEqual(JSON.parse(request.options.body), {
    "billingOrders/42": { status: "paid" },
    "billingCourseEntitlements/abc123": { active: true },
    "billingWebhookEvents/event123": { status: "processed" }
  });
});

test("rechaza segmentos que podrían escapar del espacio de facturación", async () => {
  const result = await readAdminJson({ pathSegments: ["billingOrders", "../users"], tokenReader: auth });
  assert.equal(result.status, "failed");
  assert.equal(result.reason, "INVALID_RTDB_PATH");
});
