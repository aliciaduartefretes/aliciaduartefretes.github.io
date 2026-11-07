import test from "node:test";
import assert from "node:assert/strict";
import { publicBillingCatalog, readBillingConfig } from "../billing-config.mjs";

const catalog = JSON.stringify({
  nalvi_plus_monthly: {
    kind: "subscription",
    variantId: "123",
    productId: "456",
    entitlements: ["courses:premium", "library:premium"],
    displayName: "NALVI Plus",
    description: "Cursos y biblioteca premium",
    priceLabel: "USD 9/mes"
  }
});

test("la facturación queda cerrada por defecto", () => {
  const config = readBillingConfig({});
  assert.equal(config.mode, "disabled");
  assert.equal(config.enabled, false);
});

test("test mode requiere todos los secretos y un catálogo validado", () => {
  const config = readBillingConfig({
    NALVI_BILLING_MODE: "test",
    LEMONSQUEEZY_API_KEY: "a-secure-test-api-key-value",
    LEMONSQUEEZY_STORE_ID: "42",
    LEMONSQUEEZY_WEBHOOK_SECRET: "secret-123",
    LEMONSQUEEZY_PLAN_CATALOG_JSON: catalog
  });
  assert.equal(config.enabled, true);
  assert.deepEqual(publicBillingCatalog(config), [{
    planKey: "nalvi_plus_monthly",
    kind: "subscription",
    displayName: "NALVI Plus",
    description: "Cursos y biblioteca premium",
    priceLabel: "USD 9/mes"
  }]);
});

test("conserva completa una clave JWT larga de Lemon Squeezy", () => {
  const longApiKey = `header.${"a".repeat(1_010)}.signature`;
  const config = readBillingConfig({
    NALVI_BILLING_MODE: "test",
    LEMONSQUEEZY_API_KEY: longApiKey,
    LEMONSQUEEZY_STORE_ID: "42",
    LEMONSQUEEZY_WEBHOOK_SECRET: "secret-123",
    LEMONSQUEEZY_PLAN_CATALOG_JSON: catalog
  });
  assert.equal(config.enabled, true);
  assert.equal(config.apiKey, longApiKey);
});

test("live no puede activarse por accidente", () => {
  assert.throws(() => readBillingConfig({ NALVI_BILLING_MODE: "live" }), /LIVE_BILLING_NOT_CONFIRMED/);
});

test("rechaza catálogos con IDs o permisos manipulables", () => {
  assert.throws(() => readBillingConfig({
    NALVI_BILLING_MODE: "test",
    LEMONSQUEEZY_PLAN_CATALOG_JSON: JSON.stringify({ bad: { variantId: "<script>", entitlements: ["admin"] } })
  }), /INVALID_BILLING_PLAN_ID/);
});
