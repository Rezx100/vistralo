# Vistralo legal publication gate

**Drafts only — not approved legal notices. Do not copy these to a public page or describe Vistralo as legally compliant.** Neither https://vistralo.com nor https://app.vistralo.com links to a legal notice yet. The MIT software license does not replace a service privacy notice or customer terms.

The drafts here map product behavior to information a reviewer needs. Replace every `{{FIELD}}` with verified operator facts, obtain jurisdiction-appropriate legal review, then publish versioned notices and link them from the app's sign-in page and settings and from the landing footer **before** opening signups. Show material updates to existing users and retain the prior versions.

## Drafts in this folder (13 October 2026)

Every page the blueprint lists now has a draft. None is approved, none is published and neither site links to any of them. "Open fields" counts the `{{FIELD}}` placeholders still in the file: facts only the operator knows, decisions the operator has to make, and passages left for counsel.

| Page | File | Open fields | What mainly holds it up |
| --- | --- | --- | --- |
| Service terms | `TERMS-DRAFT.md` | 21 | Warranties, liability and governing law are left wholly to counsel; confirmed plans; the account deletion process |
| Privacy notice | `PRIVACY-DRAFT.md` | 22 | Hosting countries, retention periods, lawful bases, transfer safeguards |
| Browser storage notice | `STORAGE-NOTICE-DRAFT.md` | 2 | What Paddle's checkout stores in the browser |
| Refund policy | `REFUND-POLICY-DRAFT.md` | 14 | The refund window and renewal rule, which are the operator's decision; the consumer withdrawal right |
| Acceptable use policy | `ACCEPTABLE-USE-DRAFT.md` | 7 | The appeal process; duties to report content |
| Copyright and takedown policy | `COPYRIGHT-TAKEDOWN-DRAFT.md` | 12 | Which notice regimes apply, a designated agent, response times |
| AI and voice disclosure | `AI-AND-VOICE-DRAFT.md` | 14 | The providers' current data terms, the default voice and its consent, the models used in production |
| Data processing addendum | `DPA-DRAFT.md` | 22 | Transfer mechanism, breach notice period, audit terms, how it is accepted |
| Subprocessors and other recipients | `SUBPROCESSORS-DRAFT.md` | 17 | Each provider's contracting entity and region; whether OpenAI and HeyGen are the customer's processors or Vistralo's |
| Security overview | `SECURITY-OVERVIEW-DRAFT.md` | 13 | Hosting regions, encryption at rest, backups, who holds administrator access |
| Company details and contact | `COMPANY-DETAILS-DRAFT.md` | 14 | Registered name and number, a postal contact for legal notices, representatives if required |

The terms were rewritten on 13 October 2026 to match the refund policy and to name Paddle as reseller and merchant of record (section 6). Read the two together: a change to one usually needs the other changed.

Three facts in these drafts are true of the code but have to be confirmed in production before anything is published:

1. Pro and Studio narration runs on Vistralo's own OpenAI and HeyGen keys; Free brings its own; a customer's own saved keys always come first (`src/included-ai.cjs`, decided 14 October 2026). The terms, the AI disclosure, the DPA, the subprocessors list and the refund policy say so; change them together if the plans that include AI change.
2. The database rules in production match the migrations. `docs/SCHEMA-DRIFT.md` records where they are known to differ.
3. The share page described is the app's `/watch` page (`web/share/watch.ts`). It works only once the app change that adds it is deployed and the `vistralo-share` function from the same change is deployed with it.

## Product data map (cloud app, 29 September 2026)

