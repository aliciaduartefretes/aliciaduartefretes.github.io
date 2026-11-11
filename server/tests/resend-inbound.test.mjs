import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { crmInterestIdFromRecipients, normalizeReceivedEmail, verifyResendWebhook } from "../resend-inbound.mjs";

test("verifica la firma Svix del webhook de Resend", () => {
  const raw = Buffer.from(JSON.stringify({ type: "email.received" }));
  const key = Buffer.from("secret-for-tests");
  const secret = `whsec_${key.toString("base64")}`;
  const timestamp = "1794340800";
  const id = "msg_test";
  const signature = createHmac("sha256", key).update(`${id}.${timestamp}.${raw.toString("utf8")}`).digest("base64");
  const headers = { "svix-id": id, "svix-timestamp": timestamp, "svix-signature": `v1,${signature}` };
  assert.equal(verifyResendWebhook(raw, headers, secret, { now: 1_794_340_800_000 }), true);
  assert.equal(verifyResendWebhook(Buffer.from("alterado"), headers, secret, { now: 1_794_340_800_000 }), false);
});

test("normaliza remitente, contenido y dirección única del CRM", () => {
  const id = "f".repeat(48);
  const email = normalizeReceivedEmail({ data: { email_id: "received-2" } }, {
    from: "Ana <ana@example.com>",
    to: [`NALVI <crm-${id}@inbound.example.com>`],
    subject: "Respuesta",
    html: "<p>Quiero <strong>inscribirme</strong>.</p>"
  });
  assert.equal(email.from, "ana@example.com");
  assert.equal(email.text, "Quiero inscribirme.");
  assert.equal(crmInterestIdFromRecipients(email.to), id);
});
