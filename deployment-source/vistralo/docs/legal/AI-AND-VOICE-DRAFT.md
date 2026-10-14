# How Vistralo uses AI and voices — DRAFT, NOT PUBLISHED

Operator Dynamix LTD, Mirpur 12, Eastern Housing, Road10, House 123, 2nd Floor, Dhaka 1216, Bangladesh · Website https://vistralo.com · Contact contact@vistralo.com · Effective `{{EFFECTIVE_DATE}}`

**Not approved. Do not publish or link this until a lawyer has reviewed it and every `{{FIELD}}` is filled.** It is an original draft describing what the code does on 13 October 2026. It is not legal advice. Every statement about what OpenAI or HeyGen do with data must be checked against their current terms before publication; this draft makes none.

## In one paragraph

Vistralo's narration is written by an OpenAI model and spoken by a HeyGen voice. On Pro and Studio they run on Vistralo's own accounts with those companies, unless you have saved your own keys. On Free they run on API keys from your own accounts. Nothing is sent to either of them until you start a job that needs it. Talk-throughs recorded with your own voice, trimming, and plain uploads never go to an AI provider.

## What is sent to OpenAI, and when

When you start an AI walkthrough or ask for an AI voice-over, the worker that processes your project:

1. Works out which distinct screens appear in the recording.
2. Takes a still picture of each screen it will hold on, and a few smaller pictures from the parts where the screen is moving.
3. For a website project, or a recording you gave a web address for, also opens the public page in an automated browser and writes notes on the libraries, fonts and effects it finds in the page's code.
4. Sends those pictures and notes to OpenAI in one request, with instructions to write one spoken line per screen.

The pictures show whatever was on screen. If a name, a message, an account number or a face was visible in the recording, it is in the pictures. Vistralo does not blur or remove anything. `{{CONFIRM_THE_NUMBER_AND_RESOLUTION_OF_FRAMES_SENT}}`

The audio of your recording is not sent to OpenAI. `{{CONFIRM}}` The request asks OpenAI not to store it (`store: false`). What OpenAI retains, for how long, and whether it uses API data to train models are governed by your agreement with OpenAI: `{{LINK_AND_SUMMARY_AFTER_CHECKING_OPENAI'S_CURRENT_TERMS}}`.

The model is `{{MODEL_NAMES_IN_PRODUCTION}}`. If that model refuses the request or is rate limited, the worker tries a second and then a third model.

## What is sent to HeyGen, and when

The script, as text, one spoken line at a time. No pictures and none of your recording. For a website project the script is sent only after you have read and approved it. For a recording, the walkthrough is made in one step: the script is written and voiced without a pause for review, and you can edit it and make the voice-over again afterwards. `{{CONFIRM_THE_APPROVAL_STEP_FOR_EACH_FLOW_AS_SHIPPED}}`

HeyGen returns audio, which is stored with your project. What HeyGen retains is governed by your agreement with HeyGen: `{{LINK_AND_SUMMARY_AFTER_CHECKING_HEYGEN'S_CURRENT_TERMS}}`.

## Voices

The default voice is `{{DEFAULT_VOICE_NAME_AND_WHOSE_IT_IS}}`. You can enter a different HeyGen voice ID in Settings. Only use a voice you have the right to use. A voice that imitates a real person needs that person's agreement, and the Acceptable Use Policy forbids using one without it. `{{WHETHER_THE_DEFAULT_VOICE_IS_A_CLONE_OF_A_REAL_PERSON_AND_THE_CONSENT_HELD}}`

## Your keys

You enter your OpenAI and HeyGen keys in Settings. Your browser encrypts each key before it leaves your computer, using a public key published by the worker (RSA-OAEP with SHA-256). The database stores only the encrypted form, which the web app cannot read back. Only the worker holds the private key that can open it, and it does so when it runs your job.

To stop Vistralo using a key, replace it in Settings or revoke it in the provider's own dashboard. Revoking it at the provider is the only way to be certain. `{{WHETHER_A_STORED_KEY_CAN_BE_DELETED_FROM_SETTINGS}}`

## Cost

When your own keys are used, OpenAI and HeyGen bill you directly, and the cost limit you set in Settings is checked against Vistralo's own estimate before a provider is called; it cannot guarantee what the provider charges. When the included keys are used, Vistralo pays the providers and applies its own limit per job, which your setting can lower but not raise. A request that fails without a clear answer is not sent again automatically, so that you are not charged twice for one job.

## What the AI gets wrong

- It describes what it sees in still pictures. It can misread small text, miss something that happened between two pictures, or describe a screen confidently and wrongly.
- When it names a library or a technique, the claim is only as good as the evidence. Where the page's code confirmed it, the narration states it. Where only the pictures suggest it, the narration says "likely" or "looks like".
- It does not know your product. Read the script before you send a walkthrough to a customer.

## What Vistralo does not do

- It does not train AI models on your content. `{{CONFIRM_AND_STATE_THE_PROVIDERS'_POSITION_SEPARATELY}}`
- It does not send content to an AI provider for any project where you did not ask for narration or a website analysis.
- It does not make decisions about people.

## Telling viewers

A narrated walkthrough is spoken by a synthetic voice. The page a share link opens says "Narrated by an AI voice." under a narrated film (`web/share/watch.ts`); a video file you download carries no such label. If you publish one where the law or a platform's rules require AI-generated audio to be labelled, labelling it is your responsibility. `{{COUNSEL: TRANSPARENCY DUTIES, FOR EXAMPLE UNDER THE EU AI ACT}}`

## Facts to check before publishing

1. Read `src/providers.cjs` and `scripts/local-admin-worker.cjs` again on the day of publication and correct anything above that has changed, especially which frames are sent and whether audio ever is.
2. The included keys are used only for the plans marked `aiIncluded` in `web/billing/plans.json` (Pro and Studio) and the owner's account, and a customer's own saved keys always come first (`src/included-ai.cjs`). The worker no longer reads `OPENAI_API_KEY` or `HEYGEN_API_KEY`; its included keys are `VISTRALO_INCLUDED_*`.
3. The default voice's ownership and consent.
4. Both providers' current API data terms, linked and summarised in their own words with the date checked.
5. The working copies the worker keeps on its server: where, and for how long. `{{WORKER_WORKING_COPY_RETENTION}}`
