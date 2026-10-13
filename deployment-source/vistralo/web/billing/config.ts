import type { AppMode } from "../contracts";
import type { BillingInterval, PaidPlanId } from "./plans";

// Set by scripts/build-web.cjs from the build environment. All of these are public values:
// a Paddle client-side token is made to ship in the browser, like the Supabase publishable key.
// The Paddle API key and webhook secret are Supabase function secrets and never reach this file.
declare const VISTRALO_BILLING: string;
declare const VISTRALO_SIGNUP: string;
declare const VISTRALO_PADDLE_CLIENT_TOKEN: string;
declare const VISTRALO_PADDLE_ENV: string;
declare const VISTRALO_PADDLE_PRICES: Record<string, string>;
declare const VISTRALO_LEGAL_URL: string;

export type PriceKey = `${PaidPlanId}_${BillingInterval}`;
export interface BillingConfig {
  /** The feature flag. Off unless the build sets VISTRALO_BILLING=on. */
  enabled: boolean;
  /** Shows "Create account" on the sign-in page. Off unless the build sets VISTRALO_SIGNUP=on. */
  signup: boolean;
  token: string;
  environment: string;
  prices: Partial<Record<PriceKey, string>>;
  /** Base address of the published terms, privacy notice and refund policy; empty until they exist. */
  legalUrl: string;
}

export const PRICE_KEYS: PriceKey[] = ["pro_month", "pro_year", "studio_month", "studio_year"];

export const billingConfig: BillingConfig = {
  enabled: typeof VISTRALO_BILLING !== "undefined" && VISTRALO_BILLING === "on",
  signup: typeof VISTRALO_SIGNUP !== "undefined" && VISTRALO_SIGNUP === "on",
  token: typeof VISTRALO_PADDLE_CLIENT_TOKEN !== "undefined" ? VISTRALO_PADDLE_CLIENT_TOKEN : "",
  environment: typeof VISTRALO_PADDLE_ENV !== "undefined" ? VISTRALO_PADDLE_ENV : "",
  prices: typeof VISTRALO_PADDLE_PRICES !== "undefined" ? VISTRALO_PADDLE_PRICES : {},
  legalUrl: typeof VISTRALO_LEGAL_URL !== "undefined" ? VISTRALO_LEGAL_URL : "",
};

/**
 * off: the flag is off and nothing about plans is shown.
 * mock: the demo workspace, where a test checkout stands in for Paddle and nothing leaves the browser.
 * unconfigured: a cloud workspace whose build has no sandbox token or price IDs yet; plans show, checkout does not.
 * sandbox: Paddle's sandbox checkout. There is no live mode in this build.
 */
export type PaddleMode = "off" | "mock" | "unconfigured" | "sandbox";

export function paddleMode(config: BillingConfig, appMode: AppMode): PaddleMode {
  if (!config.enabled) return "off";
  if (appMode === "demo") return "mock";
  const ready =
    config.environment === "sandbox" &&
    config.token.startsWith("test_") &&
    PRICE_KEYS.every((key) => /^pri_[a-z0-9]+$/.test(config.prices[key] || ""));
  return ready ? "sandbox" : "unconfigured";
}
