// Lets a signed-in customer manage their own Paddle subscription: open the customer portal,
// change plan, resume a pause, or undo a scheduled change. The Paddle API key never leaves here.
// Secrets: PADDLE_API_KEY (sandbox), PADDLE_PRICE_*, VISTRALO_APP_ORIGIN (see docs/BILLING.md).
import { createClient } from "npm:@supabase/supabase-js@2.99.1";
import { BillingError, billingAction, parseBillingRequest, priceMapFromEnv } from "../_shared/paddle.ts";

const client = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const cors = {
  "Access-Control-Allow-Origin": Deno.env.get("VISTRALO_APP_ORIGIN") || "https://app.vistralo.com",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  Vary: "Origin",
};
const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return reply(405, { error: "Method not allowed" });
  try {
    const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    const { data: auth, error: authError } = await client.auth.getUser(token);
    if (authError || !auth.user) throw new BillingError("Sign in to manage your plan.", 401);
    const request = parseBillingRequest(await req.json().catch(() => null));
    // The subscription is looked up by the verified user, never taken from the request.
    const { data: rows, error } = await client
      .from("vistralo_billing_subscriptions")
      .select("paddle_subscription_id,paddle_customer_id,plan_id,status,billing_interval,scheduled_action")
      .eq("user_id", auth.user.id)
      .neq("status", "canceled")
      .order("occurred_at", { ascending: false })
      .limit(1);
    if (error) throw new Error(error.message);
    const result = await billingAction(request, rows?.[0] || null, {
      fetch,
      apiKey: Deno.env.get("PADDLE_API_KEY") || "",
      prices: priceMapFromEnv((name) => Deno.env.get(name)),
    });
    return reply(200, result);
  } catch (error) {
    if (error instanceof BillingError) return reply(error.status, { error: error.message });
    console.error("Billing action failed", (error as Error).message);
    return reply(500, { error: "Something went wrong. Try again in a moment." });
  }
});
