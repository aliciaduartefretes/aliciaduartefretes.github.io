import { verifyFirebaseIdToken } from "../server/firebase-id-token.mjs";
import { createTeacherTaskOrganizer } from "../server/teacher-task-organizer.mjs";

const organizer = createTeacherTaskOrganizer();
const rateWindows = new Map();
const RATE_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT = 20;
const MAX_BODY_BYTES = 60_000;
const PUBLIC_REASONS = new Set([
  "INVALID_TASK_MATERIAL",
  "TASK_LIMIT_EXCEEDED"
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
  try {
    const forwardedHost = String(request.headers["x-forwarded-host"] || request.headers.host || "").split(",")[0].trim();
    return new URL(request.headers.origin).host === forwardedHost;
  } catch {
    return false;
  }
}

async function bodyOf(request) {
  if (request.body && typeof request.body === "object") {
    if (Buffer.byteLength(JSON.stringify(request.body), "utf8") > MAX_BODY_BYTES) throw new RangeError("PAYLOAD_TOO_LARGE");
    return request.body;
  }
  if (typeof request.body === "string") {
    if (Buffer.byteLength(request.body, "utf8") > MAX_BODY_BYTES) throw new RangeError("PAYLOAD_TOO_LARGE");
    return JSON.parse(request.body);
  }
  let body = "";
  for await (const chunk of request) {
    body += chunk;
    if (Buffer.byteLength(body, "utf8") > MAX_BODY_BYTES) throw new RangeError("PAYLOAD_TOO_LARGE");
  }
  return body ? JSON.parse(body) : {};
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

function publicResult(result) {
  if (result?.ok === true) return result;
  const reason = PUBLIC_REASONS.has(result?.reason) ? result.reason : "INVALID_TASK_MATERIAL";
  return {
    ok: false,
    reason,
    ...(Array.isArray(result?.issues) ? { issues: result.issues } : {})
  };
}

export function createOrganizeTeacherTaskHandler({
  verifyIdToken = verifyFirebaseIdToken,
  taskOrganizer = createTeacherTaskOrganizer(),
  rateLimit = withinRateLimit
} = {}) {
  return async function handler(request, response) {
    if (request.method !== "POST") {
      response.setHeader("Allow", "POST");
      return send(response, 405, { ok: false, reason: "METHOD_NOT_ALLOWED" });
    }
    if (!sameOrigin(request)) return send(response, 403, { ok: false, reason: "CROSS_ORIGIN_DENIED" });
    try {
      const token = request.headers.authorization?.replace(/^Bearer\s+/i, "");
      const user = await verifyIdToken(token);
      if (!user || user.isAnonymous === true) return send(response, 401, { ok: false, reason: "AUTH_REQUIRED" });
      if (!rateLimit(user.uid)) return send(response, 429, { ok: false, reason: "RATE_LIMITED" });
      const result = await taskOrganizer.organizeDraft(await bodyOf(request), {
        verifiedUserId: user.uid,
        isAnonymous: user.isAnonymous === true
      });
      return send(response, result.ok ? 200 : 400, publicResult(result));
    } catch (error) {
      const tooLarge = error?.message === "PAYLOAD_TOO_LARGE";
      return send(response, tooLarge ? 413 : 400, {
        ok: false,
        reason: tooLarge ? "PAYLOAD_TOO_LARGE" : "INVALID_REQUEST"
      });
    }
  };
}

export default createOrganizeTeacherTaskHandler({ taskOrganizer: organizer });
export const __audit = () => organizer.audit();
export const __test = { publicResult, MAX_BODY_BYTES };
