import { bearerToken, requestOriginAllowed, sendJson } from "./billing-http.mjs";
import { readBillingEntitlement } from "./billing-store.mjs";
import { verifyFirebaseIdToken } from "./firebase-id-token.mjs";

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

export function createBillingStatusHandler({ verifyIdToken = verifyFirebaseIdToken, readEntitlement = readBillingEntitlement } = {}) {
  return async function handler(request, response) {
    if (request.method !== "GET") {
      response.setHeader("Allow", "GET");
      return sendJson(response, 405, { ok: false, reason: "METHOD_NOT_ALLOWED" });
    }
    if (!requestOriginAllowed(request)) return sendJson(response, 403, { ok: false, reason: "CROSS_ORIGIN_DENIED" });
    try {
      const user = await verifyIdToken(bearerToken(request));
      if (!user || user.isAnonymous) return sendJson(response, 401, { ok: false, reason: "AUTH_REQUIRED" });
      const result = await readEntitlement({ userId: user.uid });
      if (result.status === "missing") return sendJson(response, 200, { ok: true, subscription: publicStatus(null) });
      if (result.status !== "found") return sendJson(response, 503, { ok: false, reason: "BILLING_STATUS_UNAVAILABLE" });
      return sendJson(response, 200, { ok: true, subscription: publicStatus(result.document) });
    } catch {
      return sendJson(response, 503, { ok: false, reason: "BILLING_STATUS_UNAVAILABLE" });
    }
  };
}

export const __test = { publicStatus };
