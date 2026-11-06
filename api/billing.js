import { createBillingCatalogHandler } from "../server/billing-catalog-handler.mjs";
import { createCheckoutHandler } from "../server/billing-checkout-handler.mjs";
import { createBillingCourseContentHandler } from "../server/billing-course-content-handler.mjs";
import { sendJson } from "../server/billing-http.mjs";
import { createBillingStatusHandler } from "../server/billing-status-handler.mjs";
import { createLemonSqueezyWebhookHandler } from "../server/billing-webhook-handler.mjs";

const handlers = Object.freeze({
  catalog: createBillingCatalogHandler(),
  checkout: createCheckoutHandler(),
  "course-content": createBillingCourseContentHandler(),
  status: createBillingStatusHandler(),
  webhook: createLemonSqueezyWebhookHandler()
});

export function createBillingRouter(overrides = handlers) {
  return async function billingRouter(request, response) {
    let operation = "";
    try {
      operation = new URL(request.url || "/api/billing", "https://www.idiomaguarani.com.py").searchParams.get("operation") || "";
    } catch {
      return sendJson(response, 400, { ok: false, reason: "INVALID_REQUEST" });
    }
    const handler = overrides[operation];
    if (!handler) return sendJson(response, 404, { ok: false, reason: "BILLING_OPERATION_NOT_FOUND" });
    return handler(request, response);
  };
}

export const config = { api: { bodyParser: false } };
export default createBillingRouter();
