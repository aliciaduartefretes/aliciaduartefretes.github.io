import { bearerToken, jsonBody, requestOriginAllowed, sendJson } from "./billing-http.mjs";
import { readBillingEntitlement } from "./billing-store.mjs";
import { verifyFirebaseIdToken } from "./firebase-id-token.mjs";
import { hasPremiumSubscription, isPremiumAdministrator } from "./premium-academy-handler.mjs";
import { readPremiumCourse, validPremiumCourseId } from "./premium-academy-store.mjs";
import { createMuxDirectUpload, createMuxPlaybackToken, muxConfigured, readMuxDirectUpload } from "./mux-video.mjs";

const SAFE_LESSON_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{1,79}$/;
const SAFE_UPLOAD_ID = /^[A-Za-z0-9_-]{6,180}$/;

function lessonFromCourse(course, lessonId) {
  return Array.isArray(course?.lessons) ? course.lessons.find(lesson => lesson?.lessonId === lessonId) : null;
}

async function permittedCourse({ courseId, lessonId, user, administrator, readCourse, readEntitlement }) {
  if (!validPremiumCourseId(courseId) || !SAFE_LESSON_ID.test(lessonId)) return { status: 400, reason: "INVALID_VIDEO_REFERENCE" };
  const courseResult = await readCourse({ courseId });
  if (courseResult.status === "missing") return { status: 404, reason: "COURSE_NOT_FOUND" };
  if (courseResult.status !== "found") return { status: 503, reason: "PREMIUM_CATALOG_UNAVAILABLE" };
  const course = courseResult.document || {};
  if (course.status !== "published" && !administrator) return { status: 404, reason: "COURSE_NOT_FOUND" };
  const lesson = lessonFromCourse(course, lessonId);
  if (!lesson || (lesson.status === "draft" && !administrator)) return { status: 404, reason: "LESSON_NOT_FOUND" };
  if (lesson.videoProvider !== "mux" || !SAFE_UPLOAD_ID.test(String(lesson.videoValue || ""))) {
    return { status: 404, reason: "MUX_VIDEO_NOT_FOUND" };
  }
  if (administrator || course.access === "free") return { status: 200, playbackId: lesson.videoValue };
  if (!user || user.isAnonymous) return { status: 401, reason: "AUTH_REQUIRED" };
  const entitlement = await readEntitlement({ userId: user.uid });
  if (entitlement.status === "missing" || (entitlement.status === "found" && !hasPremiumSubscription(entitlement.document, user.uid))) {
    return { status: 402, reason: "SUBSCRIPTION_REQUIRED" };
  }
  if (entitlement.status !== "found") return { status: 503, reason: "BILLING_STATUS_UNAVAILABLE" };
  return { status: 200, playbackId: lesson.videoValue };
}

export function createMuxVideoHandler({
  verifyIdToken = verifyFirebaseIdToken,
  readCourse = readPremiumCourse,
  readEntitlement = readBillingEntitlement,
  createUpload = createMuxDirectUpload,
  readUpload = readMuxDirectUpload,
  createPlaybackToken = createMuxPlaybackToken,
  env = process.env
} = {}) {
  return async function muxVideoHandler(request, response) {
    let url;
    try { url = new URL(request.url || "/api/mux-video", "https://www.idiomaguarani.com.py"); }
    catch { return sendJson(response, 400, { ok: false, reason: "INVALID_REQUEST" }); }
    const operation = url.searchParams.get("operation") || "status";
    const method = String(request.method || "GET").toUpperCase();
    if (!requestOriginAllowed(request, env)) return sendJson(response, 403, { ok: false, reason: "CROSS_ORIGIN_DENIED" });
    if (!muxConfigured(env)) return sendJson(response, 503, { ok: false, reason: "MUX_NOT_CONFIGURED" });

    try {
      const user = await verifyIdToken(bearerToken(request));
      const administrator = isPremiumAdministrator(user, env);

      if (operation === "create-upload") {
        if (method !== "POST") return sendJson(response, 405, { ok: false, reason: "METHOD_NOT_ALLOWED" });
        if (!administrator) return sendJson(response, 403, { ok: false, reason: "ADMIN_REQUIRED" });
        const body = await jsonBody(request, 4_096);
        const courseId = String(body?.courseId || "").trim();
        const lessonId = String(body?.lessonId || "").trim();
        if (!validPremiumCourseId(courseId) || !SAFE_LESSON_ID.test(lessonId)) {
          return sendJson(response, 400, { ok: false, reason: "INVALID_VIDEO_REFERENCE" });
        }
        const origin = new URL(String(request.headers?.origin || env.NALVI_PUBLIC_APP_URL || "https://www.idiomaguarani.com.py")).origin;
        const upload = await createUpload({ corsOrigin: origin, passthrough: `nalvi:${courseId}:${lessonId}`, env });
        return sendJson(response, 201, { ok: true, ...upload });
      }

      if (operation === "upload-status") {
        if (method !== "GET") return sendJson(response, 405, { ok: false, reason: "METHOD_NOT_ALLOWED" });
        if (!administrator) return sendJson(response, 403, { ok: false, reason: "ADMIN_REQUIRED" });
        const uploadId = String(url.searchParams.get("uploadId") || "");
        if (!SAFE_UPLOAD_ID.test(uploadId)) return sendJson(response, 400, { ok: false, reason: "INVALID_MUX_UPLOAD_ID" });
        const upload = await readUpload({ uploadId, env });
        return sendJson(response, 200, { ok: true, ...upload });
      }

      if (operation === "playback-token") {
        if (method !== "GET") return sendJson(response, 405, { ok: false, reason: "METHOD_NOT_ALLOWED" });
        const access = await permittedCourse({
          courseId: String(url.searchParams.get("courseId") || ""),
          lessonId: String(url.searchParams.get("lessonId") || ""),
          user,
          administrator,
          readCourse,
          readEntitlement
        });
        if (access.status !== 200) return sendJson(response, access.status, { ok: false, reason: access.reason });
        const signed = createPlaybackToken({ playbackId: access.playbackId, env });
        return sendJson(response, 200, { ok: true, playbackId: access.playbackId, ...signed });
      }

      return sendJson(response, 404, { ok: false, reason: "MUX_OPERATION_NOT_FOUND" });
    } catch (error) {
      console.error(`[mux-video] ${String(error?.message || error?.name || "UNKNOWN").slice(0, 96)}`);
      return sendJson(response, 503, { ok: false, reason: "MUX_VIDEO_UNAVAILABLE" });
    }
  };
}

export const __test = { SAFE_LESSON_ID, SAFE_UPLOAD_ID, lessonFromCourse, permittedCourse };
