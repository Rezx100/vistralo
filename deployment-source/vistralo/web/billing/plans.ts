// Plans, limits and the wording for each billing state. No React, no network: the same
// functions back the cloud adapter, the demo adapter and tests/billing.test.cjs.

export type PlanId = "free" | "pro" | "studio";
export type PaidPlanId = Exclude<PlanId, "free">;
export type BillingInterval = "month" | "year";
export type SubscriptionStatus = "trialing" | "active" | "past_due" | "paused" | "canceled";
export type LimitKind = "projects" | "jobs" | "minutes" | "share";

export interface PlanLimits {
  /** Projects outside Trash. Null means no limit. */
  maxProjects: number | null;
  /** AI walkthroughs and website analyses started per calendar month. */
  monthlyJobs: number | null;
  /** Longest recording the worker will narrate, in minutes. */
  maxSourceMinutes: number | null;
  /** Longest life of a share link, in days. */
  shareDays: number;
}
export interface Plan extends PlanLimits {
  id: PlanId;
  name: string;
  rank: number;
  summary: string;
  /** Shown only by the test checkout. Real prices come from Paddle for the customer's country. */
  testPrice: Record<BillingInterval, number>;
}

/** Mirrors the rows seeded into public.vistralo_plans; the database is what enforces them. */
export const PLANS: Plan[] = [
  {
    id: "free",
    name: "Free",
    rank: 0,
    summary: "Try Vistralo on a few short recordings.",
    maxProjects: 5,
    monthlyJobs: 3,
    maxSourceMinutes: 5,
    shareDays: 7,
    testPrice: { month: 0, year: 0 },
  },
  {
    id: "pro",
    name: "Pro",
    rank: 1,
    summary: "For regular walkthroughs and design reviews.",
    maxProjects: 100,
    monthlyJobs: 60,
    maxSourceMinutes: 30,
    shareDays: 30,
    testPrice: { month: 12, year: 120 },
  },
  {
    id: "studio",
    name: "Studio",
    rank: 2,
    summary: "For long recordings and heavy monthly use.",
    maxProjects: null,
    monthlyJobs: 300,
    maxSourceMinutes: 120,
    shareDays: 30,
    testPrice: { month: 36, year: 360 },
  },
];
export const planById = (id: string | null | undefined): Plan =>
  PLANS.find((plan) => plan.id === id) || PLANS[0];

export interface Subscription {
  id: string;
  plan: PlanId | null;
  status: SubscriptionStatus;
  interval: BillingInterval | null;
  periodEnd: string | null;
  nextBilledAt: string | null;
  scheduledAction: "cancel" | "pause" | "resume" | null;
  scheduledAt: string | null;
  resumeAt: string | null;
  lastPayment: "completed" | "failed" | null;
}
export interface BillingState {
  /** False until the workspace switches limits on; the plan is then shown but nothing is blocked. */
  enforce: boolean;
  admin: boolean;
  plan: PlanId;
  limits: PlanLimits;
  usage: { projects: number; jobs: number; periodStart: string };
  subscription: Subscription | null;
  customerId?: string | null;
  account?: { id: string; email: string };
  /** The billing tables are not installed in this workspace yet. */
  unavailable?: boolean;
}

export const freeState = (extra: Partial<BillingState> = {}): BillingState => {
  const { maxProjects, monthlyJobs, maxSourceMinutes, shareDays } = PLANS[0];
  return {
    enforce: false,
    admin: false,
    plan: "free",
    limits: { maxProjects, monthlyJobs, maxSourceMinutes, shareDays },
    usage: { projects: 0, jobs: 0, periodStart: new Date().toISOString().slice(0, 10) },
    subscription: null,
    ...extra,
  };
};

/** A subscription grants its plan while Paddle is billing it, including while a failed payment is retried. */
export const grantsPlan = (status: SubscriptionStatus | undefined) =>
  status === "active" || status === "trialing" || status === "past_due";

export class PlanLimitError extends Error {
  constructor(
    public kind: LimitKind,
    message: string,
  ) {
    super(message);
    this.name = "PlanLimitError";
  }
}

export function limitReached(state: BillingState | null, kind: LimitKind, wanted = 0): boolean {
  if (!state || !state.enforce || state.admin) return false;
  const { limits, usage } = state;
  if (kind === "projects") return limits.maxProjects !== null && usage.projects >= limits.maxProjects;
  if (kind === "jobs") return limits.monthlyJobs !== null && usage.jobs >= limits.monthlyJobs;
  if (kind === "share") return wanted > limits.shareDays;
  return limits.maxSourceMinutes !== null && wanted > limits.maxSourceMinutes;
}

const count = (value: number, one: string, many: string) => `${value} ${value === 1 ? one : many}`;

