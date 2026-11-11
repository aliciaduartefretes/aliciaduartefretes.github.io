import test from "node:test";
import assert from "node:assert/strict";
import { createUnifiedWebhookFetchHandler } from "../unified-webhook-fetch.mjs";

test("routes Resend only through the explicit source and preserves Lemon by default", async () => {
  const calls = [];
  const handler = createUnifiedWebhookFetchHandler({
    billingWebhook: async () => { calls.push("billing"); return new Response("billing"); },
    emailWebhook: async () => { calls.push("email"); return new Response("email"); }
  });

  const email = await handler(new Request("https://example.test/api/billing-webhook?source=live-course-email"));
  const billing = await handler(new Request("https://example.test/api/billing-webhook"));

  assert.equal(await email.text(), "email");
  assert.equal(email.headers.get("x-nalvi-webhook-route"), "live-course-email-v1");
  assert.equal(await billing.text(), "billing");
  assert.equal(billing.headers.get("x-nalvi-webhook-route"), null);
  assert.deepEqual(calls, ["email", "billing"]);
});
