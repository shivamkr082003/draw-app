# syntax=docker/dockerfile:1

FROM node:20-alpine AS base
RUN apk add --no-cache libc6-compat
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
ARG NEXT_PUBLIC_HTTP_BACKEND=http://localhost:3002
ARG NEXT_PUBLIC_WS_URL=ws://localhost:8080
ENV NEXT_PUBLIC_HTTP_BACKEND=$NEXT_PUBLIC_HTTP_BACKEND
ENV NEXT_PUBLIC_WS_URL=$NEXT_PUBLIC_WS_URL
RUN pnpm --filter draw... build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

COPY --from=builder /app/apps/draw/public ./apps/draw/public
COPY --from=builder --chown=nextjs:nodejs /app/apps/draw/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/draw/.next/static ./apps/draw/.next/static

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "apps/draw/server.js"]
