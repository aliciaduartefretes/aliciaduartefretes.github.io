import { bearerToken, jsonBody, requestOriginAllowed, sendJson } from "./billing-http.mjs";
import { readBillingEntitlement } from "./billing-store.mjs";
import { verifyFirebaseIdToken } from "./firebase-id-token.mjs";
import {
  persistPremiumCourse,
  persistPremiumCourseProgress,
  readPremiumCourse,
  readPremiumCourseCatalog,
  readPremiumCourseProgress,
  validPremiumCourseId
} from "./premium-academy-store.mjs";

const PREMIUM_ENTITLEMENT = "courses:premium";
const DEFAULT_ADMIN_EMAILS = Object.freeze(["aliciaduartefretes@gmail.com"]);
const COURSE_STATUSES = new Set(["draft", "published", "archived"]);
const COURSE_ACCESS = new Set(["free", "premium"]);
const CONTENT_TYPES = new Set(["course", "library"]);
const VIDEO_PROVIDERS = new Set(["youtube", "mux", "external", "none"]);
const MATERIAL_TYPES = new Set(["ebook", "pdf", "audio", "worksheet", "link"]);
const MAX_COURSE_BYTES = 384 * 1024;
const PRIVATE_LIBRARY_PATH = /^nalvi-plus\/library\/[a-z0-9][a-z0-9/_-]{1,190}\.pdf$/;

const cleanText = (value, maximum) => String(value ?? "").replace(/\u0000/g, "").trim().slice(0, maximum);
const cleanInteger = (value, minimum, maximum, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(maximum, Math.max(minimum, Math.round(number))) : fallback;
};

function safeHttpsUrl(value, maximum = 900) {
  const raw = cleanText(value, maximum);
  if (!raw) return "";
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || url.username || url.password) return "";
    return url.toString().slice(0, maximum);
  } catch {
    return "";
  }
}

function slugify(value) {
  return cleanText(value, 100)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72);
}

function normalizeMaterial(material, index) {
  const type = MATERIAL_TYPES.has(material?.type) ? material.type : "link";
  const url = safeHttpsUrl(material?.url);
  const privatePath = cleanText(material?.privatePath, 220);
  const validPrivatePath = PRIVATE_LIBRARY_PATH.test(privatePath) ? privatePath : "";
  if (!url && !validPrivatePath) return null;
  return {
    materialId: cleanText(material?.materialId, 80) || `material-${index + 1}`,
    title: cleanText(material?.title, 140) || `Material ${index + 1}`,
    type,
    url,
    ...(validPrivatePath ? { privatePath: validPrivatePath } : {})
  };
}

function normalizeLesson(lesson, index) {
  const provider = VIDEO_PROVIDERS.has(lesson?.videoProvider) ? lesson.videoProvider : "none";
  const rawVideoValue = cleanText(lesson?.videoValue, 900);
  const rawLessonId = cleanText(lesson?.lessonId, 80);
  const lessonId = /^[A-Za-z0-9][A-Za-z0-9_-]{1,79}$/.test(rawLessonId) ? rawLessonId : `lesson-${index + 1}`;
  const videoValue = provider === "external"
    ? safeHttpsUrl(rawVideoValue)
    : provider === "mux" && !/^[A-Za-z0-9_-]{6,180}$/.test(rawVideoValue)
      ? ""
      : rawVideoValue;
  return {
    lessonId,
    title: cleanText(lesson?.title, 180) || `Lección ${index + 1}`,
    summary: cleanText(lesson?.summary, 600),
    body: cleanText(lesson?.body, 12_000),
    durationMinutes: cleanInteger(lesson?.durationMinutes, 0, 600),
    order: cleanInteger(lesson?.order, 0, 1_000, index),
    status: lesson?.status === "draft" ? "draft" : "published",
    videoProvider: provider,
    videoValue,
    materials: (Array.isArray(lesson?.materials) ? lesson.materials : [])
      .slice(0, 20)
      .map(normalizeMaterial)
      .filter(Boolean)
  };
}

