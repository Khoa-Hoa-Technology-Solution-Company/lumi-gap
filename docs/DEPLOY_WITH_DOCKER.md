# Docker Compose Runtime

This Compose stack is a reproducible **local/demo runtime** for LiemResearch:

- React web app through Nginx on `http://localhost:8080`
- Express API on `http://localhost:4000`
- MongoDB and Redis with persistent named volumes
- opt-in BullMQ workers through Compose profiles

It is suitable for a lecturer to inspect the project architecture and run the
application locally. It is not a replacement for managed production hosting.
MongoDB and Redis are intentionally internal-only; this prevents collisions
with a developer's existing local database and keeps them off the host network.

## 1. Configure secrets

From the repository root:

```powershell
Copy-Item .env.compose.example .env.compose
```

Set unique `MONGO_ROOT_PASSWORD`, `MONGO_ROOT_PASSWORD_URI`, `JWT_ACCESS_SECRET`,
`JWT_REFRESH_SECRET`, and `GEMINI_API_KEY` in `.env.compose`. Do not send or
commit this file. Generate a JWT secret with:

```powershell
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

`MONGO_ROOT_PASSWORD_URI` is the same Mongo password URL-encoded for use in
the connection URI. For example, `#` becomes `%23`.

## 2. Start the app

```powershell
docker compose --env-file .env.compose up --build
```

Open `http://localhost:8080`. API health is at `http://localhost:4000/health`
and API documentation is at `http://localhost:4000/api-docs`.

Stop while retaining data:

```powershell
docker compose --env-file .env.compose down
```

Delete local Mongo/Redis/upload data as well:

```powershell
docker compose --env-file .env.compose down -v
```

## 3. Workers are explicit

The default command starts only web, API, MongoDB, and Redis. This prevents a
demo from unexpectedly consuming Gemini quota or processing a large queue.

```powershell
# Reports, gaps, embedding, paper analysis, and notifications
docker compose --env-file .env.compose --profile workers up --build

# Million-scale OpenAlex campaign worker; requires OPENALEX_API_KEY.
docker compose --env-file .env.compose --profile ingest up --build

# Optional Mongo Express, bound only to localhost:8081.
docker compose --env-file .env.compose --profile tools up

# Optional free Paper Detail translation (title + abstract only).
# Set TRANSLATION_PROVIDER=libretranslate in .env.compose first.
docker compose --env-file .env.compose --profile translation up --build
```

The OpenAlex campaign worker does not begin a campaign on startup. An admin
must plan and explicitly start a campaign through the API/dashboard.

## 4. Important vector-search boundary

The official `mongo:7` image in this Compose file is MongoDB Community. It does
not contain MongoDB Atlas Vector Search (`mongot`), so `$vectorSearch`-based
semantic search, RAG retrieval, and embedding-backed features cannot be fully
demonstrated against this local Mongo container.

For those features, point `MONGODB_URI` at MongoDB Atlas or a self-hosted
MongoDB deployment where the administrator has installed and configured
`mongot`/Vector Search. Do not claim that plain MongoDB Community provides
Atlas Vector Search.

## 5. OpenAlex authentication

Older project syncs used `OPENALEX_MAILTO` (the historical polite-pool
mechanism). OpenAlex now requires an API key for new API access. Add the free
key as `OPENALEX_API_KEY` before starting the million-scale ingest worker.
The legacy corpus remains valid; the key is required for future provider calls,
not to read existing papers from MongoDB.

## 6. Paper Detail translation

Translation is opt-in and does not translate the website, PDFs, taxonomy, DOI,
or author names. The backend sends only a paper's title and abstract to the
self-hosted LibreTranslate container when an authenticated user clicks
Translate. Results are cached in `paper_translations` using the paper id,
target language, provider, and a hash of the original text. Repeated requests
for unchanged content therefore do not invoke the translation engine again.
The first LibreTranslate startup can take longer because its language models
must be initialized. Keep the service private; only the backend needs access.
