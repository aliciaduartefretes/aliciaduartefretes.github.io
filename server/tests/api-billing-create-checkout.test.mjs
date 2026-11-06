import test from "node:test";
import assert from "node:assert/strict";
import { __test, createCheckoutHandler } from "../billing-checkout-handler.mjs";

const plan = Object.freeze({ planKey: "nalvi_plus_monthly", kind: "subscription", variantId: "123" });
const oneTimePlan = Object.freeze({ planKey: "nalvi_test_course_once", kind: "one_time", variantId: "124" });
const config = Object.freeze({ enabled: true, mode: "test", plans: new Map([
  [plan.planKey, plan],
  [oneTimePlan.planKey, oneTimePlan]
]) });

function response() {
  return {
    statusCode: 0,
    headers: {},
    payload: null,
    setHeader(name, value) { this.headers[name] = value; },
    end(body) { this.payload = JSON.parse(body); }
  };
}

function request(body, headers = {}) {
  return {
    method: "POST",
    headers: {
      origin: "https://www.idiomaguarani.com.py",
      authorization: "Bearer firebase-token",
      ...headers
    },
    body
  };
}

function handler(overrides = {}) {
  return createCheckoutHandler({
    configReader: () => config,
    verifyIdToken: async () => ({
      uid: "user-123",
      isAnonymous: false,
      email: "student@example.com",
      emailVerified: true,
      name: "Estudiante"
    }),
    createCheckout: async ({ plan: selected }) => ({
      checkoutUrl: `https://nalvi.lemonsqueezy.com/checkout/custom/${selected.planKey}`,
      expiresAt: "2026-11-05T12:30:00.000Z"
    }),
    ...overrides
  });
}

test("crea checkout solo para una clave de plan permitida", async () => {
  const res = response();
  await handler()(request({ planKey: plan.planKey }), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.ok, true);
  assert.match(res.payload.checkoutUrl, /^https:\/\/nalvi\.lemonsqueezy\.com\//);
});

test("permite un checkout de pago único definido exclusivamente por el servidor", async () => {
  const res = response();
  await handler()(request({ planKey: oneTimePlan.planKey }), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.kind, "one_time");
  assert.match(res.payload.checkoutUrl, /nalvi_test_course_once/);
});

test("el cliente no puede enviar precio, variante ni permisos", async () => {
  const res = response();
  await handler()(request({ planKey: plan.planKey, variantId: "999", price: 1, entitlements: ["admin"] }), res);
  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.payload, { ok: false, reason: "INVALID_PLAN" });
});

test("rechaza origen ajeno, correo no verificado y modo apagado", async () => {
  const foreign = response();
  await handler()(request({ planKey: plan.planKey }, { origin: "https://evil.example" }), foreign);
  assert.equal(foreign.statusCode, 403);

  const unverified = response();
  await handler({ verifyIdToken: async () => ({ uid: "user-123", email: "student@example.com", emailVerified: false }) })(request({ planKey: plan.planKey }), unverified);
  assert.equal(unverified.statusCode, 403);

  const disabled = response();
  await handler({ configReader: () => ({ enabled: false, plans: new Map() }) })(request({ planKey: plan.planKey }), disabled);
  assert.equal(disabled.statusCode, 503);
});

test("el diagnóstico de checkout solo permite códigos técnicos seguros", () => {
  assert.equal(__test.safeCheckoutErrorCode(new Error("LEMONSQUEEZY_CHECKOUT_HTTP_422")), "LEMONSQUEEZY_CHECKOUT_HTTP_422");
  assert.equal(__test.safeCheckoutErrorCode(new Error("token secreto o datos del proveedor")), "CHECKOUT_INTERNAL_ERROR");
});
