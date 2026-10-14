# Keyword map for vistralo.com

Written 13 October 2026. This decides which page answers which search, and gives each page its title, meta description, main heading and links before any copy is written.

**No search volume or difficulty has been measured.** The SEO connector (openseo) failed to connect in two sessions, so every "Volume" cell says "unmeasured". The clusters come from `vistralo-loom-blueprint.md`, section 6: the phrases Loom built pages for, and what Vistralo does that Loom does not. Before spending effort on a page beyond its first version, measure its primary phrase and replace the cell.

## How to read it

- One primary phrase per page. No two pages share one, so they do not compete with each other.
- Titles are 60 characters or fewer and meta descriptions 155 or fewer, so they are not cut off in results. `node scripts/check-keyword-map.cjs` checks both and fails on a duplicate primary phrase.
- "Expect" is a guess at how hard the phrase is for a new site, from who already has pages for it. It is not a measurement.
- Every claim a page makes must be true of the product today. Where a page would be tempted to claim more, the "Must not say" table records it.

## Pages

| Page | URL | Primary phrase | Also covers | Intent | Volume | Expect |
| --- | --- | --- | --- | --- | --- | --- |
| Home | `/` | AI narrated walkthrough | narrated screen recording, AI voiceover for screen recording, Vistralo | Learn what it is, try it | unmeasured | Reachable: few products hold the picture while a line plays |
| Pricing | `/pricing` | Vistralo pricing | Vistralo plans, Vistralo free plan | Compare plans, sign up | unmeasured | Brand phrase; ranks once the site is indexed |
| AI walkthroughs | `/ai-walkthroughs` | add voiceover to screen recording | AI voiceover for screen recording, narrate a screen recording, AI narrated product walkthrough | Solve a task now | unmeasured | Contested by video editors and text-to-speech tools; winnable on the "explains each screen" angle |
| Narrate screenshots | `/narrate-screenshots` | turn screenshots into video | screenshots to video with voiceover, narrated screenshots, screenshot walkthrough | Solve a task now | unmeasured | Reachable: most results are slideshow makers with no narration written for them |
| Website visual briefs | `/website-visual-briefs` | website design teardown | what is this website built with, landing page breakdown, website design review tool | Research a site | unmeasured | "Built with" is owned by technology lookup sites; the teardown and breakdown phrases are open |
| Design review | `/use-cases/design-review` | design review video | design handoff video, design feedback video, walkthrough for design critique | Find a way of working | unmeasured | Reachable |
| Engineering handoff | `/use-cases/engineering-handoff` | code walkthrough video | engineering handoff video, pull request walkthrough video, explain a feature to the team | Find a way of working | unmeasured | Reachable |
| Product demos | `/use-cases/product-demos` | product demo video maker | narrated product demo, product walkthrough video | Compare tools | unmeasured | Hard: demo tools (Arcade, Supademo and others) target this directly |
| Customer support | `/use-cases/customer-support` | support video replies | video replies for customer support, how-to video for a support ticket | Find a way of working | unmeasured | Reachable |
| Vistralo vs Loom | `/compare/loom` | Loom alternative | Vistralo vs Loom, Loom alternative with AI voiceover | Compare tools | unmeasured | Very hard: every recorder has this page. Rank for the "with AI voiceover" variant first |
| Vistralo vs Arcade | `/compare/arcade` | Arcade alternative | Vistralo vs Arcade, Arcade vs narrated video | Compare tools | unmeasured | Hard |
| Vistralo vs Supademo | `/compare/supademo` | Supademo alternative | Vistralo vs Supademo | Compare tools | unmeasured | Hard |
| Security | `/security` | Vistralo security | where Vistralo stores recordings, Vistralo API keys | Check before buying | unmeasured | Brand phrase |
| Contact | `/contact` | contact Vistralo | Vistralo support | Reach a person | unmeasured | Brand phrase |
| Changelog | `/changelog` | Vistralo changelog | Vistralo updates, what's new in Vistralo | Check it is maintained | unmeasured | Brand phrase |
| Help centre | `/help` | Vistralo help | how to use Vistralo | Fix a problem | unmeasured | Brand phrase; individual articles target their own "how to" questions |

Left out of this round:

- A free screen recorder tool ("screen recorder", "online screen recorder", "free screen recorder"). These are the head terms and the blueprint's best idea for earning visits, but the page needs a recorder that works with no account, which the product does not have. The pages above link to the app's demo instead.
- Device and browser variants ("chrome screen recorder" and so on). They are only worth having if the free tool exists.
- A download page. There is no desktop app on offer.

## Titles, descriptions and headings

