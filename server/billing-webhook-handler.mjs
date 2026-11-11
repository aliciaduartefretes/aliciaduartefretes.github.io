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
const ORDER_EVENTS = new Set(["order_created", "order_refunded"]);
const SUPPORTED_EVENTS = new Set([...SUBSCRIPTION_EVENTS, ...ORDER_EVENTS]);
const VALID_STATUSES = new Set(["on_trial", "active", "paused", "past_due", "unpaid", "cancelled", "expired"]);
const UID_PATTERN = /^[A-Za-z0-9:_-]{1,128}$/;
const MAXIMUM_WEBHOOK_BYTES = 524_288;
const SAFE_WEBHOOK_ERRORS = new Set([
  "UNSUPPORTED_EVENT",
  "INVALID_EVENT_LINK",
  "INVALID_EVENT_PRODUCT",
  "INVALID_EVENT_ENVIRONMENT",
  "PAYLOAD_TOO_LARGE",
  "SyntaxError"
]);

function safeWebhookErrorCode(error) {
  const message = String(error?.message || "");
  if (SAFE_WEBHOOK_ERRORS.has(message)) return message;
  if (SAFE_WEBHOOK_ERRORS.has(error?.name)) return error.name;
  return "INVALID_WEBHOOK";
}

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
      configuredEntitlements: [...plan.entitlements],
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
  const refunded = attributes.refunded === true || status === "refunded";
  if (!/^\d{1,20}$/.test(orderId) || !UID_PATTERN.test(userId) || !plan || plan.kind !== "one_time") {
    throw new Error("INVALID_EVENT_LINK");
  }
  if (String(attributes.store_id || "") !== config.storeId || String(item.variant_id || "") !== plan.variantId) {
    throw new Error("INVALID_EVENT_PRODUCT");
  }
  if (plan.productId && String(item.product_id || "") !== plan.productId) throw new Error("INVALID_EVENT_PRODUCT");
  const isPaidOrder = eventName === "order_created" && status === "paid" && !refunded;
  const isRefundedOrder = eventName === "order_refunded" && refunded;
  if ((!isPaidOrder && !isRefundedOrder) || Boolean(attributes.test_mode) !== (config.mode === "test")) {
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
      refunded,
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
      active: isPaidOrder,
      permanent: isPaidOrder,
      entitlements: isPaidOrder ? [...plan.entitlements] : [],
      configuredEntitlements: [...plan.entitlements],
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

function webhookFailure(error) {
  const tooLarge = error?.message === "PAYLOAD_TOO_LARGE";
  console.error(`[billing] webhook rejected: ${safeWebhookErrorCode(error)}`);
  return {
    status: tooLarge ? 413 : 400,
    payload: {
      ok: false,
      reason: tooLarge ? "PAYLOAD_TOO_LARGE" : "INVALID_WEBHOOK"
    }
  };
}

export function createLemonSqueezyWebhookProcessor({
  configReader = readBillingConfig,
  readEvent = readBillingWebhookEvent,
  persistSubscription = persistSubscriptionSnapshot,
  persistPurchase = persistOneTimePurchaseSnapshot,
  clock = () => new Date()
} = {}) {
  return async function processWebhook(raw, signature) {
    try {
      const config = configReader();
      if (!config.enabled) return { status: 503, payload: { ok: false, reason: "BILLING_NOT_AVAILABLE" } };
      if (!signatureValid(raw, signature, config.webhookSecret)) {
        return { status: 401, payload: { ok: false, reason: "INVALID_SIGNATURE" } };
      }
      const snapshot = normalizeWebhookEvent(JSON.parse(raw.toString("utf8")), config, raw, clock());
      const existing = await readEvent({ eventId: snapshot.event.eventId });
      if (existing.status === "found") return { status: 200, payload: { ok: true, duplicate: true } };
      if (existing.status !== "missing") {
        return { status: 503, payload: { ok: false, reason: "BILLING_STORE_UNAVAILABLE" } };
      }
      const persisted = snapshot.kind === "one_time"
        ? await persistPurchase(snapshot)
        : await persistSubscription(snapshot);
      if (persisted.status !== "persisted") {
        return { status: 503, payload: { ok: false, reason: "BILLING_STORE_UNAVAILABLE" } };
      }
      return { status: 200, payload: { ok: true } };
    } catch (error) {
      return webhookFailure(error);
    }
  };
}

export function createLemonSqueezyWebhookHandler({
  configReader = readBillingConfig,
  readEvent = readBillingWebhookEvent,
  persistSubscription = persistSubscriptionSnapshot,
  persistPurchase = persistOneTimePurchaseSnapshot,
  clock = () => new Date()
} = {}) {
  const processWebhook = createLemonSqueezyWebhookProcessor({
    configReader,
    readEvent,
    persistSubscription,
    persistPurchase,
    clock
  });
  return async function handler(request, response) {
    if (request.method !== "POST") {
      response.setHeader("Allow", "POST");
      return sendJson(response, 405, { ok: false, reason: "METHOD_NOT_ALLOWED" });
    }
    try {
      const raw = await rawBody(request, MAXIMUM_WEBHOOK_BYTES);
      const result = await processWebhook(raw, request.headers?.["x-signature"]);
      return sendJson(response, result.status, result.payload);
    } catch (error) {
      const result = webhookFailure(error);
      return sendJson(response, result.status, result.payload);
    }
  };
}

export function createLemonSqueezyFetchWebhookHandler(dependencies = {}) {
  const processWebhook = createLemonSqueezyWebhookProcessor(dependencies);
  return async function fetchWebhook(request) {
    const responseHeaders = {
      "Cache-Control": "no-store",
      "Content-Type": "application/json; charset=utf-8",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff"
    };
    if (request.method !== "POST") {
      return Response.json(
        { ok: false, reason: "METHOD_NOT_ALLOWED" },
        { status: 405, headers: { ...responseHeaders, Allow: "POST" } }
      );
    }
    try {
      const declaredLength = Number(request.headers.get("content-length") || 0);
      if (Number.isFinite(declaredLength) && declaredLength > MAXIMUM_WEBHOOK_BYTES) {
        throw new RangeError("PAYLOAD_TOO_LARGE");
      }
      const raw = Buffer.from(await request.arrayBuffer());
      if (raw.length > MAXIMUM_WEBHOOK_BYTES) throw new RangeError("PAYLOAD_TOO_LARGE");
      const result = await processWebhook(raw, request.headers.get("x-signature") || "");
      return Response.json(result.payload, { status: result.status, headers: responseHeaders });
    } catch (error) {
      const result = webhookFailure(error);
      return Response.json(result.payload, { status: result.status, headers: responseHeaders });
    }
  };
}

export const __test = {
  signatureValid,
  activeFor,
  normalizeSubscriptionEvent,
  normalizeOrderEvent,
  normalizeWebhookEvent,
  safeWebhookErrorCode,
  webhookFailure,
  SUPPORTED_EVENTS
};
