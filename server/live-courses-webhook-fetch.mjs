import { createLiveCoursesHandler } from "./live-courses-handler.mjs";

function nodeResponseAdapter() {
  let status = 200;
  let body = "";
  const headers = new Headers();
  return {
    response: {
      get statusCode() { return status; },
      set statusCode(value) { status = Number(value) || 500; },
      setHeader(name, value) { headers.set(name, String(value)); },
      end(value = "") { body = String(value ?? ""); }
    },
    result() { return new Response(body, { status, headers }); }
  };
}

export function createLiveCoursesWebhookFetchHandler({ handler = createLiveCoursesHandler() } = {}) {
  return async function liveCoursesWebhookFetch(request) {
    const incomingUrl = new URL(request.url);
    incomingUrl.searchParams.set("operation", "live-courses");
    incomingUrl.searchParams.set("action", "email-inbound");
    const adaptedRequest = {
      url: incomingUrl.toString(),
      method: request.method,
      headers: request.headers,
      arrayBuffer: () => request.arrayBuffer()
    };
    const adapter = nodeResponseAdapter();
    await handler(adaptedRequest, adapter.response);
    return adapter.result();
  };
}

