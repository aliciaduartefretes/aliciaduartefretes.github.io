import { createVerify } from "node:crypto";

const CERTIFICATES_URL = "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com";
let certificateCache = { expiresAt: 0, certificates: null };

const decodePart = value => JSON.parse(Buffer.from(String(value || ""), "base64url").toString("utf8"));

function projectIdFromEnvironment(env = process.env) {
  try {
    const account = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON || "{}");
    return String(account.project_id || "").trim();
  } catch {
    return "";
  }
}

function maxAgeMilliseconds(headerValue) {
  const match = String(headerValue || "").match(/(?:^|,)\s*max-age=(\d+)/i);
  return match ? Number(match[1]) * 1000 : 60 * 60 * 1000;
}

async function getCertificates(fetchImpl, now) {
  if (certificateCache.certificates && certificateCache.expiresAt > now + 30_000) return certificateCache.certificates;
  const response = await fetchImpl(CERTIFICATES_URL, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`FIREBASE_CERTIFICATES_HTTP_${response.status}`);
  const certificates = await response.json();
  certificateCache = {
    certificates,
    expiresAt: now + maxAgeMilliseconds(response.headers?.get?.("cache-control"))
  };
  return certificates;
}

export async function verifyFirebaseIdToken(idToken, {
  env = process.env,
  fetchImpl = globalThis.fetch,
  now = Date.now()
} = {}) {
  const token = String(idToken || "").trim(), projectId = projectIdFromEnvironment(env);
  if (!token || !projectId) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const header = decodePart(parts[0]), payload = decodePart(parts[1]);
    if (header.alg !== "RS256" || !header.kid) return null;
    const certificates = await getCertificates(fetchImpl, now), certificate = certificates?.[header.kid];
    if (!certificate) return null;
    const verifier = createVerify("RSA-SHA256");
    verifier.update(`${parts[0]}.${parts[1]}`); verifier.end();
    if (!verifier.verify(certificate, Buffer.from(parts[2], "base64url"))) return null;
    const nowSeconds = Math.floor(now / 1000), uid = String(payload.sub || "");
    if (payload.aud !== projectId || payload.iss !== `https://securetoken.google.com/${projectId}`) return null;
    if (!uid || uid.length > 128 || Number(payload.exp) <= nowSeconds || Number(payload.iat) > nowSeconds + 30) return null;
    if (payload.auth_time != null && Number(payload.auth_time) > nowSeconds + 30) return null;
    return { uid, isAnonymous: payload.firebase?.sign_in_provider === "anonymous" };
  } catch {
    return null;
  }
}

export const __test = {
  projectIdFromEnvironment,
  maxAgeMilliseconds,
  resetCertificateCache: () => { certificateCache = { expiresAt: 0, certificates: null }; }
};
