import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

const RESPONSE_HEADERS = {
  "Cache-Control": "no-store",
  "Content-Type": "application/json; charset=utf-8",
  "X-Content-Type-Options": "nosniff",
};

function getFirebaseApp() {
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

  return (
    getApps()[0] ||
    initializeApp({
      credential: cert(serviceAccount),
      projectId: serviceAccount.project_id,
    })
  );
}

export default {
  async fetch(request) {
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response(
        JSON.stringify({ ok: false, error: "method_not_allowed" }),
        {
          status: 405,
          headers: {
            ...RESPONSE_HEADERS,
            Allow: "GET, HEAD",
          },
        },
      );
    }

    try {
      const app = getFirebaseApp();

      // Comprobación únicamente de lectura.
      await getAuth(app).listUsers(1);

      const payload = {
        ok: true,
        service: "guarani-con-ali-firebase-admin",
        connected: true,
        projectId: "guaraniconali",
        message: "Firebase Admin está conectado al servidor",
      };

      return new Response(
        request.method === "HEAD" ? null : JSON.stringify(payload),
        { status: 200, headers: RESPONSE_HEADERS },
      );
    } catch (error) {
      console.error("FIREBASE_ADMIN_STATUS_ERROR", {
        name: error?.name || "Error",
        code: error?.code || "unknown",
        message: error?.message || "unknown",
      });

      return new Response(
        request.method === "HEAD"
          ? null
          : JSON.stringify({
              ok: false,
              service: "guarani-con-ali-firebase-admin",
              connected: false,
              error: "firebase_connection_failed",
            }),
        { status: 503, headers: RESPONSE_HEADERS },
      );
    }
  },
};
