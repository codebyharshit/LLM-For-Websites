# CLAUDE.md — Customer Support RAG Platform

> This file is auto-loaded every session. Keep it concise and authoritative. Detailed
> tasks live in `@IMPLEMENTATION_PLAN.md`; architecture in `@support-rag-platform-design.md`;
> milestones in `@v1-build-plan.md`. Read the relevant task in the plan before coding.

## Non-negotiables (these break the product if violated)
1. **Tenant isolation is sacred.** Every tenant-scoped table has `tenant_id`; every query is scoped; Postgres RLS is the second lock. The cross-tenant isolation test must stay green forever. Never write a retrieval query without a `bot_id`/`tenant_id` filter.
2. **The embedding model is frozen** (`text-embedding-3-small`, 1536 dims). Changing it = full re-embed migration. Do not swap it casually.
3. **No vendor SDK is called outside `packages/core`.** Embeddings, rerank, generation go through `LLMRouter`. Business code stays model-agnostic.
4. **Never generate an answer below the confidence gate.** If `rerank_top_score < τ`, return the templated refusal + escalation. No free-generation fallback.
5. **Log the full `messages` row on every turn** (rewritten query, retrieved chunk ids, scores, model, tokens, latency). This is the eval dataset; it cannot be reconstructed later.

## What this is
Multi-tenant SaaS: a business indexes its content (URLs + files + typed rules) and gets an embeddable chat widget that answers its customers from that content, cites sources, refuses honestly, and captures a lead on every miss. Knowledge-only in v1. No account-aware actions, no helpdesk integrations.

## Stack
TypeScript everywhere · Turborepo + pnpm · Fastify (api) · BullMQ/Redis (worker) · Next.js App Router (dashboard) · vanilla-TS IIFE (widget) · Postgres 16 + pgvector(HNSW) + tsvector(GIN) · Drizzle ORM · Playwright (crawler) · OpenAI `text-embedding-3-small` · Cohere Rerank 3.5 · Gemini Flash → Claude Haiku → DeepSeek (generation, via LLMRouter) · Railway EU.

## Repo layout
```
apps/api  apps/worker  apps/dashboard
packages/core (chunker,retriever,reranker,prompt,LLMRouter)
packages/db (drizzle schema, migrations, RLS, tenant-scoped client)
packages/widget  packages/evals  packages/shared (types,config,logger)
```
Add a package-level `CLAUDE.md` in `apps/api`, `apps/worker`, `packages/core` as they grow (loads lazily when you work there).

## Commands
- Install: `pnpm install`
- Local infra: `docker compose up -d` (postgres+redis)
- Migrate: `pnpm db:migrate` · Generate migration: `pnpm db:generate`
- Dev: `pnpm dev` (turbo runs all apps) · single app: `pnpm --filter api dev`
- Test: `pnpm test` · single: `pnpm --filter <pkg> test`
- Typecheck: `pnpm typecheck` · Lint: `pnpm lint`
- **Before every commit:** `pnpm typecheck && pnpm lint && pnpm test` must pass.

## Conventions
- Strict TypeScript; no `any` without a `// reason:` comment. Prefer explicit return types on exported functions.
- Zod-validate all external input (HTTP bodies, job payloads, env). Env parsed once in `packages/shared/config`.
- Errors: typed Result or thrown `AppError` with a code; never swallow. Log with `pino`, structured fields, never `console.log`.
- Async work goes through BullMQ jobs, never inline in a request handler.
- SSE for chat streaming. Never buffer a full answer before sending.
- Secrets only in env / Railway. Never commit real keys; `.env.example` holds placeholders.
- Tests colocated as `*.test.ts`; integration tests use the docker Postgres, not mocks, for DB/RLS behavior.

## Workflow for Claude Code
- Work one task at a time from `@IMPLEMENTATION_PLAN.md` (tasks are sized to ~one session/PR).
- Use plan mode to confirm approach on any task touching the DB schema, RLS, or the query pipeline before editing.
- Each task lists a **Verify** command — run it; the task is done only when it passes.
- After a task: run the pre-commit checks, commit with `[T<id>] <summary>`, then stop for review.
- Do not start the next task or expand scope beyond the current task's "Files" list without asking.
- The `OUT OF SCOPE` list in the plan is law. New ideas go to `docs/someday.md`, not into code.

## Golden test tenant
Use the Buycycle help center as the fixture tenant from M1 onward (the owner knows the domain and can judge answer correctness instantly). CI runs the eval harness against it.
