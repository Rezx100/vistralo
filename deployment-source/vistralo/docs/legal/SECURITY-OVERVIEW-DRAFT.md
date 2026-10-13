# Vistralo security overview — DRAFT, NOT PUBLISHED

Operator Dynamix LTD, Mirpur 12, Eastern Housing, Road10, House 123, 2nd Floor, Dhaka 1216, Bangladesh · Website https://vistralo.com · Contact contact@vistralo.com · Last updated `{{DATE}}`

**Not approved. Do not publish or link this until it has been reviewed and every `{{FIELD}}` is filled.** It is an original draft. It describes only what the code shows on 13 October 2026, and it says where something is unknown. Vistralo holds no security certification and has had no independent audit or penetration test; this page must not suggest otherwise.

## Where your content lives

Projects, recordings, screenshots, scripts, audio and finished films are stored in Supabase (database and file storage). The web app is served by Vercel. One processing worker on a separate server downloads a project's media while it makes the film and uploads the result. Regions and providers: `{{HOSTING_REGIONS_AND_WORKER_HOST}}`.

## Who can read it

- Other customers cannot read it. Every table has row-level security, and the rules let an account read and change only rows it owns. Files are stored under a folder named for the owner's account, and the storage rules check that folder against the signed-in user.
- Someone with a share link can see one thing: the walkthrough or brief that link was made for, read-only.
- The processing worker can read the projects it processes. It signs in as an administrator account. `{{WHO_ELSE_HOLDS_ADMINISTRATOR_OR_DATABASE_ACCESS, AND HOW THAT ACCESS IS CONTROLLED AND LOGGED}}`
- Vistralo staff: `{{WHETHER_AND_WHEN_STAFF_OPEN_CUSTOMER_CONTENT}}`

## Signing in

Sign-in is by email and password through Supabase Auth, which stores a hash of the password, not the password. New passwords must be at least 12 characters. Vistralo keeps your session in your browser's storage; signing out removes it. `{{WHETHER_MULTI-FACTOR_SIGN-IN_IS_AVAILABLE}}` (it is not built today).

## Share links

A share link contains a random 256-bit token. Vistralo stores only a SHA-256 hash of it, so a link cannot be recovered from the database. Every link expires, after 1, 7 or 30 days as you choose, and you can revoke one at any time. Moving a project to Trash revokes its links. The page a link opens loads no scripts and sets no cookies.

## Your OpenAI and HeyGen keys

Your browser encrypts each key with the worker's public key (RSA-OAEP with SHA-256) before sending it. The database holds only the result, and the web app has no permission to read that column back. The private key exists only on the worker's server. `{{HOW_THE_WORKER'S_PRIVATE_KEY_IS_STORED, BACKED UP AND ROTATED}}`

## In transit and at rest

The app, the website, Supabase and the provider APIs are reached over HTTPS. `{{ENCRYPTION_AT_REST: STATE ONLY WHAT SUPABASE AND THE WORKER HOST DOCUMENT, WITH LINKS}}` Recordings are not end-to-end encrypted: the service has to read them to make the walkthrough.

## The browser

The app sends a Content Security Policy that allows scripts only from its own address (and from Paddle's checkout when paid plans are on), refuses inline scripts and styles, and cannot be framed by another site. It loads no analytics or advertising code.

## Payments

Paddle takes payment as merchant of record. Card details go to Paddle and never reach Vistralo's servers. Vistralo accepts a billing event from Paddle only after checking its signature, and processes each event once.

## The website reader

When you analyse a website, the worker opens the address in an automated browser. It refuses addresses on private or local networks and addresses that contain credentials, so it cannot be pointed at internal systems.

## What we do not have yet

Stated plainly so nobody assumes otherwise:

- No independent audit, penetration test or certification.
- No multi-factor sign-in, single sign-on or team roles.
- No self-service account deletion or export. Ask at contact@vistralo.com.
- `{{BACKUP_AND_RESTORE: WHETHER BACKUPS EXIST, HOW LONG THEY ARE KEPT, AND WHEN A RESTORE WAS LAST TESTED}}`
- `{{MONITORING_AND_INCIDENT_RESPONSE: WHO IS ALERTED, AND HOW QUICKLY CUSTOMERS ARE TOLD ABOUT A BREACH}}`

## Reporting a security problem

Email contact@vistralo.com with "Security" in the subject. Say what you found and how to reproduce it, and please do not open other people's data or disrupt the service while testing. `{{RESPONSE_TIME}}` `{{SECURITY_MAILBOX_IF_SEPARATE, AND WHETHER A security.txt FILE IS PUBLISHED}}`

## Facts to check before publishing

1. The database rules in production. `docs/SCHEMA-DRIFT.md` shows that the processing worker must have rights in production that are not recorded in the repository (to read and change other accounts' projects, jobs and files). Record the real policies and have them reviewed before publishing the "Who can read it" section.
2. The password length and email-confirmation settings in Supabase Auth match what this page says.
3. The share page still loads no scripts (`supabase/functions/vistralo-share/index.ts`).
4. The Content Security Policy in `vercel.json` still matches the description.
5. Every `{{FIELD}}` is answered from the provider's own documentation or dashboard, with a link.
