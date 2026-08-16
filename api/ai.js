import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

const ADMIN_EMAILS = new Set(["aliciaduartefretes@gmail.com"]);
const CONFIG_COLLECTION = "ai_system";
const CONFIG_DOCUMENT = "config";
const DEFAULT_CONFIG = Object.freeze({
  enabled: false,
  dailyLimit: 20,
  monthlyLimit: 300,
});
const MAX_BODY_BYTES = 16_000;
const MAX_QUESTION_LENGTH = 2_000;
const AI_TIME_ZONE = "America/Asuncion";

const BASE_HEADERS = {
  "Cache-Control": "no-store",
  "Content-Type": "application/json; charset=utf-8",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
};

function jsonResponse(payload, status, extraHeaders = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...BASE_HEADERS, ...extraHeaders },
  });
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function getFirebaseApp() {
  const existingApp = getApps()[0];
  if (existingApp) return existingApp;

  const rawCredentials = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!rawCredentials?.trim()) {
    throw new Error("firebase_credentials_missing");
  }

  let serviceAccount;
  try {
    serviceAccount = JSON.parse(rawCredentials);
  } catch {
    throw new Error("firebase_credentials_invalid_json");
  }

  if (
    serviceAccount.project_id !== "guaraniconali" ||
    !serviceAccount.client_email ||
    !serviceAccount.private_key
  ) {
    throw new Error("firebase_credentials_invalid_fields");
  }

  return initializeApp({
    credential: cert(serviceAccount),
    projectId: serviceAccount.project_id,
  });
}

function readBearerToken(request) {
  const authorization = request.headers.get("authorization") || "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || "";
}

async function authenticate(request, app) {
  const idToken = readBearerToken(request);
  if (!idToken) {
    return {
      ok: false,
      response: jsonResponse({ ok: false, error: "authentication_required" }, 401),
    };
  }

  try {
    const user = await getAuth(app).verifyIdToken(idToken, true);
    const email = normalizeEmail(user.email);
    return {
      ok: true,
      user,
      email,
      isAdmin: user.email_verified === true && ADMIN_EMAILS.has(email),
    };
  } catch (error) {
    console.warn("AI_AUTH_REJECTED", {
      code: error?.code || "invalid_token",
    });
    return {
      ok: false,
      response: jsonResponse({ ok: false, error: "invalid_session" }, 401),
    };
  }
}

function numberInRange(value, fallback, minimum, maximum) {
  const number = Number(value);
  if (!Number.isInteger(number)) return fallback;
  return Math.min(maximum, Math.max(minimum, number));
}

function normalizeConfig(data = {}) {
  return {
    enabled: data.enabled === true,
    dailyLimit: numberInRange(data.dailyLimit, DEFAULT_CONFIG.dailyLimit, 1, 100),
    monthlyLimit: numberInRange(data.monthlyLimit, DEFAULT_CONFIG.monthlyLimit, 1, 3_000),
  };
}

async function getConfig(db) {
  const snapshot = await db.collection(CONFIG_COLLECTION).doc(CONFIG_DOCUMENT).get();
  return snapshot.exists ? normalizeConfig(snapshot.data()) : { ...DEFAULT_CONFIG };
}

function periodKeys(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: AI_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const day = `${values.year}-${values.month}-${values.day}`;
  return { day, month: `${values.year}-${values.month}` };
}

function cleanCount(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : 0;
}

async function getUsage(db, uid) {
  const { day, month } = periodKeys();
  const userRef = db.collection("ai_usage").doc(uid);
  const [dailySnapshot, monthlySnapshot] = await Promise.all([
    userRef.collection("daily").doc(day).get(),
    userRef.collection("monthly").doc(month).get(),
  ]);

  return {
    day,
    month,
    dailyUsed: cleanCount(dailySnapshot.data()?.requestCount),
    monthlyUsed: cleanCount(monthlySnapshot.data()?.requestCount),
  };
}

