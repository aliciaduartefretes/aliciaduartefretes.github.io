const RESPONSE_HEADERS = {
  "Cache-Control": "no-store",
  "Content-Type": "application/json; charset=utf-8",
  "X-Content-Type-Options": "nosniff",
};

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

    const configured = Boolean(process.env.OPENAI_API_KEY?.trim());

    const payload = {
      ok: configured,
      service: "guarani-con-ali-ai",
      configured,
      message: configured
        ? "OpenAI está configurado en el servidor"
        : "Falta configurar OPENAI_API_KEY en Vercel",
    };

    return new Response(
      request.method === "HEAD" ? null : JSON.stringify(payload),
      {
        status: configured ? 200 : 503,
        headers: RESPONSE_HEADERS,
      },
    );
  },
};
