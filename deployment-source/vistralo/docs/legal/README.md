# Vistralo legal publication gate

**Drafts only — not approved legal notices. Do not copy these to a public page or describe Vistralo as legally compliant.** Neither https://vistralo.com nor https://app.vistralo.com links to a legal notice yet. The MIT software license does not replace a service privacy notice or customer terms.

The drafts here map product behavior to information a reviewer needs. Replace every `{{FIELD}}` with verified operator facts, obtain jurisdiction-appropriate legal review, then publish versioned notices and link them from the app's sign-in page and settings and from the landing footer **before** opening signups. Show material updates to existing users and retain the prior versions.

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

Do not launch public multi-user signups based on these draft notices. No analytics or advertising SDK was found in the inspected source; reassess when a marketing site, telemetry or payment service is added. “No sale/share” and “no model training” are not legal statements until all provider terms and actual operations have been checked.

## Decisions required before publication

1. Operator is a software company in Bangladesh named **Dynamix LTD**; supplied address is **Mirpur 12, Eastern Housing, Road10, House 123, 2nd Floor, Dhaka 1216, Bangladesh**. Supplied contact is **contact@vistralo.com** and website is **vistralo.com**. Confirm company registration details, operational mailbox and domain ownership; role as controller or processor for each data set; age/audience; whether service is sold to US, EEA or UK residents.
2. Hosting and backup countries; exact retention/deletion schedule for projects, uploads, sessions, logs, backups and provider data; rights request identity-check and response workflow.
3. OpenAI/HeyGen and host contracts, subprocessors, international transfer safeguards, and whether EU and UK representatives or a DPO are required.
4. Whether California CCPA/CPRA applies to the operator and whether data is sold/shared; other US state thresholds and rights if public service expands.
5. Commercial terms: service owner, payments/refunds (if any), acceptable use, customer recording rights, service availability, support, termination, dispute venue and liability provisions.
6. Tested account deletion and export paths before public signups. A statement in a policy cannot substitute for an implemented request process.

## Regulatory references

- EU GDPR, Articles 13–14, 27 and 28: https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32016R0679
- UK ICO privacy information checklist: https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/individual-rights/the-right-to-be-informed/checklists/
- UK ICO storage/access technologies: https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/guide-to-pecr/cookies-and-similar-technologies/
- California current statute and regulations: https://cppa.ca.gov/regulations/
- FTC guidance on truthful privacy representations: https://www.ftc.gov/policy/advocacy-research/tech-at-ftc/2024/01/ai-companies-uphold-your-privacy-confidentiality-commitments
