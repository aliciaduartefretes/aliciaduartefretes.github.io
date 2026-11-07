const PLAN_KEY_PATTERN = /^[a-z][a-z0-9_-]{2,63}$/;
const ID_PATTERN = /^\d{1,20}$/;
const ENTITLEMENT_PATTERN = /^[a-z][a-z0-9:_-]{2,79}$/;

function cleanString(value, maximum = 120) {
  return typeof value === "string" ? value.trim().slice(0, maximum) : "";
}

function parseCatalog(raw) {
  if (!raw) return new Map();
  let value;
  try { value = JSON.parse(raw); }
  catch { throw new Error("INVALID_BILLING_CATALOG_JSON"); }
  if (!value || Array.isArray(value) || typeof value !== "object") throw new Error("INVALID_BILLING_CATALOG");
  const plans = new Map();
  for (const [planKey, candidate] of Object.entries(value)) {
    if (!PLAN_KEY_PATTERN.test(planKey) || !candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
      throw new Error("INVALID_BILLING_PLAN");
    }
    const variantId = cleanString(candidate.variantId, 20);
    const productId = cleanString(candidate.productId, 20);
    const entitlements = Array.isArray(candidate.entitlements) ? [...new Set(candidate.entitlements)] : [];
    if (!ID_PATTERN.test(variantId) || (productId && !ID_PATTERN.test(productId))) throw new Error("INVALID_BILLING_PLAN_ID");
    if (!entitlements.length || entitlements.length > 20 || entitlements.some(item => !ENTITLEMENT_PATTERN.test(item))) {
      throw new Error("INVALID_BILLING_ENTITLEMENTS");
    }
    plans.set(planKey, Object.freeze({
      planKey,
      kind: candidate.kind === "one_time" ? "one_time" : "subscription",
      variantId,
      productId,
      entitlements: Object.freeze(entitlements),
      displayName: cleanString(candidate.displayName, 80) || planKey,
      description: cleanString(candidate.description, 180),
      priceLabel: cleanString(candidate.priceLabel, 40)
    }));
  }
  return plans;
}

function configuredMode(env) {
  const mode = cleanString(env.NALVI_BILLING_MODE, 16).toLowerCase() || "disabled";
  if (!["disabled", "test", "live"].includes(mode)) throw new Error("INVALID_BILLING_MODE");
  if (mode === "live" && env.NALVI_BILLING_LIVE_CONFIRMATION !== "NALVI_REAL_CHARGES_APPROVED") {
    throw new Error("LIVE_BILLING_NOT_CONFIRMED");
  }
  return mode;
}

export function readBillingConfig(env = process.env) {
  const mode = configuredMode(env);
  const plans = parseCatalog(env.LEMONSQUEEZY_PLAN_CATALOG_JSON);
  const storeId = cleanString(env.LEMONSQUEEZY_STORE_ID, 20);
  // Lemon Squeezy API keys are signed JWTs and can exceed 1,000 characters.
  // Keep a defensive ceiling without truncating a valid credential.
  const apiKey = cleanString(env.LEMONSQUEEZY_API_KEY, 2_048);
  const webhookSecret = cleanString(env.LEMONSQUEEZY_WEBHOOK_SECRET, 128);
  const appUrl = cleanString(env.NALVI_PUBLIC_APP_URL, 300) || "https://www.idiomaguarani.com.py";
  const configured = mode !== "disabled"
    && ID_PATTERN.test(storeId)
    && apiKey.length >= 20
    && webhookSecret.length >= 6
    && plans.size > 0;
  return Object.freeze({ mode, enabled: configured, storeId, apiKey, webhookSecret, appUrl, plans });
}

export function publicBillingCatalog(config) {
  return [...config.plans.values()].map(({ planKey, kind, entitlements, displayName, description, priceLabel }) => ({
    planKey,
    kind,
    displayName,
    description,
    priceLabel,
    unlocksPremiumCourses: entitlements.includes("courses:premium")
  }));
}

export const __test = { parseCatalog, configuredMode, PLAN_KEY_PATTERN, ID_PATTERN };
