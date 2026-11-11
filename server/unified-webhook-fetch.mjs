import { createLemonSqueezyFetchWebhookHandler } from "./billing-webhook-handler.mjs";
import { createLiveCoursesWebhookFetchHandler } from "./live-courses-webhook-fetch.mjs";

export function createUnifiedWebhookFetchHandler({
  billingWebhook = createLemonSqueezyFetchWebhookHandler(),
  emailWebhook = createLiveCoursesWebhookFetchHandler()
} = {}) {
  return async function unifiedWebhookFetch(request) {
    let source = "";
    try { source = new URL(request.url).searchParams.get("source") || ""; }
    catch { source = ""; }
    if (source !== "live-course-email") return billingWebhook(request);
    const response = await emailWebhook(request);
    const headers = new Headers(response.headers);
    headers.set("X-Nalvi-Webhook-Route", "live-course-email-v1");
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers
    });
  };
}

