# Plans and payments (Paddle sandbox)

Sign-up, plans and Paddle checkout are built and switched off. A build with no extra variables behaves exactly as before: no plan screens, no Paddle script, no limits. This page says what exists, what you must supply to turn it on, and what is still unproven.

**Sandbox only.** The build refuses a live client token, the functions refuse a live API key, and the only Paddle hosts in the Content Security Policy are sandbox hosts. Going live is a separate piece of work (last section).

## What you must supply

An agent cannot create accounts, so these come from you. Nothing below is in the repository.

### 1. In Paddle (sandbox account, `sandbox-vendors.paddle.com`)

| Make this | You get |
| --- | --- |
| A sandbox account | — |
| A client-side token | starts with `test_` |
| An API key with the permissions `subscription.write` and `customer_portal_session.write` | contains `_sdbx` |
| Product "Vistralo Pro" with a monthly and a yearly recurring price | two IDs starting `pri_` |
| Product "Vistralo Studio" with a monthly and a yearly recurring price | two IDs starting `pri_` |
| A notification destination (webhook) pointing at `https://yyiikuzhgxdgrthntzyr.supabase.co/functions/v1/vistralo-paddle-webhook` | a secret starting `pdl_ntfset_` |

Subscribe the destination to: `subscription.created`, `subscription.activated`, `subscription.trialing`, `subscription.updated`, `subscription.past_due`, `subscription.paused`, `subscription.resumed`, `subscription.canceled`, `transaction.completed`, `transaction.payment_failed`.

### 2. Supabase function secrets (never in Git, never in Vercel)

| Secret | Value |
| --- | --- |
| `PADDLE_API_KEY` | the sandbox API key |
| `PADDLE_WEBHOOK_SECRET` | the destination's secret |
| `PADDLE_PRICE_PRO_MONTH`, `PADDLE_PRICE_PRO_YEAR`, `PADDLE_PRICE_STUDIO_MONTH`, `PADDLE_PRICE_STUDIO_YEAR` | the four price IDs |
| `VISTRALO_APP_ORIGIN` (optional) | defaults to `https://app.vistralo.com`; set it for a preview deployment |
| `PADDLE_WEBHOOK_TOLERANCE_SECONDS` (optional) | defaults to 5, Paddle's own default |

### 3. Vercel build variables (public values only)

| Variable | Value |
| --- | --- |
| `VISTRALO_BILLING` | `on` (anything else, or unset, is off) |
| `VISTRALO_PADDLE_CLIENT_TOKEN` | the `test_` client-side token |
| `VISTRALO_PADDLE_ENV` | `sandbox` |
| `VISTRALO_PADDLE_PRICE_PRO_MONTH`, `…_PRO_YEAR`, `…_STUDIO_MONTH`, `…_STUDIO_YEAR` | the same four price IDs as the function secrets |
| `VISTRALO_LEGAL_URL` (optional until sign-up) | where the terms, privacy notice and refund policy are published, for example `https://vistralo.com/legal`; the app links to `/terms`, `/privacy` and `/refunds` under it |
| `VISTRALO_SIGNUP` | `on` to show "Create an account"; the build refuses it without `VISTRALO_LEGAL_URL` |

The price IDs are entered twice (browser build and functions) and must match. `scripts/billing-env.cjs` stops the build if the token is not a sandbox client token, if the environment is not `sandbox`, or if a price ID is malformed.

### 4. Decisions only you can make

- **Plan names, limits and prices.** The three plans and their limits below are placeholders I chose so the system could be built and tested. Change them in one migration and `web/billing/plans.json` (a test fails if the two disagree). That file is the one place the plan table is written: `web/billing/plans.ts` imports it, the build publishes it as `/plans.json`, and the pricing page on vistralo.com is built from it. Set `"confirmed": true` in it once the names, limits and prices are final; until then the pricing page says they are placeholders. Prices live in Paddle; the `$12` and `$36` figures appear only in the test checkout.
- **Past due.** A subscription whose payment failed keeps its plan while Paddle retries. To cut access sooner, remove `'past_due'` from `vistralo_effective_plan` and `grantsPlan`.
- **Legal sign-off** for the refund policy, terms and privacy notice (`docs/legal`).

## Turning it on, in order

1. Apply the migration `supabase/migrations/20261013103120_vistralo_billing.sql`. It adds tables, functions and three restrictive policies; with both switches off it changes nothing for existing accounts.
2. Set the function secrets, then deploy:
   ```sh
   supabase functions deploy vistralo-paddle-webhook --no-verify-jwt
   supabase functions deploy vistralo-billing
   ```
   The webhook takes no Supabase token (Paddle cannot send one); the `Paddle-Signature` check is its only gate.
