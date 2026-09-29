# Providers and spending

Vistralo calls two paid providers, only from the worker and only for real jobs: OpenAI writes the script, HeyGen voices it.

## Keys

The workspace owner enters the OpenAI and HeyGen keys in the app's provider settings. The browser seals each key to the capture worker's public key (`web/cloud.ts`, `scripts/worker-secrets.cjs`) before saving it through `vistralo_save_provider_settings`, so the database only holds ciphertext. The private key stays on the worker host. Never paste keys into project names, briefs, prompts, logs or Git.

## OpenAI (director script)

The worker sends every held viewport plus small in-motion frames, and the build read's evidence text, in one structured request (`providers.directorScript`). The model is `VISTRALO_DIRECTOR_MODEL` if set, else `gpt-5-mini`, falling back to `gpt-4.1` and then `gpt-4o-mini` on HTTP 400, 403, 404 or 429.

## HeyGen (voice)

The default voice is `02dbea5e083144c884525b7d9260bec6` (**Rezan Ferdous -- 62**); the owner can choose another voice ID in settings. Speech is made per spoken stop with `POST /v3/voices/speech`, at most 5,000 characters per request.

## Spending

Each owner sets a per-job cost cap (`cost_cap_usd`) in provider settings, and the worker checks its estimate against it before calling a provider. The estimate cannot guarantee what a provider bills, so also set a budget in each provider's account. A request that fails with an uncertain outcome is not retried automatically.
