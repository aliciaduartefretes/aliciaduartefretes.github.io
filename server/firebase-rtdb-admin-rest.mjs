import { createSign } from "node:crypto";

let cachedToken = null;

const base64url = value => Buffer.from(value).toString("base64url");

function readServiceAccount(env) {
  const raw = env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) return null;
  try {
    const account = JSON.parse(raw);
    if (!account.client_email || !account.private_key || !account.project_id) return null;
    return account;
  } catch {
    return null;
  }
}

function databaseUrlFor(account, env) {
  const candidate = String(env.FIREBASE_DATABASE_URL || `https://${account.project_id}-default-rtdb.firebaseio.com`).trim();
  try {
    const url = new URL(candidate);
    const allowedHost = url.hostname.endsWith(".firebaseio.com") || url.hostname.endsWith(".firebasedatabase.app");
    if (url.protocol !== "https:" || !allowedHost || url.username || url.password) return "";
    return `${url.origin}${url.pathname.replace(/\/+$/, "")}`;
  } catch {
    return "";
  }
}

async function getAccessToken({ env = process.env, fetchImpl = globalThis.fetch } = {}) {
  const account = readServiceAccount(env);
  if (!account) return { ok: false, reason: "FIREBASE_ADMIN_NOT_CONFIGURED" };
  const databaseUrl = databaseUrlFor(account, env);
  if (!databaseUrl) return { ok: false, reason: "FIREBASE_DATABASE_URL_INVALID" };
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken?.projectId === account.project_id && cachedToken.expiresAt > now + 60) {
    return { ok: true, token: cachedToken.token, projectId: account.project_id, databaseUrl };
  }
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64url(JSON.stringify({
    iss: account.client_email,
    scope: "https://www.googleapis.com/auth/firebase.database https://www.googleapis.com/auth/userinfo.email",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600
  }));
  const unsigned = `${header}.${claims}`;
  const signer = createSign("RSA-SHA256"); signer.update(unsigned); signer.end();
  const assertion = `${unsigned}.${signer.sign(account.private_key).toString("base64url")}`;
  const response = await fetchImpl("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion })
  });
  if (!response.ok) return { ok: false, reason: "FIREBASE_ADMIN_TOKEN_FAILED", status: response.status };
  const payload = await response.json();
  cachedToken = { token: payload.access_token, projectId: account.project_id, expiresAt: now + Number(payload.expires_in || 3600) };
  return { ok: true, token: cachedToken.token, projectId: account.project_id, databaseUrl };
}

function validPathSegments(pathSegments) {
  return Array.isArray(pathSegments)
    && pathSegments.length >= 1
    && pathSegments.length <= 8
    && pathSegments.every(segment => typeof segment === "string"
      && segment.length >= 1
      && segment.length <= 256
      && !/[.#$\[\]\/]/.test(segment));
}

const encodePath = pathSegments => pathSegments.map(segment => encodeURIComponent(segment)).join("/");

export async function readAdminJson({
  pathSegments,
  env = process.env,
  fetchImpl = globalThis.fetch,
  tokenReader = getAccessToken
} = {}) {
  if (!validPathSegments(pathSegments)) return { status: "failed", reason: "INVALID_RTDB_PATH", document: null };
  const auth = await tokenReader({ env, fetchImpl });
  if (!auth.ok) return { status: "skipped", reason: auth.reason, document: null };
  const response = await fetchImpl(`${auth.databaseUrl}/${encodePath(pathSegments)}.json`, {
    headers: { Authorization: `Bearer ${auth.token}`, Accept: "application/json" }
  });
  if (!response.ok) return { status: "failed", reason: "RTDB_READ_FAILED", httpStatus: response.status, document: null };
  const document = await response.json();
  return document == null ? { status: "missing", document: null } : { status: "found", document };
}

export async function commitAdminJson({
  documents,
  env = process.env,
  fetchImpl = globalThis.fetch,
  tokenReader = getAccessToken
} = {}) {
  if (!Array.isArray(documents) || documents.length < 1 || documents.length > 20
    || documents.some(document => !validPathSegments(document.pathSegments))) {
    return { status: "failed", reason: "INVALID_RTDB_COMMIT" };
  }
  const auth = await tokenReader({ env, fetchImpl });
  if (!auth.ok) return { status: "skipped", reason: auth.reason };
  const updates = Object.fromEntries(documents.map(document => [encodePath(document.pathSegments), document.fields || {}]));
  const response = await fetchImpl(`${auth.databaseUrl}/.json`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${auth.token}`, "Content-Type": "application/json" },
    body: JSON.stringify(updates)
  });
  if (!response.ok) return { status: "failed", reason: "RTDB_COMMIT_FAILED", httpStatus: response.status };
  return { status: "persisted" };
}

export const __test = {
  readServiceAccount,
  databaseUrlFor,
  validPathSegments,
  resetTokenCache: () => { cachedToken = null; }
};
