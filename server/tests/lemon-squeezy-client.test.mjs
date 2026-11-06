import test from "node:test";
import assert from "node:assert/strict";
import { createLemonSqueezyCheckout } from "../lemon-squeezy-client.mjs";

const config = {
  enabled: true,
  mode: "test",
  storeId: "42",
  apiKey: "server-secret-api-key",
  appUrl: "https://www.idiomaguarani.com.py"
};
const plan = { planKey: "nalvi_plus_monthly", variantId: "123" };
const user = { uid: "user-123", email: "student@example.com", name: "Estudiante" };

test("el servidor fija tienda, variante, entorno e identidad del checkout", async () => {
  let sent;
  const result = await createLemonSqueezyCheckout({
    config,
    plan,
    user,
    fetchImpl: async (url, options) => {
      sent = { url, options, body: JSON.parse(options.body) };
      return {
        ok: true,
        json: async () => ({
          data: {
            attributes: {
              url: "https://nalvi.lemonsqueezy.com/checkout/custom/signed",
              expires_at: "2026-11-05T12:30:00.000Z"
            }
          }
        })
      };
    }
  });
  assert.equal(result.checkoutUrl, "https://nalvi.lemonsqueezy.com/checkout/custom/signed");
  assert.equal(sent.url, "https://api.lemonsqueezy.com/v1/checkouts");
  assert.equal(sent.options.headers.Authorization, "Bearer server-secret-api-key");
  assert.deepEqual(sent.body.data.relationships.variant.data, { type: "variants", id: "123" });
  assert.deepEqual(sent.body.data.attributes.checkout_data.custom, { user_id: "user-123", plan_key: "nalvi_plus_monthly" });
  assert.equal(sent.body.data.attributes.test_mode, true);
  assert.equal("custom_price" in sent.body.data.attributes, false);
});

test("nunca devuelve al navegador una URL de pago fuera de Lemon Squeezy", async () => {
  await assert.rejects(() => createLemonSqueezyCheckout({
    config,
    plan,
    user,
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({ data: { attributes: { url: "https://evil.example/pay" } } })
    })
  }), /INVALID_CHECKOUT_URL/);
});
