# Platform API key pool (Gemini, OpenAlex)

Admins manage the platform's Gemini and OpenAlex keys in **Admin → API Keys** (`/admin/api-keys`).
Calls rotate to another key automatically when a provider rejects one, so a revoked key, a billing
problem or a used-up daily quota does not stop embeddings, analysis, reports or sync.

## Selection order

1. Enabled pool keys, lowest `priority` first, skipping keys that are cooling down or marked rejected.
2. The env key (`GEMINI_API_KEY` / `OPENALEX_API_KEY`) as the last fallback.

Order of precedence for Gemini text generation is unchanged: a user's personal AI connection, then the
active platform AI connection (Platform Settings), then this pool. Embeddings use an active platform
embedding connection first, then this pool.

## When a key is rotated out

| Provider response | Effect |
|---|---|
| Gemini 400 `API_KEY_INVALID`, 401, expired key | Marked rejected (`invalid_at`) until an admin tests or replaces it |
| Gemini 403 (billing, region, permission) | Cooldown 1 hour |
| Gemini 429 daily or zero quota | Cooldown 1 hour (or the provider's retry delay, if longer) |
| OpenAlex 401/403 | Marked rejected |
| OpenAlex 429 whose body mentions the daily budget | Cooldown until the next UTC day |
| Per-minute 429, 5xx, network errors | Not about the key: no rotation, the caller's own retry applies |

The call is repeated at once with the next usable key. The rejection is written to the row
(`cooldown_until` / `invalid_at`, `last_error`, `failure_count`) so every process skips the key.
Each process (API and every worker) re-reads the pool at most every 30 seconds.

**Test** calls the provider with the key (Gemini: one embedding with `GEMINI_EMBEDDING_MODEL` and a
one-token generation with `GEMINI_MODEL_FAST`; OpenAlex: a cursor-paged request, which needs a valid
key). Success puts a rejected or cooling-down key back into rotation. A new key is tested when it is added.

## Security

Keys are encrypted with AES-256-GCM (`user-ai.crypto.ts`, bound to the row id) and decrypted only
when a call uses them. The API returns only the last 4 characters. Every change is written to the audit log.

Use extra keys as backups. Spreading one workload over many free-tier projects to multiply quota can
break the provider's terms.

## Code

- `apps/backend/src/modules/api-keys/api-key-pool.ts`: selection, failover (`withApiKey`), cooldown records.
- `api-key-errors.ts`: which provider errors mean "this key cannot serve the call".
- `openalex-key-fetch.ts`: `openAlexFetch`, used by every OpenAlex request.
- `modules/llm/gemini.client.ts`: `withGeminiKey` and the pooled `geminiClient`.
- Table `platform_api_keys` (migration `20261128120000_platform_api_keys`).