| Operation | Data and location | Disclosure question |
| --- | --- | --- |
| Accounts | Supabase Auth (email and password) in project `yyiikuzhgxdgrthntzyr`; accounts are created by the workspace administrator, there is no public signup | Supabase region `{{SUPABASE_REGION}}`, account deletion process, who administers access |
| Browser storage | The Supabase sign-in session and, during an upload, a resume reference, both in browser storage on app.vistralo.com; the landing sets no cookies and has no analytics | Confirm the exact keys and lifetimes before publishing |
| Projects and media | Recordings, screenshots, posters, briefs and finished films in Supabase Storage bucket `vistralo-media` under the owner's ID; project and job records in `vistralo_projects` and `vistralo_jobs` | Retention and deletion after a project is trashed or an account closes; backups |
| Processing worker | The VPS worker downloads a project's media to its working folder, runs FFmpeg, and uploads results | Host provider and country `{{WORKER_HOST_AND_COUNTRY}}`, how long working copies stay on the host |
| Website read | For website projects and recordings with a URL, the worker opens the public page in headless Chrome and records which libraries, fonts and effects it finds | Pages can show third-party personal data; the customer must have authority to capture them |
| AI script | Held frames, small in-motion frames and the build-read evidence are sent to OpenAI to write the narration | OpenAI account terms, retention, transfer mechanism and subprocessor role |
| Voice | The approved script text is sent to HeyGen; the returned audio is stored with the project | HeyGen contract, data location, retention and voice authorization |
| Provider keys | Entered by the owner, sealed in the browser to the worker's public key, stored only as ciphertext in `vistralo_provider_settings` | Key rotation and deletion when an account closes |
| Operational data | Vercel and Supabase request logs; the worker's systemd journal on the VPS | Inventory actual logs and retention; avoid claiming logs contain no personal data |
| Payments (built, switched off; see `docs/BILLING.md`) | Paddle is the merchant of record and holds card and billing details; Vistralo stores only the Paddle customer and subscription IDs, plan, status and dates in `vistralo_billing_customers` and `vistralo_billing_subscriptions`, and a ledger of webhook event IDs. Checkout loads Paddle.js and a Paddle frame in the app, and passes the account's email and ID to Paddle | Paddle's role and entity, what Paddle.js stores in the browser, transfer mechanism, how long billing records are kept after an account closes |

Do not launch public multi-user signups based on these draft notices. No analytics or advertising SDK was found in the inspected source; reassess when a marketing site, telemetry or payment service is added. “No sale/share” and “no model training” are not legal statements until all provider terms and actual operations have been checked.

## Decisions required before publication

1. Operator is a software company in Bangladesh named **Dynamix LTD**; supplied address is **Mirpur 12, Eastern Housing, Road10, House 123, 2nd Floor, Dhaka 1216, Bangladesh**. Supplied contact is **contact@vistralo.com** and website is **vistralo.com**. Confirm company registration details, operational mailbox and domain ownership; role as controller or processor for each data set; age/audience; whether service is sold to US, EEA or UK residents.
2. Hosting and backup countries; exact retention/deletion schedule for projects, uploads, sessions, logs, backups and provider data; rights request identity-check and response workflow.
3. OpenAI/HeyGen and host contracts, subprocessors, international transfer safeguards, and whether EU and UK representatives or a DPO are required.
4. Whether California CCPA/CPRA applies to the operator and whether data is sold/shared; other US state thresholds and rights if public service expands.
5. Commercial terms: service owner, payments/refunds, acceptable use, customer recording rights, service availability, support, termination, dispute venue and liability provisions. Payments will go through Paddle (decided 13 October 2026), which asks for terms, a privacy notice and a **refund policy** reachable from the site's navigation before it approves live payments: see `REFUND-POLICY-DRAFT.md`. The terms must name Paddle as reseller and merchant of record.
6. Tested account deletion and export paths before public signups. A statement in a policy cannot substitute for an implemented request process.

## Regulatory references

- EU GDPR, Articles 13–14, 27 and 28: https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32016R0679
- UK ICO privacy information checklist: https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/individual-rights/the-right-to-be-informed/checklists/
- UK ICO storage/access technologies: https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/guide-to-pecr/cookies-and-similar-technologies/
- California current statute and regulations: https://cppa.ca.gov/regulations/
- FTC guidance on truthful privacy representations: https://www.ftc.gov/policy/advocacy-research/tech-at-ftc/2024/01/ai-companies-uphold-your-privacy-confidentiality-commitments
