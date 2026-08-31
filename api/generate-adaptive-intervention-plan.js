import { readFileSync } from "node:fs";
import { createGrammarEngine } from "../grammar-engine/grammar-engine.mjs";
import { planPedagogicalIntervention, wouldAIImproveIntervention } from "../intervention-engine/intervention-engine.mjs";
import { createAdaptiveInterventionPlanService } from "../server/adaptive-intervention-plan.mjs";
import { normalizeInterventionRequest } from "../server/intervention-service.mjs";
import { persistInterventionEvent } from "../server/firestore-admin-rest.mjs";
import { verifyFirebaseIdToken } from "../server/firebase-id-token.mjs";

const corpus = JSON.parse(readFileSync(new URL("../knowledge-base/pilot-corpus.json", import.meta.url), "utf8"));
const governance = JSON.parse(readFileSync(new URL("../knowledge-base/governance.json", import.meta.url), "utf8"));
const grammarEngine = createGrammarEngine({ corpus, governance });
const service = createAdaptiveInterventionPlanService({
  corpusRecords: corpus.records || [],
  grammarEngine,
  persistEvent: persistInterventionEvent
});
const rateWindows = new Map(), RATE_WINDOW_MS = 10 * 60 * 1000, RATE_LIMIT = 8;

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
  const localPlan = planPedagogicalIntervention({
    ...context,
    previousActivityFingerprint: String(raw.previousActivityFingerprint || "").slice(0, 80)
  });
  const firstErrorWithValidatedContext = context.attemptNumber === 1
    && context.knowledgeIds.length > 0
    && raw?.aiPolicy?.allowAdaptivePlanAfterFirstError !== false;
  return {
    ...context,
    previousFingerprint: localPlan.previousFingerprint,
    previousActivityFingerprint: localPlan.previousFingerprint,
    allowedConceptIds: [context.conceptId],
    localPlan,
    wouldAIImproveIntervention: wouldAIImproveIntervention(context, localPlan) || firstErrorWithValidatedContext
  };
}

export default async function handler(request, response) {
  if (request.method !== "POST") { response.setHeader("Allow", "POST"); return send(response, 405, { ok: false, reason: "METHOD_NOT_ALLOWED" }); }
  if (!sameOrigin(request)) return send(response, 403, { ok: false, reason: "CROSS_ORIGIN_DENIED" });
  try {
    const raw = await parseBody(request);
    const user = await verifyFirebaseIdToken(request.headers.authorization?.replace(/^Bearer\s+/i, ""));
    if (user && !withinRateLimit(user.uid)) return send(response, 429, { ok: false, reason: "RATE_LIMITED_LOCAL_FALLBACK" });
    const prepared = prepareRequest(raw);
    const result = await service.generateAdaptiveInterventionPlan(prepared, { verifiedUserId: user?.uid || "" });
    return send(response, 200, result);
  } catch (error) {
    const reason = error?.message === "PAYLOAD_TOO_LARGE" ? "PAYLOAD_TOO_LARGE" : "INVALID_REQUEST";
    return send(response, reason === "PAYLOAD_TOO_LARGE" ? 413 : 400, { ok: false, reason, message: String(error?.message || "") });
  }
}

export const __audit = () => service.audit();
export const __prepareRequest = prepareRequest;
