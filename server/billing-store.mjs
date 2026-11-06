import { commitAdminDocuments, readAdminDocument } from "./firestore-admin-rest.mjs";

const SAFE_ID = /^[A-Za-z0-9:_-]{1,128}$/;

function validId(value) {
  return typeof value === "string" && SAFE_ID.test(value);
}

export async function readBillingWebhookEvent({ eventId, ...options } = {}) {
  if (!validId(eventId)) return { status: "failed", reason: "INVALID_BILLING_EVENT_ID" };
  return readAdminDocument({ pathSegments: ["billingWebhookEvents", eventId], ...options });
}

export async function readBillingEntitlement({ userId, ...options } = {}) {
  if (!validId(userId)) return { status: "failed", reason: "INVALID_BILLING_USER_ID", document: null };
  return readAdminDocument({ pathSegments: ["billingEntitlements", userId], ...options });
}

export async function persistSubscriptionSnapshot({ event, subscription, entitlement, ...options } = {}) {
  if (!validId(event?.eventId) || !validId(subscription?.subscriptionId) || !validId(entitlement?.userId)) {
    return { status: "failed", reason: "INVALID_BILLING_SNAPSHOT" };
  }
  return commitAdminDocuments({
    documents: [
      { pathSegments: ["billingSubscriptions", subscription.subscriptionId], fields: subscription },
      { pathSegments: ["billingEntitlements", entitlement.userId], fields: entitlement },
      { pathSegments: ["billingWebhookEvents", event.eventId], fields: event }
    ],
    ...options
  });
}

export const __test = { validId };
