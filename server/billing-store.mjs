import { createHash } from "node:crypto";
import { commitAdminJson, readAdminJson } from "./firebase-rtdb-admin-rest.mjs";

const SAFE_ID = /^[A-Za-z0-9:_-]{1,128}$/;

function validId(value) {
  return typeof value === "string" && SAFE_ID.test(value);
}

function courseEntitlementId(userId, planKey) {
  if (!validId(userId) || !validId(planKey)) return "";
  return createHash("sha256").update(`${userId}:${planKey}`).digest("hex");
}

function liveCourseEnrollmentDocuments(entitlement = {}) {
  if (!validId(entitlement.userId)) return [];
  const configured = Array.isArray(entitlement.configuredEntitlements)
    ? entitlement.configuredEntitlements
    : (Array.isArray(entitlement.entitlements) ? entitlement.entitlements : []);
  return [...new Set(configured)]
    .filter(value => typeof value === "string" && value.startsWith("live-course:"))
    .map(value => value.slice("live-course:".length))
    .filter(validId)
    .map(courseId => ({
      pathSegments: ["liveCourseEnrollments", courseId, entitlement.userId],
      fields: {
        courseId,
        userId: entitlement.userId,
        planKey: entitlement.planKey,
        active: entitlement.active === true,
        permanent: entitlement.permanent === true,
        status: entitlement.status,
        source: entitlement.source,
        testMode: entitlement.testMode === true,
        currentPeriodEnd: entitlement.currentPeriodEnd || null,
        purchasedAt: entitlement.purchasedAt || null,
        updatedAt: entitlement.updatedAt
      }
    }));
}

export async function readBillingWebhookEvent({ eventId, ...options } = {}) {
  if (!validId(eventId)) return { status: "failed", reason: "INVALID_BILLING_EVENT_ID" };
  return readAdminJson({ pathSegments: ["billingWebhookEvents", eventId], ...options });
}

export async function readBillingEntitlement({ userId, ...options } = {}) {
  if (!validId(userId)) return { status: "failed", reason: "INVALID_BILLING_USER_ID", document: null };
  return readAdminJson({ pathSegments: ["billingEntitlements", userId], ...options });
}

export async function readBillingCourseEntitlement({ userId, planKey, ...options } = {}) {
  const entitlementId = courseEntitlementId(userId, planKey);
  if (!entitlementId) return { status: "failed", reason: "INVALID_BILLING_COURSE_ENTITLEMENT", document: null };
  return readAdminJson({ pathSegments: ["billingCourseEntitlements", entitlementId], ...options });
}

export async function persistSubscriptionSnapshot({ event, subscription, entitlement, ...options } = {}) {
  if (!validId(event?.eventId) || !validId(subscription?.subscriptionId) || !validId(entitlement?.userId)) {
    return { status: "failed", reason: "INVALID_BILLING_SNAPSHOT" };
  }
  return commitAdminJson({
    documents: [
      { pathSegments: ["billingSubscriptions", subscription.subscriptionId], fields: subscription },
      { pathSegments: ["billingEntitlements", entitlement.userId], fields: entitlement },
      ...liveCourseEnrollmentDocuments(entitlement),
      { pathSegments: ["billingWebhookEvents", event.eventId], fields: event }
    ],
    ...options
  });
}

export async function persistOneTimePurchaseSnapshot({ event, purchase, entitlement, ...options } = {}) {
  const entitlementId = courseEntitlementId(entitlement?.userId, entitlement?.planKey);
  if (!validId(event?.eventId) || !validId(purchase?.orderId) || !entitlementId) {
    return { status: "failed", reason: "INVALID_BILLING_PURCHASE_SNAPSHOT" };
  }
  return commitAdminJson({
    documents: [
      { pathSegments: ["billingOrders", purchase.orderId], fields: purchase },
      { pathSegments: ["billingCourseEntitlements", entitlementId], fields: entitlement },
      ...liveCourseEnrollmentDocuments(entitlement),
      { pathSegments: ["billingWebhookEvents", event.eventId], fields: event }
    ],
    ...options
  });
}

export const __test = { validId, courseEntitlementId, liveCourseEnrollmentDocuments };
