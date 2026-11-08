import { createPrivateKey, sign } from "node:crypto";

const MUX_API_ORIGIN = "https://api.mux.com";
const MUX_ID_PATTERN = /^[A-Za-z0-9_-]{6,180}$/;

function muxConfiguration(env = process.env) {
  const tokenId = String(env.MUX_TOKEN_ID || "").trim();
  const tokenSecret = String(env.MUX_TOKEN_SECRET || "").trim();
  const signingKeyId = String(env.MUX_SIGNING_KEY_ID || "").trim();
  const signingPrivateKey = String(env.MUX_SIGNING_PRIVATE_KEY || "").trim();
  return { tokenId, tokenSecret, signingKeyId, signingPrivateKey };
}

export function muxConfigured(env = process.env) {
  const config = muxConfiguration(env);
  return Boolean(config.tokenId && config.tokenSecret && config.signingKeyId && config.signingPrivateKey);
}

function muxAuthorization(env) {
  const { tokenId, tokenSecret } = muxConfiguration(env);
  if (!tokenId || !tokenSecret) throw new Error("MUX_API_NOT_CONFIGURED");
  return `Basic ${Buffer.from(`${tokenId}:${tokenSecret}`).toString("base64")}`;
}

async function muxRequest(path, { method = "GET", body, fetchImpl = globalThis.fetch, env = process.env } = {}) {
  const response = await fetchImpl(`${MUX_API_ORIGIN}${path}`, {
    method,
    headers: {
      Authorization: muxAuthorization(env),
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload?.data) {
    const error = new Error(`MUX_HTTP_${response.status}`);
    error.status = response.status;
    throw error;
  }
  return payload.data;
}

export async function createMuxDirectUpload({ corsOrigin, passthrough, fetchImpl, env } = {}) {
  const origin = String(corsOrigin || "").trim();
  const reference = String(passthrough || "").trim();
  if (!/^https:\/\/[^\s/]+(?::\d+)?$/.test(origin)) throw new TypeError("INVALID_MUX_CORS_ORIGIN");
  if (!reference || reference.length > 255) throw new TypeError("INVALID_MUX_PASSTHROUGH");
  const upload = await muxRequest("/video/v1/uploads", {
    method: "POST",
    fetchImpl,
    env,
    body: {
      cors_origin: origin,
      new_asset_settings: {
        playback_policies: ["signed"],
        video_quality: "basic",
        passthrough: reference
      }
    }
  });
  if (!MUX_ID_PATTERN.test(String(upload.id || "")) || !String(upload.url || "").startsWith("https://")) {
    throw new Error("MUX_INVALID_UPLOAD_RESPONSE");
  }
  return { uploadId: upload.id, uploadUrl: upload.url, status: upload.status || "waiting" };
}

export async function readMuxDirectUpload({ uploadId, fetchImpl, env } = {}) {
  if (!MUX_ID_PATTERN.test(String(uploadId || ""))) throw new TypeError("INVALID_MUX_UPLOAD_ID");
  const upload = await muxRequest(`/video/v1/uploads/${encodeURIComponent(uploadId)}`, { fetchImpl, env });
  const result = {
    uploadId: String(upload.id || uploadId),
    status: String(upload.status || "waiting"),
    assetId: MUX_ID_PATTERN.test(String(upload.asset_id || "")) ? upload.asset_id : ""
  };
  if (result.status !== "asset_created" || !result.assetId) return result;
  const asset = await muxRequest(`/video/v1/assets/${encodeURIComponent(result.assetId)}`, { fetchImpl, env });
  const playback = Array.isArray(asset.playback_ids)
    ? asset.playback_ids.find(item => item?.policy === "signed" && MUX_ID_PATTERN.test(String(item?.id || "")))
    : null;
  return {
    ...result,
    assetStatus: String(asset.status || "preparing"),
    playbackId: playback?.id || "",
    durationSeconds: Number.isFinite(Number(asset.duration)) ? Number(asset.duration) : null,
    error: asset.errors?.messages?.[0] ? String(asset.errors.messages[0]).slice(0, 300) : ""
  };
}

function signingPrivateKey(env) {
  const raw = muxConfiguration(env).signingPrivateKey;
  if (!raw) throw new Error("MUX_SIGNING_NOT_CONFIGURED");
  const pem = raw.includes("BEGIN") ? raw.replace(/\\n/g, "\n") : Buffer.from(raw, "base64").toString("utf8");
  if (!pem.includes("PRIVATE KEY")) throw new Error("MUX_INVALID_SIGNING_KEY");
  return createPrivateKey(pem);
}

export function createMuxPlaybackToken({ playbackId, expiresInSeconds = 4 * 60 * 60, now = Date.now(), env = process.env } = {}) {
  const id = String(playbackId || "").trim();
  if (!MUX_ID_PATTERN.test(id)) throw new TypeError("INVALID_MUX_PLAYBACK_ID");
  const { signingKeyId } = muxConfiguration(env);
  if (!signingKeyId) throw new Error("MUX_SIGNING_NOT_CONFIGURED");
  const issuedAt = Math.floor(now / 1000);
  const expiresAt = issuedAt + Math.max(60, Math.min(24 * 60 * 60, Number(expiresInSeconds) || 0));
  const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT", kid: signingKeyId })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({ sub: id, aud: "v", iat: issuedAt, exp: expiresAt })).toString("base64url");
  const signature = sign("RSA-SHA256", Buffer.from(`${header}.${payload}`), signingPrivateKey(env)).toString("base64url");
  return { token: `${header}.${payload}.${signature}`, expiresAt: new Date(expiresAt * 1000).toISOString() };
}

export const __test = { MUX_API_ORIGIN, MUX_ID_PATTERN, muxConfiguration };
