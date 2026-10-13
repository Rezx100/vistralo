# Product

<!-- impeccable:product-schema 1 -->

Written 13 October 2026. The owner asked for the interview to be answered from the briefing files and the repository, so nothing here was confirmed in conversation. Each fact is tagged: **(repo)** is what the code or its docs show, **(brief)** is what the owner wrote in the redesign brief, handoff or blueprint, and **(inferred)** is my reading of the two and should be corrected if wrong.

## Platform

web

## Users

- People who have to explain something on a screen to someone who was not there: a designer walking a client through a page, an engineer handing over a feature, a product person showing a flow, a support agent answering with a short video instead of a paragraph. (brief: the four first use cases are design review, engineering handoff, product demos and customer support)
- They work alone or in a small team, at a desk, in a desktop browser, usually Chrome. Recording needs screen capture, which phone browsers do not offer, so the phone is for watching and sharing. (repo; inferred for "small team")
- Many of them do not want to speak on a recording, or do not have the time to re-record until it sounds right. The AI voice exists for them. (inferred from the product's emphasis on narration it writes and speaks)
- Second audience: the people who receive a link. They have no account, open it once, often on a phone, and want the video and nothing else. (repo: the share page is public and read-only)

## Product Purpose

Vistralo turns a screen recording, an uploaded video, a set of screenshots or a public website into a narrated walkthrough. It finds each distinct screen, writes one spoken line for it, voices the line, and holds the picture on that screen while the line plays. For a website it also reads the page's code and produces a Visual brief: screenshots at several widths with notes on the libraries, fonts and effects it found. (repo)

Success for the person recording: one click from "I should explain this" to the browser's screen picker, and a share link ready as soon as the recording stops. (brief)

Success for the business: a public product people can sign up for and pay for. Today accounts are created by the administrator and there are no working plans. (brief, repo)

## Positioning

A screen recorder gives back what you recorded. Vistralo gives back an explanation of it.

- The narration is written from what is on each screen and holds on that screen while it is spoken. Other recorders add a voice track over a video that keeps moving. (repo)
- A set of still screenshots becomes a narrated walkthrough with no recording at all. (repo)
- A website becomes a Visual brief that names the real libraries behind what the page does, taken from the page's code. When only the video suggests something, the product says "likely". (repo: `AGENTS.md`)

These three lead the product. The recorder, library and share link around them follow the shape people already know from Loom. (brief)

## Operating Context

- Desktop browser, mostly Chrome. The browser's own "Choose what to share" dialog and its "sharing your screen" bar always appear; the product cannot remove or restyle them. (repo, handoff)
- Six ways to start: record an AI walkthrough, record a talk-through (your own voice), record a section of the screen, narrate a video, narrate screenshots, analyze a website. (repo: `web/features/create-flows.ts`)
- Work is slow by web standards. A walkthrough is queued, then processed by one worker for minutes, and can fail. People leave and come back, so status has to be readable at a glance and actionable when something is stuck. (repo, handoff)
- AI narration runs on the customer's own OpenAI and HeyGen keys, with a spending cap per job that the customer sets. Vistralo does not pay for or resell AI. (brief: decided)
- Two modes: cloud (Supabase) and a demo at `#demo/` that keeps everything in the browser and needs no account. (repo)

## Capabilities and Constraints

Confirmed:

- Web app only. No browser extension and no mobile app, and the desktop app is out of scope. (brief: decided)
- Light theme first, with the dark theme kept and fully working. (brief: decided)
- Must keep working: German, right-to-left layout, Windows high-contrast mode, reduced motion, the keyboard shortcuts (N, U, I, W, Ctrl+K, Ctrl+B, ?), demo mode, and recovery of a recording left unsaved. (brief, repo)
- Every colour, size and spacing value lives in `web/styles/tokens.css`; `npm run lint:design` fails on raw values elsewhere. Fonts are self-hosted, and any new host the browser contacts must be added to the Content Security Policy in `vercel.json`. `'unsafe-inline'` is not allowed. (repo, brief)
- Share links are read-only and expire. (repo)
- Payments use Paddle Billing as merchant of record, sandbox only for now. Sign-up and billing are built behind flags that are off. (repo, brief)
- One worker processes jobs. (repo)

Terms the product uses, which the interface and copy should keep: project, walkthrough, talk-through, section, Visual brief, narration script, share link, workspace, capture worker.

Undecided, and not to be invented:

- Plan names, limits and prices. Free, Pro and Studio and their numbers in `web/billing/plans.ts` are placeholders. (brief)
- Teams, comments, reactions and view counts. None exist. (blueprint)
- Whether a free screen-recorder tool page or a download page is offered. (blueprint)

## Brand Commitments

- The name Vistralo and its emblem (`server-ui/assets/brand/emblem-light.svg`, `emblem-dark.svg`, `favicon.svg`) stay. (brief)
- Vistralo keeps its own voice. It is modelled on Loom's structure and flows only; no other company's code, images, logo, wording, help text or legal text is used. (brief)
- The operator named in the legal drafts is Dynamix LTD, Dhaka, Bangladesh; contact is contact@vistralo.com. (repo: `docs/legal/README.md`, itself marked unconfirmed)
- Voice, as the existing interface writes it: plain sentences, says what happened and what to do next, British-leaning spelling in docs ("analyse") and American in the interface ("Analyze a website"). (repo; the mixed spelling is an observation, not a decision)

## Evidence on Hand

- Eight sample projects in demo mode, with posters and a sample film, in `web/fixtures.ts` and `server-ui/assets`. These are the only real product imagery.
- The audit of the current app and its twelve fixed faults (`vistralo-redesign-handoff.md`, section 6).
- One private visual reference for the library, `vistralo-inspiration/mericod-screen-recording-dashboard.png`. It is someone else's concept shot: structure may be taken from it, its artwork and name may not.

Not on hand, and not to be fabricated: customers, testimonials, logos, usage numbers, case studies, press, awards, security certifications, uptime figures, measured search volumes, confirmed prices.

## Product Principles

1. The explanation is the product. The narrated walkthrough, narrated screenshots and the Visual brief come first on every surface; the recorder and library serve them.
2. One obvious way to start. Recording is one click from anywhere, and nothing floats over the user's content to get there.
3. Land on the result. Stopping a recording opens that project with the share link offered first, not a form.
4. Every status says what is happening and what the person can do next, including the stuck and failed ones.
5. Say only what is true. "Likely" when the evidence is thin, placeholders marked as placeholders, no invented proof.

## Accessibility & Inclusion

WCAG 2.2 AA is what the existing tests enforce (axe with the `wcag2a`, `wcag2aa`, `wcag21aa` and `wcag22aa` tags), with text contrast of at least 4.5:1 and no horizontal page scroll at any width. Support for right-to-left layout, German, Windows forced colours, reduced motion and keyboard-only use is existing behaviour that must not regress. (repo, brief)