export function normalizePremiumCourse(input, { existing = null, user, now = new Date().toISOString() } = {}) {
  const title = cleanText(input?.title, 180);
  if (!title) throw new TypeError("COURSE_TITLE_REQUIRED");
  const requestedId = cleanText(input?.courseId, 80);
  const courseId = validPremiumCourseId(requestedId) ? requestedId : slugify(requestedId || title);
  if (!validPremiumCourseId(courseId)) throw new TypeError("INVALID_PREMIUM_COURSE_ID");
  const status = COURSE_STATUSES.has(input?.status) ? input.status : "draft";
  const access = COURSE_ACCESS.has(input?.access) ? input.access : "premium";
  const contentType = CONTENT_TYPES.has(input?.contentType) ? input.contentType : "course";
  const lessons = (Array.isArray(input?.lessons) ? input.lessons : []).slice(0, 100).map(normalizeLesson);
  const course = {
    courseId,
    slug: slugify(input?.slug || title) || courseId,
    title,
    summary: cleanText(input?.summary, 500),
    description: cleanText(input?.description, 5_000),
    level: cleanText(input?.level, 80),
    coverImageUrl: safeHttpsUrl(input?.coverImageUrl),
    contentType,
    access,
    status,
    order: cleanInteger(input?.order, 0, 10_000),
    lessons,
    createdAt: cleanText(existing?.createdAt, 64) || now,
    createdBy: cleanText(existing?.createdBy, 160) || cleanText(user?.email, 160),
    updatedAt: now,
    updatedBy: cleanText(user?.email, 160)
  };
  if (status === "published") course.publishedAt = cleanText(existing?.publishedAt, 64) || now;
  const bytes = Buffer.byteLength(JSON.stringify(course));
  if (bytes > MAX_COURSE_BYTES) throw new RangeError("COURSE_TOO_LARGE");
  return course;
}

function adminEmails(env = process.env) {
  return new Set([
    ...DEFAULT_ADMIN_EMAILS,
    ...String(env.NALVI_ADMIN_EMAILS || "").split(",").map(value => value.trim().toLowerCase()).filter(Boolean)
  ]);
}

export function isPremiumAdministrator(user, env = process.env) {
  return Boolean(user && !user.isAnonymous && user.emailVerified === true && adminEmails(env).has(String(user.email || "").toLowerCase()));
}

export function hasPremiumSubscription(document, userId) {
  return Boolean(document
    && document.active === true
    && (!document.userId || document.userId === userId)
    && Array.isArray(document.entitlements)
    && document.entitlements.includes(PREMIUM_ENTITLEMENT));
}

function publicCourseSummary(course) {
  return {
    courseId: cleanText(course?.courseId, 80),
    slug: cleanText(course?.slug, 80),
    title: cleanText(course?.title, 180),
    summary: cleanText(course?.summary, 500),
    description: cleanText(course?.description, 5_000),
    level: cleanText(course?.level, 80),
    coverImageUrl: safeHttpsUrl(course?.coverImageUrl),
    contentType: course?.contentType === "library" ? "library" : "course",
    access: course?.access === "free" ? "free" : "premium",
    lessonCount: Array.isArray(course?.lessons) ? course.lessons.filter(lesson => lesson?.status !== "draft").length : 0,
    durationMinutes: Array.isArray(course?.lessons)
      ? course.lessons.filter(lesson => lesson?.status !== "draft").reduce((sum, lesson) => sum + cleanInteger(lesson?.durationMinutes, 0, 600), 0)
      : 0,
    order: cleanInteger(course?.order, 0, 10_000)
  };
}

