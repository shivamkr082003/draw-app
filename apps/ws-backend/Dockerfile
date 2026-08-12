# syntax=docker/dockerfile:1

FROM node:20-alpine AS base
RUN apk add --no-cache libc6-compat openssl
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate
WORKDIR /app

FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/http-backend/package.json apps/http-backend/
COPY apps/ws-backend/package.json apps/ws-backend/
COPY apps/draw/package.json apps/draw/
COPY packages/db/package.json packages/db/
COPY packages/common/package.json packages/common/
COPY packages/typescript-config/package.json packages/typescript-config/
COPY packages/ui/package.json packages/ui/
COPY packages/eslint-config/package.json packages/eslint-config/
RUN pnpm install --frozen-lockfile

FROM deps AS builder
COPY . .
ENV DATABASE_URL="postgresql://draw:drawpassword@postgres:5432/drawapp"
RUN pnpm --filter ws-backend... build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/pnpm-workspace.yaml ./pnpm-workspace.yaml
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/apps/ws-backend ./apps/ws-backend
COPY scripts/docker-entrypoint-ws.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

EXPOSE 8080
ENTRYPOINT ["docker-entrypoint.sh"]
