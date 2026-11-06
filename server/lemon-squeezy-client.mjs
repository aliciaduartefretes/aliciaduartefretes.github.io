function ensureCheckoutUrl(value) {
  const url = new URL(String(value || ""));
  if (url.protocol !== "https:" || !(url.hostname === "lemonsqueezy.com" || url.hostname.endsWith(".lemonsqueezy.com"))) {
    throw new Error("INVALID_CHECKOUT_URL");
  }
  return url.toString();
}

export async function createLemonSqueezyCheckout({ config, plan, user, fetchImpl = globalThis.fetch }) {
  if (!config?.enabled || !plan || !user?.uid || !user?.email) throw new Error("BILLING_NOT_CONFIGURED");
  const redirectUrl = new URL("/", config.appUrl);
  redirectUrl.searchParams.set("billing", "success");
  redirectUrl.searchParams.set("plan", plan.planKey);
  if (plan.kind === "one_time") redirectUrl.searchParams.set("billingTest", "1");
  redirectUrl.hash = plan.kind === "one_time" ? "paidCourseTest" : "subscription";
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
  const response = await fetchImpl("https://api.lemonsqueezy.com/v1/checkouts", {
    method: "POST",
    headers: {
      Accept: "application/vnd.api+json",
      "Content-Type": "application/vnd.api+json",
      Authorization: `Bearer ${config.apiKey}`
    },
    body: JSON.stringify({
      data: {
        type: "checkouts",
        attributes: {
          test_mode: config.mode === "test",
          expires_at: expiresAt,
          product_options: {
            enabled_variants: [Number(plan.variantId)],
            redirect_url: redirectUrl.toString()
          },
          checkout_options: { embed: false, locale: "es" },
          checkout_data: {
            email: user.email,
            name: user.name || undefined,
            custom: { user_id: user.uid, plan_key: plan.planKey }
          }
        },
        relationships: {
          store: { data: { type: "stores", id: config.storeId } },
          variant: { data: { type: "variants", id: plan.variantId } }
        }
      }
    })
  });
  if (!response.ok) throw new Error(`LEMONSQUEEZY_CHECKOUT_HTTP_${response.status}`);
  const result = await response.json();
  const checkoutUrl = ensureCheckoutUrl(result?.data?.attributes?.url);
  return { checkoutUrl, expiresAt: result?.data?.attributes?.expires_at || expiresAt };
}

export const __test = { ensureCheckoutUrl };
