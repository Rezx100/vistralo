// Paddle Billing logic shared by the webhook and billing functions.
// Nothing here touches Deno or the network directly, so tests/billing.test.cjs runs it in Node.

export type PlanId = "pro" | "studio";
export type Interval = "month" | "year";
export type PriceMap = Record<string, { plan: PlanId; interval: Interval }>;

/** Function secret names for each plan price. The web build reads the same IDs as VISTRALO_PADDLE_PRICE_*. */
export const PRICE_SECRETS: Array<[string, PlanId, Interval]> = [
  ["PADDLE_PRICE_PRO_MONTH", "pro", "month"],
  ["PADDLE_PRICE_PRO_YEAR", "pro", "year"],
  ["PADDLE_PRICE_STUDIO_MONTH", "studio", "month"],
  ["PADDLE_PRICE_STUDIO_YEAR", "studio", "year"],
];

export function priceMapFromEnv(read: (name: string) => string | undefined): PriceMap {
  const map: PriceMap = {};
  for (const [name, plan, interval] of PRICE_SECRETS) {
    const id = (read(name) || "").trim();
    if (/^pri_[a-z0-9]+$/.test(id)) map[id] = { plan, interval };
  }
  return map;
}

const hex = (bytes: ArrayBuffer) =>
  Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, "0")).join("");

/** Compares every character whatever the input, so timing does not reveal where two strings differ. */
function sameString(a: string, b: string) {
  let diff = a.length ^ b.length;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i % (b.length || 1));
  return diff === 0;
}

export type SignatureCheck = { ok: true } | { ok: false; reason: string };

/**
 * Paddle-Signature is "ts=<unix seconds>;h1=<hex>". The signed text is the timestamp, a colon
 * and the request body exactly as received. More than one h1 can appear while a secret rotates.
 */
export async function verifyPaddleSignature(
  header: string | null,
  rawBody: string,
  secret: string,
  nowSeconds: number,
  toleranceSeconds = 5,
): Promise<SignatureCheck> {
  if (!secret) return { ok: false, reason: "The webhook secret is not configured" };
  if (!header) return { ok: false, reason: "Missing Paddle-Signature header" };
  let ts = "";
  const signatures: string[] = [];
  for (const part of header.split(";")) {
    const at = part.indexOf("=");
    if (at < 1) continue;
    const key = part.slice(0, at).trim(),
      value = part.slice(at + 1).trim();
    if (key === "ts") ts = value;
    else if (key === "h1") signatures.push(value.toLowerCase());
  }
  if (!/^\d{1,12}$/.test(ts) || !signatures.length)
    return { ok: false, reason: "Malformed Paddle-Signature header" };
  if (Math.abs(nowSeconds - Number(ts)) > toleranceSeconds)
    return { ok: false, reason: "Signature timestamp is outside the allowed window" };
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const expected = hex(await crypto.subtle.sign("HMAC", key, encoder.encode(`${ts}:${rawBody}`)));
  let matched = false;
  for (const candidate of signatures) if (sameString(candidate, expected)) matched = true;
  return matched ? { ok: true } : { ok: false, reason: "Signature does not match" };
}

export interface PaddleEvent {
  eventId: string;
  eventType: string;
  occurredAt: string;
  data: Record<string, any>;
}

/** Call only after the signature has been verified. */
export function readEvent(rawBody: string): PaddleEvent {
  let body: any;
  try {
    body = JSON.parse(rawBody);
  } catch {
    throw new Error("Webhook body is not JSON");
  }
  const { event_id, event_type, occurred_at, data } = body || {};
  if (
    typeof event_id !== "string" ||
    typeof event_type !== "string" ||
    !Number.isFinite(Date.parse(occurred_at)) ||
    !data ||
    typeof data !== "object"
  )
    throw new Error("Webhook body is not a Paddle notification");
  return { eventId: event_id, eventType: event_type, occurredAt: occurred_at, data };
}

