const DEFAULT_ORIGINS = Object.freeze([
  "https://www.idiomaguarani.com.py",
  "https://idiomaguarani.com.py"
]);

export function sendJson(response, status, payload, extraHeaders = {}) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "no-referrer");
  for (const [name, value] of Object.entries(extraHeaders)) response.setHeader(name, value);
  response.end(JSON.stringify(payload));
}

export function requestOriginAllowed(request, env = process.env) {
  const origin = String(request.headers?.origin || "").trim();
  if (!origin) return false;
  const configured = String(env.NALVI_ALLOWED_ORIGINS || "")
    .split(",")
    .map(item => item.trim())
    .filter(Boolean);
  const allowed = new Set([...DEFAULT_ORIGINS, ...configured]);
  if (env.NODE_ENV !== "production") {
    allowed.add("http://127.0.0.1:4174");
    allowed.add("http://localhost:4174");
  }
  return allowed.has(origin);
}

export async function jsonBody(request, maximumBytes = 4_096) {
  if (request.body && typeof request.body === "object" && !Buffer.isBuffer(request.body)) return request.body;
  let body = typeof request.body === "string" ? request.body : "";
  if (!body && !request.readableEnded) {
    for await (const chunk of request) {
      body += chunk;
      if (Buffer.byteLength(body) > maximumBytes) throw new RangeError("PAYLOAD_TOO_LARGE");
    }
  }
  if (Buffer.byteLength(body) > maximumBytes) throw new RangeError("PAYLOAD_TOO_LARGE");
  return body ? JSON.parse(body) : {};
}

export async function rawBody(request, maximumBytes = 524_288) {
  if (Buffer.isBuffer(request.body)) {
    if (request.body.length > maximumBytes) throw new RangeError("PAYLOAD_TOO_LARGE");
    return request.body;
  }
  if (typeof request.body === "string") {
    const buffer = Buffer.from(request.body);
    if (buffer.length > maximumBytes) throw new RangeError("PAYLOAD_TOO_LARGE");
    return buffer;
  }
  if (request.body && typeof request.body === "object") throw new TypeError("RAW_BODY_UNAVAILABLE");
  const chunks = [];
  let length = 0;
  for await (const chunk of request) {
    const buffer = Buffer.from(chunk);
    length += buffer.length;
    if (length > maximumBytes) throw new RangeError("PAYLOAD_TOO_LARGE");
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
}

export function bearerToken(request) {
  const match = String(request.headers?.authorization || "").match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : "";
}
