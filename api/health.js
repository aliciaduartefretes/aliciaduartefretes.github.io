const RESPONSE_HEADERS = {
  "Cache-Control": "no-store",
  "Content-Type": "application/json; charset=utf-8",
  "X-Content-Type-Options": "nosniff",
};

export default {
  async fetch(request) {
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response(
        JSON.stringify({
          ok: false,
          error: "method_not_allowed",
        }),
        {
          status: 405,
          headers: {
            ...RESPONSE_HEADERS,
            Allow: "GET, HEAD",
          },
        },
      );
    }

    const payload = {
      ok: true,
      service: "guarani-con-ali-api",
      version: "health-v1",
      message: "Servidor activo",
      timestamp: new Date().toISOString(),
    };

    return new Response(
      request.method === "HEAD" ? null : JSON.stringify(payload),
      {
        status: 200,
        headers: RESPONSE_HEADERS,
      },
    );
  },
};