3. In Paddle, send a simulated `subscription.created` to the destination and confirm a row appears in `vistralo_billing_events` with an outcome.
4. Run the policy probe with the real token and compare its output with `vercel.json` (next section).
5. Set the Vercel variables on a **preview** deployment first. Buy a plan with card `4242 4242 4242 4242`, then try `4000 0000 0000 0002` (declined) and `4000 0038 0000 0446` (3-D Secure).
6. When the plan screens are right, switch limits on: `update public.vistralo_billing_config set enforce_limits = true;` (SQL editor, service role). Existing member accounts become Free-plan accounts at that moment; administrators are never limited.
7. Sign-up is a second switch: `update public.vistralo_billing_config set signup_enabled = true;` plus `VISTRALO_SIGNUP=on`, and "Confirm email" enabled in Supabase Auth. `docs/legal/README.md` says not to open sign-up on draft notices.

## Content Security Policy

`vercel.json` now allows four Paddle sandbox hosts. They were measured, not guessed: `scripts/paddle-csp-probe.cjs` loads Paddle.js under the app's policy in report-only mode, asks for a price, opens a checkout and prints each violation.

| Directive | Host added | What needs it |
| --- | --- | --- |
| `script-src` | `https://cdn.paddle.com` | Paddle.js |
| `style-src` | `https://sandbox-cdn.paddle.com` | Paddle.js's stylesheet |
| `connect-src` | `https://sandbox-api.paddle.com` | price preview from the page |
| `frame-src` | `https://sandbox-buy.paddle.com` | the checkout frame (`'self'` kept, as before) |

Two things to know:

- **Measured with a dummy token.** No sandbox token existed, so Paddle rejected the checkout at its first request (`checkout.error`). The four hosts above are everything the page asked for up to that point. A real checkout may ask for more. Before step 5, run:
  ```sh
  VISTRALO_PADDLE_CLIENT_TOKEN=test_... VISTRALO_PADDLE_PRICE_PRO_MONTH=pri_... node scripts/paddle-csp-probe.cjs
  node scripts/paddle-csp-probe.cjs --enforce   # same, with the policy applied for real
  ```
  Add only hosts it reports under "Policy violations". Requests listed as `frame` are made inside Paddle's own frame and are not governed by this app's policy.
- **Inline styles are still refused, on purpose.** Paddle.js positions its checkout frame with a `style` attribute and injects a small `<style>` element (a spinner animation). Allowing those would mean `'unsafe-inline'` for the whole app. Instead `web/billing/billing.css` gives `.paddle-frame-overlay` the same full-window layout from the app's own stylesheet; under the enforced policy the frame measured full-window with it and 300×150 without it. The browser console will still log two refused inline styles when a checkout opens. If the spinner or anything else looks wrong with a real token, the choice is between living with it and adding `style-src-attr 'unsafe-inline'`; that is your call, not something to slip in.

## How it works

| Piece | Where |
| --- | --- |
| Feature flag and build checks | `scripts/billing-env.cjs`, read by `scripts/build-web.cjs` |
| Plans, limits, wording for each state | `web/billing/plans.ts` |
| Paddle.js loader and the mock that replaces it | `web/billing/paddle.ts`, `web/billing/config.ts` |
| Plans page, Billing tab, upgrade prompt, status banner, test checkout | `web/billing/Billing.tsx`, `web/billing/billing.css` |
| Limit checks before work starts, and the billing calls | `web/cloud.ts` (`guard`, `limited`, `billing`, `billingAction`) |
| Tables, row-level security, limits, usage | `supabase/migrations/20261013103120_vistralo_billing.sql` |
| Webhook receiver | `supabase/functions/vistralo-paddle-webhook` |
| Customer portal link, change plan, resume, undo a cancellation | `supabase/functions/vistralo-billing` |
| Signature check, event mapping, Paddle API calls | `supabase/functions/_shared/paddle.ts` |
| Worker checks | `src/entitlements.cjs`, called from `scripts/local-admin-worker.cjs` |

**Checkout.** The Plans page opens Paddle's overlay with the price ID, the account's email and `customData: { vistralo_user_id }`. Paddle tells the browser the payment completed; the app then waits for the webhook to write the subscription and shows the new plan.

**Webhook.** It reads the raw body, verifies `Paddle-Signature` (HMAC-SHA256 of `ts:body` with the destination secret, constant-time compare, 5-second window, more than one `h1` accepted), and only then parses anything. Each event ID is processed once. Subscription events are applied in `occurred_at` order, so a late, older event cannot overwrite a newer state. An event whose price is not one of the four configured prices is stored with no plan and grants nothing.

**What grants a plan.** Only a stored subscription whose status is `trialing`, `active` or `past_due`. `transaction.completed` grants nothing by itself; it and `transaction.payment_failed` only record the last payment's result.

