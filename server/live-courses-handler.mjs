import { createHash } from "node:crypto";
import { bearerToken, jsonBody, rawBody, requestOriginAllowed, sendJson } from "./billing-http.mjs";
import { verifyFirebaseIdToken } from "./firebase-id-token.mjs";
import { commitAdminJson, readAdminJson } from "./firebase-rtdb-admin-rest.mjs";
import { NALVI_EMAIL_TEMPLATES, sendNalviEmail } from "./nalvi-email.mjs";
import {
  crmInterestIdFromRecipients,
  fetchResendReceivedEmail,
  normalizeReceivedEmail,
  verifyResendWebhook
} from "./resend-inbound.mjs";

const INTEREST_COLLECTION = "liveCourseInterests";
const CLASSROOM_COLLECTION = "liveCourseClassrooms";
const ENROLLMENT_COLLECTION = "liveCourseEnrollments";
const DEFAULT_ADMIN_EMAILS = Object.freeze(["aliciaduartefretes@gmail.com"]);
const SCHEDULES = new Set(["weekday-evenings", "saturday-mornings", "flexible", "other"]);
const LEVELS = new Set(["new", "beginner", "intermediate"]);
const PAYMENT_PREFERENCES = new Set(["full", "monthly"]);
const CRM_STATUSES = new Set(["waitlist", "contacted", "payment_pending", "enrolled", "active", "completed", "not_interested"]);
const EMAIL_TEMPLATES = new Set(Object.keys(NALVI_EMAIL_TEMPLATES));
const CLASS_PROVIDERS = new Set(["zoom", "google-meet", "teams", "other"]);
const RESOURCE_TYPES = new Set(["document", "video", "audio", "link", "exercise"]);
const EMAIL_DUPLICATE_WINDOW_MS = 5 * 60 * 1_000;