function fullCourse(course, { administrator = false } = {}) {
  const base = publicCourseSummary(course);
  return {
    ...base,
    status: administrator && COURSE_STATUSES.has(course?.status) ? course.status : "published",
    lessons: (Array.isArray(course?.lessons) ? course.lessons : [])
      .filter(lesson => administrator || lesson?.status !== "draft")
      .map((lesson, index) => normalizeLesson(lesson, index))
      .sort((a, b) => a.order - b.order),
    ...(administrator ? {
      createdAt: cleanText(course?.createdAt, 64),
      createdBy: cleanText(course?.createdBy, 160),
      updatedAt: cleanText(course?.updatedAt, 64),
      updatedBy: cleanText(course?.updatedBy, 160)
    } : {})
  };
}

function normalizeProgress(document, course, userId) {
  const lessons = (Array.isArray(course?.lessons) ? course.lessons : [])
    .filter(lesson => lesson?.status !== "draft")
    .map((lesson, index) => normalizeLesson(lesson, index));
  const validLessonIds = new Set(lessons.map(lesson => lesson.lessonId));
  const completedLessonIds = [...new Set(Array.isArray(document?.completedLessonIds) ? document.completedLessonIds : [])]
    .map(value => cleanText(value, 80))
    .filter(value => validLessonIds.has(value));
  const totalLessons = lessons.length;
  return {
    userId: cleanText(userId, 256),
    courseId: cleanText(course?.courseId, 80),
    completedLessonIds,
    lastLessonId: validLessonIds.has(cleanText(document?.lastLessonId, 80)) ? cleanText(document?.lastLessonId, 80) : "",
    completedLessons: completedLessonIds.length,
    totalLessons,
    percent: totalLessons ? Math.round(completedLessonIds.length / totalLessons * 100) : 0,
    updatedAt: cleanText(document?.updatedAt, 64)
  };
}

function catalogDocuments(result) {
  if (result.status === "missing") return [];
  if (result.status !== "found" || !result.document || typeof result.document !== "object") return null;
  return Object.entries(result.document).flatMap(([courseId, value]) => {
    if (!value || typeof value !== "object") return [];
    return [{ ...value, courseId: validPremiumCourseId(value.courseId) ? value.courseId : courseId }];
  });
}

function userFacingError(error) {
  const message = String(error?.message || "");
  if (["COURSE_TITLE_REQUIRED", "INVALID_PREMIUM_COURSE_ID"].includes(message)) return { status: 400, reason: message };
  if (["COURSE_TOO_LARGE", "PAYLOAD_TOO_LARGE"].includes(message)) return { status: 413, reason: message };
  return { status: 503, reason: "PREMIUM_ACADEMY_UNAVAILABLE" };
}

