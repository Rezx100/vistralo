import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AppMode, WorkspaceAdapter } from "../contracts";
import { Icon } from "../components/Icon";
import { Dialog, SheetToggle, confirmDialog } from "../components/Primitives";
import { billingConfig, paddleMode, type PaddleMode, type PriceKey } from "./config";
import {
  createPaddleClient,
  type CheckoutOutcome,
  type CheckoutRequest,
  type PaddleClient,
  type PriceLabels,
} from "./paddle";
import {
  PLANS,
  PLAN_LIMIT_EVENT,
  billingNotice,
  formatDate,
  grantsPlan,
  limitMessage,
  planById,
  usageText,
  type BillingInterval,
  type BillingNotice,
  type BillingState,
  type LimitKind,
  type NoticeAction,
  type PaidPlanId,
  type Plan,
} from "./plans";

type BillingAction = NoticeAction | "portal" | "cancel";
const message = (failure: unknown) =>
  failure instanceof Error ? failure.message : "Something went wrong. Please try again.";
const wait = (ms: number) => new Promise((done) => setTimeout(done, ms));

/** Everything the app shell needs for plans and billing. Inert while the feature flag is off. */
export function useBilling({
  adapter,
  mode,
  active,
  theme,
  locale,
  notify,
  showPlans,
}: {
  adapter: WorkspaceAdapter;
  mode: AppMode;
  /** Signed in (or the demo), so there is an account whose plan can be read. */
  active: boolean;
  theme: string;
  locale: string;
  notify: (text: string, error?: boolean) => void;
  showPlans: () => void;
}) {
  const paddle = paddleMode(billingConfig, mode),
    enabled = paddle !== "off";
  const [state, setState] = useState<BillingState | null>(null),
    [prices, setPrices] = useState<PriceLabels>({}),
    [busy, setBusy] = useState(""),
    [upgrade, setUpgrade] = useState<LimitKind | null>(null),
    [mock, setMock] = useState<{
      request: CheckoutRequest;
      done: (outcome: CheckoutOutcome) => void;
    } | null>(null);
  const client = useMemo<PaddleClient | null>(
    () =>
      createPaddleClient(
        paddle,
        billingConfig,
        (request) =>
          new Promise<CheckoutOutcome>((done) =>
            setMock({
              request,
              done: (outcome) => {
                setMock(null);
                done(outcome);
              },
            }),
          ),
      ),
    [paddle],
  );
  const refresh = useCallback(
    async (fresh = true) => {
      if (!enabled || !active) return null;
      try {
        const next = await adapter.rpc<BillingState>("billing", { fresh });
        setState(next);
        return next;
      } catch {
        return null;
      }
    },
    [adapter, enabled, active],
  );
  useEffect(() => {
    if (!enabled || !active) {
      setState(null);
      return;
    }
    refresh(false);
    // A plan changes on Paddle's pages, in another tab; pick the change up on the way back.
    const focus = () => document.visibilityState === "visible" && refresh();
    document.addEventListener("visibilitychange", focus);
    return () => document.removeEventListener("visibilitychange", focus);
  }, [enabled, active, refresh]);
  useEffect(() => {
    if (!enabled) return;
    const onLimit = (event: Event) => {
      setUpgrade((event as CustomEvent<{ kind: LimitKind }>).detail.kind);
      refresh();
    };
    window.addEventListener(PLAN_LIMIT_EVENT, onLimit);
    return () => window.removeEventListener(PLAN_LIMIT_EVENT, onLimit);
  }, [enabled, refresh]);

  const pricesAsked = useRef<PaddleClient | null>(null);
  const loadPrices = useCallback(() => {
    if (!client || pricesAsked.current === client) return;
    pricesAsked.current = client;
    client
      .prices()
      .then(setPrices)
      .catch(() => {
        pricesAsked.current = null;
      });
  }, [client]);

  // Paddle tells the database through a webhook, a moment after it tells the browser.
  async function settle(reached: (next: BillingState) => boolean, success: string) {
    for (let attempt = 0; attempt < 30; attempt++) {
      const next = await refresh();
      if (next && reached(next)) return notify(success);
      await wait(2000);
    }
    notify("Paddle has your request. Your plan will update here within a minute.");
  }

  async function choose(plan: PaidPlanId, interval: BillingInterval) {
    if (!client || busy) return;
    const current = state ?? (await refresh()),
      sub = current?.subscription,
      name = planById(plan).name;
    setBusy(plan);
    try {
      if (sub && sub.status !== "canceled" && grantsPlan(sub.status)) {
        const agreed = await confirmDialog({
          title: `Switch to ${name}, billed ${interval === "year" ? "yearly" : "monthly"}?`,
          message:
            "Paddle charges or credits the difference for the rest of this billing period straight away.",
          confirmLabel: `Switch to ${name}`,
          icon: "sparkle",
        });
        if (!agreed) return;
        await adapter.rpc("billingAction", { action: "change_plan", plan, interval });
        await settle(
          (next) => next.subscription?.plan === plan && next.subscription?.interval === interval,
          `You are on the ${name} plan`,
        );
        return;
      }
      if (sub && sub.status === "paused")
        throw Error("Resume your paused subscription before choosing a plan.");
      const outcome = await client.checkout({
        plan,
        interval,
        userId: current?.account?.id,
        email: current?.account?.email || undefined,
        customerId: current?.customerId,
        theme: theme === "light" ? "light" : "dark",
        locale,
      });
      if (outcome === "declined")
        notify("The test card was declined. Your plan has not changed.", true);
      if (outcome !== "completed") return;
      if (client.mode === "mock")
        await adapter.rpc("billingSimulate", {
          plan,
          interval,
          status: "active",
          scheduledAction: null,
        });
      await settle((next) => next.plan === plan, `You are on the ${name} plan`);
    } catch (failure) {
      notify(message(failure), true);
    } finally {
      setBusy("");
    }
  }

  async function act(action: BillingAction) {
    if (action === "plans") return showPlans();
    if (busy) return;
    setBusy(action);
    // Opened before the request so the browser still counts it as the click's own window.
    const tab =
      mode === "cloud" && (action === "payment" || action === "cancel" || action === "portal")
        ? window.open("", "_blank")
        : null;
    try {
      if (action === "resume") {
        await adapter.rpc("billingAction", { action: "resume" });
        await settle((next) => next.subscription?.status === "active", "Your subscription is active again");
      } else if (action === "keep") {
        await adapter.rpc("billingAction", { action: "keep" });
        await settle((next) => !next.subscription?.scheduledAction, "Your plan will keep renewing");
      } else {
        const result = await adapter.rpc<{ url: string }>("billingAction", {
          action: "portal",
          intent: action === "portal" ? "overview" : action,
        });
        if (tab) {
          tab.opener = null;
          tab.location.replace(result.url);
        } else location.assign(result.url);
      }
    } catch (failure) {
      tab?.close();
      notify(message(failure), true);
    } finally {
      setBusy("");
    }
  }

  return {
    enabled,
    paddle,
    state,
    prices,
    busy,
    upgrade,
    setUpgrade,
    mock,
    refresh,
    loadPrices,
    choose,
    act,
    /** Demo only: jump straight to a billing state to see how it looks. */
    simulate: async (patch: Record<string, unknown>) => {
      await adapter.rpc("billingSimulate", patch);
      await refresh();
    },
  };
}
export type Billing = ReturnType<typeof useBilling>;

