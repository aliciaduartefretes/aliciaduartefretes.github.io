import { createLemonSqueezyFetchWebhookHandler } from "../server/billing-webhook-handler.mjs";

const fetchWebhook = createLemonSqueezyFetchWebhookHandler();

export default {
  fetch: fetchWebhook
};
