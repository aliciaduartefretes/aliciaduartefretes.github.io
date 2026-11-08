import { commitAdminJson, readAdminJson } from "./firebase-rtdb-admin-rest.mjs";

const COURSE_ID_PATTERN = /^[a-z][a-z0-9-]{2,79}$/;
const RTDB_KEY_PATTERN = /^[^.#$\[\]\/]{1,256}$/;

export function validPremiumCourseId(courseId) {
  return typeof courseId === "string" && COURSE_ID_PATTERN.test(courseId);
}

export async function readPremiumCourseCatalog(options = {}) {
  return readAdminJson({ pathSegments: ["premiumCourses"], ...options });
}

export async function readPremiumCourse({ courseId, ...options } = {}) {
  if (!validPremiumCourseId(courseId)) {
    return { status: "failed", reason: "INVALID_PREMIUM_COURSE_ID", document: null };
  }
  return readAdminJson({ pathSegments: ["premiumCourses", courseId], ...options });
}

export async function persistPremiumCourse({ course, ...options } = {}) {
  if (!validPremiumCourseId(course?.courseId)) {
    return { status: "failed", reason: "INVALID_PREMIUM_COURSE" };
  }
  return commitAdminJson({
    documents: [{ pathSegments: ["premiumCourses", course.courseId], fields: course }],
    ...options
  });
}

export async function readPremiumCourseProgress({ userId, courseId, ...options } = {}) {
  if (!RTDB_KEY_PATTERN.test(String(userId || "")) || !validPremiumCourseId(courseId)) {
    return { status: "failed", reason: "INVALID_PREMIUM_PROGRESS", document: null };
  }
  return readAdminJson({ pathSegments: ["premiumCourseProgress", userId, courseId], ...options });
}

export async function persistPremiumCourseProgress({ progress, ...options } = {}) {
  if (!RTDB_KEY_PATTERN.test(String(progress?.userId || "")) || !validPremiumCourseId(progress?.courseId)) {
    return { status: "failed", reason: "INVALID_PREMIUM_PROGRESS" };
  }
  return commitAdminJson({
    documents: [{
      pathSegments: ["premiumCourseProgress", progress.userId, progress.courseId],
      fields: progress
    }],
    ...options
  });
}

export const __test = { COURSE_ID_PATTERN, RTDB_KEY_PATTERN };
