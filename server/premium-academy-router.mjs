export function createPremiumAcademyRouter({ academyHandler, muxHandler, resourceHandler }) {
  if (typeof academyHandler !== "function" || typeof muxHandler !== "function") {
    throw new TypeError("PREMIUM_ACADEMY_HANDLERS_REQUIRED");
  }
  return function premiumAcademyRouter(request, response) {
    let operation = "";
    try { operation = new URL(request.url || "/api/premium-academy", "https://www.idiomaguarani.com.py").searchParams.get("operation") || ""; }
    catch { operation = ""; }
    if (operation.startsWith("mux-")) return muxHandler(request, response);
    if (operation.startsWith("resource") && typeof resourceHandler === "function") return resourceHandler(request, response);
    return academyHandler(request, response);
  };
}
