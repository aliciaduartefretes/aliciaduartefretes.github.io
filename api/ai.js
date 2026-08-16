import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

const MAX_BODY_BYTES = 16_000;
const MAX_QUESTION_LENGTH = 2_000;

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

export default {
  async fetch(request) {
    if (request.method !== "POST") {
      return jsonResponse(
        { ok: false, error: "method_not_allowed" },
        405,
        { Allow: "POST" },
      );
    }

    const declaredLength = Number(
      request.headers.get("content-length") || 0
    );

    if (declaredLength > MAX_BODY_BYTES) {
      return jsonResponse(
        { ok: false, error: "request_too_large" },
        413
      );
    }

    const idToken = readBearerToken(request);

    if (!idToken) {
      return jsonResponse(
        { ok: false, error: "authentication_required" },
        401
      );
    }

    let app;

    try {
      app = getFirebaseApp();
    } catch (error) {
      console.error("AI_FIREBASE_CONFIGURATION_ERROR", {
        name: error?.name || "Error",
        message: error?.message || "unknown",
      });

      return jsonResponse(
        { ok: false, error: "service_unavailable" },
        503
      );
    }

    try {
      await getAuth(app).verifyIdToken(idToken, true);
    } catch (error) {
      console.warn("AI_AUTH_REJECTED", {
        code: error?.code || "invalid_token",
      });

      return jsonResponse(
        { ok: false, error: "invalid_session" },
        401
      );
    }

    let body;

    try {
      body = await request.json();
    } catch {
      return jsonResponse(
        { ok: false, error: "invalid_json" },
        400
      );
    }

    const question =
      typeof body?.question === "string"
        ? body.question.trim()
        : "";

    if (!question) {
      return jsonResponse(
        { ok: false, error: "question_required" },
        400
      );
    }

    if (question.length > MAX_QUESTION_LENGTH) {
      return jsonResponse(
        { ok: false, error: "question_too_long" },
        400
      );
    }

    return jsonResponse(
      {
        ok: true,
        authenticated: true,
        readyForAi: true,
        message:
          "Sesión verificada. La generación con IA todavía no está activada.",
      },
      200
    );
  },
};
