import { createHash } from "node:crypto";
import { bearerToken, jsonBody, requestOriginAllowed, sendJson } from "./billing-http.mjs";
import { verifyFirebaseIdToken } from "./firebase-id-token.mjs";
import { commitAdminJson, readAdminJson } from "./firebase-rtdb-admin-rest.mjs";

const INTEREST_COLLECTION = "liveCourseInterests";
const DEFAULT_ADMIN_EMAILS = Object.freeze(["aliciaduartefretes@gmail.com"]);
const SCHEDULES = new Set(["weekday-evenings", "saturday-mornings", "flexible", "other"]);
const LEVELS = new Set(["new", "beginner", "intermediate"]);
const PAYMENT_PREFERENCES = new Set(["full", "monthly"]);
const CRM_STATUSES = new Set(["waitlist", "contacted", "payment_pending", "enrolled", "active", "completed", "not_interested"]);

export const LIVE_COURSE = Object.freeze({
  courseId: "guarani-live-founders-2026",
  status: "open",
  name: "Guaraní en vivo: de cero a conversación",
  eyebrow: "NUEVO · COHORTE FUNDADORA",
  summary: "Un programa cercano y exigente para aprender con una persona docente, practicar en grupo y recibir acompañamiento real.",
  duration: "8 semanas",
  cadence: "2 encuentros en vivo por semana",
  sessionLength: "60 minutos por encuentro",
  capacity: 12,
  currency: "USD",
  fullPriceUsd: 79,
  monthlyPriceUsd: 45,
  monthlyPayments: 2,
  priceLabel: "Desde US$45/mes",
  includes: [
    "16 clases en vivo en grupos reducidos",
    "Materiales y grabaciones de apoyo",
    "Acceso a NALVI Plus durante el programa",
    "Seguimiento de avance y certificado final"
  ],
  paymentStatus: "waitlist_only"
});

const cleanText = (value, maximum) => String(value ?? "").replace(/\u0000/g, "").replace(/\s+/g, " ").trim().slice(0, maximum);
const normalizedEmail = value => cleanText(value, 160).toLowerCase();
const validEmail = value => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(value);

function adminEmails(env = process.env) {
  return new Set([
    ...DEFAULT_ADMIN_EMAILS,
    ...String(env.NALVI_ADMIN_EMAILS || "").split(",").map(value => value.trim().toLowerCase()).filter(Boolean)
  ]);
}

function isAdministrator(user, env = process.env) {
  return Boolean(user && !user.isAnonymous && user.emailVerified === true && adminEmails(env).has(String(user.email || "").toLowerCase()));
}

function interestId(courseId, email) {
  return createHash("sha256").update(`${courseId}|${email}`).digest("hex").slice(0, 48);
}

function crmMetrics(interests = []) {
  const byStatus = Object.fromEntries([...CRM_STATUSES].map(status => [status, 0]));
  let marketingEligible = 0;
  for (const interest of interests) {
    const status = CRM_STATUSES.has(interest.status) ? interest.status : "waitlist";
    byStatus[status] += 1;
    if (interest.marketingConsent === true) marketingEligible += 1;
  }
  return {
    total: interests.length,
    marketingEligible,
    pendingContact: byStatus.waitlist,
    conversionReady: byStatus.payment_pending,
    customers: byStatus.enrolled + byStatus.active + byStatus.completed,
    byStatus
  };
}

function publicAdminInterest(document = {}) {
  return {
    id: cleanText(document.id, 80),
    name: cleanText(document.name, 100),
    email: normalizedEmail(document.email),
    whatsapp: cleanText(document.whatsapp, 40),
    country: cleanText(document.country, 80),
    timezone: cleanText(document.timezone, 100),
    schedule: cleanText(document.schedule, 40),
    level: cleanText(document.level, 40),
    paymentPreference: cleanText(document.paymentPreference, 40),
    goal: cleanText(document.goal, 800),
    consent: document.consent === true,
    marketingConsent: document.marketingConsent === true,
    source: cleanText(document.source, 80),
    status: CRM_STATUSES.has(document.status) ? document.status : "waitlist",
    notes: cleanText(document.notes, 1200),
    followUpAt: cleanText(document.followUpAt, 64),
    createdAt: cleanText(document.createdAt, 64),
    updatedAt: cleanText(document.updatedAt, 64),
    crmUpdatedAt: cleanText(document.crmUpdatedAt, 64),
    updateCount: Math.max(0, Number(document.updateCount || 0))
  };
}

