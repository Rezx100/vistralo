// Receives Paddle Billing webhooks. Deploy with --no-verify-jwt: Paddle does not send a
// Supabase token, so the Paddle-Signature header is the only thing that authenticates a request.
// Secrets: PADDLE_WEBHOOK_SECRET, PADDLE_PRICE_* (see docs/BILLING.md).
import { createClient } from "npm:@supabase/supabase-js@2.99.1";
import {
  PAYMENT_EVENTS,
  SUBSCRIPTION_EVENTS,
  priceMapFromEnv,
  readEvent,
  subscriptionRecord,
  verifyPaddleSignature,
} from "../_shared/paddle.ts";

const client = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const reply = (status: number, message: string) =>
  new Response(JSON.stringify({ message }), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
const unwrap = <T>(result: { data: T; error: { message: string } | null }) => {
  if (result.error) throw new Error(result.error.message);
  return result.data;
};

Deno.serve(async (req) => {
  if (req.method !== "POST") return reply(405, "Method not allowed");
  const secret = Deno.env.get("PADDLE_WEBHOOK_SECRET") || "";
  if (!secret) return reply(503, "Webhook secret is not configured");
  // The signature covers the exact bytes Paddle sent, so read the text before parsing anything.
  const raw = await req.text();
  const tolerance = Number(Deno.env.get("PADDLE_WEBHOOK_TOLERANCE_SECONDS")) || 5;
  const check = await verifyPaddleSignature(
    req.headers.get("Paddle-Signature"),
    raw,
    secret,
    Math.floor(Date.now() / 1000),
    tolerance,
  );
  if (!check.ok) return reply(401, check.reason);

  let event;
  try {
    event = readEvent(raw);
  } catch (error) {
    return reply(400, (error as Error).message);
  }
  try {
    const fresh = unwrap(
      await client.rpc("vistralo_begin_paddle_event", {
        p_event_id: event.eventId,
        p_event_type: event.eventType,
        p_occurred_at: event.occurredAt,
      }),
    );
    if (!fresh) return reply(200, "Already processed");
    let outcome = "ignored";
    if (SUBSCRIPTION_EVENTS.has(event.eventType)) {
      const record = subscriptionRecord(event, priceMapFromEnv((name) => Deno.env.get(name)));
      outcome = unwrap(await client.rpc("vistralo_apply_paddle_subscription", { p: record }));
    } else if (PAYMENT_EVENTS[event.eventType] && typeof event.data.subscription_id === "string") {
      outcome = unwrap(
        await client.rpc("vistralo_apply_paddle_payment", {
          p_subscription_id: event.data.subscription_id,
          p_status: PAYMENT_EVENTS[event.eventType],
          p_occurred_at: event.occurredAt,
        }),
      );
    }
    unwrap(await client.rpc("vistralo_finish_paddle_event", { p_event_id: event.eventId, p_outcome: outcome }));
    return reply(200, outcome);
  } catch (error) {
    // Not marked processed, so Paddle's retry runs it again.
    console.error("Paddle webhook failed", event.eventId, event.eventType, (error as Error).message);
    return reply(500, "Could not process this event");
  }
});
