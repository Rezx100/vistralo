import { PLANS, planById, type BillingInterval, type PaidPlanId } from "./plans";
import { PRICE_KEYS, type BillingConfig, type PaddleMode, type PriceKey } from "./config";

export interface CheckoutRequest {
  plan: PaidPlanId;
  interval: BillingInterval;
  /** The Vistralo account the subscription belongs to; the webhook reads it back from custom_data. */
  userId?: string;
  email?: string;
  customerId?: string | null;
  theme: "light" | "dark";
  locale: string;
}
/** completed: Paddle took the payment. closed: the customer left. declined: the test checkout's failed card. */
export type CheckoutOutcome = "completed" | "closed" | "declined";
export type PriceLabels = Partial<Record<PriceKey, string>>;

export interface PaddleClient {
  readonly mode: "mock" | "sandbox";
  /** A formatted price per plan and period, for example "$12.00". */
  prices(): Promise<PriceLabels>;
  checkout(request: CheckoutRequest): Promise<CheckoutOutcome>;
}

/** Stands in for Paddle wherever there is no sandbox token. It never loads a script or makes a request. */
export function createMockPaddle(
  present: (request: CheckoutRequest) => Promise<CheckoutOutcome>,
): PaddleClient {
  return {
    mode: "mock",
    async prices() {
      const labels: PriceLabels = {};
      for (const key of PRICE_KEYS) {
        const [plan, interval] = key.split("_") as [PaidPlanId, BillingInterval];
        labels[key] = `$${planById(plan).testPrice[interval]}`;
      }
      return labels;
    },
    checkout: present,
  };
}

export const PADDLE_JS = "https://cdn.paddle.com/paddle/v2/paddle.js";

interface PaddleEvent {
  name?: string;
}
type Listener = (event: PaddleEvent) => void;

/** Paddle's sandbox checkout. The script is fetched the first time a price or a checkout is needed. */
export function createSandboxPaddle(config: BillingConfig): PaddleClient {
  let loading: Promise<any> | undefined;
  let listener: Listener | undefined;
  const load = () =>
    (loading ??= new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = PADDLE_JS;
      script.async = true;
      script.onload = () => {
        const Paddle = (window as any).Paddle;
        if (!Paddle) return reject(new Error("Paddle's checkout did not start. Reload and try again."));
        Paddle.Environment.set("sandbox");
        Paddle.Initialize({
          token: config.token,
          eventCallback: (event: PaddleEvent) => listener?.(event),
        });
        resolve(Paddle);
      };
      script.onerror = () => {
        loading = undefined;
        script.remove();
        reject(new Error("Paddle's checkout could not be loaded. Check your connection and try again."));
      };
      document.head.append(script);
    }));
  return {
    mode: "sandbox",
    async prices() {
      const Paddle = await load();
      const result = await Paddle.PricePreview({
        items: PRICE_KEYS.map((key) => ({ priceId: config.prices[key], quantity: 1 })),
      });
      const labels: PriceLabels = {};
      for (const item of result?.data?.details?.lineItems || []) {
        const key = PRICE_KEYS.find((name) => config.prices[name] === item?.price?.id);
        const label = item?.formattedTotals?.total || item?.formattedTotals?.subtotal;
        if (key && typeof label === "string") labels[key] = label;
      }
      return labels;
    },
    async checkout(request) {
      const Paddle = await load();
      const priceId = config.prices[`${request.plan}_${request.interval}`];
      if (!priceId) throw new Error("That plan is not available yet.");
      return new Promise<CheckoutOutcome>((resolve) => {
        let completed = false;
        listener = (event) => {
          if (event.name === "checkout.completed") {
            completed = true;
            resolve("completed");
          } else if (event.name === "checkout.closed") resolve(completed ? "completed" : "closed");
        };
        Paddle.Checkout.open({
          items: [{ priceId, quantity: 1 }],
          ...(request.customerId
            ? { customer: { id: request.customerId } }
            : request.email
              ? { customer: { email: request.email } }
              : {}),
          ...(request.userId ? { customData: { vistralo_user_id: request.userId } } : {}),
          settings: {
            displayMode: "overlay",
            theme: request.theme,
            locale: request.locale,
            allowLogout: false,
          },
        });
      });
    },
  };
}

export function createPaddleClient(
  mode: PaddleMode,
  config: BillingConfig,
  present: (request: CheckoutRequest) => Promise<CheckoutOutcome>,
): PaddleClient | null {
  if (mode === "sandbox") return createSandboxPaddle(config);
  if (mode === "mock") return createMockPaddle(present);
  return null;
}

export const paidPlans = PLANS.filter((plan) => plan.id !== "free");
