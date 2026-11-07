import { commitAdminJson, readAdminJson } from "./firebase-rtdb-admin-rest.mjs";

const COURSE_ID_PATTERN = /^[a-z][a-z0-9-]{2,79}$/;

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

export const __test = { COURSE_ID_PATTERN };