export const LIVE_COURSE = Object.freeze({
  courseId: "guarani-live-founders-2026",
  status: "open",
  name: "Guaraní en vivo: de cero a conversación",
  eyebrow: "NUEVO · PRIMER GRUPO",
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
const validHttpsUrl = value => {
  try { return new URL(String(value || "")).protocol === "https:"; }
  catch { return false; }
};

function publicEmailEntry(entry = {}) {
  const direction = entry.direction === "inbound" ? "inbound" : "outbound";
  return {
    direction,
    sentAt: cleanText(entry.sentAt, 64),
    receivedAt: cleanText(entry.receivedAt, 64),
    template: EMAIL_TEMPLATES.has(entry.template) ? entry.template : "",
    status: cleanText(entry.status, 40),
    providerId: cleanText(entry.providerId, 200),
    messageId: cleanText(entry.messageId, 300),
    sentBy: cleanText(entry.sentBy, 160),
    from: cleanText(entry.from, 320),
    to: cleanText(entry.to, 320),
    replyTo: cleanText(entry.replyTo, 320),
    subject: cleanText(entry.subject, 240),
    text: cleanText(entry.text, 5_000)
  };
}

function outboundEmailEntry(delivery, { template, timestamp, sentBy }) {
  return publicEmailEntry({
    direction: "outbound",
    sentAt: timestamp,
    template,
    status: "sent",
    providerId: delivery.id,
    messageId: delivery.messageId,
    sentBy,
    from: delivery.from,
    to: delivery.to,
    replyTo: delivery.replyTo,
    subject: delivery.subject,
    text: delivery.text
  });
}

function recentMatchingEmail(history, template, timestamp, windowMs = EMAIL_DUPLICATE_WINDOW_MS) {
  const currentTime = Date.parse(timestamp);
  if (!Number.isFinite(currentTime) || !Array.isArray(history)) return null;
  return [...history].reverse().find(entry => {
    if (entry?.direction === "inbound" || entry?.template !== template || entry?.status !== "sent") return false;
    const sentTime = Date.parse(entry.sentAt);
    return Number.isFinite(sentTime) && currentTime >= sentTime && currentTime - sentTime < windowMs;
  }) || null;
}

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
    lastEmailAt: cleanText(document.lastEmailAt, 64),
    lastEmailType: EMAIL_TEMPLATES.has(document.lastEmailType) ? document.lastEmailType : "",
    lastEmailStatus: cleanText(document.lastEmailStatus, 40),
    lastEmailId: cleanText(document.lastEmailId, 160),
    lastReplyAt: cleanText(document.lastReplyAt, 64),
    lastReplySubject: cleanText(document.lastReplySubject, 240),
    emailHistory: Array.isArray(document.emailHistory) ? document.emailHistory.slice(-30).map(publicEmailEntry).filter(entry => entry.template || entry.direction === "inbound") : [],
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
    lastEmailAt: cleanText(existing?.lastEmailAt, 64),
    lastEmailType: EMAIL_TEMPLATES.has(existing?.lastEmailType) ? existing.lastEmailType : "",
    lastEmailStatus: cleanText(existing?.lastEmailStatus, 40),
    lastEmailId: cleanText(existing?.lastEmailId, 160),
    lastReplyAt: cleanText(existing?.lastReplyAt, 64),
    lastReplySubject: cleanText(existing?.lastReplySubject, 240),
    emailHistory: Array.isArray(existing?.emailHistory) ? existing.emailHistory.slice(-30) : [],
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

function normalizeClassroom(input = {}, { now = new Date().toISOString(), updatedBy = "" } = {}) {
  const events = Array.isArray(input.events) ? input.events.slice(0, 80).map((event, index) => {
    const startsAt = cleanText(event?.startsAt, 64);
    const joinUrl = cleanText(event?.joinUrl, 500);
    const provider = CLASS_PROVIDERS.has(event?.provider) ? event.provider : "other";
    if (!cleanText(event?.title, 120) || !Number.isFinite(Date.parse(startsAt)) || !validHttpsUrl(joinUrl)) throw new TypeError("INVALID_CLASS_EVENT");
    return {
      id: cleanText(event?.id, 80) || `class-${index + 1}-${Date.parse(startsAt)}`,
      title: cleanText(event.title, 120),
      startsAt,
      endsAt: cleanText(event?.endsAt, 64),
      provider,
      joinUrl,
      notes: cleanText(event?.notes, 500)
    };
  }) : [];
  const resources = Array.isArray(input.resources) ? input.resources.slice(0, 120).map((resource, index) => {
    const url = cleanText(resource?.url, 500);
    const type = RESOURCE_TYPES.has(resource?.type) ? resource.type : "link";
    if (!cleanText(resource?.title, 140) || !validHttpsUrl(url)) throw new TypeError("INVALID_CLASS_RESOURCE");
    return {
      id: cleanText(resource?.id, 80) || `resource-${index + 1}`,
      title: cleanText(resource.title, 140),
      type,
      url,
      description: cleanText(resource?.description, 500)
    };
  }) : [];
  return {
    courseId: LIVE_COURSE.courseId,
    title: cleanText(input.title, 160) || "Mi programa de Guaraní en vivo",
    welcome: cleanText(input.welcome, 800) || "Aquí encontrarás tus próximas clases, enlaces de conexión y materiales de apoyo.",
    events: events.sort((a, b) => a.startsAt.localeCompare(b.startsAt)),
    resources,
    updatedAt: now,
    updatedBy: cleanText(updatedBy, 160)
  };
}

function publicClassroom(document = {}) {
  return normalizeClassroom(document, {
    now: cleanText(document.updatedAt, 64) || new Date(0).toISOString(),
    updatedBy: cleanText(document.updatedBy, 160)
  });
}

async function enrollmentAllowsAccess({ user, readDocument, env }) {
  if (!user?.uid || user.isAnonymous) return false;
  const result = await readDocument({ pathSegments: [ENROLLMENT_COLLECTION, LIVE_COURSE.courseId, cleanText(user.uid, 128)], env });
  return result.status === "found" && result.document?.active === true;
}

export function createLiveCoursesHandler({
  verifyIdToken = verifyFirebaseIdToken,
  readDocument = readAdminJson,
  commitDocuments = commitAdminJson,
  listDocuments = listLiveCourseInterests,
  env = process.env,
  now = () => new Date().toISOString(),
  sendEmail = sendNalviEmail,
  fetchReceivedEmail = fetchResendReceivedEmail,
  verifyInboundWebhook = verifyResendWebhook
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

    if (operation === "email-inbound") {
      if (request.method !== "POST") return sendJson(response, 405, { ok: false, reason: "METHOD_NOT_ALLOWED" }, { Allow: "POST" });
      try {
        const raw = await rawBody(request, 524_288);
        if (!verifyInboundWebhook(raw, request.headers, env.RESEND_WEBHOOK_SECRET || "")) {
          return sendJson(response, 401, { ok: false, reason: "INVALID_SIGNATURE" });
        }
        const payload = JSON.parse(raw.toString("utf8"));
        const eventName = cleanText(payload?.type || payload?.event, 80);
        if (eventName !== "email.received") return sendJson(response, 200, { ok: true, ignored: true });
        const emailId = cleanText(payload?.data?.email_id || payload?.data?.id, 200);
        const fullEmail = emailId ? await fetchReceivedEmail(emailId, { env }) : null;
        const inbound = normalizeReceivedEmail(payload, fullEmail);
        let id = crmInterestIdFromRecipients(inbound.to);
        if (!id && validEmail(inbound.from)) id = interestId(LIVE_COURSE.courseId, inbound.from);
        if (!/^[a-f0-9]{48}$/.test(id)) return sendJson(response, 202, { ok: true, unmatched: true });
        const existingResult = await readDocument({ pathSegments: [INTEREST_COLLECTION, id], env });
        if (existingResult.status !== "found" || !existingResult.document) return sendJson(response, 202, { ok: true, unmatched: true });
        if (inbound.from && normalizedEmail(existingResult.document.email) !== normalizedEmail(inbound.from)) {
          return sendJson(response, 202, { ok: true, unmatched: true });
        }
        const previous = Array.isArray(existingResult.document.emailHistory) ? existingResult.document.emailHistory : [];
        if (inbound.providerId && previous.some(entry => cleanText(entry?.providerId, 200) === inbound.providerId)) {
          return sendJson(response, 200, { ok: true, duplicate: true });
        }
        const timestamp = now();
        const entry = publicEmailEntry({
          direction: "inbound",
          receivedAt: timestamp,
          status: "received",
          providerId: inbound.providerId,
          messageId: inbound.messageId,
          from: inbound.from,
          to: inbound.to.join(", "),
          subject: inbound.subject,
          text: inbound.text
        });
        const updated = {
          ...existingResult.document,
          status: existingResult.document.status === "waitlist" ? "contacted" : existingResult.document.status,
          lastReplyAt: timestamp,
          lastReplySubject: inbound.subject,
          emailHistory: [...previous.slice(-29), entry],
          crmUpdatedAt: timestamp,
          crmUpdatedBy: "resend-inbound",
          updatedAt: timestamp
        };
        const saved = await commitDocuments({ documents: [{ pathSegments: [INTEREST_COLLECTION, id], fields: updated }], env });
        if (saved.status !== "persisted") throw new Error("LIVE_COURSE_WRITE_FAILED");
        return sendJson(response, 200, { ok: true, matched: true });
      } catch (error) {
        if (error?.message === "PAYLOAD_TOO_LARGE") return sendJson(response, 413, { ok: false, reason: "PAYLOAD_TOO_LARGE" });
        return sendJson(response, 400, { ok: false, reason: "INVALID_INBOUND_EMAIL" });
      }
    }

    if (!requestOriginAllowed(request, env)) return sendJson(response, 403, { ok: false, reason: "ORIGIN_NOT_ALLOWED" });

    if (operation === "classroom") {
      if (request.method !== "GET") return sendJson(response, 405, { ok: false, reason: "METHOD_NOT_ALLOWED" }, { Allow: "GET" });
      const token = bearerToken(request);
      const user = token ? await verifyIdToken(token, { env }) : null;
      if (!user || user.isAnonymous) return sendJson(response, 401, { ok: false, reason: "AUTH_REQUIRED" });
      const administrator = isAdministrator(user, env);
      const enrolled = administrator || await enrollmentAllowsAccess({ user, readDocument, env });
      if (!enrolled) return sendJson(response, 403, { ok: false, reason: "LIVE_COURSE_ACCESS_REQUIRED" });
      const result = await readDocument({ pathSegments: [CLASSROOM_COLLECTION, LIVE_COURSE.courseId], env });
      if (!['found', 'missing'].includes(result.status)) return sendJson(response, 503, { ok: false, reason: "LIVE_CLASSROOM_UNAVAILABLE" });
      const classroom = result.status === "found"
        ? publicClassroom(result.document)
        : normalizeClassroom({}, { now: now(), updatedBy: "nalvi-system" });
      return sendJson(response, 200, { ok: true, administrator, course: LIVE_COURSE, classroom });
    }

    if (operation === "admin-classroom-save") {
      if (request.method !== "POST") return sendJson(response, 405, { ok: false, reason: "METHOD_NOT_ALLOWED" }, { Allow: "POST" });
      const token = bearerToken(request);
      const user = token ? await verifyIdToken(token, { env }) : null;
      if (!isAdministrator(user, env)) return sendJson(response, 403, { ok: false, reason: "ADMIN_REQUIRED" });
      try {
        const body = await jsonBody(request, 65_536);
        const classroom = normalizeClassroom(body, { now: now(), updatedBy: user.email });
        const saved = await commitDocuments({ documents: [{ pathSegments: [CLASSROOM_COLLECTION, LIVE_COURSE.courseId], fields: classroom }], env });
        if (saved.status !== "persisted") throw new Error("LIVE_CLASSROOM_WRITE_FAILED");
        return sendJson(response, 200, { ok: true, classroom: publicClassroom(classroom) });
      } catch (error) {
        const reason = String(error?.message || "");
        if (["INVALID_CLASS_EVENT", "INVALID_CLASS_RESOURCE"].includes(reason)) return sendJson(response, 400, { ok: false, reason });
        if (reason === "PAYLOAD_TOO_LARGE") return sendJson(response, 413, { ok: false, reason });
        return sendJson(response, 503, { ok: false, reason: "LIVE_CLASSROOM_SAVE_UNAVAILABLE" });
      }
    }

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

    if (operation === "admin-send-email") {
      if (request.method !== "POST") return sendJson(response, 405, { ok: false, reason: "METHOD_NOT_ALLOWED" }, { Allow: "POST" });
      const token = bearerToken(request);
      const user = token ? await verifyIdToken(token, { env }) : null;
      if (!isAdministrator(user, env)) return sendJson(response, 403, { ok: false, reason: "ADMIN_REQUIRED" });
      try {
        const body = await jsonBody(request, 8_192);
        const id = cleanText(body?.id, 80);
        const template = cleanText(body?.template, 80);
        if (!/^[a-f0-9]{48}$/.test(id)) throw new TypeError("INVALID_INTEREST_ID");
        if (!EMAIL_TEMPLATES.has(template) || template === "registration_confirmation") throw new TypeError("INVALID_EMAIL_TEMPLATE");
        const existingResult = await readDocument({ pathSegments: [INTEREST_COLLECTION, id], env });
        if (existingResult.status === "missing") return sendJson(response, 404, { ok: false, reason: "INTEREST_NOT_FOUND" });
        if (existingResult.status !== "found" || !existingResult.document) throw new Error("LIVE_COURSE_READ_FAILED");
        if (template === "course_news" && existingResult.document.marketingConsent !== true) {
          return sendJson(response, 403, { ok: false, reason: "MARKETING_CONSENT_REQUIRED" });
        }
        const timestamp = now();
        const history = Array.isArray(existingResult.document.emailHistory) ? existingResult.document.emailHistory.slice(-29) : [];
        const recentDelivery = recentMatchingEmail(history, template, timestamp);
        if (recentDelivery) {
          return sendJson(response, 409, { ok: false, reason: "EMAIL_RECENTLY_SENT", sentAt: cleanText(recentDelivery.sentAt, 64) });
        }
        const idempotencyBucket = Math.floor(Date.parse(timestamp) / EMAIL_DUPLICATE_WINDOW_MS);
        const delivery = await sendEmail({
          template,
          interest: { ...existingResult.document, crmId: id },
          env,
          idempotencyKey: `crm:${id}:${template}:${idempotencyBucket}`
        });
        if (delivery.status !== "sent") {
          const status = delivery.reason === "EMAIL_NOT_CONFIGURED" || delivery.reason === "EMAIL_DISABLED" ? 503 : 502;
          return sendJson(response, status, { ok: false, reason: delivery.reason || "EMAIL_SEND_FAILED" });
        }
        const updated = {
          ...existingResult.document,
          status: existingResult.document.status === "waitlist" ? "contacted" : existingResult.document.status,
          lastEmailAt: timestamp,
          lastEmailType: template,
          lastEmailStatus: "sent",
          lastEmailId: delivery.id,
          emailHistory: [...history, outboundEmailEntry(delivery, { template, timestamp, sentBy: cleanText(user.email, 160) })],
          crmUpdatedAt: timestamp,
          crmUpdatedBy: cleanText(user.email, 160),
          updatedAt: timestamp
        };
        const saved = await commitDocuments({ documents: [{ pathSegments: [INTEREST_COLLECTION, id], fields: updated }], env });
        if (saved.status !== "persisted") throw new Error("LIVE_COURSE_WRITE_FAILED");
        return sendJson(response, 200, { ok: true, delivery: { status: "sent", template }, interest: publicAdminInterest({ id, ...updated }) });
      } catch (error) {
        const reason = String(error?.message || "");
        if (["INVALID_INTEREST_ID", "INVALID_EMAIL_TEMPLATE"].includes(reason)) return sendJson(response, 400, { ok: false, reason });
        if (reason === "PAYLOAD_TOO_LARGE") return sendJson(response, 413, { ok: false, reason });
        return sendJson(response, 503, { ok: false, reason: "EMAIL_SEND_UNAVAILABLE" });
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
      let emailStatus = "skipped";
      if (existingResult.status === "missing") {
        const sentAt = now();
        const delivery = await sendEmail({
          template: "registration_confirmation",
          interest: { ...interest, crmId: id },
          env,
          idempotencyKey: `registration:${id}:registration-confirmation`
        });
        emailStatus = delivery.status;
        if (delivery.status === "sent") {
          const withEmail = {
            ...interest,
            lastEmailAt: sentAt,
            lastEmailType: "registration_confirmation",
            lastEmailStatus: "sent",
            lastEmailId: delivery.id,
            emailHistory: [outboundEmailEntry(delivery, { template: "registration_confirmation", timestamp: sentAt, sentBy: "nalvi-system" })],
            updatedAt: sentAt
          };
          await commitDocuments({ documents: [{ pathSegments: [INTEREST_COLLECTION, id], fields: withEmail }], env });
        }
      }
      return sendJson(response, 200, {
        ok: true,
        status: existingResult.status === "found" ? "already_registered" : "registered",
        courseId: LIVE_COURSE.courseId,
        nextStep: "NALVI_CONFIRMATION",
        emailStatus
      });
    } catch (error) {
      const failure = errorResponse(error);
      if (failure.reason === "SPAM_REJECTED") return sendJson(response, 202, { ok: true, status: "registered" });
      return sendJson(response, failure.status, { ok: false, reason: failure.reason });
    }
  };
}

export const __test = {
  interestId,
  isAdministrator,
  validEmail,
  crmMetrics,
  publicAdminInterest,
  publicEmailEntry,
  outboundEmailEntry,
  recentMatchingEmail,
  normalizeClassroom
};