function usagePayload(config, usage) {
  return {
    daily: {
      period: usage.day,
      limit: config.dailyLimit,
      used: usage.dailyUsed,
      remaining: Math.max(0, config.dailyLimit - usage.dailyUsed),
    },
    monthly: {
      period: usage.month,
      limit: config.monthlyLimit,
      used: usage.monthlyUsed,
      remaining: Math.max(0, config.monthlyLimit - usage.monthlyUsed),
    },
  };
}

async function safeRecordEvent(db, event) {
  try {
    await db.collection("ai_events").doc(event.requestId).set({
      requestId: event.requestId,
      userId: event.userId,
      type: event.type,
      status: event.status,
      errorCode: event.errorCode || null,
      model: event.model || null,
      inputTokens: cleanCount(event.inputTokens),
      outputTokens: cleanCount(event.outputTokens),
      totalTokens: cleanCount(event.totalTokens),
      estimatedCostUsd: Number(event.estimatedCostUsd) || 0,
      questionStored: false,
      createdAt: FieldValue.serverTimestamp(),
    });
  } catch (error) {
    console.error("AI_EVENT_LOG_FAILED", {
      requestId: event.requestId,
      code: error?.code || "unknown",
    });
  }
}

async function readJson(request) {
  const declaredLength = Number(request.headers.get("content-length") || 0);
  if (declaredLength > MAX_BODY_BYTES) {
    return {
      ok: false,
      response: jsonResponse({ ok: false, error: "request_too_large" }, 413),
    };
  }

  try {
    const text = await request.text();
    if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) {
      return {
        ok: false,
        response: jsonResponse({ ok: false, error: "request_too_large" }, 413),
      };
    }
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return {
      ok: false,
      response: jsonResponse({ ok: false, error: "invalid_json" }, 400),
    };
  }
}

async function handleStatus(db, auth) {
  const [config, usage] = await Promise.all([
    getConfig(db),
    getUsage(db, auth.user.uid),
  ]);

  return jsonResponse({
    ok: true,
    enabled: config.enabled,
    isAdmin: auth.isAdmin,
    usage: usagePayload(config, usage),
  }, 200);
}

async function handleAdminUpdate(request, db, auth, requestId) {
  if (!auth.isAdmin) {
    await safeRecordEvent(db, {
      requestId,
      userId: auth.user.uid,
      type: "admin_config",
      status: "rejected",
      errorCode: "administrator_required",
    });
    return jsonResponse({ ok: false, error: "administrator_required" }, 403);
  }

  const parsed = await readJson(request);
  if (!parsed.ok) return parsed.response;

  const body = parsed.value || {};
  const patch = {};

  if (Object.hasOwn(body, "enabled")) {
    if (typeof body.enabled !== "boolean") {
      return jsonResponse({ ok: false, error: "invalid_enabled_value" }, 400);
    }
    patch.enabled = body.enabled;
  }

  if (Object.hasOwn(body, "dailyLimit")) {
    if (!Number.isInteger(body.dailyLimit) || body.dailyLimit < 1 || body.dailyLimit > 100) {
      return jsonResponse({ ok: false, error: "invalid_daily_limit" }, 400);
    }
    patch.dailyLimit = body.dailyLimit;
  }

  if (Object.hasOwn(body, "monthlyLimit")) {
    if (!Number.isInteger(body.monthlyLimit) || body.monthlyLimit < 1 || body.monthlyLimit > 3_000) {
      return jsonResponse({ ok: false, error: "invalid_monthly_limit" }, 400);
    }
    patch.monthlyLimit = body.monthlyLimit;
  }

  if (!Object.keys(patch).length) {
    return jsonResponse({ ok: false, error: "configuration_value_required" }, 400);
  }

  const configRef = db.collection(CONFIG_COLLECTION).doc(CONFIG_DOCUMENT);
  await configRef.set({
    ...patch,
    updatedAt: FieldValue.serverTimestamp(),
    updatedByUid: auth.user.uid,
    updatedByEmail: auth.email,
  }, { merge: true });

  const config = await getConfig(db);
  await safeRecordEvent(db, {
    requestId,
    userId: auth.user.uid,
    type: "admin_config",
    status: "complete",
  });

  return jsonResponse({ ok: true, config }, 200);
}

