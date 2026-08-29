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

async function getAccessToken({ env = process.env, fetchImpl = globalThis.fetch } = {}) {
  const account = readServiceAccount(env);
  if (!account) return { ok: false, reason: "FIREBASE_ADMIN_NOT_CONFIGURED" };
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken?.projectId === account.project_id && cachedToken.expiresAt > now + 60) {
    return { ok: true, token: cachedToken.token, projectId: account.project_id };
  }
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64url(JSON.stringify({
    iss: account.client_email,
    scope: "https://www.googleapis.com/auth/datastore",
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
  return { ok: true, token: cachedToken.token, projectId: account.project_id };
}

function toFirestoreValue(value) {
  if (value == null) return { nullValue: null };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number") return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  if (typeof value === "string") return { stringValue: value };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(toFirestoreValue) } };
  if (typeof value === "object") return { mapValue: { fields: toFirestoreFields(value) } };
  return { stringValue: String(value) };
}

function toFirestoreFields(value) {
  return Object.fromEntries(Object.entries(value || {}).filter(([, item]) => item !== undefined).map(([key, item]) => [key, toFirestoreValue(item)]));
}

function fromFirestoreValue(value = {}) {
  if ("nullValue" in value) return null;
  if ("booleanValue" in value) return Boolean(value.booleanValue);
  if ("integerValue" in value) return Number(value.integerValue);
  if ("doubleValue" in value) return Number(value.doubleValue);
  if ("stringValue" in value) return value.stringValue;
  if ("timestampValue" in value) return value.timestampValue;
  if (value.arrayValue) return (value.arrayValue.values || []).map(fromFirestoreValue);
  if (value.mapValue) return fromFirestoreFields(value.mapValue.fields || {});
  return null;
}

function fromFirestoreFields(fields = {}) {
  return Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, fromFirestoreValue(value)]));
}

const safeSegment = value => encodeURIComponent(String(value || "").replace(/\//g, "_"));

export async function persistInterventionEvent({ userId, event, env = process.env, fetchImpl = globalThis.fetch } = {}) {
  if (!userId) return { status: "skipped", reason: "ANONYMOUS_USER" };
  const auth = await getAccessToken({ env, fetchImpl });
  if (!auth.ok) return { status: "skipped", reason: auth.reason };
  const eventId = `intervention__${Date.now()}__${Math.random().toString(36).slice(2, 10)}`;
  const url = `https://firestore.googleapis.com/v1/projects/${safeSegment(auth.projectId)}/databases/(default)/documents/users/${safeSegment(userId)}/learningEvents/${safeSegment(eventId)}`;
  const response = await fetchImpl(url, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${auth.token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ fields: toFirestoreFields({ ...event, eventId, userId }) })
  });
  if (!response.ok) return { status: "failed", reason: "FIRESTORE_WRITE_FAILED", httpStatus: response.status };
  return { status: "persisted", path: `users/${userId}/learningEvents/${eventId}`, eventId };
}

export async function readUserMasteryProfile({ userId, conceptId, env = process.env, fetchImpl = globalThis.fetch } = {}) {
  if (!userId || !conceptId) return { status: "missing", profile: null };
  const auth = await getAccessToken({ env, fetchImpl });
  if (!auth.ok) return { status: "skipped", reason: auth.reason, profile: null };
  const url = `https://firestore.googleapis.com/v1/projects/${safeSegment(auth.projectId)}/databases/(default)/documents/users/${safeSegment(userId)}/mastery/${safeSegment(conceptId)}`;
  const response = await fetchImpl(url, { headers: { Authorization: `Bearer ${auth.token}` } });
  if (response.status === 404) return { status: "missing", profile: null };
  if (!response.ok) return { status: "failed", reason: "FIRESTORE_READ_FAILED", httpStatus: response.status, profile: null };
  const document = await response.json();
  return { status: "found", profile: fromFirestoreFields(document.fields || {}) };
}

export async function persistMasteryTransition({ userId, event, profile, env = process.env, fetchImpl = globalThis.fetch } = {}) {
  if (!userId || !event?.eventId || !profile?.conceptId) return { status: "failed", reason: "INVALID_MASTERY_TRANSITION" };
  const auth = await getAccessToken({ env, fetchImpl });
  if (!auth.ok) return { status: "skipped", reason: auth.reason };
  const root = `projects/${auth.projectId}/databases/(default)/documents`;
  const eventName = `${root}/users/${userId}/learningEvents/${event.eventId}`;
  const masteryName = `${root}/users/${userId}/mastery/${profile.conceptId}`;
  const response = await fetchImpl(`https://firestore.googleapis.com/v1/projects/${safeSegment(auth.projectId)}/databases/(default)/documents:commit`, {
    method: "POST",
    headers: { Authorization: `Bearer ${auth.token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ writes: [
      { update: { name: eventName, fields: toFirestoreFields({ ...event, userId }) } },
      { update: { name: masteryName, fields: toFirestoreFields({ ...profile, userId }) } }
    ] })
  });
  if (!response.ok) return { status: "failed", reason: "FIRESTORE_COMMIT_FAILED", httpStatus: response.status };
  return { status: "persisted", eventPath: `users/${userId}/learningEvents/${event.eventId}`, masteryPath: `users/${userId}/mastery/${profile.conceptId}` };
}

export const __test = { toFirestoreValue, toFirestoreFields, fromFirestoreValue, fromFirestoreFields, readServiceAccount };
