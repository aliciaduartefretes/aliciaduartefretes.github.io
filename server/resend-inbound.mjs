import { createHmac, timingSafeEqual } from "node:crypto";

const cleanText = (value, maximum = 5_000) => String(value ?? "")
  .replace(/\u0000/g, "")
  .replace(/\r\n/g, "\n")
  .trim()
  .slice(0, maximum);

const headerValue = (headers, name) => {
  if (!headers) return "";
  if (typeof headers.get === "function") return String(headers.get(name) || "");
  const target = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (String(key).toLowerCase() === target) return String(Array.isArray(value) ? value[0] : value || "");
  }
  return "";
};

function decodedWebhookSecret(secret) {
  const value = cleanText(secret, 500).replace(/^whsec_/, "");
  if (!value) return null;
  try { return Buffer.from(value, "base64"); }
  catch { return null; }
}

export function verifyResendWebhook(raw, headers, secret, { now = Date.now(), toleranceSeconds = 300 } = {}) {
  if (!Buffer.isBuffer(raw)) return false;
  const webhookId = headerValue(headers, "svix-id");
  const timestamp = headerValue(headers, "svix-timestamp");
  const signatures = headerValue(headers, "svix-signature");
  const key = decodedWebhookSecret(secret);
  const timestampNumber = Number(timestamp);
  if (!webhookId || !Number.isFinite(timestampNumber) || !signatures || !key?.length) return false;
  if (Math.abs(Math.floor(now / 1000) - timestampNumber) > toleranceSeconds) return false;
  const signed = `${webhookId}.${timestamp}.${raw.toString("utf8")}`;
  const expected = Buffer.from(createHmac("sha256", key).update(signed).digest("base64"), "utf8");
  return signatures.split(/\s+/).some(candidate => {
    const [version, signature] = candidate.split(",", 2);
    if (version !== "v1" || !signature) return false;
    const received = Buffer.from(signature, "utf8");
    return received.length === expected.length && timingSafeEqual(received, expected);
  });
}

const firstAddress = value => {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (candidate && typeof candidate === "object") return cleanText(candidate.email || candidate.address, 320).toLowerCase();
  const text = cleanText(candidate, 320);
  const bracketed = text.match(/<([^<>\s]+@[^<>\s]+)>/);
  return cleanText(bracketed?.[1] || text, 320).toLowerCase();
};

const stripHtml = value => cleanText(String(value || "")
  .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
  .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
  .replace(/<br\s*\/?>/gi, "\n")
  .replace(/<\/p>/gi, "\n")
  .replace(/<[^>]+>/g, " ")
  .replace(/&nbsp;/gi, " ")
  .replace(/&amp;/gi, "&")
  .replace(/&lt;/gi, "<")
  .replace(/&gt;/gi, ">")
  .replace(/&quot;/gi, '"')
  .replace(/&#39;/gi, "'")
  .replace(/[ \t]+/g, " ")
  .replace(/\s+([.,;:!?])/g, "$1")
  .replace(/\n{3,}/g, "\n\n"), 5_000);

export async function fetchResendReceivedEmail(emailId, {
  env = process.env,
  fetchImpl = globalThis.fetch
} = {}) {
  const id = cleanText(emailId, 200);
  const apiKey = cleanText(env.RESEND_API_KEY, 2_048);
  if (!id || !apiKey || typeof fetchImpl !== "function") return null;
  try {
    const response = await fetchImpl(`https://api.resend.com/emails/receiving/${encodeURIComponent(id)}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" }
    });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

export function normalizeReceivedEmail(payload, fullEmail = null) {
  const data = payload?.data && typeof payload.data === "object" ? payload.data : {};
  const full = fullEmail && typeof fullEmail === "object" ? fullEmail : {};
  const providerId = cleanText(full.id || data.email_id || data.id, 200);
  const from = firstAddress(full.from || data.from);
  const toValue = full.to || data.to;
  const to = (Array.isArray(toValue) ? toValue : [toValue]).map(firstAddress).filter(Boolean).slice(0, 20);
  const subject = cleanText(full.subject || data.subject || "Respuesta sin asunto", 240);
  const text = cleanText(full.text, 5_000) || stripHtml(full.html) || cleanText(data.text, 5_000) || stripHtml(data.html);
  const messageId = cleanText(full.message_id || data.message_id, 300);
  return { providerId, messageId, from, to, subject, text: text || "Respuesta recibida sin contenido de texto." };
}

export function crmInterestIdFromRecipients(recipients = []) {
  for (const address of recipients) {
    const match = String(address || "").toLowerCase().match(/^crm-([a-f0-9]{48})@/);
    if (match) return match[1];
  }
  return "";
}

export const __test = { headerValue, decodedWebhookSecret, firstAddress, stripHtml };
