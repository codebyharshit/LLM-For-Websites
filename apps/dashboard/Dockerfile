# Build context must be the REPO ROOT (monorepo). e.g. docker build -f apps/dashboard/Dockerfile .
FROM node:20-slim AS base
ENV PNPM_HOME="/pnpm" PATH="/pnpm:$PATH"
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate
WORKDIR /app

FROM base AS build
# NEXT_PUBLIC_* values are inlined into the bundle at build time, so the
# production API URL must be passed as a build arg (not just a runtime env).
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @supportrag/dashboard build

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build /app /app
WORKDIR /app/apps/dashboard
# `next start` listens on $PORT (injected by the host).
CMD ["pnpm", "exec", "next", "start"]
