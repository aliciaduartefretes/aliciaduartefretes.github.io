import { createLiveCoursesWebhookFetchHandler } from "../server/live-courses-webhook-fetch.mjs";

const fetchWebhook = createLiveCoursesWebhookFetchHandler();

export default {
  fetch: fetchWebhook
};

