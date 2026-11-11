import { createLemonSqueezyFetchWebhookHandler } from "./billing-webhook-handler.mjs";
import { createLiveCoursesWebhookFetchHandler } from "./live-courses-webhook-fetch.mjs";

export function createUnifiedWebhookFetchHandler({
  billingWebhook = createLemonSqueezyFetchWebhookHandler(),
  emailWebhook = createLiveCoursesWebhookFetchHandler()
} = {}) {
  return function unifiedWebhookFetch(request) {
    let source = "";
    try { source = new URL(request.url).searchParams.get("source") || ""; }
    catch { source = ""; }
    return source === "live-course-email" ? emailWebhook(request) : billingWebhook(request);
  };
}

