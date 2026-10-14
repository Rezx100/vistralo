# Vistralo subprocessors and other recipients — DRAFT, NOT PUBLISHED

Operator Dynamix LTD, Mirpur 12, Eastern Housing, Road10, House 123, 2nd Floor, Dhaka 1216, Bangladesh · Website https://vistralo.com · Contact contact@vistralo.com · Last updated `{{DATE}}`

**Not approved. Do not publish or link this until a lawyer has reviewed it and every `{{FIELD}}` is filled.** It is an original draft and is not legal advice. The list was taken from the code on 13 October 2026: every company below is one the app, the worker or the build is written to send data to. Legal entity names, locations and transfer safeguards are not in the code and are left as fields. Whether each company is a subprocessor, a separate controller or the customer's own processor is a legal classification for counsel to confirm.

## Companies that process customer data for Vistralo

| Company | What it does for Vistralo | Data it handles | Entity and location | Transfer safeguard |
| --- | --- | --- | --- | --- |
| Supabase | Accounts and sign-in, the database of projects and jobs, storage of recordings, screenshots, posters, scripts, audio and finished films, and the functions that serve share links and receive billing events | Account email and password hash; all customer content; share link records; encrypted provider keys | `{{SUPABASE_ENTITY}}`, project region `{{SUPABASE_REGION}}` | `{{SAFEGUARD}}` |
| Vercel | Hosts the web app at app.vistralo.com and the website at vistralo.com | Requests to those sites, including IP address and browser details in its logs. It does not store customer content | `{{VERCEL_ENTITY}}`, `{{REGIONS}}` | `{{SAFEGUARD}}` |
| `{{WORKER_HOST}}` | The server that runs the processing worker | A working copy of a project's media while a job runs, and the worker's logs | `{{ENTITY_AND_COUNTRY}}` | `{{SAFEGUARD}}` |

## OpenAI and HeyGen

On Pro and Studio, narration runs on Vistralo's own OpenAI and HeyGen accounts, which makes both of them Vistralo's subprocessors for those plans: OpenAI receives frames from the recording and, for website projects, notes from the page's code; HeyGen receives the approved script. `{{OPENAI_ENTITY_REGION_SAFEGUARD}}`, `{{HEYGEN_ENTITY_REGION_SAFEGUARD}}`

On Free, and for any customer who saves their own keys, narration runs on the customer's own accounts. Vistralo's worker makes the requests, but under the customer's agreement with each company.

| Company | When data is sent | What is sent | Classification |
| --- | --- | --- | --- |
| OpenAI | Only when the customer starts an AI walkthrough, an AI voice-over or a website analysis | Still pictures from the recording or capture, and notes read from a website's code | `{{COUNSEL: CUSTOMER'S OWN PROCESSOR, OR VISTRALO'S SUBPROCESSOR}}` |
| HeyGen | Only when narration is voiced | The narration script as text, and the chosen voice ID | `{{COUNSEL}}` |

## Companies that act on their own account

| Company | Role | Data it receives from Vistralo |
| --- | --- | --- |
| Paddle | Reseller and merchant of record for paid plans. It takes payment, handles tax and issues receipts and refunds as a controller of the payment data it collects | The account's email address and Vistralo user ID at checkout. Card and billing details go to Paddle directly and never reach Vistralo. `{{PADDLE_ENTITY}}` |

Paid plans are switched off as of this draft, so no data goes to Paddle yet.

## Not used

On 13 October 2026 the app and the website load no analytics, advertising, session-replay, error-reporting, email-delivery or customer-support service. Sign-in and password-reset emails are sent by Supabase Auth. `{{CONFIRM_WHETHER_A_CUSTOM_EMAIL_SENDER_IS_CONFIGURED}}` Add a row here before any such service is switched on.

## Changes to this list

`{{HOW_AND_HOW_FAR_IN_ADVANCE_CUSTOMERS_ARE_TOLD, AND HOW A BUSINESS CUSTOMER CAN OBJECT}}`

## Facts to check before publishing

1. Each company's contracting entity and the region actually selected, from the dashboards and the signed agreements, not from memory.
2. A data processing agreement is in place with each company in the first table.
3. Backups: who holds them and where. `{{BACKUPS}}`
4. Search the code for new hosts before each update: the Content Security Policy in `vercel.json` lists every host the browser may contact, and `scripts/local-admin-worker.cjs` and `src/providers.cjs` show what the worker calls.
