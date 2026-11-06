import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { createLemonSqueezyWebhookHandler } from "../../server/billing-webhook-handler.mjs";

const plan = Object.freeze({
  planKey: "nalvi_plus_monthly",
  kind: "subscription",
  variantId: "123",
  productId: "456",
  entitlements: ["courses:premium"]
});
const config = Object.freeze({
  enabled: true,
  mode: "test",
  storeId: "42",
  webhookSecret: "webhook-secret",
  plans: new Map([[plan.planKey, plan]])
});

function payload(overrides = {}) {
  return {
    meta: { event_name: "subscription_created", custom_data: { user_id: "user-123", plan_key: plan.planKey } },
    data: {
      type: "subscriptions",
      id: "789",
      attributes: {
        store_id: 42,
        customer_id: 90,
        product_id: 456,
        variant_id: 123,
        status: "active",
        renews_at: "2026-12-05T00:00:00.000Z",
        ends_at: null,
        test_mode: true,
        ...overrides
      }
    }
  };
}

function signedRequest(value, signatureOverride) {
  const body = JSON.stringify(value);
  return {
    method: "POST",
    headers: {
      "x-signature": signatureOverride || createHmac("sha256", config.webhookSecret).update(body).digest("hex")
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

test("un webhook firmado concede únicamente los permisos del catálogo server-side", async () => {
  let saved;
  const handler = createLemonSqueezyWebhookHandler({
    configReader: () => config,
    readEvent: async () => ({ status: "missing" }),
    persistSnapshot: async snapshot => { saved = snapshot; return { status: "persisted" }; },
    clock: () => new Date("2026-11-05T12:00:00.000Z")
  });
  const res = response();
  await handler(signedRequest(payload()), res);
  assert.equal(res.statusCode, 200);
  assert.equal(saved.entitlement.active, true);
  assert.deepEqual(saved.entitlement.entitlements, ["courses:premium"]);
  assert.equal(saved.entitlement.userId, "user-123");
});

test("firma inválida no consulta ni escribe Firestore", async () => {
  let reads = 0, writes = 0;
  const handler = createLemonSqueezyWebhookHandler({
    configReader: () => config,
    readEvent: async () => { reads += 1; return { status: "missing" }; },
    persistSnapshot: async () => { writes += 1; return { status: "persisted" }; }
  });
  const res = response();
  await handler(signedRequest(payload(), "0".repeat(64)), res);
  assert.equal(res.statusCode, 401);
  assert.deepEqual({ reads, writes }, { reads: 0, writes: 0 });
});

test("reenvío idéntico es idempotente", async () => {
  let writes = 0;
  const handler = createLemonSqueezyWebhookHandler({
    configReader: () => config,
    readEvent: async () => ({ status: "found", document: { status: "processed" } }),
    persistSnapshot: async () => { writes += 1; return { status: "persisted" }; }
  });
  const res = response();
  await handler(signedRequest(payload()), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.duplicate, true);
  assert.equal(writes, 0);
});

test("producto, entorno o usuario manipulados se rechazan", async () => {
  const handler = createLemonSqueezyWebhookHandler({
    configReader: () => config,
    readEvent: async () => ({ status: "missing" }),
    persistSnapshot: async () => ({ status: "persisted" })
  });
  for (const event of [
    payload({ variant_id: 999 }),
    payload({ test_mode: false }),
    { ...payload(), meta: { event_name: "subscription_created", custom_data: { user_id: "../other", plan_key: plan.planKey } } }
  ]) {
    const res = response();
    await handler(signedRequest(event), res);
    assert.equal(res.statusCode, 400);
    assert.deepEqual(res.payload, { ok: false, reason: "INVALID_WEBHOOK" });
  }
});

test("cancelación conserva acceso hasta ends_at y expiración lo revoca", async () => {
  const snapshots = [];
  const handler = createLemonSqueezyWebhookHandler({
    configReader: () => config,
    readEvent: async () => ({ status: "missing" }),
    persistSnapshot: async snapshot => { snapshots.push(snapshot); return { status: "persisted" }; },
    clock: () => new Date("2026-11-05T12:00:00.000Z")
  });
  const cancelled = payload({ status: "cancelled", ends_at: "2026-12-05T00:00:00.000Z" });
  cancelled.meta.event_name = "subscription_cancelled";
  const expired = payload({ status: "expired", ends_at: "2026-11-01T00:00:00.000Z" });
  expired.meta.event_name = "subscription_expired";
  await handler(signedRequest(cancelled), response());
  await handler(signedRequest(expired), response());
  assert.equal(snapshots[0].entitlement.active, true);
  assert.equal(snapshots[1].entitlement.active, false);
  assert.deepEqual(snapshots[1].entitlement.entitlements, []);
});
