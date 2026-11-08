import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, verify } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createMuxVideoHandler } from "../mux-video-handler.mjs";
import { createMuxDirectUpload, createMuxPlaybackToken } from "../mux-video.mjs";
import { createPremiumAcademyRouter } from "../premium-academy-router.mjs";

test("premium academy passes signed Mux JWTs with the iframe playback-token parameter", async () => {
  const source = await readFile(new URL("../../assets/js/nalvi-premium-academy.js", import.meta.url), "utf8");
  assert.match(source, /player\.mux\.com\/\$\{encodeURIComponent\(payload\.playbackId\)\}\?playback-token=/);
  assert.doesNotMatch(source, /player\.mux\.com\/[^\n]+\?token=/);
});

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const env = Object.freeze({
  NODE_ENV: "production",
  MUX_TOKEN_ID: "token-id",
  MUX_TOKEN_SECRET: "token-secret",
  MUX_SIGNING_KEY_ID: "signing-key-id",
  MUX_SIGNING_PRIVATE_KEY: privateKey.export({ type: "pkcs8", format: "pem" })
});
const admin = Object.freeze({ uid: "admin", email: "aliciaduartefretes@gmail.com", emailVerified: true, isAnonymous: false });
const student = Object.freeze({ uid: "student", email: "student@example.com", emailVerified: true, isAnonymous: false });
const course = Object.freeze({
  courseId: "curso-mux",
  status: "published",
  access: "premium",
  lessons: [{ lessonId: "lesson-1", status: "published", videoProvider: "mux", videoValue: "signed_playback_123" }]
});

function request(operation, { method = "GET", body, courseId = "curso-mux", lessonId = "lesson-1", uploadId = "upload_123", token = "firebase-token" } = {}) {
  const params = new URLSearchParams({ operation });
  if (courseId) params.set("courseId", courseId);
  if (lessonId) params.set("lessonId", lessonId);
  if (uploadId) params.set("uploadId", uploadId);
  return {
    method,
    url: `/api/mux-video?${params}`,
    headers: {
      origin: "https://www.idiomaguarani.com.py",
      ...(token ? { authorization: `Bearer ${token}` } : {})
    },
    body
  };
}

function response() {
  return {
    statusCode: 0,
    headers: {},
    payload: null,
    setHeader(name, value) { this.headers[name] = value; },
    end(body) { this.payload = JSON.parse(body); }
  };
}

test("crea una carga directa con política firmada y sin exponer credenciales", async () => {
  let captured;
  const upload = await createMuxDirectUpload({
    corsOrigin: "https://www.idiomaguarani.com.py",
    passthrough: "nalvi:curso-mux:lesson-1",
    env,
    fetchImpl: async (url, options) => {
      captured = { url, options };
      return { ok: true, status: 201, json: async () => ({ data: { id: "upload_123", url: "https://storage.example/upload", status: "waiting" } }) };
    }
  });
  assert.equal(upload.uploadId, "upload_123");
  assert.equal(captured.url, "https://api.mux.com/video/v1/uploads");
  const body = JSON.parse(captured.options.body);
  assert.deepEqual(body.new_asset_settings.playback_policies, ["signed"]);
  assert.equal(body.cors_origin, "https://www.idiomaguarani.com.py");
  assert.match(captured.options.headers.Authorization, /^Basic /);
  assert.equal(JSON.stringify(upload).includes("token-secret"), false);
});

test("firma un JWT RS256 limitado al playback solicitado", () => {
  const signed = createMuxPlaybackToken({ playbackId: "signed_playback_123", expiresInSeconds: 600, now: 1_700_000_000_000, env });
  const [headerPart, payloadPart, signaturePart] = signed.token.split(".");
  const header = JSON.parse(Buffer.from(headerPart, "base64url"));
  const payload = JSON.parse(Buffer.from(payloadPart, "base64url"));
  assert.equal(header.kid, env.MUX_SIGNING_KEY_ID);
  assert.equal(payload.sub, "signed_playback_123");
  assert.equal(payload.aud, "v");
  assert.equal(payload.exp - payload.iat, 600);
  assert.equal(verify("RSA-SHA256", Buffer.from(`${headerPart}.${payloadPart}`), publicKey, Buffer.from(signaturePart, "base64url")), true);
});