export function normalizeLiveCourseInterest(input, { existing = null, user = null, now = new Date().toISOString() } = {}) {
  if (cleanText(input?.website, 120)) throw new TypeError("SPAM_REJECTED");
  const name = cleanText(input?.name, 100);
  const email = normalizedEmail(input?.email);
  const country = cleanText(input?.country, 80);
  const schedule = SCHEDULES.has(input?.schedule) ? input.schedule : "";
  const level = LEVELS.has(input?.level) ? input.level : "";
  const paymentPreference = PAYMENT_PREFERENCES.has(input?.paymentPreference) ? input.paymentPreference : "";
  if (name.length < 2) throw new TypeError("NAME_REQUIRED");
  if (!validEmail(email)) throw new TypeError("VALID_EMAIL_REQUIRED");
  if (!country) throw new TypeError("COUNTRY_REQUIRED");
  if (!schedule) throw new TypeError("SCHEDULE_REQUIRED");
  if (!level) throw new TypeError("LEVEL_REQUIRED");
  if (!paymentPreference) throw new TypeError("PAYMENT_PREFERENCE_REQUIRED");
  if (input?.consent !== true) throw new TypeError("CONSENT_REQUIRED");
  const createdAt = cleanText(existing?.createdAt, 64) || now;
  const existingStatus = cleanText(existing?.status, 40);
  return {
    courseId: LIVE_COURSE.courseId,
    name,
    email,
    whatsapp: cleanText(input?.whatsapp, 40),
    country,
    timezone: cleanText(input?.timezone, 100),
    schedule,
    level,
    paymentPreference,
    goal: cleanText(input?.goal, 800),
    consent: true,
    marketingConsent: input?.marketingConsent === true,
    source: cleanText(input?.source, 80) || "home-live-course-banner",
    locale: cleanText(input?.locale, 12) || "es",
    status: CRM_STATUSES.has(existingStatus) ? existingStatus : "waitlist",
    notes: cleanText(existing?.notes, 1200),
    followUpAt: cleanText(existing?.followUpAt, 64),
    crmUpdatedAt: cleanText(existing?.crmUpdatedAt, 64),
    crmUpdatedBy: cleanText(existing?.crmUpdatedBy, 160),
    userId: cleanText(user?.uid, 256),
    createdAt,
    updatedAt: now,
    updateCount: Math.max(1, Number(existing?.updateCount || 0) + 1)
  };
}

function errorResponse(error) {
  const reason = String(error?.message || "");
  if (["NAME_REQUIRED", "VALID_EMAIL_REQUIRED", "COUNTRY_REQUIRED", "SCHEDULE_REQUIRED", "LEVEL_REQUIRED", "PAYMENT_PREFERENCE_REQUIRED", "CONSENT_REQUIRED"].includes(reason)) {
    return { status: 400, reason };
  }
  if (reason === "SPAM_REJECTED") return { status: 202, reason };
  if (reason === "PAYLOAD_TOO_LARGE") return { status: 413, reason };
  return { status: 503, reason: "LIVE_COURSE_REGISTRATION_UNAVAILABLE" };
}

async function listLiveCourseInterests({ env = process.env } = {}) {
  const result = await readAdminJson({ pathSegments: [INTEREST_COLLECTION], env });
  if (result.status === "missing") return { status: "found", documents: [] };
  if (result.status !== "found" || !result.document || typeof result.document !== "object") {
    return { status: "failed", reason: result.reason || "LIVE_COURSE_LIST_FAILED", documents: [] };
  }
  return {
    status: "found",
    documents: Object.entries(result.document).map(([id, document]) => ({ id, ...(document || {}) }))
  };
}

