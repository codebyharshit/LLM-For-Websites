# Deploying

The platform is **5 runtime pieces** backed by **Postgres (pgvector) + Redis**:

| Piece | What it is | How it's hosted |
|---|---|---|
| **api** | Fastify HTTP API (chat, auth, dashboard data) | long-running web service |
| **worker** | BullMQ consumer that crawls + embeds content | long-running background worker (needs Chromium) |
| **dashboard** | Next.js app for business owners | long-running web service |
| **widget.js** | the chat bubble customers embed | a static file on a CDN/host (see §4) |
| **Postgres** | all data **+ embeddings** (pgvector) | managed Postgres 16 with the `vector` extension |
| **Redis** | the ingest job queue + rate limits | managed Redis |

Dockerfiles live at `apps/{api,worker,dashboard}/Dockerfile` and **build from the repo root**
(monorepo). They work on any Docker host (Render, Railway, Fly, Cloud Run, a VPS).

---

## Option A — Render (one blueprint, fewest clicks)

1. Push is already done → repo is `codebyharshit/LLM-For-Websites`.
2. Render → **New → Blueprint** → connect the repo → it reads `render.yaml` and creates:
   Postgres, Redis, **api**, **worker**, **dashboard**.
3. Fill the secrets it asks for (`OPENAI_API_KEY`, `GEMINI_API_KEY`, `COHERE_API_KEY`,
   `DEEPSEEK_API_KEY`). `AUTH_SECRET` is auto-generated; `DATABASE_URL`/`REDIS_URL` auto-wired.
4. **Set the two URLs** (Render gives bare hosts, the app needs full https):
   - `supportrag-api` → `APP_BASE_URL = https://supportrag-dashboard.onrender.com`
   - `supportrag-dashboard` → `NEXT_PUBLIC_API_URL = https://supportrag-api.onrender.com`
     (this one is a **build-time** var — set it, then trigger a redeploy of the dashboard).
5. The api runs DB migrations on boot (creates tables, pgvector, RLS). First boot takes a minute.

> Cost note: Postgres/Redis/web are free tiers; **the background worker requires a paid instance
> (~$7/mo)** on Render. Free web services also sleep when idle (cold start on first hit).

## Option B — Railway (spec's target; usage-based, cheap worker)

1. Railway → **New Project → Deploy from GitHub repo** → pick the repo.
2. Add plugins: **PostgreSQL** and **Redis** (one click each).
3. Create **3 services** from the same repo, each pointing at its Dockerfile
   (`apps/api/Dockerfile`, `apps/worker/Dockerfile`, `apps/dashboard/Dockerfile`),
   root directory = repo root.
4. Set variables on each service:
   - all: `DATABASE_URL`, `REDIS_URL` → reference the plugins (`${{Postgres.DATABASE_URL}}`, `${{Redis.REDIS_URL}}`)
   - api: `DEV_AUTH_BYPASS=false`, `AUTH_SECRET=<random>`, `APP_BASE_URL=<dashboard public URL>`, the 4 LLM keys
   - worker: the 4 LLM keys
   - dashboard: `NEXT_PUBLIC_API_URL=<api public URL>` (build-time — Railway exposes build vars)
5. Generate public domains for api + dashboard; paste them back into `APP_BASE_URL` /
   `NEXT_PUBLIC_API_URL` and redeploy.

## Option C — Any VPS (Docker)

Build the three images (`docker build -f apps/<svc>/Dockerfile -t <svc> .`), run a Postgres with
pgvector + a Redis, wire the env vars below, and run the three containers. A `docker-compose.prod.yml`
can be added on request.

---

## Environment variables (all hosts)

| Var | Where | Value |
|---|---|---|
| `DATABASE_URL` | api, worker | managed Postgres connection string (must allow the migration to `CREATE EXTENSION vector` + create the `app_rls` role) |
| `REDIS_URL` | api, worker | managed Redis connection string |
| `AUTH_SECRET` | api | long random string (signs magic-link + session tokens) |
| `DEV_AUTH_BYPASS` | api | `false` in production |
| `APP_BASE_URL` | api | the dashboard's public https URL (login redirect + cookie + CORS) |
| `NEXT_PUBLIC_API_URL` | dashboard (**build-time**) | the api's public https URL |
| `OPENAI_API_KEY` | api, worker | embeddings + a generation fallback |
| `GEMINI_API_KEY` | api, worker | primary generation model |
| `COHERE_API_KEY` | api, worker | reranker (optional — degrades gracefully if absent) |
| `DEEPSEEK_API_KEY` | api, worker | generation fallback (optional) |

## 4. The widget (`widget.js`) — hosting the chat bubble

The API/dashboard/worker get you a working product (dashboard + chat API). The embeddable bubble is a
static file built from `packages/widget`:

```bash
pnpm --filter @supportrag/widget build      # → packages/widget/dist/widget.js
```

Host that file anywhere public (an object store/CDN, or the dashboard's `public/`), then set
`WIDGET_CDN_URL` to its base URL so the dashboard's **embed snippet** points customers at it. The
snippet a customer pastes becomes:

```html
<script src="https://<your-cdn>/widget.js"
        data-bot-token="pk_…"
        data-api-url="https://supportrag-api.onrender.com"></script>
```

## 5. First-run after deploy

```bash
# create the first company (run against the deployed DATABASE_URL)
pnpm --filter @supportrag/db db:create-tenant -- --name="Acme" --email=owner@acme.com
```

Then open the dashboard URL → log in with that email → add content → configure the bot → embed.

> Heads-up: deploys usually need a build-fix iteration or two (Docker layer caching, a missing system
> lib for Chromium, a DB-privilege quirk). Share the build log and I'll fix forward.
