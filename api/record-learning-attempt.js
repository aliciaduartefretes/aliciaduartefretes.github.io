import { verifyFirebaseIdToken } from "../server/firebase-id-token.mjs";
import { createMasteryAttemptService } from "../server/mastery-attempt-service.mjs";

const service = createMasteryAttemptService();
const rateWindows = new Map(), RATE_WINDOW_MS = 10 * 60 * 1000, RATE_LIMIT = 90;
const PUBLIC_SERVICE_REASONS = new Set([
  "INVALID_ATTEMPT_PAYLOAD",
  "ATTEMPT_NOT_AUTHORIZED",
  "ACTIVITY_NOT_APPROVED_FOR_MASTERY",
  "UNSUPPORTED_SERVER_SCORING",
  "INVALID_ATTEMPT_RESPONSE",
  "ATTEMPT_REPLAYED",
  "ATTEMPT_CLAIM_FAILED",
  "PROFILE_SCOPE_MISMATCH",
  "MASTERY_READ_FAILED",
  "MASTERY_PERSISTENCE_FAILED"
]);

function send(response, status, payload) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.end(JSON.stringify(payload));
}
function sameOrigin(request) {
  if (!request.headers.origin) return true;
  try { return new URL(request.headers.origin).host === String(request.headers["x-forwarded-host"] || request.headers.host || "").split(",")[0].trim(); }
  catch { return false; }
}
async function bodyOf(request) {
  if (request.body && typeof request.body === "object") return request.body;
  if (typeof request.body === "string") return JSON.parse(request.body);
  let body = "";
  for await (const chunk of request) { body += chunk; if (body.length > 20_000) throw new RangeError("PAYLOAD_TOO_LARGE"); }
  return body ? JSON.parse(body) : {};
}
function withinRateLimit(uid) {
  const now = Date.now(), current = rateWindows.get(uid);
  if (!current || current.resetAt <= now) { rateWindows.set(uid, { count: 1, resetAt: now + RATE_WINDOW_MS }); return true; }
  current.count += 1; return current.count <= RATE_LIMIT;
}

function publicServiceResult(result) {
  if (result?.ok === true) return result;
  const reason = PUBLIC_SERVICE_REASONS.has(result?.reason) ? result.reason : "ATTEMPT_NOT_AUTHORIZED";
  return { ok: false, reason };
}

export function createRecordLearningAttemptHandler({
  verifyIdToken = verifyFirebaseIdToken,
  masteryService = createMasteryAttemptService(),
  rateLimit = withinRateLimit
} = {}) {
  return async function handler(request, response) {
    if (request.method !== "POST") { response.setHeader("Allow", "POST"); return send(response, 405, { ok: false, reason: "METHOD_NOT_ALLOWED" }); }
    if (!sameOrigin(request)) return send(response, 403, { ok: false, reason: "CROSS_ORIGIN_DENIED" });
    try {
      const user = await verifyIdToken(request.headers.authorization?.replace(/^Bearer\s+/i, ""));
      if (!user) return send(response, 401, { ok: false, reason: "AUTH_REQUIRED" });
      if (!rateLimit(user.uid)) return send(response, 429, { ok: false, reason: "RATE_LIMITED" });
      const result = await masteryService.recordAttempt(await bodyOf(request), { verifiedUserId: user.uid });
      return send(response, result.ok ? 200 : 400, publicServiceResult(result));
    } catch (error) {
      const tooLarge = error?.message === "PAYLOAD_TOO_LARGE";
      return send(response, tooLarge ? 413 : 400, { ok: false, reason: tooLarge ? "PAYLOAD_TOO_LARGE" : "INVALID_REQUEST" });
    }
  };
}

export default createRecordLearningAttemptHandler({ masteryService: service });
export const __audit = () => service.audit();
export const __test = { publicServiceResult };
