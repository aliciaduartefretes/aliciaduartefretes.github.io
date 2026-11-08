import { Readable } from "node:stream";
import { get } from "@vercel/blob";
import { handleUpload } from "@vercel/blob/client";
import { bearerToken, jsonBody, requestOriginAllowed, sendJson } from "./billing-http.mjs";
import { readBillingEntitlement } from "./billing-store.mjs";
import { verifyFirebaseIdToken } from "./firebase-id-token.mjs";
import { hasPremiumSubscription, isPremiumAdministrator } from "./premium-academy-handler.mjs";
import { readPremiumCourse, validPremiumCourseId } from "./premium-academy-store.mjs";

const PRIVATE_LIBRARY_PATH = /^nalvi-plus\/library\/[a-z0-9][a-z0-9/_-]{1,190}\.pdf$/;
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{1,79}$/;
const MAX_PDF_BYTES = 80 * 1024 * 1024;

function cleanId(value) {
  const text = String(value || "").trim();
  return ID_PATTERN.test(text) ? text : "";
}

function privatePathAllowed(value) {
  return PRIVATE_LIBRARY_PATH.test(String(value || "").trim());
}

function findMaterial(course, lessonId, materialId) {
  const lesson = (Array.isArray(course?.lessons) ? course.lessons : []).find(item => item?.lessonId === lessonId && item?.status !== "draft");
  if (!lesson) return null;
  return (Array.isArray(lesson.materials) ? lesson.materials : []).find(item => item?.materialId === materialId) || null;
}

function safeFilename(value) {
  const name = String(value || "documento")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100) || "documento";
  return name.toLowerCase().endsWith(".pdf") ? name : `${name}.pdf`;
}

function streamPrivateBlob(response, result, filename) {
  response.statusCode = 200;
  response.setHeader("Content-Type", result.blob?.contentType || "application/pdf");
  response.setHeader("Content-Disposition", `inline; filename=\"${safeFilename(filename)}\"`);
  response.setHeader("Cache-Control", "private, no-store, max-age=0");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "no-referrer");
  Readable.fromWeb(result.stream).pipe(response);
}

async function canReadCourse({ course, user, administrator, readEntitlement }) {
  if (administrator) return true;
  if (course?.status !== "published") return false;
  if (course?.access === "free") return true;
  if (!user || user.isAnonymous) return false;
  const entitlement = await readEntitlement({ userId: user.uid });
  return entitlement.status === "found" && hasPremiumSubscription(entitlement.document, user.uid);
}

export function createPremiumResourceHandler({
  verifyIdToken = verifyFirebaseIdToken,
  readCourse = readPremiumCourse,
  readEntitlement = readBillingEntitlement,
  readPrivateBlob = (pathname) => get(pathname, { access: "private" }),
  uploadHandler = handleUpload,
  streamBlob = streamPrivateBlob,
  env = process.env
} = {}) {
  return async function premiumResourceHandler(request, response) {
    let url;
    try { url = new URL(request.url || "/api/premium-academy", "https://www.idiomaguarani.com.py"); }
    catch { return sendJson(response, 400, { ok: false, reason: "INVALID_REQUEST" }); }
    const operation = url.searchParams.get("operation") || "";
    if (!requestOriginAllowed(request, env)) return sendJson(response, 403, { ok: false, reason: "CROSS_ORIGIN_DENIED" });

    try {
      if (operation === "resource-upload") {
        if (String(request.method || "GET").toUpperCase() !== "POST") {
          response.setHeader("Allow", "POST");
          return sendJson(response, 405, { ok: false, reason: "METHOD_NOT_ALLOWED" });
        }
        const body = await jsonBody(request, 32 * 1024);
        const result = await uploadHandler({
          body,
          request,
          onBeforeGenerateToken: async (pathname) => {
            const user = await verifyIdToken(bearerToken(request));
            if (!isPremiumAdministrator(user, env)) throw new Error("ADMIN_REQUIRED");
            if (!privatePathAllowed(pathname)) throw new Error("INVALID_PRIVATE_RESOURCE_PATH");
            return {
              allowedContentTypes: ["application/pdf"],
              maximumSizeInBytes: MAX_PDF_BYTES,
              addRandomSuffix: false,
              allowOverwrite: true,
              cacheControlMaxAge: 60,
              tokenPayload: JSON.stringify({ pathname, userId: user.uid })
            };
          },
          onUploadCompleted: async () => {}
        });
        return sendJson(response, 200, result);
      }

      if (operation !== "resource" || String(request.method || "GET").toUpperCase() !== "GET") {
        return sendJson(response, 404, { ok: false, reason: "PREMIUM_RESOURCE_OPERATION_NOT_FOUND" });
      }
      const courseId = url.searchParams.get("courseId") || "";
      const lessonId = cleanId(url.searchParams.get("lessonId"));
      const materialId = cleanId(url.searchParams.get("materialId"));
      if (!validPremiumCourseId(courseId) || !lessonId || !materialId) {
        return sendJson(response, 400, { ok: false, reason: "INVALID_PREMIUM_RESOURCE" });
      }
      const user = await verifyIdToken(bearerToken(request));
      const administrator = isPremiumAdministrator(user, env);
      const courseResult = await readCourse({ courseId });
      if (courseResult.status !== "found" || !courseResult.document) return sendJson(response, 404, { ok: false, reason: "RESOURCE_NOT_FOUND" });
      const course = courseResult.document;
      if (!await canReadCourse({ course, user, administrator, readEntitlement })) {
        return sendJson(response, user && !user.isAnonymous ? 402 : 401, { ok: false, reason: user && !user.isAnonymous ? "SUBSCRIPTION_REQUIRED" : "AUTH_REQUIRED" });
      }
      const material = findMaterial(course, lessonId, materialId);
      if (!material || !privatePathAllowed(material.privatePath)) return sendJson(response, 404, { ok: false, reason: "RESOURCE_NOT_FOUND" });
      const result = await readPrivateBlob(material.privatePath);
      if (!result || result.statusCode !== 200 || !result.stream) return sendJson(response, 404, { ok: false, reason: "RESOURCE_NOT_FOUND" });
      return streamBlob(response, result, material.title);
    } catch (error) {
      const reason = String(error?.message || "");
      if (["ADMIN_REQUIRED", "INVALID_PRIVATE_RESOURCE_PATH"].includes(reason)) {
        return sendJson(response, reason === "ADMIN_REQUIRED" ? 403 : 400, { ok: false, reason });
      }
      console.error(`[premium-resource] ${String(error?.name || "UNKNOWN").slice(0, 64)}`);
      return sendJson(response, 503, { ok: false, reason: "PREMIUM_RESOURCE_UNAVAILABLE" });
    }
  };
}

export const __test = { PRIVATE_LIBRARY_PATH, MAX_PDF_BYTES, privatePathAllowed, findMaterial, safeFilename };
