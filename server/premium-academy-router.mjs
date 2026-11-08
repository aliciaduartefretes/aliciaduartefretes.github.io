export function createPremiumAcademyRouter({ academyHandler, muxHandler }) {
  if (typeof academyHandler !== "function" || typeof muxHandler !== "function") {
    throw new TypeError("PREMIUM_ACADEMY_HANDLERS_REQUIRED");
  }
  return function premiumAcademyRouter(request, response) {
    let operation = "";
    try { operation = new URL(request.url || "/api/premium-academy", "https://www.idiomaguarani.com.py").searchParams.get("operation") || ""; }
    catch { operation = ""; }
    return operation.startsWith("mux-") ? muxHandler(request, response) : academyHandler(request, response);
  };
}
