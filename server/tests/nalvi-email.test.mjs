import test from "node:test";
import assert from "node:assert/strict";
import { sendNalviEmail } from "../nalvi-email.mjs";

const interest = Object.freeze({
  name: "Ana Pérez",
  email: "ana@example.com",
  marketingConsent: true
});

test("envía correo operativo con identidad NALVI y Reply-To administrativo", async () => {
  let request = null;
  const result = await sendNalviEmail({
    template: "cohort_details",
    interest,
    env: {
      RESEND_API_KEY: "re_test_key",
      RESEND_EMAIL_DOMAIN: "correo.idiomaguarani.com.py",
      NALVI_EMAIL_REPLY_TO: "aliciaduartefretes@gmail.com"
    },
    idempotencyKey: "test-cohort-details-1",
    fetchImpl: async (url, options) => {
      request = { url, options, body: JSON.parse(options.body) };
      return { ok: true, status: 200, json: async () => ({ id: "email-123" }) };
    }
  });
  assert.equal(result.status, "sent");
  assert.equal(result.id, "email-123");
  assert.equal(request.url, "https://api.resend.com/emails");
  assert.equal(request.body.from, "NALVI · Equipo Académico <cursos@correo.idiomaguarani.com.py>");
  assert.equal(request.body.reply_to, "aliciaduartefretes@gmail.com");
  assert.deepEqual(request.body.to, ["ana@example.com"]);
  assert.match(request.body.html, /NALVI/);
  assert.match(request.body.text, /Hola, Ana Pérez:/);
  assert.equal(request.options.headers["Idempotency-Key"], "test-cohort-details-1");
});

test("usa remitente separado para marketing y exige consentimiento", async () => {
  let body = null;
  const accepted = await sendNalviEmail({
    template: "course_news",
    interest,
    env: { RESEND_API_KEY: "re_test_key", RESEND_EMAIL_DOMAIN: "correo.idiomaguarani.com.py" },
    fetchImpl: async (_url, options) => {
      body = JSON.parse(options.body);
      return { ok: true, status: 200, json: async () => ({ id: "email-marketing-1" }) };
    }
  });
  assert.equal(accepted.status, "sent");
  assert.equal(body.from, "NALVI <novedades@correo.idiomaguarani.com.py>");
  assert.match(body.headers["List-Unsubscribe"], /mailto:aliciaduartefretes@gmail.com/);

  const rejected = await sendNalviEmail({
    template: "course_news",
    interest: { ...interest, marketingConsent: false },
    env: { RESEND_API_KEY: "re_test_key", RESEND_EMAIL_DOMAIN: "correo.idiomaguarani.com.py" },
    fetchImpl: async () => { throw new Error("must not call provider"); }
  });
  assert.deepEqual(rejected, { status: "failed", reason: "MARKETING_CONSENT_REQUIRED" });
});

test("no intenta enviar si la integración todavía no está configurada", async () => {
  let called = false;
  const result = await sendNalviEmail({
    template: "registration_confirmation",
    interest,
    env: {},
    fetchImpl: async () => { called = true; }
  });
  assert.deepEqual(result, { status: "skipped", reason: "EMAIL_NOT_CONFIGURED" });
  assert.equal(called, false);
});
