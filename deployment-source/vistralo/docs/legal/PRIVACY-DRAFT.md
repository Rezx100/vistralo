# Vistralo privacy notice — DRAFT, NOT PUBLISHED

Effective date: `{{EFFECTIVE_DATE}}` · Operator: Dynamix LTD · Address: Mirpur 12, Eastern Housing, Road10, House 123, 2nd Floor, Dhaka 1216, Bangladesh · Website: https://vistralo.com · Privacy contact: contact@vistralo.com

This draft describes the Vistralo cloud app at https://app.vistralo.com and the website https://vistralo.com. It must be verified against the deployed service before publication. Dynamix LTD must identify when it acts as controller for account and operational data and when it processes customer recordings on a customer's instructions.

## What Vistralo handles

Vistralo stores each account's projects in Supabase: project names, recordings, uploaded videos and screenshots, posters, website briefs, scripts, generated audio and finished films. A processing worker on a server downloads a project's media to make the film and uploads the result. For website projects, the worker opens the public page in a headless browser and records the libraries, fonts and effects it finds. A capture can incidentally include people, voices, page text, account details or other personal information visible on screen. The customer chooses what to record and upload.

Sign-in uses Supabase Auth with an email address and password; the app keeps the sign-in session in browser storage. Provider API keys are sealed in the browser to the worker's public key and stored only as ciphertext. The marketing website sets no cookies and loads no analytics. Dynamix LTD must inventory the actual Vercel, Supabase and worker logs before stating what IP addresses, device details or diagnostics it retains.

## Purposes and legal basis — complete after operator review

| Purpose | Data | Legal basis for EEA/UK processing | Retention |
| --- | --- | --- | --- |
| Deliver recording, upload, editing, rendering and downloads | Customer content and project/job records | `{{BASIS_AND_CONTROLLER_PROCESSOR_ROLE}}` | `{{PROJECT_RETENTION}}` |
| Authenticate and protect the service | Account email, sign-in session, access attempts and operational logs | `{{BASIS}}` | `{{SESSION_AND_LOG_RETENTION}}` |
| Perform optional approved AI analysis | Selected frames and evidence sent to OpenAI | `{{BASIS}}` | `{{PROVIDER_RETENTION}}` |
| Perform optional approved voice generation | Approved script sent to HeyGen | `{{BASIS}}` | `{{PROVIDER_RETENTION}}` |
| Respond to support/privacy requests | Contact details and request records | `{{BASIS}}` | `{{SUPPORT_RETENTION}}` |

Provider calls run only for the owner's own jobs, within the per-job cost cap set in provider settings. Provider request options alone are not a complete promise about provider retention or training. Confirm current provider terms before making a stronger statement. There is no marketing or analytics integration in the inspected application source.

## Recipients and transfers

Hosting and backups: Vercel (app and website), Supabase (accounts, database, storage) and the worker's server host; countries and backup locations `{{HOST_AND_BACKUP_SUBPROCESSORS_COUNTRIES}}`. Optional OpenAI and HeyGen processing occurs only when approved: `{{PROVIDER_ENTITIES_LOCATIONS_TRANSFER_SAFEGUARDS}}`. Add any support, payment, email, telemetry or marketing vendors actually used. If EEA/UK data moves abroad, state the applicable adequacy decision or transfer mechanism and how users can obtain it. List `{{EU_REPRESENTATIVE_IF_REQUIRED}}`, `{{UK_REPRESENTATIVE_IF_REQUIRED}}` and `{{DPO_IF_REQUIRED}}` where applicable.

## Retention, protection and requests

Define actual deletion periods for complete and incomplete uploads, recordings, outputs, session records, logs and backups. Explain whether deleting a project removes all replicas and when a backup ages out: `{{DELETION_AND_BACKUP_POLICY}}`. Storage access is limited by Supabase row-level security to each owner's own files; do not claim end-to-end encryption or independently restorable backups without verification.

People may have rights to access, correct, erase, restrict, object, port data or withdraw consent depending on their location and applicable legal basis. Send requests to `contact@vistralo.com`; describe verification, response time and any customer-controller routing at `{{RIGHTS_PROCESS}}`. EEA users can complain to a relevant data protection authority; UK users can complain to the ICO. Add California and other applicable US state rights, appeal/opt-out methods and notices after applicability and actual practices are confirmed. Do not imply a “Do Not Sell or Share” mechanism exists when it has not been implemented.

Contact: Dynamix LTD, Mirpur 12, Eastern Housing, Road10, House 123, 2nd Floor, Dhaka 1216, Bangladesh; email `contact@vistralo.com`. Material changes: `{{NOTICE_CHANGE_PROCESS}}`.
