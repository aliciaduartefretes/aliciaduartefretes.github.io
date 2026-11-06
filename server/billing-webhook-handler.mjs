import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { readBillingConfig } from "./billing-config.mjs";
import { rawBody, sendJson } from "./billing-http.mjs";
import {
  persistOneTimePurchaseSnapshot,
  persistSubscriptionSnapshot,
  readBillingWebhookEvent
} from "./billing-store.mjs";

const SUBSCRIPTION_EVENTS = new Set([
  "subscription_created",
  "subscription_updated",
  "subscription_cancelled",
  "subscription_resumed",
  "subscription_expired",
  "subscription_paused",
  "subscription_unpaused",
  "subscription_plan_changed"
]);
const ORDER_EVENTS = new Set(["order_created"]);
const SUPPORTED_EVENTS = new Set([...SUBSCRIPTION_EVENTS, ...ORDER_EVENTS]);
const VALID_STATUSES = new Set(["on_trial", "active", "paused", "past_due", "unpaid", "cancelled", "expired"]);
const UID_PATTERN = /^[A-Za-z0-9:_-]{1,128}$/;

function signatureValid(raw, signature, secret) {
  if (!Buffer.isBuffer(raw) || !/^[a-f0-9]{64}$/i.test(signature || "") || !secret) return false;
  const expected = Buffer.from(createHmac("sha256", secret).update(raw).digest("hex"), "utf8");
  const received = Buffer.from(String(signature).toLowerCase(), "utf8");
  return expected.length === received.length && timingSafeEqual(expected, received);
}

function activeFor(status, endsAt, now) {
  if (["on_trial", "active", "paused", "past_due"].includes(status)) return true;
  if (status !== "cancelled" || !endsAt) return false;
  const timestamp = Date.parse(endsAt);
  return Number.isFinite(timestamp) && timestamp > now.getTime();
}

function normalizeSubscriptionEvent(payload, config, raw, now = new Date()) {
  const eventName = String(payload?.meta?.event_name || "");
  if (!SUBSCRIPTION_EVENTS.has(eventName) || payload?.data?.type !== "subscriptions") throw new Error("UNSUPPORTED_EVENT");
  const attributes = payload.data.attributes || {};
  const custom = payload.meta?.custom_data || {};
  const subscriptionId = String(payload.data.id || "");
  const userId = String(custom.user_id || "");
  const planKey = String(custom.plan_key || "");
  const plan = config.plans.get(planKey);
  const status = String(attributes.status || "");
  if (!/^\d{1,20}$/.test(subscriptionId) || !UID_PATTERN.test(userId) || !plan || plan.kind !== "subscription") throw new Error("INVALID_EVENT_LINK");
  if (String(attributes.store_id || "") !== config.storeId || String(attributes.variant_id || "") !== plan.variantId) throw new Error("INVALID_EVENT_PRODUCT");
  if (plan.productId && String(attributes.product_id || "") !== plan.productId) throw new Error("INVALID_EVENT_PRODUCT");
  if (!VALID_STATUSES.has(status) || Boolean(attributes.test_mode) !== (config.mode === "test")) throw new Error("INVALID_EVENT_ENVIRONMENT");
  const eventId = createHash("sha256").update(raw).digest("hex");
  const active = activeFor(status, attributes.ends_at, now);
  const currentPeriodEnd = attributes.ends_at || attributes.renews_at || attributes.trial_ends_at || null;
  const processedAt = now.toISOString();
  return {
    event: {
      eventId,
      eventName,
      resourceType: "subscriptions",
      resourceId: subscriptionId,
      status: "processed",
      testMode: Boolean(attributes.test_mode),
      processedAt
    },
    subscription: {
      subscriptionId,
      userId,
      planKey,
      storeId: config.storeId,
      productId: String(attributes.product_id || ""),
      variantId: String(attributes.variant_id || ""),
      customerId: String(attributes.customer_id || ""),
      status,
      active,
      testMode: Boolean(attributes.test_mode),
      renewsAt: attributes.renews_at || null,
      endsAt: attributes.ends_at || null,
      updatedAt: processedAt
    },
    entitlement: {
      userId,
      source: "lemonsqueezy",
      subscriptionId,
      planKey,
      status,
      active,
      entitlements: active ? [...plan.entitlements] : [],
      currentPeriodEnd,
      testMode: Boolean(attributes.test_mode),
      updatedAt: processedAt
    }
  };
}