/** One sentence that says which limit was reached and what lifts it. */
export function limitMessage(state: BillingState, kind: LimitKind): { title: string; body: string } {
  const plan = planById(state.plan),
    { limits } = state;
  if (kind === "projects")
    return {
      title: `The ${plan.name} plan holds ${count(limits.maxProjects ?? 0, "project", "projects")}`,
      body: "Move a project to Trash to free a place, or choose a plan with more room. Projects in Trash do not count.",
    };
  if (kind === "jobs")
    return {
      title: `You have used this month's ${count(limits.monthlyJobs ?? 0, "AI walkthrough", "AI walkthroughs")}`,
      body: `The ${plan.name} plan includes ${count(limits.monthlyJobs ?? 0, "AI walkthrough or website analysis", "AI walkthroughs and website analyses")} each calendar month. The count resets on the 1st, or you can choose a larger plan now.`,
    };
  if (kind === "share")
    return {
      title: `Share links last up to ${count(limits.shareDays, "day", "days")} on the ${plan.name} plan`,
      body: "Choose a shorter expiry, or a paid plan for links that last 30 days.",
    };
  return {
    title: `The ${plan.name} plan narrates recordings up to ${count(limits.maxSourceMinutes ?? 0, "minute", "minutes")}`,
    body: "Trim the recording, or choose a plan that narrates longer ones.",
  };
}

export const formatDate = (value: string | null | undefined, locale?: string) =>
  value && Number.isFinite(Date.parse(value))
    ? new Date(value).toLocaleDateString(locale, { day: "numeric", month: "long", year: "numeric" })
    : "";

/** The line under the workspace name, for example "Pro plan" or "Pro plan · Past due". */
export function planLabel(state: BillingState | null): string {
  if (!state) return "Free plan";
  const sub = state.subscription;
  const name = planById(sub && sub.status !== "canceled" && sub.plan ? sub.plan : state.plan).name;
  const suffix =
    sub?.status === "past_due"
      ? " · Past due"
      : sub?.status === "paused"
        ? " · Paused"
        : sub?.status === "trialing"
          ? " · Trial"
          : "";
  return `${name} plan${suffix}`;
}

export type NoticeAction = "payment" | "resume" | "keep" | "plans";
export interface BillingNotice {
  key: string;
  tone: "warning" | "danger" | "info";
  title: string;
  body: string;
  action: NoticeAction;
  actionLabel: string;
  dismissible: boolean;
}

/** The banner for a subscription that needs the customer's attention, or null when all is well. */
export function billingNotice(state: BillingState | null, locale?: string): BillingNotice | null {
  const sub = state?.subscription;
  if (!sub) return null;
  const name = planById(sub.plan).name,
    key = `${sub.id}:${sub.status}:${sub.scheduledAction || ""}`;
  if (sub.status === "past_due")
    return {
      key,
      tone: "danger",
      title: "Your last payment did not go through",
      body: `You still have ${name} while the payment is retried. Update your payment method to keep it.`,
      action: "payment",
      actionLabel: "Update payment method",
      dismissible: false,
    };
  if (sub.status === "paused") {
    const until = formatDate(sub.resumeAt, locale);
    return {
      key,
      tone: "warning",
      title: `Your ${name} subscription is paused`,
      body: `Free plan limits apply ${until ? `until it resumes on ${until}` : "until you resume it"}. Your projects are kept.`,
      action: "resume",
      actionLabel: "Resume subscription",
      dismissible: false,
    };
  }
  if (sub.status === "canceled")
    return {
      key,
      tone: "info",
      title: `Your ${name} subscription has ended`,
      body: "Free plan limits apply now. Your projects are kept, and you can subscribe again at any time.",
      action: "plans",
      actionLabel: "See plans",
      dismissible: true,
    };
  if (sub.scheduledAction === "cancel" || sub.scheduledAction === "pause") {
    const on = formatDate(sub.scheduledAt, locale);
    return {
      key,
      tone: "warning",
      title:
        sub.scheduledAction === "cancel"
          ? `${name} ends${on ? ` on ${on}` : " at the end of this billing period"}`
          : `${name} pauses${on ? ` on ${on}` : " at the end of this billing period"}`,
      body: "After that, Free plan limits apply. Your projects are kept.",
      action: "keep",
      actionLabel: `Keep ${name}`,
      dismissible: true,
    };
  }
  return null;
}

/** "3 of 5", or "3" when the plan has no limit. */
export const usageText = (used: number, cap: number | null) => (cap === null ? String(used) : `${used} of ${cap}`);

export const PLAN_LIMIT_EVENT = "vistralo:plan-limit";

/** The error an adapter throws at a limit. It also tells the app shell, which offers the upgrade. */
export function planLimit(state: BillingState, kind: LimitKind): PlanLimitError {
  const { title, body } = limitMessage(state, kind);
  if (
    typeof window !== "undefined" &&
    typeof window.dispatchEvent === "function" &&
    typeof CustomEvent === "function"
  )
    window.dispatchEvent(new CustomEvent(PLAN_LIMIT_EVENT, { detail: { kind } }));
  return new PlanLimitError(kind, `${title}. ${body}`);
}

/** Create flows that queue an AI walkthrough or website analysis. */
export const AI_FLOWS = new Set(["ai-walkthrough", "narrate-video", "narrate-screenshots", "website"]);