async function handleAiRequest(request, db, auth, requestId) {
  const parsed = await readJson(request);
  if (!parsed.ok) return parsed.response;

  const question = typeof parsed.value?.question === "string"
    ? parsed.value.question.trim()
    : "";

  if (!question) {
    return jsonResponse({ ok: false, error: "question_required" }, 400);
  }

  if (question.length > MAX_QUESTION_LENGTH) {
    return jsonResponse({ ok: false, error: "question_too_long" }, 400);
  }

  const [config, usage] = await Promise.all([
    getConfig(db),
    getUsage(db, auth.user.uid),
  ]);

  if (!config.enabled) {
    await safeRecordEvent(db, {
      requestId,
      userId: auth.user.uid,
      type: "generation",
      status: "blocked",
      errorCode: "ai_temporarily_disabled",
    });
    return jsonResponse({ ok: false, error: "ai_temporarily_disabled" }, 503);
  }

  if (usage.dailyUsed >= config.dailyLimit) {
    await safeRecordEvent(db, {
      requestId,
      userId: auth.user.uid,
      type: "generation",
      status: "blocked",
      errorCode: "daily_limit_reached",
    });
    return jsonResponse({
      ok: false,
      error: "daily_limit_reached",
      usage: usagePayload(config, usage),
    }, 429);
  }

  if (usage.monthlyUsed >= config.monthlyLimit) {
    await safeRecordEvent(db, {
      requestId,
      userId: auth.user.uid,
      type: "generation",
      status: "blocked",
      errorCode: "monthly_limit_reached",
    });
    return jsonResponse({
      ok: false,
      error: "monthly_limit_reached",
      usage: usagePayload(config, usage),
    }, 429);
  }

  await db.collection("ai_generations").doc(requestId).set({
    requestId,
    userId: auth.user.uid,
    status: "security_ready",
    model: null,
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    estimatedCostUsd: 0,
    questionStored: false,
    createdAt: FieldValue.serverTimestamp(),
  });

  return jsonResponse({
    ok: true,
    requestId,
    authenticated: true,
    controlsPassed: true,
    usage: usagePayload(config, usage),
    message: "Controles de IA superados. OpenAI todavÃ­a no estÃ¡ activado.",
  }, 200);
}

export default {
  async fetch(request) {
    const requestId = crypto.randomUUID();

    if (!["GET", "POST", "PATCH"].includes(request.method)) {
      return jsonResponse(
        { ok: false, error: "method_not_allowed" },
        405,
        { Allow: "GET, POST, PATCH" },
      );
    }

    if (!readBearerToken(request)) {
      return jsonResponse({ ok: false, error: "authentication_required" }, 401);
    }

    let app;
    try {
      app = getFirebaseApp();
    } catch (error) {
      console.error("AI_FIREBASE_CONFIGURATION_ERROR", {
        requestId,
        name: error?.name || "Error",
        message: error?.message || "unknown",
      });
      return jsonResponse({ ok: false, error: "service_unavailable" }, 503);
    }

    const auth = await authenticate(request, app);
    if (!auth.ok) return auth.response;

    const db = getFirestore(app);

    try {
      if (request.method === "GET") {
        return await handleStatus(db, auth);
      }
      if (request.method === "PATCH") {
        return await handleAdminUpdate(request, db, auth, requestId);
      }
      return await handleAiRequest(request, db, auth, requestId);
    } catch (error) {
      console.error("AI_SERVER_ERROR", {
        requestId,
        code: error?.code || "unknown",
        message: error?.message || "unknown",
      });

      await safeRecordEvent(db, {
        requestId,
        userId: auth.user.uid,
        type: "server",
        status: "error",
        errorCode: error?.code || "internal_error",
      });

      return jsonResponse({ ok: false, error: "internal_error", requestId }, 500);
    }
  },
};