**Tables** (all with row-level security; clients can read their own rows and write none):
`vistralo_billing_customers`, `vistralo_billing_subscriptions`, `vistralo_billing_usage`, `vistralo_plans`, `vistralo_billing_config`, and `vistralo_billing_events` (no client access at all).

### Limits and where each is enforced

| Limit (Free / Pro / Studio) | Database | Worker | App |
| --- | --- | --- | --- |
| Projects outside Trash (5 / 100 / none) | restrictive insert policy `project_plan_limit`; trigger on restore from Trash | — | checked before a create flow opens; upgrade prompt |
| AI walkthroughs and website analyses per calendar month, UTC (3 / 60 / 300) | restrictive insert policy `jobs_plan_limit`; counted by trigger, and a failed or cancelled job gives its place back | refuses a job over the allowance before any provider is called | checked before upload or capture; upgrade prompt |
| Longest recording narrated (5 / 30 / 120 minutes) | — (the length is only known once the worker measures it) | refuses before any provider is called; the project shows the reason | shown on Plans and in Billing |
| Share link life (7 / 30 / 30 days) | restrictive insert policy `shares_plan_limit` | — | 30 days disabled in the share dialog; upgrade prompt |

Someone over a limit after a downgrade keeps everything and can still open, edit and trash projects; only adding more is refused.

### States

| Paddle status | Plan in effect | What the customer sees |
| --- | --- | --- |
| `active`, `trialing` | the subscribed plan | nothing extra |
| `active` with a scheduled cancel or pause | the subscribed plan until the date | banner with the date and "Keep Pro" |
| `past_due` | the subscribed plan | red banner, "Update payment method" (opens Paddle's page) |
| `paused` | Free | banner, "Resume subscription" |
| `canceled` | Free | dismissible banner, "See plans" |

Cancelling, payment method and invoices are on Paddle's customer portal, opened from Settings → Billing.

## Tests

All off the network: Paddle is the mock client or a fake `fetch`.

```sh
npm test                    # tests/billing.test.cjs: signature, events, API calls, flag, modes, limits, states, worker
npm run test:web:billing    # browser journey in demo mode with VISTRALO_BILLING=on, plus axe at six sizes
npm run test:web:signup     # the sign-up form in a cloud build, with Supabase Auth and the database answered by a mock
```

The sign-up test builds the app against the project's real Supabase address (the Content Security Policy allows no other) and intercepts every request to it inside the browser, so nothing reaches Supabase. A request the mock has no answer for fails the run. It covers the form's rules, the confirmation email step, the link from that email, a first sign-in on another device, a project with email confirmation off, refusals from Supabase Auth, and the database's sign-up switch being off.

In the demo (`#demo/`, with a flag-on build) Settings → Billing has two demo-only controls: "Preview a billing state" and "Apply plan limits in this demo". They are how each state above can be looked at without Paddle.

## Not proven yet

- **Nothing has talked to Paddle with real credentials.** The request shapes follow Paddle's documentation as read on 13 October 2026 and are tested against fakes. First real run: step 3 and step 5 above.
- **The Edge Functions have not been run under Deno.** Their logic is in `_shared/paddle.ts`, which the Node tests cover; the two thin `index.ts` files are unexecuted. Deno was not installed on the machine that did the follow-up work on 13 October 2026 either, so this is unchanged.
- **The migration has been run on an in-process Postgres with Supabase-like roles (41 checks), not on the Vistralo project.** The repository's migrations do not match production exactly (the worker calls `vistralo_claim_next_job` and jobs have a `progress` column, neither of which is in `supabase/migrations`), so review the migration against the live schema before applying it. `docs/SCHEMA-DRIFT.md` lists every difference found in the code, what each means for this migration, and read-only queries that record the real schema. It deliberately adds restrictive policies and triggers instead of rewriting existing policies.
- **The CSP host list is partial** until the probe is rerun with a real token.
- **Sign-up has only been tested against a mock.** `npm run test:web:signup` proves the form and the app's side of each step. It does not prove Supabase's side: that "Confirm email" is on, that the confirmation email arrives, that `/auth/callback` is an allowed redirect address, or that `vistralo_complete_signup` behaves on the real database. Check those by hand on a preview deployment before opening sign-up.

## Before live payments

Not built here: live hosts in the policy (`buy.paddle.com`, `api.paddle.com`, …, to be measured the same way), a live/sandbox switch in `billing-env.cjs` and `_shared/paddle.ts`, Paddle's website and business verification, the published refund policy, terms naming Paddle as merchant of record, a tested delete-account path that cancels the Paddle subscription first (the database refuses to delete an account that still has a subscription row), and email for receipts and failed payments (Paddle sends its own).
