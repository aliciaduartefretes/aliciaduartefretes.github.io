import assert from "node:assert/strict";
import { generateKeyPairSync, createSign } from "node:crypto";
import { test } from "node:test";
import { verifyFirebaseIdToken, __test } from "../firebase-id-token.mjs";

const projectId = "nalvi-test-project";
const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const publicPem = publicKey.export({ type: "spki", format: "pem" });
const env = { FIREBASE_SERVICE_ACCOUNT_JSON: JSON.stringify({ project_id: projectId }) };
const now = Date.parse("2026-08-28T12:00:00.000Z"), nowSeconds = Math.floor(now / 1000);

function token(overrides = {}) {
  const header = Buffer.from(JSON.stringify({ alg: "RS256", kid: "fixture-key", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({
    aud: projectId,
    iss: `https://securetoken.google.com/${projectId}`,
    sub: "student-pseudonymous-uid",
    iat: nowSeconds - 30,
    exp: nowSeconds + 3600,
    auth_time: nowSeconds - 60,
    firebase: { sign_in_provider: "google.com" },
    ...overrides
  })).toString("base64url");
  const signer = createSign("RSA-SHA256"); signer.update(`${header}.${payload}`); signer.end();
  return `${header}.${payload}.${signer.sign(privateKey).toString("base64url")}`;
}

const fetchCertificates = async () => ({
  ok: true,
  headers: { get: () => "public, max-age=3600" },
  json: async () => ({ "fixture-key": publicPem })
});

test("verifica un Firebase ID token con el proyecto server-side ya configurado", async () => {
  __test.resetCertificateCache();
  const result = await verifyFirebaseIdToken(token(), { env, fetchImpl: fetchCertificates, now });
  assert.deepEqual(result, { uid: "student-pseudonymous-uid", isAnonymous: false });
});

test("rechaza audiencia, vencimiento o firma incorrectos", async () => {
  __test.resetCertificateCache();
  assert.equal(await verifyFirebaseIdToken(token({ aud: "another-project" }), { env, fetchImpl: fetchCertificates, now }), null);
  assert.equal(await verifyFirebaseIdToken(token({ exp: nowSeconds - 1 }), { env, fetchImpl: fetchCertificates, now }), null);
  assert.equal(await verifyFirebaseIdToken(`${token().slice(0, -2)}xx`, { env, fetchImpl: fetchCertificates, now }), null);
});
