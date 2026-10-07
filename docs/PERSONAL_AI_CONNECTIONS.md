# Personal AI connections

Open **Settings → AI Connections** (`/settings/ai`) with any signed-in account.

1. Choose **Add connection** and give it a name.
2. Select **Gemini** or **OpenAI-compatible** and enter the provider's Base URL and API key.
3. Click **Fetch models**, select a text model, then **Save connection**.
4. Click **Use as default**. New AI requests and queued jobs use the owner's active connection when execution begins.

You can save up to 20 connections, edit or delete them, or return to **Platform AI**. Connections belong to their user; administrators cannot read another user's keys through these endpoints. Keys are encrypted in the database and are never returned to the browser. Leaving the key blank during editing keeps the existing key only when the protocol and normalized Base URL are unchanged.

## Supported protocols

| Protocol | Base URL example | Discovery |
| --- | --- | --- |
| Gemini | `https://generativelanguage.googleapis.com` | `/v1beta/models` |
| OpenAI-compatible | `https://api.openai.com/v1` | `/models` |
| OpenRouter / compatible gateway | `https://openrouter.ai/api/v1` | `/models` |

OpenAI-compatible providers must implement model listing and chat completions. Gateways that require no authentication may leave the API key blank. Other protocols (such as native Anthropic Messages) require a compatible gateway. A listed model may still lack quota, generation access, tool support or the output budget required by a task. Discovery verifies model availability in the list, not generation success.

Personal connections apply to research gaps, reports, paper comparison/analysis/index extraction, quality scoring and AI chat. A connection selects one model for these tasks. Shared search embeddings and scheduled corpus jobs retain the platform configuration so stored vectors remain compatible. The separate Python manuscript **AI Reviewer** service still uses platform configuration.

## Server environment

- `GEMINI_API_KEY`, `GEMINI_BASE_URL`, `GEMINI_MODEL_FAST`, `GEMINI_MODEL_DEEP`: platform fallback. Existing installations continue to work without personal connections.
- `AI_CONNECTION_ENCRYPTION_KEY`: stable secret of at least 32 characters. `pnpm setup` creates it when missing. Keep it with database backups; changing it requires users to re-enter their saved API keys. Installations without this value fall back to `INTERNAL_SERVICE_KEY`; changing that fallback also makes saved keys unreadable.
- `AI_ALLOW_LOCAL_ENDPOINTS=true`: allow HTTP/HTTPS gateways on loopback, LAN and private VPN addresses, on any port. Enabled in the local `.env.example`; the backend default is false when unset. Examples: `http://localhost:51736/v1`, `http://localhost:11434/v1`, `http://192.168.1.10:1234/v1`. Link-local/metadata, unspecified and reserved addresses are not granted access by this switch.
- `AI_LOCALHOST_HOST`: Compose sets `host.docker.internal`. User-facing localhost/loopback URLs are routed to the host computer when making a request; saved URLs retain the address the user entered. Leave unset for a native backend. Docker Desktop provides this hostname; on Linux, configure Docker's host-gateway alias if needed.
- `AI_ALLOWED_BASE_URLS`: comma-separated exact origins for separately trusted gateways, for example `http://host.docker.internal:11434`. This also works when general local gateway access is disabled. Recreate backend and workers after changing server environment. Public endpoints must use HTTPS. Requests pin validated DNS addresses and do not follow redirects with credentials.

Base URLs must not contain embedded credentials, query parameters or fragments. Choose the OpenAI-compatible protocol for local servers exposing `/v1/models` and `/v1/chat/completions`; API keys may be blank only if the gateway permits this. The local endpoint switch changes network access, not the supported API protocols.
