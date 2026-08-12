# Draw App

> Real-time collaborative whiteboard with WebSockets, Redis cache + Pub/Sub, PostgreSQL, OAuth, and Docker.

![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat&logo=typescript&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB?style=flat&logo=react&logoColor=black)
![Next.js](https://img.shields.io/badge/Next.js-15-000000?style=flat&logo=next.js&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-18+-339933?style=flat&logo=node.js&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?style=flat&logo=postgresql&logoColor=white)
![Redis](https://img.shields.io/badge/Redis-7-DC382D?style=flat&logo=redis&logoColor=white)
![WebSocket](https://img.shields.io/badge/WebSocket-ws-010101?style=flat)
![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?style=flat&logo=docker&logoColor=white)
![Prisma](https://img.shields.io/badge/Prisma-6-2D3748?style=flat&logo=prisma&logoColor=white)

| | |
|---|---|
| **Stack** | Turborepo monorepo · pnpm · Express · Prisma |
| **Local** | Frontend `:3000` · HTTP `:3002` · WebSocket `:8080` |

---

## Table of Contents

- [Features](#features)
- [Tech Stack](#tech-stack)
- [System Architecture](#system-architecture)
- [Performance](#performance)
- [Architecture Deep Dive](#architecture-deep-dive)
- [API Reference](#api-reference)
- [Project Structure](#project-structure)
- [Local Development](#local-development)
- [Docker Setup](#docker-setup)
- [Testing](#testing)
- [Environment Variables](#environment-variables)
- [Security](#security)
- [Future Improvements](#future-improvements)

---

## Features

| Feature | Description |
|---------|-------------|
| **Real-time drawing** | WebSocket room broadcasts; shapes sync across clients instantly |
| **Redis Pub/Sub** | Cross-server WebSocket sync via `ws:room:roomId` channels |
| **Redis caching** | Cache-aside on three GET endpoints (~99% lower cache-hit latency) |
| **GitHub / Google OAuth** | Social login with JWT issued after callback |
| **Email + JWT auth** | Sign up / sign in with token stored in `localStorage` |
| **Guest mode** | `guest_*` tokens for drawing without an account |
| **PostgreSQL + Prisma** | Users, rooms, drawings, chats, OAuth accounts |
| **Docker Compose** | One-command full stack (frontend, backends, Postgres, Redis) |
| **Undo / Redo** | Canvas history synced over WebSocket |
| **Chat** | Real-time room chat; persisted for authenticated users |

Draw is a Turborepo monorepo with three runtime services:

- **Frontend** (`apps/draw`) — Next.js app for auth, rooms, and canvas UI
- **HTTP backend** (`apps/http-backend`) — REST API, OAuth, Redis cache-aside
- **WebSocket backend** (`apps/ws-backend`) — real-time drawing, chat, undo/redo, presence

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 15, React 19, TypeScript, Tailwind CSS, Framer Motion, Axios |
| HTTP Backend | Express 5, TypeScript, CORS, dotenv |
| WebSocket Backend | `ws`, TypeScript, JWT verification |
| Database | PostgreSQL 16 |
| ORM | Prisma 6 |
| Cache | Redis 7 — cache-aside on HTTP reads |
| Pub/Sub | Redis 7 — WebSocket cross-server broadcasting |
| Authentication | Custom JWT + guest tokens (`guest_*`) |
| OAuth | GitHub OAuth, Google OAuth (HTTP redirect flow) |
| Validation | Zod (`@repo/common`) |
| Monorepo | Turborepo, pnpm workspaces |
| Containerization | Docker, Docker Compose, multi-stage builds |

---

## System Architecture

```mermaid
flowchart TB
    classDef frontend fill:#2563eb,color:#fff,stroke:#1e40af
    classDef backend fill:#16a34a,color:#fff,stroke:#166534
    classDef ws fill:#9333ea,color:#fff,stroke:#6b21a8
    classDef database fill:#f59e0b,color:#fff,stroke:#b45309
    classDef redis fill:#dc2626,color:#fff,stroke:#991b1b
    classDef external fill:#6b7280,color:#fff,stroke:#374151

    subgraph browserLayer ["Browser"]
        U["User Browser"]
    end

    subgraph frontendLayer ["Frontend Layer"]
        FE["Next.js · apps/draw · :3000"]
    end

    subgraph httpLayer ["HTTP Layer"]
        HB["Express API · :3002"]
        PR["Prisma Client · @repo/db"]
    end

    subgraph wsLayer ["WebSocket Layer"]
        WS1["WS Server 1 · :8080"]
        WS2["WS Server 2 · :8080"]
    end

    subgraph dataLayer ["Data Layer"]
        PG[("PostgreSQL")]
        RD[("Redis")]
    end

    subgraph oauthLayer ["OAuth"]
        GH["GitHub"]
        GO["Google"]
    end

    U --> FE
    U --> HB
    U --> WS1
    U --> WS2
    FE --> HB
    FE --> WS1
    HB --> PR --> PG
    HB -->|"cache-aside GET"| RD
    WS1 --> PR
    WS2 --> PR
    WS1 <-->|"Pub/Sub"| RD
    WS2 <-->|"Pub/Sub"| RD
    HB --> GH
    HB --> GO
    GH --> HB
    GO --> HB

    class FE frontend
    class HB,PR backend
    class WS1,WS2 ws
    class PG database
    class RD redis
    class GH,GO external
```

> **Why Redis twice?** HTTP caching reduces repeated PostgreSQL reads. WebSocket Pub/Sub lets multiple WS instances broadcast to the same room without shared in-memory state.

---

## Performance

Benchmarks run with the same script before and after Redis caching:

```bash
node apps/http-backend/scripts/benchmark-baseline.mjs
```

**Methodology:** 21 requests per endpoint (1 warm-up discarded, 20 measured). **After** numbers reflect **cache-hit** latency once Redis is warm.

| Endpoint | Before | After | Improvement |
|----------|--------|-------|-------------|
| `GET /drawings/:roomId` | 345.64 ms | 3.39 ms | **~99.0% lower** |
| `GET /room/:slug` | 326.25 ms | 2.59 ms | **~99.2% lower** |
| `GET /chats/:roomId` | 295.47 ms | 3.29 ms | **~98.9% lower** |
| `GET /health` | 2.11 ms | 2.15 ms | Not cached |

**Cache HIT** — Redis returns stored JSON; response skips PostgreSQL (~2–4 ms).

**Cache MISS** — PostgreSQL query runs, result is stored in Redis with TTL, then returned (~300 ms+ on remote DB).

The first request after a miss or invalidation is slow; subsequent requests within TTL are fast. Write endpoints (`POST /signin`, `POST /room`, `POST /drawings`, etc.) were not cached and remain database-bound.

---

## Architecture Deep Dive

<details open>
<summary><strong>HTTP cache-aside flow</strong></summary>

Cached endpoints fall back to PostgreSQL if Redis is unavailable.

**Cache hit**

```mermaid
sequenceDiagram
    participant C as Client
    participant H as HTTP Backend
    participant R as Redis

    C->>H: GET /drawings/:roomId
    H->>R: GET drawings:room:roomId
    R-->>H: cached JSON
    Note over H: Cache HIT
    H-->>C: Response
```

**Cache miss**

```mermaid
sequenceDiagram
    participant C as Client
    participant H as HTTP Backend
    participant R as Redis
    participant P as PostgreSQL

    C->>H: GET /drawings/:roomId
    H->>R: GET drawings:room:roomId
    R-->>H: null
    Note over H: Cache MISS
    H->>P: Drawing.findMany + JSON.parse
    P-->>H: rows
    H->>R: SET TTL 300s
    H-->>C: Response
```

| Endpoint | Cache key | TTL |
|----------|-----------|-----|
| `GET /drawings/:roomId` | `drawings:room:{roomId}` | 300 s |
| `GET /room/:slug` | `room:slug:{slug}` | 600 s |
| `GET /chats/:roomId` | `chats:room:{roomId}` | 30 s |

</details>

<details>
<summary><strong>Drawing cache invalidation</strong></summary>

```mermaid
sequenceDiagram
    participant C as Client
    participant H as HTTP Backend
    participant P as PostgreSQL
    participant R as Redis

    C->>H: POST /drawings
    H->>P: Drawing.create
    P-->>H: success
    H->>R: DEL drawings:room:roomId
    H-->>C: 200 OK

    C->>H: DELETE /drawings/:elementId
    H->>P: Drawing.deleteMany
    P-->>H: success
    H->>R: DEL drawings:room:roomId
    H-->>C: 200 OK
```

Invalidation is required because `GET /drawings/:roomId` caches the full element list. Without `DEL drawings:room:{roomId}`, a new or deleted stroke would not appear until the 300-second TTL expired. Responses: `POST /drawings` → `{ message, id }`; `DELETE /drawings/:elementId` → `{ message }`.

</details>

<details>
<summary><strong>Redis Pub/Sub (WebSocket)</strong></summary>

Each WS instance has a unique `SERVER_ID` (`randomUUID()`). Channel format: `ws:room:{roomId}`.

```mermaid
sequenceDiagram
    participant A as Client A
    participant W1 as WS Server 1
    participant R as Redis
    participant W2 as WS Server 2
    participant B as Client B

    A->>W1: drawing event
    W1->>W1: local broadcast
    W1->>R: PUBLISH payload
    R->>W1: same SERVER_ID
    Note over W1: ignored
    R->>W2: other SERVER_ID
    W2->>B: local broadcast

    B->>W2: chat event
    W2->>W2: local broadcast
    W2->>R: PUBLISH payload
    R->>W2: same SERVER_ID
    Note over W2: ignored
    R->>W1: other SERVER_ID
    W1->>A: local broadcast
```

| Role | Behavior |
|------|----------|
| Origin server | Local broadcast, then Redis publish |
| Same server on receive | Ignore — `serverId === SERVER_ID` |
| Other server | Broadcast to local room users |

</details>

<details>
<summary><strong>WebSocket room subscription</strong></summary>

```mermaid
flowchart TD
    classDef ws fill:#9333ea,color:#fff,stroke:#6b21a8

    A["join_room"] --> B{"First local user?"}
    B -->|Yes| C["subscribeToRoom"]
    B -->|No| D["Reuse subscription"]
    C --> E["subscribedRooms Set add"]

    F["leave / disconnect"] --> G{"Last local user?"}
    G -->|Yes| H["unsubscribeFromRoom"]
    G -->|No| I["Keep subscription"]
    H --> J["subscribedRooms Set delete"]

    class C,H ws
```

Implementation: `subscribedRooms` Set in `apps/ws-backend/src/redis.ts`; `ensureRoomSubscribed` / `maybeUnsubscribeRoom` in `index.ts`.

</details>

<details>
<summary><strong>Authentication flows</strong></summary>

**Email / password**

```mermaid
sequenceDiagram
    participant C as Client
    participant FE as Frontend
    participant H as HTTP Backend
    participant P as PostgreSQL

    C->>FE: signup / signin form
    FE->>H: POST /signup or /signin
    H->>P: User create / find
    H-->>FE: 201 signup or JWT signin
    FE->>FE: localStorage token
```

Sign up returns `201 { success, user }`; sign in returns `{ token, userId, name }`.

JWT is sent in the `Authorization` header for protected HTTP routes (e.g. `POST /room`). WebSocket connections pass the token as `?token=` on connect.

**GitHub OAuth**

```mermaid
sequenceDiagram
    participant C as Client
    participant FE as Frontend
    participant H as HTTP Backend
    participant GH as GitHub
    participant P as PostgreSQL

    C->>FE: Continue with GitHub
    FE->>H: GET /auth/github
    H->>GH: OAuth authorize redirect
    GH->>H: GET /auth/github/callback
    H->>GH: Exchange code for token
    H->>GH: Fetch profile and email
    H->>P: findOrCreateOAuthUser
    H->>FE: Redirect /auth/callback?token
    FE->>FE: localStorage then redirect /
```

**Google OAuth** — same pattern via `/auth/google` and `/auth/google/callback`, using Google's OAuth 2.0 userinfo endpoint.

**Guest mode** — Tokens prefixed with `guest_` bypass JWT verification on both HTTP middleware and WebSocket `CheckUser`. Guest users can draw and chat; drawing/chat persistence to PostgreSQL is skipped for guest user IDs.

</details>

<details>
<summary><strong>Drawing and chat flows</strong></summary>

**Drawing**

```mermaid
sequenceDiagram
    participant U1 as User 1
    participant FE as Frontend
    participant WS as WS Backend
    participant R as Redis
    participant U2 as User 2
    participant P as PostgreSQL

    U1->>FE: draw stroke
    FE->>WS: type drawing
    WS->>P: Drawing.create if authed
    WS->>WS: local broadcast
    WS->>R: PUBLISH
    R->>WS: other instance
    WS->>U2: drawing event

    Note over FE,P: Canvas load via GET /drawings/:roomId
```

WS types: `drawing`, `elementRemoved`, `elementUpdated`, `clearCanvas`, `undo`, `redo`.

**Chat**

```mermaid
sequenceDiagram
    participant U1 as User 1
    participant W1 as WS Server 1
    participant R as Redis
    participant W2 as WS Server 2
    participant U2 as User 2
    participant P as PostgreSQL

    U1->>W1: type chat
    W1->>P: Chat.create if authed
    W1->>R: PUBLISH
    W2->>U2: chat event
```

History: `GET /chats/:roomId` (Redis-cached, 30s). No HTTP endpoint to create chat messages.

</details>

<details>
<summary><strong>Database schema</strong></summary>

```mermaid
erDiagram
    User ||--o{ Room : admin
    User ||--o{ Chat : sends
    User ||--o{ Drawing : creates
    User ||--o{ OAuthAccount : has
    Room ||--o{ Chat : contains
    Room ||--o{ Drawing : contains

    User {
        String id PK
        String email UK
        String password
        String name
        String photo
    }

    OAuthAccount {
        String id PK
        String provider
        String providerAccountId
        String userId FK
    }

    Room {
        Int id PK
        String slug UK
        DateTime createdAt
        String adminId FK
    }

    Chat {
        Int id PK
        Int roomId FK
        String message
        String userId FK
    }

    Drawing {
        Int id PK
        Int roomId FK
        String elementId
        String elementData
        DateTime createdAt
        String userId FK
    }
```

Source: `packages/db/prisma/schema.prisma`

</details>

<details>
<summary><strong>Docker architecture</strong></summary>

```mermaid
flowchart LR
    classDef frontend fill:#2563eb,color:#fff,stroke:#1e40af
    classDef backend fill:#16a34a,color:#fff,stroke:#166534
    classDef ws fill:#9333ea,color:#fff,stroke:#6b21a8
    classDef database fill:#f59e0b,color:#fff,stroke:#b45309
    classDef redis fill:#dc2626,color:#fff,stroke:#991b1b

    subgraph host ["Host Browser"]
        BR["Browser"]
    end

    subgraph compose ["Docker Compose"]
        FE["frontend :3000"]
        HB["http-backend :3002"]
        WSB["ws-backend :8080"]
        PG[("postgres")]
        RD[("redis")]
    end

    BR -->|"localhost:3000"| FE
    BR -->|"localhost:3002"| HB
    BR -->|"localhost:8080"| WSB
    HB --> PG
    HB --> RD
    WSB --> PG
    WSB --> RD

    class FE frontend
    class HB backend
    class WSB ws
    class PG database
    class RD redis
```

| Context | URL pattern |
|---------|-------------|
| Browser → services | `localhost` + exposed ports |
| Container → container | Docker service names `postgres`, `redis` |
| Frontend build args | `NEXT_PUBLIC_*` point to localhost (browser runs on host) |

Frontend `depends_on` healthy HTTP and WS backends. HTTP backend entrypoint runs `prisma migrate deploy` before start. Redis and PostgreSQL are not exposed to the host (internal network only).

</details>

---

## API Reference

| Method | Endpoint | Purpose | Auth | Cache |
|--------|----------|---------|:----:|:-----:|
| GET | `/health` | Health check | | |
| POST | `/signup` | Create user | | |
| POST | `/signin` | Sign in, receive JWT | | |
| GET | `/auth/github` | Start GitHub OAuth | | |
| GET | `/auth/github/callback` | GitHub callback | | |
| GET | `/auth/google` | Start Google OAuth | | |
| GET | `/auth/google/callback` | Google callback | | |
| POST | `/room` | Create room | JWT / guest | |
| GET | `/room/:slug` | Get room by slug | | **600s** |
| GET | `/drawings/:roomId` | Get room drawings | | **300s** |
| GET | `/chats/:roomId` | Chat history (last 50) | | **30s** |
| POST | `/drawings` | Persist element | | invalidates |
| DELETE | `/drawings/:elementId` | Delete element | | invalidates |

---

## Project Structure

```
draw-app/
├── apps/
│   ├── draw/              # Next.js frontend (:3000)
│   ├── http-backend/      # Express REST API (:3002)
│   └── ws-backend/        # WebSocket server (:8080)
├── packages/
│   ├── db/                # Prisma schema, migrations, client
│   ├── common/            # Shared Zod schemas
│   ├── ui/                # Shared UI components
│   ├── typescript-config/
│   └── eslint-config/
├── scripts/               # Docker entrypoints
├── benchmarks/            # HTTP benchmark results
├── docker-compose.yml
├── pnpm-workspace.yaml
└── turbo.json
```

| Path | Role |
|------|------|
| `apps/draw` | `/`, `/signin`, `/signup`, `/canvas/[roomId]`, `/auth/callback` |
| `apps/http-backend` | REST, OAuth, Redis cache-aside |
| `apps/ws-backend` | Real-time sync, Redis Pub/Sub |
| `packages/db` | User, OAuthAccount, Room, Chat, Drawing |

---

## Local Development

### Prerequisites

Node.js 18+ · pnpm 9+ · PostgreSQL · Redis

### Install and migrate

```bash
git clone <repository-url>
cd draw-app
pnpm install

cd packages/db
npx prisma migrate deploy
npx prisma generate
```

### Environment files

> Never commit `.env` files. Use `.env.example` as a template.

<details>
<summary><strong>Click to expand all env file templates</strong></summary>

**`packages/db/.env`**
```env
DATABASE_URL="postgresql://USER:PASSWORD@localhost:5432/drawapp"
```

**`apps/http-backend/.env`**
```env
DATABASE_URL="postgresql://USER:PASSWORD@localhost:5432/drawapp"
JWT_SECRET="your-jwt-secret"
PORT=3002
REDIS_URL="redis://localhost:6379"
FRONTEND_URL="http://localhost:3000"
OAUTH_CALLBACK_BASE_URL="http://localhost:3002"
GITHUB_CLIENT_ID=""
GITHUB_CLIENT_SECRET=""
GOOGLE_CLIENT_ID=""
GOOGLE_CLIENT_SECRET=""
```

**`apps/ws-backend/.env`**
```env
DATABASE_URL="postgresql://USER:PASSWORD@localhost:5432/drawapp"
JWT_SECRET="your-jwt-secret"
PORT=8080
REDIS_URL="redis://localhost:6379"
```

**`apps/draw/.env.local`**
```env
NEXT_PUBLIC_HTTP_BACKEND="http://localhost:3002"
NEXT_PUBLIC_WS_URL="ws://localhost:8080"
```

</details>

### Start

```bash
# All services (Turborepo)
pnpm dev

# Or individually:
cd apps/http-backend && npm run build && npm run start
cd apps/ws-backend && npm run build && npm run start
cd apps/draw && pnpm dev
```

| Service | URL |
|---------|-----|
| Frontend | http://localhost:3000 |
| HTTP API | http://localhost:3002 |
| WebSocket | ws://localhost:8080 |

---

## Docker Setup

```bash
cp .env.example .env
docker compose up --build        # foreground
docker compose up -d --build     # detached
docker compose down              # stop
docker compose down -v           # stop + delete DB volume
```

> **Warning:** `docker compose down -v` permanently deletes PostgreSQL data.

Free ports `3000`, `3002`, `8080` before starting.

---

## Testing

**HTTP benchmark**
```bash
node apps/http-backend/scripts/benchmark-baseline.mjs
```
Optional env: `BENCHMARK_BASE_URL`, `BENCHMARK_REQUESTS` (default 21). Results written to `benchmarks/before-redis-baseline.json`, `benchmarks/after-redis-baseline.json`, and `.md` summaries.

**WebSocket Pub/Sub (cross-server)**
```bash
# Terminal 1
REDIS_URL=redis://localhost:6379 PORT=8080 node apps/ws-backend/dist/index.js

# Terminal 2
REDIS_URL=redis://localhost:6379 PORT=8081 node apps/ws-backend/dist/index.js

# Terminal 3
WS_TEST_SERVER_A=ws://localhost:8080 \
WS_TEST_SERVER_B=ws://localhost:8081 \
node apps/ws-backend/scripts/test-redis-pubsub.mjs
```

Verified:
- Server A drawing → Server B receives
- Server B chat → Server A receives
- No duplicate messages (`SERVER_ID` deduplication)

---

## Environment Variables

| Variable | Service | Purpose |
|----------|---------|---------|
| `DATABASE_URL` | db, http-backend, ws-backend | PostgreSQL connection |
| `REDIS_URL` | http-backend, ws-backend | Redis connection |
| `JWT_SECRET` | http-backend, ws-backend | JWT sign/verify (must match) |
| `PORT` | http-backend `3002`, ws-backend `8080` | Listen port |
| `FRONTEND_URL` | http-backend | OAuth redirect, CORS |
| `OAUTH_CALLBACK_BASE_URL` | http-backend | OAuth callback base |
| `GITHUB_CLIENT_ID` / `SECRET` | http-backend | GitHub OAuth (optional) |
| `GOOGLE_CLIENT_ID` / `SECRET` | http-backend | Google OAuth (optional) |
| `NEXT_PUBLIC_HTTP_BACKEND` | draw (build) | Browser → HTTP URL |
| `NEXT_PUBLIC_WS_URL` | draw (build) | Browser → WebSocket URL |
| `POSTGRES_USER/PASSWORD/DB` | Docker Compose | Postgres credentials |

---

## Security

| Practice | Detail |
|----------|--------|
| Secrets in env | JWT, OAuth, DB credentials — never in source |
| `.env` gitignored | Safe to commit `.env.example` only |
| OAuth state | CSRF protection on callbacks |
| WebSocket auth | JWT or `guest_*` token required |
| Docker network | Redis and Postgres internal-only (not host-exposed) |

**Known limitation:** email/password stored in plaintext in PostgreSQL (hashing planned). Prefer OAuth for production or treat as dev-only.

---

## Future Improvements

Items not yet implemented:

- Password hashing (bcrypt/argon2)
- Rate limiting on auth and API routes
- Automated test suite (unit/integration/e2e)
- CI/CD pipeline
- Structured logging and production monitoring (metrics, tracing)
- Global user count across WS instances (currently per-server for `userCount`)
- Chat cache invalidation over HTTP (relies on 30s TTL; no HTTP chat write endpoint exists)
- Production TLS termination and secret management (e.g. Docker secrets, vault)

---

## License

Private project. See repository for license details.
