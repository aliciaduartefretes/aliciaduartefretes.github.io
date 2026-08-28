import { readFileSync } from "node:fs";
import { createReinforcementService } from "../server/reinforcement-engine.mjs";

const readJson = relativePath => JSON.parse(readFileSync(new URL(relativePath, import.meta.url), "utf8"));
const corpus = readJson("../knowledge-base/pilot-corpus.json");
const existingIndex = readJson("../server-data/existing-activity-index.json");
const service = createReinforcementService({
  corpusRecords: corpus.records || [],
  existingActivities: existingIndex.activities || []
});

const rateWindows = new Map();
const RATE_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT = 6;

function send(response, status, payload) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.end(JSON.stringify(payload));
}

function sameOrigin(request) {
  const origin = request.headers.origin;
  if (!origin) return true;
  try {
    const originUrl = new URL(origin);
    const forwardedHost = String(request.headers["x-forwarded-host"] || request.headers.host || "").split(",")[0].trim();
    return originUrl.host === forwardedHost;
  } catch {
    return false;
  }
}

async function parseBody(request) {
  if (request.body && typeof request.body === "object") return request.body;
  if (typeof request.body === "string") {
    if (request.body.length > 20_000) throw new RangeError("PAYLOAD_TOO_LARGE");
    return JSON.parse(request.body);
  }
  let body = "";
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 20_000) throw new RangeError("PAYLOAD_TOO_LARGE");
  }
  return body ? JSON.parse(body) : {};
}

async function verifyFirebaseToken(idToken) {
  const token = String(idToken || "").trim();
  if (!token || !process.env.FIREBASE_WEB_API_KEY) return null;
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(process.env.FIREBASE_WEB_API_KEY)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken: token })
  });
  if (!response.ok) return null;
  const payload = await response.json();
  const user = payload.users?.[0];
  return user?.localId ? { uid: user.localId } : null;
}

function withinRateLimit(uid) {
  const now = Date.now();
  const current = rateWindows.get(uid);
  if (!current || current.resetAt <= now) {
    rateWindows.set(uid, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true;
  }
  current.count += 1;
  return current.count <= RATE_LIMIT;
}

export default async function handler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return send(response, 405, { ok: false, reason: "METHOD_NOT_ALLOWED" });
  }
  if (!sameOrigin(request)) return send(response, 403, { ok: false, reason: "CROSS_ORIGIN_DENIED" });

  try {
    const body = await parseBody(request);
    const user = await verifyFirebaseToken(request.headers.authorization?.replace(/^Bearer\s+/i, ""));
    if (user && !withinRateLimit(user.uid)) {
      return send(response, 429, { ok: true, mode: "fallback", canResolveWithoutAI: false, reason: "RATE_LIMITED", activity: null });
    }
    const result = await service.generateReinforcementActivity(body, { verifiedUserId: user?.uid || "" });
    return send(response, result.ok === false ? 400 : 200, result);
  } catch (error) {
    const reason = error?.message === "PAYLOAD_TOO_LARGE" ? "PAYLOAD_TOO_LARGE" : "INVALID_JSON";
    return send(response, reason === "PAYLOAD_TOO_LARGE" ? 413 : 400, { ok: false, reason });
  }
}

export const __audit = () => service.audit();
