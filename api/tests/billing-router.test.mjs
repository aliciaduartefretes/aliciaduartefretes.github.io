import test from "node:test";
import assert from "node:assert/strict";
import { createBillingRouter } from "../billing.js";

function response() {
  return {
    statusCode: 0,
    headers: {},
    payload: null,
    setHeader(name, value) { this.headers[name] = value; },
    end(body) { this.payload = JSON.parse(body); }
  };
}

test("una sola función enruta únicamente operaciones de facturación explícitas", async () => {
  const called = [];
  const router = createBillingRouter({
    catalog: async (request, responseObject) => {
      called.push("catalog");
      responseObject.statusCode = 200;
      responseObject.end(JSON.stringify({ ok: true }));
    }
  });
  const accepted = response();
  await router({ method: "GET", url: "/api/billing?operation=catalog" }, accepted);
  assert.equal(accepted.statusCode, 200);
  assert.deepEqual(called, ["catalog"]);

  const rejected = response();
  await router({ method: "POST", url: "/api/billing?operation=grant-admin" }, rejected);
  assert.equal(rejected.statusCode, 404);
  assert.deepEqual(rejected.payload, { ok: false, reason: "BILLING_OPERATION_NOT_FOUND" });
});