function normalizeOrderEvent(payload, config, raw, now = new Date()) {
  const eventName = String(payload?.meta?.event_name || "");
  if (!ORDER_EVENTS.has(eventName) || payload?.data?.type !== "orders") throw new Error("UNSUPPORTED_EVENT");
  const attributes = payload.data.attributes || {};
  const custom = payload.meta?.custom_data || {};
  const item = attributes.first_order_item || {};
  const orderId = String(payload.data.id || "");
  const userId = String(custom.user_id || "");
  const planKey = String(custom.plan_key || "");
  const plan = config.plans.get(planKey);
  const status = String(attributes.status || "");
  if (!/^\d{1,20}$/.test(orderId) || !UID_PATTERN.test(userId) || !plan || plan.kind !== "one_time") {
    throw new Error("INVALID_EVENT_LINK");
  }
  if (String(attributes.store_id || "") !== config.storeId || String(item.variant_id || "") !== plan.variantId) {
    throw new Error("INVALID_EVENT_PRODUCT");
  }
  if (plan.productId && String(item.product_id || "") !== plan.productId) throw new Error("INVALID_EVENT_PRODUCT");
  if (status !== "paid" || attributes.refunded === true || Boolean(attributes.test_mode) !== (config.mode === "test")) {
    throw new Error("INVALID_EVENT_ENVIRONMENT");
  }
  const eventId = createHash("sha256").update(raw).digest("hex");
  const processedAt = now.toISOString();
  const purchasedAt = typeof attributes.created_at === "string" ? attributes.created_at : processedAt;
  return {
    kind: "one_time",
    event: {
      eventId,
      eventName,
      resourceType: "orders",
      resourceId: orderId,
      status: "processed",
      testMode: Boolean(attributes.test_mode),
      processedAt
    },
    purchase: {
      orderId,
      userId,
      planKey,
      storeId: config.storeId,
      productId: String(item.product_id || ""),
      variantId: String(item.variant_id || ""),
      customerId: String(attributes.customer_id || ""),
      status,
      testMode: Boolean(attributes.test_mode),
      purchasedAt,
      updatedAt: processedAt
    },
    entitlement: {
      userId,
      source: "lemonsqueezy",
      orderId,
      planKey,
      status,
      active: true,
      permanent: true,
      entitlements: [...plan.entitlements],
      testMode: Boolean(attributes.test_mode),
      purchasedAt,
      updatedAt: processedAt
    }
  };
}

function normalizeWebhookEvent(payload, config, raw, now = new Date()) {
  const eventName = String(payload?.meta?.event_name || "");
  if (SUBSCRIPTION_EVENTS.has(eventName)) return { kind: "subscription", ...normalizeSubscriptionEvent(payload, config, raw, now) };
  if (ORDER_EVENTS.has(eventName)) return normalizeOrderEvent(payload, config, raw, now);
  throw new Error("UNSUPPORTED_EVENT");
}

export function createLemonSqueezyWebhookHandler({
  configReader = readBillingConfig,
  readEvent = readBillingWebhookEvent,
  persistSubscription = persistSubscriptionSnapshot,
  persistPurchase = persistOneTimePurchaseSnapshot,
  clock = () => new Date()
} = {}) {
  return async function handler(request, response) {
    if (request.method !== "POST") {
      response.setHeader("Allow", "POST");
      return sendJson(response, 405, { ok: false, reason: "METHOD_NOT_ALLOWED" });
    }
    try {
      const config = configReader();
      if (!config.enabled) return sendJson(response, 503, { ok: false, reason: "BILLING_NOT_AVAILABLE" });
      const raw = await rawBody(request);
      if (!signatureValid(raw, request.headers?.["x-signature"], config.webhookSecret)) {
        return sendJson(response, 401, { ok: false, reason: "INVALID_SIGNATURE" });
      }
      const snapshot = normalizeWebhookEvent(JSON.parse(raw.toString("utf8")), config, raw, clock());
      const existing = await readEvent({ eventId: snapshot.event.eventId });
      if (existing.status === "found") return sendJson(response, 200, { ok: true, duplicate: true });
      if (existing.status !== "missing") return sendJson(response, 503, { ok: false, reason: "BILLING_STORE_UNAVAILABLE" });
      const persisted = snapshot.kind === "one_time"
        ? await persistPurchase(snapshot)
        : await persistSubscription(snapshot);
      if (persisted.status !== "persisted") return sendJson(response, 503, { ok: false, reason: "BILLING_STORE_UNAVAILABLE" });
      return sendJson(response, 200, { ok: true });
    } catch (error) {
      const tooLarge = error?.message === "PAYLOAD_TOO_LARGE";
      const invalidBody = ["UNSUPPORTED_EVENT", "INVALID_EVENT_LINK", "INVALID_EVENT_PRODUCT", "INVALID_EVENT_ENVIRONMENT"].includes(error?.message);
      return sendJson(response, tooLarge ? 413 : invalidBody ? 400 : 400, {
        ok: false,
        reason: tooLarge ? "PAYLOAD_TOO_LARGE" : "INVALID_WEBHOOK"
      });
    }
  };
}

export const __test = {
  signatureValid,
  activeFor,
  normalizeSubscriptionEvent,
  normalizeOrderEvent,
  normalizeWebhookEvent,
  SUPPORTED_EVENTS
};
