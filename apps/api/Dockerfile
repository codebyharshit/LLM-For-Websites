# Build context must be the REPO ROOT (monorepo). e.g. docker build -f apps/api/Dockerfile .
FROM node:20-slim AS base
ENV PNPM_HOME="/pnpm" PATH="/pnpm:$PATH"
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate
WORKDIR /app

FROM base AS build
COPY . .
RUN pnpm install --frozen-lockfile
# Builds @supportrag/api and its workspace deps (core, db, shared)
RUN pnpm --filter @supportrag/api... build && pnpm --filter @supportrag/widget build

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build /app /app
WORKDIR /app/apps/api
# Apply any pending DB migrations on boot, then start the API (listens on $PORT).
CMD ["sh", "-c", "pnpm --filter @supportrag/db db:migrate && node dist/index.js"]
