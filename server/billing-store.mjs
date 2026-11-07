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
      { pathSegments: ["billingWebhookEvents", event.eventId], fields: event }
    ],
    ...options
  });
}

export const __test = { validId, courseEntitlementId };
