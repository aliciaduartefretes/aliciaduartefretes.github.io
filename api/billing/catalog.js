import { publicBillingCatalog, readBillingConfig } from "../../server/billing-config.mjs";
import { sendJson } from "../../server/billing-http.mjs";

export function createBillingCatalogHandler({ configReader = readBillingConfig } = {}) {
  return async function handler(request, response) {
    if (request.method !== "GET") {
      response.setHeader("Allow", "GET");
      return sendJson(response, 405, { ok: false, reason: "METHOD_NOT_ALLOWED" });
    }
    try {
      const config = configReader();
      return sendJson(response, 200, {
        ok: true,
        enabled: config.enabled,
        environment: config.enabled ? config.mode : "disabled",
        plans: config.enabled ? publicBillingCatalog(config) : []
      });
    } catch {
      return sendJson(response, 200, { ok: true, enabled: false, environment: "disabled", plans: [] });
    }
  };
}

export default createBillingCatalogHandler();
