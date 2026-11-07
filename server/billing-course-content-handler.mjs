import { readBillingConfig } from "./billing-config.mjs";
import { bearerToken, requestOriginAllowed, sendJson } from "./billing-http.mjs";
import { readBillingCourseEntitlement } from "./billing-store.mjs";
import { verifyFirebaseIdToken } from "./firebase-id-token.mjs";

const PLAN_KEY_PATTERN = /^[a-z][a-z0-9_-]{2,63}$/;
const TEST_COURSE_ENTITLEMENT = "course:test-one-time";

const TEST_COURSE = Object.freeze({
  courseId: "test-one-time",
  title: "Guaraní para situaciones cotidianas",
  subtitle: "Curso ficticio para validar una compra de pago único",
  lessons: Object.freeze([
    Object.freeze({
      id: "saludos-cotidianos",
      title: "Saludos cotidianos",
      summary: "Practica cómo saludar, agradecer y despedirte con naturalidad.",
      vocabulary: Object.freeze([
        Object.freeze({ guarani: "Maitei", spanish: "Hola / saludo" }),
        Object.freeze({ guarani: "Aguyje", spanish: "Gracias" }),
        Object.freeze({ guarani: "Jajoechata", spanish: "Nos vemos" })
      ])
    })
  ])
});

function courseForPlan(plan) {
  return plan?.entitlements?.includes(TEST_COURSE_ENTITLEMENT) ? TEST_COURSE : null;
}

export function createBillingCourseContentHandler({
  configReader = readBillingConfig,
  verifyIdToken = verifyFirebaseIdToken,
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
      const planKey = new URL(request.url || "/api/billing", "https://www.idiomaguarani.com.py").searchParams.get("planKey") || "";
      const config = configReader();
      const plan = PLAN_KEY_PATTERN.test(planKey) ? config.plans.get(planKey) : null;
      const course = plan?.kind === "one_time" ? courseForPlan(plan) : null;
      if (!plan || !course) return sendJson(response, 404, { ok: false, reason: "COURSE_NOT_FOUND" });
      const result = await readCourseEntitlement({ userId: user.uid, planKey });
      if (result.status === "missing") return sendJson(response, 402, { ok: false, reason: "PURCHASE_REQUIRED" });
      if (result.status !== "found") {
        const storeReason = String(result.reason || "UNKNOWN").replace(/[^A-Z0-9_]/gi, "_").slice(0, 64);
        const storeStatus = Number.isInteger(result.httpStatus) ? `:${result.httpStatus}` : "";
        console.error(`[billing] course access store unavailable: ${storeReason}${storeStatus}`);
        return sendJson(response, 503, { ok: false, reason: "BILLING_STATUS_UNAVAILABLE" });
      }
      const entitlement = result.document || {};
      const allowed = entitlement.active === true
        && entitlement.userId === user.uid
        && entitlement.planKey === planKey
        && Array.isArray(entitlement.entitlements)
        && entitlement.entitlements.includes(TEST_COURSE_ENTITLEMENT);
      if (!allowed) return sendJson(response, 402, { ok: false, reason: "PURCHASE_REQUIRED" });
      return sendJson(response, 200, { ok: true, course });
    } catch (error) {
      const errorName = String(error?.name || "UNKNOWN").replace(/[^A-Z0-9_]/gi, "_").slice(0, 64);
      console.error(`[billing] course access failed: ${errorName}`);
      return sendJson(response, 503, { ok: false, reason: "COURSE_ACCESS_UNAVAILABLE" });
    }
  };
}

export const __test = { courseForPlan, TEST_COURSE_ENTITLEMENT };
