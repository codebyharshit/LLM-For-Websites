# Build context must be the REPO ROOT (monorepo). e.g. docker build -f apps/worker/Dockerfile .
FROM node:20-slim AS base
ENV PNPM_HOME="/pnpm" PATH="/pnpm:$PATH"
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate
WORKDIR /app

FROM base AS build
COPY . .
RUN pnpm install --frozen-lockfile
# Builds @supportrag/worker and its workspace deps (core, db, shared)
RUN pnpm --filter @supportrag/worker... build

FROM base AS runtime
ENV NODE_ENV=production
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
COPY --from=build /app /app
WORKDIR /app/apps/worker
# Crawler needs a headless Chromium + its system libraries (Playwright).
RUN pnpm --filter @supportrag/core exec playwright install --with-deps chromium
CMD ["node", "dist/index.js"]
