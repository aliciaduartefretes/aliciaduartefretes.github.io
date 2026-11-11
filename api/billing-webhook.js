import { createUnifiedWebhookFetchHandler } from "../server/unified-webhook-fetch.mjs";

const fetchWebhook = createUnifiedWebhookFetchHandler();

export default {
  fetch: fetchWebhook
};
