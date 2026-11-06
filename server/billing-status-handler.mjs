import { bearerToken, requestOriginAllowed, sendJson } from "./billing-http.mjs";
import { readBillingConfig } from "./billing-config.mjs";
import { readBillingCourseEntitlement, readBillingEntitlement } from "./billing-store.mjs";
import { verifyFirebaseIdToken } from "./firebase-id-token.mjs";

const PLAN_KEY_PATTERN = /^[a-z][a-z0-9_-]{2,63}$/;

function publicStatus(document) {
  if (!document || document.active !== true) {
    return { active: false, planKey: "free", status: "free", entitlements: [], currentPeriodEnd: null };
  }
  return {
    active: true,
    planKey: String(document.planKey || ""),
    status: String(document.status || "active"),
    entitlements: Array.isArray(document.entitlements) ? document.entitlements.filter(value => typeof value === "string").slice(0, 20) : [],
    currentPeriodEnd: typeof document.currentPeriodEnd === "string" ? document.currentPeriodEnd : null
  };
}

function publicPurchase(document, planKey) {
  const active = document?.active === true && document?.planKey === planKey;
  return {
    active,
    planKey,
    status: active ? String(document.status || "paid") : "not_purchased",
    entitlements: active && Array.isArray(document.entitlements)
      ? document.entitlements.filter(value => typeof value === "string").slice(0, 20)
      : [],
    purchasedAt: active && typeof document.purchasedAt === "string" ? document.purchasedAt : null
  };
}

export function createBillingStatusHandler({
  configReader = readBillingConfig,
  verifyIdToken = verifyFirebaseIdToken,
  readEntitlement = readBillingEntitlement,
  readCourseEntitlement = readBillingCourseEntitlement
} = {}) {
  return async function handler(request, response) {
    if (request.method !== "GET") {
      response.setHeader("Allow", "GET");
      return sendJson(response, 405, { ok: false, reason: "METHOD_NOT_ALLOWED" });
    }
    if (!requestOriginAllowed(request)) return sendJson(response, 403, { ok: false, reason: "CROSS_ORIGIN_DENIED" });
    try {
      const user = await verifyIdToken(bearerToken(request));
      if (!user || user.isAnonymous) return sendJson(response, 401, { ok: false, reason: "AUTH_REQUIRED" });
      const subscriptionResult = await readEntitlement({ userId: user.uid });
      if (!["found", "missing"].includes(subscriptionResult.status)) {
        return sendJson(response, 503, { ok: false, reason: "BILLING_STATUS_UNAVAILABLE" });
      }
      const payload = { ok: true, subscription: publicStatus(subscriptionResult.document) };
      const planKey = new URL(request.url || "/api/billing", "https://www.idiomaguarani.com.py").searchParams.get("planKey") || "";
      if (!planKey) return sendJson(response, 200, payload);
      const config = configReader();
      const plan = PLAN_KEY_PATTERN.test(planKey) ? config.plans.get(planKey) : null;
      if (!plan || plan.kind !== "one_time") return sendJson(response, 400, { ok: false, reason: "INVALID_PLAN" });
      const purchaseResult = await readCourseEntitlement({ userId: user.uid, planKey });
      if (!["found", "missing"].includes(purchaseResult.status)) {
        return sendJson(response, 503, { ok: false, reason: "BILLING_STATUS_UNAVAILABLE" });
      }
      payload.purchase = publicPurchase(purchaseResult.document, planKey);
      return sendJson(response, 200, payload);
    } catch {
      return sendJson(response, 503, { ok: false, reason: "BILLING_STATUS_UNAVAILABLE" });
    }
  };
}

export const __test = { publicStatus, publicPurchase };
