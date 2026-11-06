import test from "node:test";
import assert from "node:assert/strict";
import { createCheckoutHandler } from "../../server/billing-checkout-handler.mjs";

const plan = Object.freeze({ planKey: "nalvi_plus_monthly", kind: "subscription", variantId: "123" });
const config = Object.freeze({ enabled: true, mode: "test", plans: new Map([[plan.planKey, plan]]) });

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
