import test from "node:test";
import assert from "node:assert/strict";
import { createLiveCoursesWebhookFetchHandler } from "../live-courses-webhook-fetch.mjs";

test("the dedicated fetch endpoint preserves the raw webhook body", async () => {
  let received = null;
  const fetchHandler = createLiveCoursesWebhookFetchHandler({
    handler: async (request, response) => {
      received = {
        url: request.url,
        method: request.method,
        raw: Buffer.from(await request.arrayBuffer()).toString("utf8")
      };
      response.statusCode = 202;
      response.setHeader("Content-Type", "application/json");
      response.end(JSON.stringify({ ok: true }));
    }
  });
  const response = await fetchHandler(new Request("https://www.idiomaguarani.com.py/api/live-course-email-webhook", {
    method: "POST",
    headers: { "content-type": "application/json", "svix-id": "msg_1" },
    body: '{"type":"email.received"}'
  }));

  assert.equal(response.status, 202);
  assert.equal((await response.json()).ok, true);
  assert.equal(received.method, "POST");
  assert.equal(received.raw, '{"type":"email.received"}');
  assert.match(received.url, /operation=live-courses/);
  assert.match(received.url, /action=email-inbound/);
});