| Page | Title | Meta description | H1 |
| --- | --- | --- | --- |
| Home | Vistralo: AI narrated walkthroughs from any screen | Record a screen, upload a video or screenshots, or enter a website. Vistralo writes a line for each screen, speaks it and holds the picture as it plays. | A walkthrough that explains every screen |
| Pricing | Vistralo pricing: Free, Pro and Studio plans | Compare Vistralo plans: how many projects, AI walkthroughs each month, the longest recording narrated and how long share links last. Start free. | Plans |
| AI walkthroughs | Add an AI voiceover to a screen recording \| Vistralo | Record your screen or upload a video. Vistralo finds each screen, writes one spoken line for it and pauses the picture while the line plays. | Add a voiceover that knows what is on screen |
| Narrate screenshots | Turn screenshots into a narrated video \| Vistralo | Upload a set of screenshots and get a narrated walkthrough: one spoken line per image, written from what the image shows, in the order you choose. | Turn screenshots into a narrated video |
| Website visual briefs | Website design teardown with the real stack \| Vistralo | Enter a public URL. Vistralo captures the page at desktop and phone width, reads its code and writes a Visual brief of its libraries, fonts and effects. | A design teardown of any public website |
| Design review | Design review videos that explain each screen \| Vistralo | Walk a client or teammate through a design without booking a call. Vistralo narrates every screen and holds on it, so nothing scrolls past unexplained. | Design reviews people can watch on their own |
| Engineering handoff | Code walkthrough videos for handoff \| Vistralo | Record a feature once and hand over a narrated walkthrough: each screen explained in a spoken line, with a share link ready when the recording stops. | Hand over a feature with a walkthrough |
| Product demos | Narrated product demos from one recording \| Vistralo | Record your product once. Vistralo writes and speaks a line for each screen and pauses on it, so the demo is clear without a script or a retake. | Product demos that narrate themselves |
| Customer support | Answer support tickets with a narrated video \| Vistralo | Reply to a "how do I" ticket with a short narrated walkthrough made from a recording or a few screenshots, and send it as a link that needs no account. | Answer a ticket with a walkthrough |
| Vistralo vs Loom | Vistralo vs Loom: a Loom alternative with AI voiceover | Loom records and shares. Vistralo records, then writes and speaks an explanation of every screen. A comparison that includes what Loom does better. | Vistralo and Loom compared |
| Vistralo vs Arcade | Vistralo vs Arcade: narrated video or click-through demo | Arcade builds interactive demos people click through. Vistralo makes narrated videos people watch. What each is for, and what Arcade does better. | Vistralo and Arcade compared |
| Vistralo vs Supademo | Vistralo vs Supademo: narrated video or guided demo | Supademo turns clicks into step-by-step demos. Vistralo turns a recording into a narrated video. What each is for, and what Supademo does better. | Vistralo and Supademo compared |
| Security | Security at Vistralo: storage, keys and access | Where Vistralo keeps recordings, how your OpenAI and HeyGen keys are sealed in the browser, who can open a share link, and how to report a problem. | Security |
| Contact | Contact Vistralo | Email the Vistralo team about the product, your account, a bug, a security report or a copyright complaint. One address, read by a person. | Contact |
| Changelog | Vistralo changelog: what changed and when | Every notable change to Vistralo, newest first, written from the merged pull requests. | Changelog |
| Help centre | Vistralo help centre | How to record, narrate, edit and share with Vistralo, and what to do when a recording, a job or a share link does not behave. | Help |

## Must not say

These are constraints on the copy, taken from `PRODUCT.md`.

| Page | Do not claim | Because |
| --- | --- | --- |
| All | Customers, logos, testimonials, usage numbers, awards | None exist |
| All | "Compliant", "certified", SOC 2, GDPR-ready | Legal notices are unapproved drafts and nothing has been audited |
| Home, AI walkthroughs, Pricing | That narration is included on Free, or that it ever will be | Only Pro and Studio include it; Free brings its own OpenAI and HeyGen keys |
| Pricing | That plan names, limits or prices are final | They are placeholders awaiting the owner's confirmation; the page says so until confirmed |
| Website visual briefs | That it works on any site | Public pages only, and a claim about a library is "likely" unless the page's code proved it |
| Narrate screenshots, use cases | Mobile recording, a browser extension, a desktop app | Web app only |
| Comparisons | Anything about a competitor that was not checked on its own public pages on the day of writing | Stated with the date checked; no feature tables copied from anywhere |
| Security | Encryption at rest, retention periods, hosting regions | Not established in the repository; described only where the code proves it |

## Internal links

Every page links to Pricing and to the app from the header. Beyond that, each page sends the reader to the next thing they would ask about. Anchor text names the destination's subject.

| From | Links to |
| --- | --- |
| Home | The three product pages; the four use cases; Pricing; Vistralo vs Loom; Security |
| Pricing | Help: plans and billing; Security; Contact |
| AI walkthroughs | Narrate screenshots; Engineering handoff; Product demos; Help: how the script is written; Help: adding your own OpenAI and HeyGen keys; Vistralo vs Loom |
| Narrate screenshots | AI walkthroughs; Customer support; Design review; Help: narrate screenshots |
| Website visual briefs | Design review; Help: analyse a website; Help: what "public pages only" means |
| Design review | Website visual briefs; AI walkthroughs; Vistralo vs Loom |
| Engineering handoff | AI walkthroughs; Narrate screenshots; Help: share links and expiry |
| Product demos | AI walkthroughs; Vistralo vs Arcade; Vistralo vs Supademo |
| Customer support | Narrate screenshots; Help: share links and expiry; Help: who can see what |
| Each comparison | The other two comparisons; the product page closest to the difference it describes; Pricing |
| Security | Help: adding your own OpenAI and HeyGen keys; Help: who can see what; Contact |
| Changelog | The product page for whatever changed |
| Help centre | Every article; Contact |

## Help articles as search answers

Each help article takes its title from the way a person would ask the question.

| Article | Phrase it answers |
| --- | --- |
| Record your first walkthrough | how to record a walkthrough with Vistralo |
| What the browser will ask you and why | why does Chrome ask to share my screen |
| Tab, window or whole screen | should I share a tab or the entire screen |
| Your voice or an AI voice | AI voice or my own voice for a screen recording |
| The 1 GB browser limit | screen recording stops at 1 GB in the browser |
| Narrate screenshots | how to make a video from screenshots with narration |
| Adding your own OpenAI and HeyGen keys | use my own OpenAI key for narration |
| Share links and expiry | how long does a Vistralo share link last |
| Stuck on "Restoring your session" | Vistralo stuck on restoring your session |
| Screen sharing was not allowed | screen sharing permission denied in Chrome |
| Microphone not found | browser cannot find microphone for recording |