export function createLiveCoursesHandler({
  verifyIdToken = verifyFirebaseIdToken,
  readDocument = readAdminJson,
  commitDocuments = commitAdminJson,
  listDocuments = listLiveCourseInterests,
  env = process.env,
  now = () => new Date().toISOString()
} = {}) {
  return async function liveCoursesHandler(request, response) {
    let operation;
    try {
      const url = new URL(request.url || "/api/live-courses", "https://www.idiomaguarani.com.py");
      const requestedOperation = url.searchParams.get("operation") || "";
      operation = requestedOperation === "live-courses"
        ? (url.searchParams.get("action") || (request.method === "POST" ? "interest" : "catalog"))
        : (requestedOperation || (request.method === "POST" ? "interest" : "catalog"));
    } catch {
      return sendJson(response, 400, { ok: false, reason: "INVALID_REQUEST" });
    }

    if (operation === "catalog") {
      if (request.method !== "GET") return sendJson(response, 405, { ok: false, reason: "METHOD_NOT_ALLOWED" }, { Allow: "GET" });
      return sendJson(response, 200, { ok: true, course: LIVE_COURSE });
    }

    if (!requestOriginAllowed(request, env)) return sendJson(response, 403, { ok: false, reason: "ORIGIN_NOT_ALLOWED" });

    if (operation === "admin-list") {
      if (request.method !== "GET") return sendJson(response, 405, { ok: false, reason: "METHOD_NOT_ALLOWED" }, { Allow: "GET" });
      const token = bearerToken(request);
      const user = token ? await verifyIdToken(token, { env }) : null;
      if (!isAdministrator(user, env)) return sendJson(response, 403, { ok: false, reason: "ADMIN_REQUIRED" });
      const result = await listDocuments({ env });
      if (result.status !== "found") return sendJson(response, 503, { ok: false, reason: "LIVE_COURSE_LIST_UNAVAILABLE" });
      const interests = result.documents
        .map(publicAdminInterest)
        .filter(document => document.email)
        .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
      return sendJson(response, 200, { ok: true, courseId: LIVE_COURSE.courseId, total: interests.length, metrics: crmMetrics(interests), interests });
    }

    if (operation === "admin-update") {
      if (request.method !== "POST") return sendJson(response, 405, { ok: false, reason: "METHOD_NOT_ALLOWED" }, { Allow: "POST" });
      const token = bearerToken(request);
      const user = token ? await verifyIdToken(token, { env }) : null;
      if (!isAdministrator(user, env)) return sendJson(response, 403, { ok: false, reason: "ADMIN_REQUIRED" });
      try {
        const body = await jsonBody(request, 8_192);
        const id = cleanText(body?.id, 80);
        const status = cleanText(body?.status, 40);
        if (!/^[a-f0-9]{48}$/.test(id)) throw new TypeError("INVALID_INTEREST_ID");
        if (!CRM_STATUSES.has(status)) throw new TypeError("INVALID_CRM_STATUS");
        const existingResult = await readDocument({ pathSegments: [INTEREST_COLLECTION, id], env });
        if (existingResult.status === "missing") return sendJson(response, 404, { ok: false, reason: "INTEREST_NOT_FOUND" });
        if (existingResult.status !== "found" || !existingResult.document) throw new Error("LIVE_COURSE_READ_FAILED");
        const timestamp = now();
        const updated = {
          ...existingResult.document,
          status,
          notes: cleanText(body?.notes, 1200),
          followUpAt: cleanText(body?.followUpAt, 64),
          crmUpdatedAt: timestamp,
          crmUpdatedBy: cleanText(user.email, 160),
          updatedAt: timestamp
        };
        const saved = await commitDocuments({ documents: [{ pathSegments: [INTEREST_COLLECTION, id], fields: updated }], env });
        if (saved.status !== "persisted") throw new Error("LIVE_COURSE_WRITE_FAILED");
        return sendJson(response, 200, { ok: true, interest: publicAdminInterest({ id, ...updated }) });
      } catch (error) {
        const reason = String(error?.message || "");
        if (["INVALID_INTEREST_ID", "INVALID_CRM_STATUS"].includes(reason)) return sendJson(response, 400, { ok: false, reason });
        if (reason === "PAYLOAD_TOO_LARGE") return sendJson(response, 413, { ok: false, reason });
        return sendJson(response, 503, { ok: false, reason: "LIVE_COURSE_UPDATE_UNAVAILABLE" });
      }
    }

    if (operation !== "interest") return sendJson(response, 404, { ok: false, reason: "UNKNOWN_OPERATION" });
    if (request.method !== "POST") return sendJson(response, 405, { ok: false, reason: "METHOD_NOT_ALLOWED" }, { Allow: "POST" });

    try {
      const body = await jsonBody(request, 16_384);
      const email = normalizedEmail(body?.email);
      if (!validEmail(email)) throw new TypeError("VALID_EMAIL_REQUIRED");
      const id = interestId(LIVE_COURSE.courseId, email);
      const existingResult = await readDocument({ pathSegments: [INTEREST_COLLECTION, id], env });
      if (!["found", "missing"].includes(existingResult.status)) throw new Error("LIVE_COURSE_READ_FAILED");
      const token = bearerToken(request);
      const user = token ? await verifyIdToken(token, { env }) : null;
      const interest = normalizeLiveCourseInterest(body, {
        existing: existingResult.document,
        user,
        now: now()
      });
      const saved = await commitDocuments({ documents: [{ pathSegments: [INTEREST_COLLECTION, id], fields: interest }], env });
      if (saved.status !== "persisted") throw new Error("LIVE_COURSE_WRITE_FAILED");
      return sendJson(response, 200, {
        ok: true,
        status: existingResult.status === "found" ? "already_registered" : "registered",
        courseId: LIVE_COURSE.courseId,
        nextStep: "NALVI_CONFIRMATION"
      });
    } catch (error) {
      const failure = errorResponse(error);
      if (failure.reason === "SPAM_REJECTED") return sendJson(response, 202, { ok: true, status: "registered" });
      return sendJson(response, failure.status, { ok: false, reason: failure.reason });
    }
  };
}

export const __test = { interestId, isAdministrator, validEmail, crmMetrics, publicAdminInterest };