export function createPremiumAcademyHandler({
  verifyIdToken = verifyFirebaseIdToken,
  readEntitlement = readBillingEntitlement,
  readCatalog = readPremiumCourseCatalog,
  readCourse = readPremiumCourse,
  saveCourse = persistPremiumCourse,
  readProgress = readPremiumCourseProgress,
  saveProgress = persistPremiumCourseProgress,
  env = process.env,
  now = () => new Date().toISOString()
} = {}) {
  return async function premiumAcademyHandler(request, response) {
    let operation = "";
    let url;
    try {
      url = new URL(request.url || "/api/premium-academy", "https://www.idiomaguarani.com.py");
      operation = url.searchParams.get("operation") || "catalog";
    } catch {
      return sendJson(response, 400, { ok: false, reason: "INVALID_REQUEST" });
    }

    const method = String(request.method || "GET").toUpperCase();
    const readOnly = ["catalog", "course", "access", "admin-list", "progress"].includes(operation);
    const writeOnly = ["admin-save", "progress-save"].includes(operation);
    if ((readOnly && method !== "GET") || (writeOnly && method !== "POST")) {
      response.setHeader("Allow", readOnly ? "GET" : "POST");
      return sendJson(response, 405, { ok: false, reason: "METHOD_NOT_ALLOWED" });
    }
    if (!["catalog", "course", "access", "admin-list", "admin-save", "progress", "progress-save"].includes(operation)) {
      return sendJson(response, 404, { ok: false, reason: "PREMIUM_OPERATION_NOT_FOUND" });
    }
    if (operation !== "catalog" && !requestOriginAllowed(request, env)) {
      return sendJson(response, 403, { ok: false, reason: "CROSS_ORIGIN_DENIED" });
    }

    try {
      if (operation === "catalog") {
        const documents = catalogDocuments(await readCatalog());
        if (!documents) return sendJson(response, 503, { ok: false, reason: "PREMIUM_CATALOG_UNAVAILABLE" });
        const courses = documents
          .filter(course => course.status === "published")
          .map(publicCourseSummary)
          .filter(course => validPremiumCourseId(course.courseId) && course.title)
          .sort((a, b) => a.order - b.order || a.title.localeCompare(b.title, "es"));
        return sendJson(response, 200, { ok: true, courses });
      }

      const user = await verifyIdToken(bearerToken(request));
      const administrator = isPremiumAdministrator(user, env);

      if (operation === "access") {
        if (!user || user.isAnonymous) {
          return sendJson(response, 200, { ok: true, signedIn: false, administrator: false, premium: false });
        }
        if (administrator) {
          return sendJson(response, 200, { ok: true, signedIn: true, administrator: true, premium: true });
        }
        const entitlement = await readEntitlement({ userId: user.uid });
        const premium = entitlement.status === "found" && hasPremiumSubscription(entitlement.document, user.uid);
        if (!["found", "missing"].includes(entitlement.status)) {
          return sendJson(response, 503, { ok: false, reason: "BILLING_STATUS_UNAVAILABLE" });
        }
        return sendJson(response, 200, { ok: true, signedIn: true, administrator: false, premium });
      }

      if (operation === "admin-list") {
        if (!administrator) return sendJson(response, 403, { ok: false, reason: "ADMIN_REQUIRED" });
        const documents = catalogDocuments(await readCatalog());
        if (!documents) return sendJson(response, 503, { ok: false, reason: "PREMIUM_CATALOG_UNAVAILABLE" });
        return sendJson(response, 200, {
          ok: true,
          courses: documents.map(course => fullCourse(course, { administrator: true }))
            .filter(course => validPremiumCourseId(course.courseId) && course.title)
            .sort((a, b) => a.order - b.order || a.title.localeCompare(b.title, "es"))
        });
      }

      if (operation === "admin-save") {
        if (!administrator) return sendJson(response, 403, { ok: false, reason: "ADMIN_REQUIRED" });
        const body = await jsonBody(request, MAX_COURSE_BYTES + 4_096);
        if (!body || Object.keys(body).some(key => key !== "course") || !body.course || typeof body.course !== "object") {
          return sendJson(response, 400, { ok: false, reason: "INVALID_COURSE" });
        }
        const requestedId = cleanText(body.course.courseId, 80);
        const existingResult = validPremiumCourseId(requestedId) ? await readCourse({ courseId: requestedId }) : { status: "missing", document: null };
        if (!["found", "missing"].includes(existingResult.status)) {
          return sendJson(response, 503, { ok: false, reason: "PREMIUM_CATALOG_UNAVAILABLE" });
        }
        const course = normalizePremiumCourse(body.course, { existing: existingResult.document, user, now: now() });
        const saved = await saveCourse({ course });
        if (saved.status !== "persisted") return sendJson(response, 503, { ok: false, reason: "COURSE_SAVE_FAILED" });
        return sendJson(response, 200, { ok: true, course: fullCourse(course, { administrator: true }) });
      }

      const courseId = url.searchParams.get("courseId") || "";
      if (!validPremiumCourseId(courseId)) return sendJson(response, 400, { ok: false, reason: "INVALID_PREMIUM_COURSE_ID" });
      const courseResult = await readCourse({ courseId });
      if (courseResult.status === "missing") return sendJson(response, 404, { ok: false, reason: "COURSE_NOT_FOUND" });
      if (courseResult.status !== "found") return sendJson(response, 503, { ok: false, reason: "PREMIUM_CATALOG_UNAVAILABLE" });
      const course = courseResult.document || {};
      if (course.status !== "published" && !administrator) return sendJson(response, 404, { ok: false, reason: "COURSE_NOT_FOUND" });
      let access = administrator ? "administrator" : course.access === "free" ? "free" : "";
      if (!access) {
        if (!user || user.isAnonymous) return sendJson(response, 401, { ok: false, reason: "AUTH_REQUIRED" });
        const entitlement = await readEntitlement({ userId: user.uid });
        if (entitlement.status === "missing") return sendJson(response, 402, { ok: false, reason: "SUBSCRIPTION_REQUIRED" });
        if (entitlement.status !== "found") return sendJson(response, 503, { ok: false, reason: "BILLING_STATUS_UNAVAILABLE" });
        if (!hasPremiumSubscription(entitlement.document, user.uid)) {
          return sendJson(response, 402, { ok: false, reason: "SUBSCRIPTION_REQUIRED" });
        }
        access = "subscription";
      }
      if (["progress", "progress-save"].includes(operation)) {
        if (!user || user.isAnonymous) return sendJson(response, 401, { ok: false, reason: "AUTH_REQUIRED" });
        const current = await readProgress({ userId: user.uid, courseId });
        if (!["found", "missing"].includes(current.status)) {
          return sendJson(response, 503, { ok: false, reason: "PREMIUM_PROGRESS_UNAVAILABLE" });
        }
        let progress = normalizeProgress(current.document, course, user.uid);
        if (operation === "progress-save") {
          const body = await jsonBody(request, 2_048);
          if (!body || Object.keys(body).some(key => !["lessonId", "completed"].includes(key)) || typeof body.completed !== "boolean") {
            return sendJson(response, 400, { ok: false, reason: "INVALID_PREMIUM_PROGRESS" });
          }
          const lessonId = cleanText(body.lessonId, 80);
          const publishedLessonIds = new Set((Array.isArray(course.lessons) ? course.lessons : [])
            .filter(lesson => lesson?.status !== "draft")
            .map((lesson, index) => normalizeLesson(lesson, index).lessonId));
          if (!publishedLessonIds.has(lessonId)) return sendJson(response, 400, { ok: false, reason: "INVALID_PREMIUM_LESSON" });
          const completed = new Set(progress.completedLessonIds);
          if (body.completed) completed.add(lessonId); else completed.delete(lessonId);
          const document = {
            userId: user.uid,
            courseId,
            completedLessonIds: [...completed],
            lastLessonId: lessonId,
            updatedAt: now()
          };
          const saved = await saveProgress({ progress: document });
          if (saved.status !== "persisted") return sendJson(response, 503, { ok: false, reason: "PREMIUM_PROGRESS_SAVE_FAILED" });
          progress = normalizeProgress(document, course, user.uid);
        }
        return sendJson(response, 200, { ok: true, progress });
      }
      return sendJson(response, 200, { ok: true, access, course: fullCourse(course, { administrator }) });
    } catch (error) {
      const failure = userFacingError(error);
      if (failure.status >= 500) console.error(`[premium-academy] ${String(error?.name || "UNKNOWN").slice(0, 64)}`);
      return sendJson(response, failure.status, { ok: false, reason: failure.reason });
    }
  };
}

export const __test = {
  PREMIUM_ENTITLEMENT,
  MAX_COURSE_BYTES,
  slugify,
  safeHttpsUrl,
  normalizeLesson,
  normalizeMaterial,
  publicCourseSummary,
  fullCourse,
  normalizeProgress,
  catalogDocuments
};
