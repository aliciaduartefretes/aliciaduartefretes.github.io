import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { createGrammarEngine } from "../grammar-engine/grammar-engine.mjs";
import { normalizeInterventionRequest } from "../server/intervention-service.mjs";
import { createAdaptiveTutorOrchestrator } from "../server/adaptive-tutor-orchestrator.mjs";
import { persistInterventionEvent } from "../server/firestore-admin-rest.mjs";
import { verifyFirebaseIdToken } from "../server/firebase-id-token.mjs";

const corpus = JSON.parse(readFileSync(new URL("../knowledge-base/pilot-corpus.json", import.meta.url), "utf8"));
const governance = JSON.parse(readFileSync(new URL("../knowledge-base/governance.json", import.meta.url), "utf8"));
const grammarEngine = createGrammarEngine({ corpus, governance });
const service = createAdaptiveTutorOrchestrator({
  corpusRecords: corpus.records || [],
  grammarEngine,
  persistEvent: persistInterventionEvent
});
const rateWindows = new Map(), RATE_WINDOW_MS = 10 * 60 * 1000, RATE_LIMIT = 12;

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
    const originUrl = new URL(origin), forwardedHost = String(request.headers["x-forwarded-host"] || request.headers.host || "").split(",")[0].trim();
    return originUrl.host === forwardedHost;
  } catch { return false; }
}

async function parseBody(request) {
  if (request.body && typeof request.body === "object") return request.body;
  if (typeof request.body === "string") {
    if (request.body.length > 48_000) throw new RangeError("PAYLOAD_TOO_LARGE");
    return JSON.parse(request.body);
  }
  let body = "";
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 48_000) throw new RangeError("PAYLOAD_TOO_LARGE");
  }
  return body ? JSON.parse(body) : {};
}

function withinRateLimit(uid) {
  const now = Date.now(), current = rateWindows.get(uid);
  if (!current || current.resetAt <= now) { rateWindows.set(uid, { count: 1, resetAt: now + RATE_WINDOW_MS }); return true; }
  current.count += 1;
  return current.count <= RATE_LIMIT;
}

function prepareRequest(raw) {
  const context = normalizeInterventionRequest(raw);
  return {
    ...context,
    previousFingerprint: context.previousActivityFingerprint,
    allowedConceptIds: [context.conceptId],
    needsAdaptiveTutor: context.aiPolicy.AI_TUTOR_ON_EVERY_INCORRECT_ANSWER !== false
  };
}

function requesterHash(request, user) {
  if (user?.uid) return `user:${user.uid}`;
  const address = String(request.headers["x-forwarded-for"] || request.socket?.remoteAddress || "anonymous").split(",")[0].trim();
  const agent = String(request.headers["user-agent"] || "").slice(0, 160);
  return createHash("sha256").update(`${address}|${agent}`).digest("hex").slice(0, 32);
}

export default async function handler(request, response) {
  if (request.method !== "POST") { response.setHeader("Allow", "POST"); return send(response, 405, { ok: false, reason: "METHOD_NOT_ALLOWED" }); }
  if (!sameOrigin(request)) return send(response, 403, { ok: false, reason: "CROSS_ORIGIN_DENIED" });
  try {
    const raw = await parseBody(request);
    const user = await verifyFirebaseIdToken(request.headers.authorization?.replace(/^Bearer\s+/i, ""));
    const requester = requesterHash(request, user);
    if (!withinRateLimit(requester)) return send(response, 429, { ok: false, reason: "RATE_LIMITED_LOCAL_FALLBACK" });
    const prepared = prepareRequest(raw);
    const result = await service.orchestrateAdaptiveTutoring(prepared, { verifiedUserId: user?.uid || "", requesterHash: requester });
    return send(response, 200, result);
  } catch (error) {
    const reason = error?.message === "PAYLOAD_TOO_LARGE" ? "PAYLOAD_TOO_LARGE" : "INVALID_REQUEST";
    return send(response, reason === "PAYLOAD_TOO_LARGE" ? 413 : 400, { ok: false, reason, message: String(error?.message || "") });
  }
}

export const __audit = () => service.audit();
export const __prepareRequest = prepareRequest;
