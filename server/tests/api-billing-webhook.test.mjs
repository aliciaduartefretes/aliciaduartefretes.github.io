import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { createLemonSqueezyWebhookHandler, __test } from "../billing-webhook-handler.mjs";

const plan = Object.freeze({
  planKey: "nalvi_plus_monthly",
  kind: "subscription",
  variantId: "123",
  productId: "456",
  entitlements: ["courses:premium"]
});
const oneTimePlan = Object.freeze({
  planKey: "nalvi_test_course_once",
  kind: "one_time",
  variantId: "124",
  productId: "457",
  entitlements: ["course:test-one-time"]
});
const config = Object.freeze({
  enabled: true,
  mode: "test",
  storeId: "42",
  webhookSecret: "webhook-secret",
  plans: new Map([[plan.planKey, plan], [oneTimePlan.planKey, oneTimePlan]])
});

test("el diagnóstico del webhook nunca expone mensajes arbitrarios", () => {
  assert.equal(__test.safeWebhookErrorCode(new Error("INVALID_EVENT_PRODUCT")), "INVALID_EVENT_PRODUCT");
  assert.equal(__test.safeWebhookErrorCode(new Error("secret customer payload")), "INVALID_WEBHOOK");
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

function orderPayload(overrides = {}) {
  return {
    meta: { event_name: "order_created", custom_data: { user_id: "user-123", plan_key: oneTimePlan.planKey } },
    data: {
      type: "orders",
      id: "790",
      attributes: {
        store_id: 42,
        customer_id: 91,
        status: "paid",
        refunded: false,
        test_mode: true,
        created_at: "2026-11-05T12:00:00.000Z",
        first_order_item: { product_id: 457, variant_id: 124 },
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
    persistSubscription: async snapshot => { saved = snapshot; return { status: "persisted" }; },
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
    persistSubscription: async () => { writes += 1; return { status: "persisted" }; }
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
    persistSubscription: async () => { writes += 1; return { status: "persisted" }; }
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
    persistSubscription: async () => ({ status: "persisted" })
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
    persistSubscription: async snapshot => { snapshots.push(snapshot); return { status: "persisted" }; },
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

test("order_created pagado concede de forma permanente solo el curso comprado", async () => {
  let saved;
  const handler = createLemonSqueezyWebhookHandler({
    configReader: () => config,
    readEvent: async () => ({ status: "missing" }),
    persistPurchase: async snapshot => { saved = snapshot; return { status: "persisted" }; },
    clock: () => new Date("2026-11-05T12:01:00.000Z")
  });
  const res = response();
  await handler(signedRequest(orderPayload()), res);
  assert.equal(res.statusCode, 200);
  assert.equal(saved.kind, "one_time");
  assert.equal(saved.purchase.orderId, "790");
  assert.equal(saved.entitlement.active, true);
  assert.equal(saved.entitlement.permanent, true);
  assert.deepEqual(saved.entitlement.entitlements, ["course:test-one-time"]);
});

test("order_refunded revoca el acceso permanente del curso comprado", async () => {
  let saved;
  const handler = createLemonSqueezyWebhookHandler({
    configReader: () => config,
    readEvent: async () => ({ status: "missing" }),
    persistPurchase: async snapshot => { saved = snapshot; return { status: "persisted" }; },
    clock: () => new Date("2026-11-05T12:02:00.000Z")
  });
  const refunded = orderPayload({ status: "refunded", refunded: true });
  refunded.meta.event_name = "order_refunded";
  const res = response();
  await handler(signedRequest(refunded), res);
  assert.equal(res.statusCode, 200);
  assert.equal(saved.purchase.refunded, true);
  assert.equal(saved.entitlement.active, false);
  assert.equal(saved.entitlement.permanent, false);
  assert.deepEqual(saved.entitlement.entitlements, []);
});

test("una orden no pagada o con otra variante nunca desbloquea el curso", async () => {
  let writes = 0;
  const handler = createLemonSqueezyWebhookHandler({
    configReader: () => config,
    readEvent: async () => ({ status: "missing" }),
    persistPurchase: async () => { writes += 1; return { status: "persisted" }; }
  });
  for (const event of [
    orderPayload({ status: "pending" }),
    { ...orderPayload({ status: "paid", refunded: false }), meta: { ...orderPayload().meta, event_name: "order_refunded" } },
    orderPayload({ first_order_item: { product_id: 457, variant_id: 999 } }),
    orderPayload({ test_mode: false })
  ]) {
    const res = response();
    await handler(signedRequest(event), res);
    assert.equal(res.statusCode, 400);
  }
  assert.equal(writes, 0);
});