test("solo la administradora puede solicitar cargas y consultar su procesamiento", async () => {
  const created = response();
  let receivedEnv;
  await createMuxVideoHandler({
    env,
    verifyIdToken: async () => admin,
    createUpload: async options => { receivedEnv = options.env; return { uploadId: "upload_123", uploadUrl: "https://storage.example/upload", status: "waiting" }; }
  })(request("create-upload", { method: "POST", body: { courseId: "curso-mux", lessonId: "lesson-1" } }), created);
  assert.equal(created.statusCode, 201);
  assert.equal(receivedEnv, env);

  const status = response();
  await createMuxVideoHandler({
    env,
    verifyIdToken: async () => admin,
    readUpload: async options => ({ uploadId: options.uploadId, status: "asset_created", playbackId: "signed_playback_123" })
  })(request("upload-status"), status);
  assert.equal(status.statusCode, 200);
  assert.equal(status.payload.playbackId, "signed_playback_123");

  const denied = response();
  await createMuxVideoHandler({ env, verifyIdToken: async () => student })(request("create-upload", { method: "POST", body: { courseId: "curso-mux", lessonId: "lesson-1" } }), denied);
  assert.equal(denied.statusCode, 403);
  assert.equal(denied.payload.reason, "ADMIN_REQUIRED");
});

test("una cuenta sin NALVI Plus nunca recibe token del video premium", async () => {
  let signed = false;
  const res = response();
  await createMuxVideoHandler({
    env,
    verifyIdToken: async () => student,
    readCourse: async () => ({ status: "found", document: course }),
    readEntitlement: async () => ({ status: "missing", document: null }),
    createPlaybackToken: () => { signed = true; return {}; }
  })(request("playback-token"), res);
  assert.equal(res.statusCode, 402);
  assert.equal(res.payload.reason, "SUBSCRIPTION_REQUIRED");
  assert.equal(signed, false);
});

test("la suscripción general habilita el token temporal y el curso gratuito no exige sesión", async () => {
  const subscribed = response();
  await createMuxVideoHandler({
    env,
    verifyIdToken: async () => student,
    readCourse: async () => ({ status: "found", document: course }),
    readEntitlement: async () => ({ status: "found", document: { userId: student.uid, active: true, entitlements: ["courses:premium"] } }),
    createPlaybackToken: () => ({ token: "temporary-token", expiresAt: "2026-11-08T00:00:00.000Z" })
  })(request("playback-token"), subscribed);
  assert.equal(subscribed.statusCode, 200);
  assert.equal(subscribed.payload.token, "temporary-token");

  const free = response();
  await createMuxVideoHandler({
    env,
    verifyIdToken: async () => null,
    readCourse: async () => ({ status: "found", document: { ...course, access: "free" } }),
    createPlaybackToken: () => ({ token: "free-token", expiresAt: "2026-11-08T00:00:00.000Z" })
  })(request("playback-token", { token: "" }), free);
  assert.equal(free.statusCode, 200);
  assert.equal(free.payload.token, "free-token");
});

test("no firma referencias de lecciones inexistentes ni playback IDs arbitrarios", async () => {
  const res = response();
  await createMuxVideoHandler({
    env,
    verifyIdToken: async () => admin,
    readCourse: async () => ({ status: "found", document: course })
  })(request("playback-token", { lessonId: "lesson-otra" }), res);
  assert.equal(res.statusCode, 404);
  assert.equal(res.payload.reason, "LESSON_NOT_FOUND");
});

test("Mux comparte la función de academia para respetar el límite del plan gratuito", async () => {
  const called = [];
  const router = createPremiumAcademyRouter({
    academyHandler: async () => called.push("academy"),
    muxHandler: async () => called.push("mux")
  });
  await router({ url: "/api/premium-academy?operation=catalog" }, {});
  await router({ url: "/api/premium-academy?operation=mux-playback-token" }, {});
  assert.deepEqual(called, ["academy", "mux"]);
});
