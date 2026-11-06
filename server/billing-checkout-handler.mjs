import { readBillingConfig } from "./billing-config.mjs";
import { bearerToken, jsonBody, requestOriginAllowed, sendJson } from "./billing-http.mjs";
import { verifyFirebaseIdToken } from "./firebase-id-token.mjs";
import { createLemonSqueezyCheckout } from "./lemon-squeezy-client.mjs";

const PLAN_KEY_PATTERN = /^[a-z][a-z0-9_-]{2,63}$/;

export function createCheckoutHandler({
  configReader = readBillingConfig,
  verifyIdToken = verifyFirebaseIdToken,
  createCheckout = createLemonSqueezyCheckout
} = {}) {
  return async function handler(request, response) {
    if (request.method !== "POST") {
      response.setHeader("Allow", "POST");
      return sendJson(response, 405, { ok: false, reason: "METHOD_NOT_ALLOWED" });
    }
    if (!requestOriginAllowed(request)) return sendJson(response, 403, { ok: false, reason: "CROSS_ORIGIN_DENIED" });
    try {
      const config = configReader();
      if (!config.enabled) return sendJson(response, 503, { ok: false, reason: "BILLING_NOT_AVAILABLE" });
      const user = await verifyIdToken(bearerToken(request));
      if (!user || user.isAnonymous) return sendJson(response, 401, { ok: false, reason: "AUTH_REQUIRED" });
      if (!user.email || !user.emailVerified) return sendJson(response, 403, { ok: false, reason: "VERIFIED_EMAIL_REQUIRED" });
      const body = await jsonBody(request, 2_048);
      if (!body || Object.keys(body).some(key => key !== "planKey") || !PLAN_KEY_PATTERN.test(body.planKey || "")) {
        return sendJson(response, 400, { ok: false, reason: "INVALID_PLAN" });
      }
      const plan = config.plans.get(body.planKey);
      if (!plan || plan.kind !== "subscription") return sendJson(response, 400, { ok: false, reason: "INVALID_PLAN" });
      const checkout = await createCheckout({ config, plan, user });
      return sendJson(response, 200, { ok: true, checkoutUrl: checkout.checkoutUrl, expiresAt: checkout.expiresAt });
    } catch (error) {
      const tooLarge = error?.message === "PAYLOAD_TOO_LARGE";
      return sendJson(response, tooLarge ? 413 : 502, {
        ok: false,
        reason: tooLarge ? "PAYLOAD_TOO_LARGE" : "CHECKOUT_UNAVAILABLE"
      });
    }
  };
}