const limitRows = (plan: Plan): Array<[string, string]> => [
  ["Projects", plan.maxProjects === null ? "No limit" : `Up to ${plan.maxProjects}`],
  [
    "AI walkthroughs and website analyses",
    plan.monthlyJobs === null ? "No limit" : `${plan.monthlyJobs} a month`,
  ],
  [
    "Longest recording narrated",
    plan.maxSourceMinutes === null ? "No limit" : `${plan.maxSourceMinutes} minutes`,
  ],
  ["Share links last", `Up to ${plan.shareDays} days`],
];

function LegalLinks() {
  const base = billingConfig.legalUrl.replace(/\/$/, "");
  if (!base) return null;
  return (
    <p className="caption plans-legal">
      <a href={`${base}/terms`} target="_blank" rel="noreferrer">
        Terms
      </a>
      <a href={`${base}/privacy`} target="_blank" rel="noreferrer">
        Privacy
      </a>
      <a href={`${base}/refunds`} target="_blank" rel="noreferrer">
        Refund policy
      </a>
    </p>
  );
}

/** Plans side by side. Signed out, it is the public price list; signed in, it is where a plan is chosen. */
export function PricingPage({
  billing,
  onSignIn,
  onBack,
}: {
  billing: Billing;
  /** Present on the signed-out page: every plan leads to the sign-in page instead of a checkout. */
  onSignIn?: () => void;
  onBack?: () => void;
}) {
  const { state, prices, busy, paddle } = billing,
    sub = state?.subscription,
    live = !!sub && sub.status !== "canceled";
  const [period, setPeriod] = useState<BillingInterval>(sub?.interval === "year" ? "year" : "month");
  useEffect(() => {
    billing.loadPrices();
    billing.refresh();
  }, []);
  const blocked =
    sub?.status === "past_due"
      ? "Update your payment method before changing plan."
      : sub?.status === "paused"
        ? "Resume your subscription before changing plan."
        : "";
  return (
    <section className="plans-page" aria-labelledby="plans-title">
      <header className="page-header">
        <h1 id="plans-title">Plans</h1>
        <div className="segmented" role="group" aria-label="Billing period">
          {(["month", "year"] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={period === value}
              onClick={() => setPeriod(value)}
            >
              {value === "month" ? "Monthly" : "Yearly"}
            </button>
          ))}
        </div>
        <p>
          Every plan records, narrates and analyses the same way. Plans differ in how much you can
          keep and make each month.
        </p>
      </header>
      {paddle === "mock" && (
        <p className="sheet-note">
          <Icon name="info" />
          Test checkout. Prices here are placeholders and no payment is taken in the demo.
        </p>
      )}
      {paddle === "unconfigured" && (
        <p className="sheet-note">
          <Icon name="info" />
          Checkout is not connected in this workspace yet, so plans can be compared but not bought.
        </p>
      )}
      <div className="plans">
        {PLANS.map((plan) => {
          const paid = plan.id !== "free",
            key = `${plan.id}_${period}` as PriceKey,
            current =
              !!state &&
              (paid
                ? live && sub!.plan === plan.id && sub!.interval === period
                : !live || !grantsPlan(sub!.status)),
            price = paid ? prices[key] : "$0";
          return (
            <article key={plan.id} className={`plan ${current ? "is-current" : ""}`}>
              <h2>
                {plan.name}
                {current && <span className="status-badge">Your plan</span>}
              </h2>
              <p className="plan-summary">{plan.summary}</p>
              <p className="plan-price">
                <strong>{price || "Price at checkout"}</strong>
                {paid && price && <span> / {period}</span>}
              </p>
              <div className="plan-action">
                {onSignIn ? (
                  <button className={`button ${paid ? "button-primary" : ""}`} onClick={onSignIn}>
                    {paid ? `Sign in to choose ${plan.name}` : "Sign in"}
                  </button>
                ) : !paid ? (
                  <p className="caption">
                    {live
                      ? "To return to Free, cancel your subscription in Settings, under Billing."
                      : "No card needed."}
                  </p>
                ) : current ? (
                  <button className="button" disabled>
                    Current plan
                  </button>
                ) : (
                  <button
                    className="button button-primary"
                    disabled={!!busy || paddle === "unconfigured" || !!blocked}
                    onClick={() => billing.choose(plan.id as PaidPlanId, period)}
                  >
                    {busy === plan.id
                      ? "Working…"
                      : live && grantsPlan(sub!.status)
                        ? `Switch to ${plan.name}`
                        : `Choose ${plan.name}`}
                  </button>
                )}
              </div>
              <dl className="plan-limits">
                {limitRows(plan).map(([label, value]) => (
                  <div key={label}>
                    <dt>{label}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
              </dl>
            </article>
          );
        })}
      </div>
      {blocked && !onSignIn && <p className="caption">{blocked}</p>}
      <p className="caption plans-footnote">
        Payments are taken by Paddle, the merchant of record for Vistralo. Paddle adds any tax for
        your country at checkout and sends the receipt. AI narration uses your own OpenAI and HeyGen
        keys, which those providers bill separately.
      </p>
      <LegalLinks />
      {onBack && (
        <button className="button button-ghost plans-back" onClick={onBack}>
          Back to projects
        </button>
      )}
    </section>
  );
}

/** A subscription that needs attention: a failed payment, a pause, or an ending. */
export function BillingBanner({ billing, locale }: { billing: Billing; locale: string }) {
  const notice = billingNotice(billing.state, locale);
  const [dismissed, setDismissed] = useState(() => localStorage.getItem("vistralo-billing-notice") || "");
  if (!notice || (notice.dismissible && dismissed === notice.key)) return null;
  return (
    <div className={`notice billing-notice is-${notice.tone}`} role="status">
      <Icon name={notice.tone === "info" ? "info" : "warning"} />
      <span>
        <strong>{notice.title}</strong>
        <span>{notice.body}</span>
      </span>
      <button className="button" disabled={!!billing.busy} onClick={() => billing.act(notice.action)}>
        {billing.busy === notice.action ? "Working…" : notice.actionLabel}
      </button>
      {notice.dismissible && (
        <button
          type="button"
          className="toast-close"
          aria-label="Dismiss"
          onClick={() => {
            localStorage.setItem("vistralo-billing-notice", notice.key);
            setDismissed(notice.key);
          }}
        >
          <Icon name="close" />
        </button>
      )}
    </div>
  );
}

function NoticeNote({ notice, billing }: { notice: BillingNotice; billing: Billing }) {
  return (
    <div className={`sheet-note billing-note is-${notice.tone}`} role="status">
      <Icon name={notice.tone === "info" ? "info" : "warning"} />
      <span>
        <strong>{notice.title}</strong> {notice.body}
      </span>
      <button className="button" disabled={!!billing.busy} onClick={() => billing.act(notice.action)}>
        {notice.actionLabel}
      </button>
    </div>
  );
}

function Usage({ label, hint, used, cap }: { label: string; hint?: string; used: number; cap: number | null }) {
  return (
    <div className="sheet-row billing-usage">
      <span>
        {label}
        {hint && <small>{hint}</small>}
      </span>
      <span className="billing-usage-value">
        <strong>{usageText(used, cap)}</strong>
        {cap !== null && (
          <progress
            className={used >= cap ? "is-full" : undefined}
            max={cap}
            value={Math.min(used, cap)}
            aria-label={`${label}: ${usageText(used, cap)}`}
          />
        )}
      </span>
    </div>
  );
}

const PREVIEWS: Array<[string, Record<string, unknown>]> = [
  ["No subscription", { status: "none" }],
  ["Pro, active", { plan: "pro", status: "active", scheduledAction: null }],
  ["Pro, payment past due", { plan: "pro", status: "past_due", scheduledAction: null }],
  ["Pro, paused", { plan: "pro", status: "paused", scheduledAction: null }],
  ["Pro, cancellation scheduled", { plan: "pro", status: "active", scheduledAction: "cancel" }],
  ["Pro, ended", { plan: "pro", status: "canceled", scheduledAction: null }],
];

/** The Billing tab in Preferences. */
export function BillingSettings({
  billing,
  locale,
  onPlans,
}: {
  billing: Billing;
  locale: string;
  onPlans: () => void;
}) {
  const { state, busy } = billing;
  useEffect(() => {
    billing.refresh();
  }, []);
  if (!state) return <p className="caption">Loading your plan…</p>;
  const sub = state.subscription,
    live = !!sub && sub.status !== "canceled",
    plan = planById(state.plan),
    notice = billingNotice(state, locale),
    renews = formatDate(sub?.nextBilledAt, locale),
    cycle = sub?.interval === "year" ? "yearly" : "monthly";
  const detail = !live
    ? "No subscription"
    : sub!.status === "trialing"
      ? `Trial${renews ? `, first payment on ${renews}` : ""}`
      : sub!.status === "paused"
        ? `${planById(sub!.plan).name} is paused`
        : sub!.scheduledAction
          ? `Billed ${cycle}`
          : `Billed ${cycle}${renews ? `, renews on ${renews}` : ""}`;
  const resets = new Date(state.usage.periodStart);
  resets.setUTCMonth(resets.getUTCMonth() + 1);
  return (
    <div className="sheet-stack billing-settings">
      {notice && <NoticeNote notice={notice} billing={billing} />}
      {state.unavailable && (
        <p className="sheet-note">
          <Icon name="info" />
          Plans are not set up in this workspace yet. Nothing is limited.
        </p>
      )}
      <div className="sheet-group">
        <div className="sheet-row">
          <span>
            <strong>{plan.name} plan</strong>
            <small>{detail}</small>
          </span>
          <button className="button" data-autofocus onClick={onPlans}>
            {live ? "Change plan" : "See plans"}
          </button>
        </div>
        <Usage
          label="Projects"
          hint="Projects in Trash do not count"
          used={state.usage.projects}
          cap={state.limits.maxProjects}
        />
        <Usage
          label="AI walkthroughs this month"
          hint={`Includes website analyses. Resets on ${formatDate(resets.toISOString(), locale)}`}
          used={state.usage.jobs}
          cap={state.limits.monthlyJobs}
        />
        <div className="sheet-row">
          <span>Longest recording narrated</span>
          <strong>
            {state.limits.maxSourceMinutes === null ? "No limit" : `${state.limits.maxSourceMinutes} minutes`}
          </strong>
        </div>
        <div className="sheet-row">
          <span>Share links last</span>
          <strong>Up to {state.limits.shareDays} days</strong>
        </div>
      </div>
      {!state.enforce && !state.unavailable && (
        <p className="caption">
          {state.admin
            ? "Administrator accounts are not limited."
            : billing.paddle === "mock"
              ? "Limits are shown but not applied in this demo. Switch them on below to try an upgrade prompt."
              : "Limits are shown but not applied in this workspace yet."}
        </p>
      )}
      {live && billing.paddle !== "mock" && (
        <div className="sheet-group">
          <div className="sheet-row">
            <span>
              Payment method and invoices
              <small>Opens Paddle, which takes payment for Vistralo, in a new tab.</small>
            </span>
            <button className="button" disabled={!!busy} onClick={() => billing.act("portal")}>
              Manage <Icon name="external" />
            </button>
          </div>
          {!sub!.scheduledAction && sub!.status !== "paused" && (
            <div className="sheet-row">
              <span>
                Cancel subscription
                <small>You keep {planById(sub!.plan).name} until the end of the period you have paid for.</small>
              </span>
              <button className="button button-ghost danger-text" disabled={!!busy} onClick={() => billing.act("cancel")}>
                Cancel <Icon name="external" />
              </button>
            </div>
          )}
        </div>
      )}
      {billing.paddle === "mock" && (
        <div className="sheet-group">
          <label className="sheet-row">
            <span>
              Preview a billing state
              <small>Demo only. Shows how each state looks without Paddle.</small>
            </span>
            <select
              aria-label="Preview a billing state"
              value=""
              onChange={(e) => {
                const preview = PREVIEWS[Number(e.target.value)];
                if (preview) billing.simulate(preview[1]);
              }}
            >
              <option value="" disabled>
                Choose a state
              </option>
              {PREVIEWS.map(([label], index) => (
                <option key={label} value={index}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <SheetToggle
            label="Apply plan limits in this demo"
            hint="With limits on, the Free plan's five projects are already used."
            checked={state.enforce}
            onChange={(enforce) => billing.simulate({ enforce })}
          />
        </div>
      )}
    </div>
  );
}

/** Shown at a limit, in place of the action that hit it. */
export function UpgradeDialog({
  billing,
  kind,
  onClose,
  onPlans,
}: {
  billing: Billing;
  kind: LimitKind;
  onClose: () => void;
  onPlans: () => void;
}) {
  if (!billing.state) return null;
  const { title, body } = limitMessage(billing.state, kind);
  return (
    <Dialog
      title={title}
      description={body}
      icon="sparkle"
      size="compact"
      className="sheet-alert"
      closable={false}
      onClose={onClose}
      footer={
        <>
          <button className="button" onClick={onClose}>
            Not now
          </button>
          <button className="button button-primary" data-autofocus onClick={onPlans}>
            See plans
          </button>
        </>
      }
    />
  );
}

/** Stands in for Paddle's checkout wherever there is no sandbox token. */
export function TestCheckout({ billing }: { billing: Billing }) {
  const { mock } = billing;
  if (!mock) return null;
  const plan = planById(mock.request.plan),
    cycle = mock.request.interval;
  return (
    <Dialog
      title="Test checkout"
      description="This stands in for Paddle's payment page. No card is asked for and no money moves."
      icon="lock"
      size="compact"
      onClose={() => mock.done("closed")}
      footer={
        <>
          <button className="button button-ghost" onClick={() => mock.done("declined")}>
            Decline the card
          </button>
          <button className="button button-primary" data-autofocus onClick={() => mock.done("completed")}>
            Complete test payment
          </button>
        </>
      }
    >
      <div className="sheet-group">
        <div className="sheet-row">
          <span>{plan.name} plan</span>
          <strong>
            ${plan.testPrice[cycle]} / {cycle}
          </strong>
        </div>
      </div>
    </Dialog>
  );
}