/** The subscription's status field carries the state; these events are how it reaches us. */
export const SUBSCRIPTION_EVENTS = new Set([
  "subscription.created",
  "subscription.activated",
  "subscription.trialing",
  "subscription.updated",
  "subscription.past_due",
  "subscription.paused",
  "subscription.resumed",
  "subscription.canceled",
]);
export const PAYMENT_EVENTS: Record<string, "completed" | "failed"> = {
  "transaction.completed": "completed",
  "transaction.payment_failed": "failed",
};
const STATUSES = new Set(["trialing", "active", "past_due", "paused", "canceled"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const time = (value: unknown) =>
  typeof value === "string" && Number.isFinite(Date.parse(value)) ? value : null;

/** The argument for public.vistralo_apply_paddle_subscription. */
export function subscriptionRecord(event: PaddleEvent, prices: PriceMap) {
  const s = event.data;
  if (typeof s.id !== "string" || !/^sub_[a-z0-9]+$/.test(s.id))
    throw new Error("Subscription event has no subscription ID");
  if (typeof s.customer_id !== "string" || !/^ctm_[a-z0-9]+$/.test(s.customer_id))
    throw new Error("Subscription event has no customer ID");
  if (!STATUSES.has(s.status)) throw new Error(`Unknown subscription status: ${String(s.status).slice(0, 40)}`);
  const priceIds: string[] = (Array.isArray(s.items) ? s.items : [])
    .map((item: any) => item?.price?.id)
    .filter((id: unknown) => typeof id === "string");
  // A price this app does not sell grants no plan; the row is still stored so support can see it.
  const known = priceIds.find((id) => prices[id]);
  const claimed = s.custom_data?.vistralo_user_id;
  const change = s.scheduled_change;
  return {
    subscriptionId: s.id as string,
    customerId: s.customer_id as string,
    userId: typeof claimed === "string" && UUID.test(claimed) ? claimed : null,
    planId: known ? prices[known].plan : null,
    priceId: known || priceIds[0] || null,
    status: s.status as string,
    interval: ["day", "week", "month", "year"].includes(s.billing_cycle?.interval)
      ? (s.billing_cycle.interval as string)
      : null,
    periodEnd: time(s.current_billing_period?.ends_at),
    nextBilledAt: time(s.next_billed_at),
    scheduledAction: ["cancel", "pause", "resume"].includes(change?.action) ? (change.action as string) : null,
    scheduledAt: time(change?.effective_at),
    resumeAt: time(change?.resume_at),
    pausedAt: time(s.paused_at),
    canceledAt: time(s.canceled_at),
    occurredAt: event.occurredAt,
  };
}

// ---------------------------------------------------------------------------
// Paddle API (sandbox only)

export const SANDBOX_API = "https://sandbox-api.paddle.com";

export interface StoredSubscription {
  paddle_subscription_id: string;
  paddle_customer_id: string;
  plan_id: string | null;
  status: string;
  billing_interval: string | null;
  scheduled_action: string | null;
}
export type BillingRequest =
  | { action: "portal"; intent?: "overview" | "payment" | "cancel" }
  | { action: "change_plan"; plan: PlanId; interval: Interval }
  | { action: "resume" }
  | { action: "keep" };

export class BillingError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

/** This build talks to the sandbox only: a live key is refused before any request is made. */
export function assertSandboxKey(apiKey: string) {
  if (!apiKey) throw new BillingError("Payments are not connected yet.", 503);
  if (!apiKey.includes("_sdbx"))
    throw new BillingError("Only a Paddle sandbox API key may be used with this build.", 503);
}

async function paddle(
  fetcher: typeof fetch,
  apiKey: string,
  method: string,
  path: string,
  body?: unknown,
): Promise<any> {
  assertSandboxKey(apiKey);
  const response = await fetcher(SANDBOX_API + path, {
    method,
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok)
    throw new BillingError(
      result?.error?.detail || `Paddle could not complete this request (HTTP ${response.status}).`,
      502,
    );
  return result?.data;
}

const paddlePage = (value: unknown) => {
  try {
    const url = new URL(String(value));
    return url.protocol === "https:" && (url.hostname === "paddle.com" || url.hostname.endsWith(".paddle.com"))
      ? url.href
      : null;
  } catch {
    return null;
  }
};

/** What a signed-in customer can do to their own subscription. State comes back through the webhook. */
export async function billingAction(
  request: BillingRequest,
  subscription: StoredSubscription | null,
  deps: { fetch: typeof fetch; apiKey: string; prices: PriceMap },
): Promise<{ ok: true; url?: string }> {
  if (!subscription) throw new BillingError("This account has no subscription yet.", 404);
  const id = subscription.paddle_subscription_id;
  if (request.action === "portal") {
    const data = await paddle(
      deps.fetch,
      deps.apiKey,
      "POST",
      `/customers/${subscription.paddle_customer_id}/portal-sessions`,
      { subscription_ids: [id] },
    );
    const links = (data?.urls?.subscriptions || []).find((item: any) => item?.id === id) || {};
    const url = paddlePage(
      request.intent === "payment"
        ? links.update_subscription_payment_method
        : request.intent === "cancel"
          ? links.cancel_subscription
          : data?.urls?.general?.overview,
    );
    if (!url) throw new BillingError("Paddle did not return a billing page for this subscription.", 502);
    return { ok: true, url };
  }
  if (request.action === "change_plan") {
    if (!["active", "trialing"].includes(subscription.status))
      throw new BillingError("Plans can only be changed on an active subscription.", 409);
    const priceId = Object.keys(deps.prices).find(
      (price) => deps.prices[price].plan === request.plan && deps.prices[price].interval === request.interval,
    );
    if (!priceId) throw new BillingError("That plan is not available.", 400);
    if (subscription.plan_id === request.plan && subscription.billing_interval === request.interval)
      throw new BillingError("You are already on that plan.", 409);
    await paddle(deps.fetch, deps.apiKey, "PATCH", `/subscriptions/${id}`, {
      items: [{ price_id: priceId, quantity: 1 }],
      proration_billing_mode: "prorated_immediately",
    });
    return { ok: true };
  }
  if (request.action === "resume") {
    if (subscription.status !== "paused") throw new BillingError("This subscription is not paused.", 409);
    await paddle(deps.fetch, deps.apiKey, "POST", `/subscriptions/${id}/resume`, {
      effective_from: "immediately",
    });
    return { ok: true };
  }
  if (request.action === "keep") {
    if (!subscription.scheduled_action) throw new BillingError("Nothing is scheduled to change.", 409);
    await paddle(deps.fetch, deps.apiKey, "PATCH", `/subscriptions/${id}`, { scheduled_change: null });
    return { ok: true };
  }
  throw new BillingError("Unknown billing action.", 400);
}

export function parseBillingRequest(body: any): BillingRequest {
  const action = body?.action;
  if (action === "portal") {
    const intent = ["overview", "payment", "cancel"].includes(body.intent) ? body.intent : "overview";
    return { action, intent };
  }
  if (action === "change_plan") {
    if (!["pro", "studio"].includes(body.plan) || !["month", "year"].includes(body.interval))
      throw new BillingError("Choose a plan and a billing period.", 400);
    return { action, plan: body.plan, interval: body.interval };
  }
  if (action === "resume" || action === "keep") return { action };
  throw new BillingError("Unknown billing action.", 400);
}
