# Draw — Real-Time Collaborative Whiteboard

A full-stack collaborative drawing application where multiple users join shared rooms, draw together in real time, chat, and persist canvas state to PostgreSQL. The system uses Redis for HTTP response caching and WebSocket cross-server Pub/Sub, and can be run locally or via Docker Compose.

---

## Overview

Draw is a Turborepo monorepo with three runtime services:

- **Frontend** (`apps/draw`) — Next.js app for signup/signin, room management, and the canvas UI
- **HTTP backend** (`apps/http-backend`) — REST API for auth, rooms, drawing persistence, and cached reads
- **WebSocket backend** (`apps/ws-backend`) — real-time sync for drawing, chat, undo/redo, and room presence

Core capabilities:

| Capability | Implementation |
|------------|----------------|
| Real-time drawing | WebSocket room broadcasts + Redis Pub/Sub for multi-instance sync |
| Chat | WebSocket broadcast; persisted to PostgreSQL for authenticated users |
| Rooms | Slug-based rooms created via HTTP; joined over WebSocket |
| Authentication | Email/password JWT, GitHub OAuth, Google OAuth, guest tokens |
| Persistent storage | PostgreSQL via Prisma (users, rooms, drawings, chats) |
| HTTP read caching | Redis cache-aside on three GET endpoints |
| Containerization | Docker Compose (frontend, both backends, PostgreSQL, Redis) |

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 15, React 19, TypeScript, Tailwind CSS, Framer Motion, Axios |
| HTTP Backend | Express 5, TypeScript, CORS, dotenv |
| WebSocket Backend | `ws`, TypeScript, JWT verification |
| Database | PostgreSQL 16 |
| ORM | Prisma 6 |
| Cache | Redis 7 (cache-aside on HTTP reads) |
| Pub/Sub | Redis 7 (WebSocket cross-server broadcasting) |
| Authentication | Custom JWT + guest tokens (`guest_*`) |
| OAuth | GitHub OAuth, Google OAuth (HTTP redirect flow) |
| Validation | Zod (`@repo/common`) |
| Monorepo | Turborepo, pnpm workspaces |
| Containerization | Docker, Docker Compose, multi-stage builds |

---

## System Architecture

```mermaid
flowchart TB
    subgraph Browser
        U[User Browser]
    end

    subgraph Frontend
        FE[Next.js Frontend<br/>apps/draw :3000]
    end

    subgraph HTTP["HTTP Backend"]
        HB[Express API<br/>apps/http-backend :3002]
    end

    subgraph WS["WebSocket Backend"]
        WS1[WS Server 1<br/>apps/ws-backend :8080]
        WS2[WS Server 2<br/>apps/ws-backend :8080]
    end

    subgraph Data
        PG[(PostgreSQL)]
        RD[(Redis)]
    end

    subgraph External
        GH[GitHub OAuth]
        GO[Google OAuth]
    end

    PR[Prisma Client<br/>@repo/db]

    U -->|HTTP :3000| FE
    U -->|REST :3002| HB
    U -->|WebSocket :8080| WS1
    U -->|WebSocket :8080| WS2

    FE -->|NEXT_PUBLIC_HTTP_BACKEND| HB
    FE -->|NEXT_PUBLIC_WS_URL| WS1

    HB --> PR --> PG
    HB -->|cache-aside GET| RD

    WS1 --> PR
    WS2 --> PR
    WS1 <-->|Pub/Sub ws:room:{roomId}| RD
    WS2 <-->|Pub/Sub ws:room:{roomId}| RD

    HB -->|OAuth redirect| GH
    HB -->|OAuth redirect| GO
    GH --> HB
    GO --> HB
```

**Why Redis is used twice:** HTTP caching reduces repeated PostgreSQL reads for room metadata, drawings, and chat history. WebSocket Pub/Sub lets multiple WS server instances broadcast to the same room without sharing in-memory state.

---

## HTTP Cache-Aside Flow

Cached endpoints use a cache-aside pattern. Redis failures fall back to PostgreSQL without breaking the API.

### Cache hit

```mermaid
sequenceDiagram
    participant C as Client
    participant H as HTTP Backend
    participant R as Redis
    participant P as PostgreSQL

    C->>H: GET /drawings/:roomId
    H->>R: GET drawings:room:{roomId}
    R-->>H: cached JSON
    Note over H: Cache HIT
    H-->>C: Response (same shape as DB path)
```

### Cache miss

```mermaid
sequenceDiagram
    participant C as Client
    participant H as HTTP Backend
    participant R as Redis
    participant P as PostgreSQL

    C->>H: GET /drawings/:roomId
    H->>R: GET drawings:room:{roomId}
    R-->>H: null
    Note over H: Cache MISS
    H->>P: Drawing.findMany + JSON.parse
    P-->>H: rows
    H->>R: SET drawings:room:{roomId} (TTL 300s)
    H-->>C: Response
```

### Cache keys and TTLs

| Endpoint | Cache key | TTL |
|----------|-----------|-----|
| `GET /drawings/:roomId` | `drawings:room:{roomId}` | 300 seconds |
| `GET /room/:slug` | `room:slug:{slug}` | 600 seconds |
| `GET /chats/:roomId` | `chats:room:{roomId}` | 30 seconds |

The first request after a cache miss or invalidation is slower (PostgreSQL round-trip). Subsequent requests within the TTL are served from Redis.

---

## Cache Invalidation (Drawings)

Drawing writes invalidate the room cache so clients never receive stale canvas data from Redis.

```mermaid
sequenceDiagram
    participant C as Client
    participant H as HTTP Backend
    participant P as PostgreSQL
    participant R as Redis

    Note over C,R: POST /drawings
    C->>H: POST /drawings { roomId, elementId, elementData }
    H->>P: Drawing.create(...)
    P-->>H: success
    H->>R: DEL drawings:room:{roomId}
    H-->>C: { message, id }

    Note over C,R: DELETE /drawings/:elementId
    C->>H: DELETE /drawings/:elementId { roomId }
    H->>P: Drawing.deleteMany(...)
    P-->>H: success
    H->>R: DEL drawings:room:{roomId}
    H-->>C: { message }
```

Invalidation is required because `GET /drawings/:roomId` caches the full element list. Without `DEL`, a new or deleted stroke would not appear until the 300-second TTL expired.

---

## Redis Pub/Sub (WebSocket)

Each WebSocket server instance has a unique `SERVER_ID` (`randomUUID()`). Room events are published to `ws:room:{roomId}`.

```mermaid
sequenceDiagram
    participant A as Client A
    participant WS1 as WS Server 1<br/>SERVER_ID=uuid-1
    participant RD as Redis<br/>ws:room:123
    participant WS2 as WS Server 2<br/>SERVER_ID=uuid-2
    participant B as Client B

    A->>WS1: drawing event (room 123)
    WS1->>WS1: broadcast to local room users (exclude sender)
    WS1->>RD: PUBLISH { serverId, roomId, message }
    RD->>WS1: message (same serverId)
    Note over WS1: Ignore own message
    RD->>WS2: message (other serverId)
    WS2->>B: broadcast to local room users

    B->>WS2: chat event (room 123)
    WS2->>WS2: broadcast to local room users
    WS2->>RD: PUBLISH { serverId, roomId, message }
    RD->>WS2: message (same serverId)
    Note over WS2: Ignore own message
    RD->>WS1: message (other serverId)
    WS1->>A: broadcast to local room users
```

**Origin server:** broadcasts locally, then publishes to Redis.

**Origin server receives its own Redis message:** compares `payload.serverId === SERVER_ID` and ignores it (prevents duplicate delivery).

**Other server:** receives the message and broadcasts to its local users in that room.

---

## WebSocket Room Subscription

Redis channels are subscribed per room only while that server has local users in the room. A `subscribedRooms` `Set` prevents duplicate subscriptions.

```mermaid
flowchart TD
    A[User sends join_room] --> B{First local user<br/>in this room?}
    B -->|Yes| C[subscribeToRoom<br/>ws:room:{roomId}]
    B -->|No| D[Reuse existing subscription]
    C --> E[subscribedRooms.add channel]
    D --> F[User in room]

    G[User leave_room or disconnect] --> H{Last local user<br/>in this room?}
    H -->|Yes| I[unsubscribeFromRoom]
    H -->|No| J[Keep subscription]
    I --> K[subscribedRooms.delete channel]
```

Implementation: `apps/ws-backend/src/redis.ts` (`subscribedRooms` Set) and `apps/ws-backend/src/index.ts` (`ensureRoomSubscribed`, `maybeUnsubscribeRoom`).

---

## Authentication Flows

### A. Email / password

```mermaid
sequenceDiagram
    participant C as Client
    participant FE as Frontend
    participant H as HTTP Backend
    participant P as PostgreSQL

    Note over C,P: Sign up
    C->>FE: Submit signup form
    FE->>H: POST /signup { email, password, name }
    H->>P: User.create(...)
    P-->>H: user
    H-->>FE: 201 { success, user }
    FE->>H: POST /signin
    H->>P: User.findFirst by email
    H-->>FE: { token, userId, name }
    FE->>FE: localStorage.setItem token, userId, userName

    Note over C,P: Sign in
    C->>FE: Submit signin form
    FE->>H: POST /signin { email, password }
    H->>P: User.findFirst by email
    H-->>FE: JWT { userId }
    FE->>FE: localStorage token
```

JWT is sent in the `Authorization` header for protected HTTP routes (e.g. `POST /room`). WebSocket connections pass the token as `?token=` on connect.

### B. GitHub OAuth

```mermaid
sequenceDiagram
    participant C as Client
    participant FE as Frontend
    participant H as HTTP Backend
    participant GH as GitHub
    participant P as PostgreSQL

    C->>FE: Click Continue with GitHub
    FE->>H: Redirect GET /auth/github
    H->>GH: OAuth authorize redirect
    GH->>C: User approves
    GH->>H: GET /auth/github/callback?code&state
    H->>GH: Exchange code for access token
    H->>GH: Fetch user profile + email
    H->>P: findOrCreateOAuthUser (OAuthAccount + User)
    H->>H: Issue JWT
    H->>FE: Redirect /auth/callback?token&userId&name
    FE->>FE: localStorage token → redirect /
```

### C. Google OAuth

Same pattern as GitHub via `GET /auth/google` and `GET /auth/google/callback`, using Google's OAuth 2.0 userinfo endpoint.

### Guest mode

Tokens prefixed with `guest_` bypass JWT verification on both HTTP middleware and WebSocket `CheckUser`. Guest users can draw and chat; drawing/chat persistence to PostgreSQL is skipped for guest user IDs.

---

## Drawing Flow

```mermaid
sequenceDiagram
    participant U1 as User 1
    participant FE as Frontend
    participant WS as WebSocket Backend
    participant RD as Redis Pub/Sub
    participant WS2 as WS Server 2
    participant U2 as User 2
    participant P as PostgreSQL

    U1->>FE: Draw on canvas
    FE->>WS: { type: drawing, roomId, message }
    WS->>P: Drawing.create (if not guest)
    WS->>WS: broadcastToLocalRoom (exclude sender)
    WS->>RD: PUBLISH ws:room:{roomId}
    RD->>WS2: message
    WS2->>U2: { type: drawing, ... }

    Note over U1,P: Initial canvas load (HTTP)
    FE->>FE: GET /drawings/:roomId
    Note over FE: Redis cache-aside → PostgreSQL on miss
```

WebSocket message types for drawing: `drawing`, `elementRemoved`, `elementUpdated`, `clearCanvas`, `undo`, `redo`.

---

## Chat Flow

```mermaid
sequenceDiagram
    participant U1 as User 1
    participant WS1 as WS Server 1
    participant RD as Redis
    participant WS2 as WS Server 2
    participant U2 as User 2
    participant P as PostgreSQL

    U1->>WS1: { type: chat, roomId, message }
    WS1->>P: Chat.create (if not guest)
    WS1->>WS1: publishToRoom → local broadcast
    WS1->>RD: PUBLISH ws:room:{roomId}
    RD->>WS2: message (other SERVER_ID)
    WS2->>U2: { type: chat, message, roomId, userId }
```

Chat history can also be fetched over HTTP via `GET /chats/:roomId` (Redis-cached, 30s TTL). There is no HTTP endpoint for creating chat messages; chat is sent over WebSocket only.

---

## Database Schema

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

---

## Docker Architecture

```mermaid
flowchart TB
    subgraph Host["Host machine (browser)"]
        BR[Browser]
    end

    subgraph Compose["Docker Compose"]
        FE[frontend :3000]
        HB[http-backend :3002]
        WS[ws-backend :8080]
        PG[(postgres :5432 internal)]
        RD[(redis :6379 internal)]
    end

    BR -->|localhost:3000| FE
    BR -->|localhost:3002| HB
    BR -->|localhost:8080| WS

    HB -->|postgres:5432| PG
    HB -->|redis:6379| RD
    WS -->|postgres:5432| PG
    WS -->|redis:6379| RD

    FE -.->|depends_on healthy| HB
    FE -.->|depends_on healthy| WS
```

**Browser-facing URLs** use `localhost` and exposed host ports (`3000`, `3002`, `8080`).

**Container-to-container URLs** use Docker service names (`postgres`, `redis`, `http-backend`, `ws-backend`). The frontend is built with `NEXT_PUBLIC_HTTP_BACKEND=http://localhost:3002` because browser JavaScript runs on the host, not inside the container network.

On startup, the HTTP backend entrypoint runs `prisma migrate deploy` before starting the server.

---

## Performance (Redis HTTP Cache)

Benchmarks were run with the same script before and after Redis caching:

```bash
node apps/http-backend/scripts/benchmark-baseline.mjs
```

**Methodology:** 21 requests per endpoint (1 warm-up discarded, 20 measured). Results below reflect **cache-hit latency** after the warm-up request populated Redis.

| Endpoint | Before Redis (avg) | After Redis (avg) | Change |
|----------|-------------------|-------------------|--------|
| `GET /drawings/:roomId` | 345.64 ms | 3.39 ms | ~99.0% lower |
| `GET /room/:slug` | 326.25 ms | 2.59 ms | ~99.2% lower |
| `GET /chats/:roomId` | 295.47 ms | 3.29 ms | ~98.9% lower |
| `GET /health` | 2.11 ms | 2.15 ms | Not cached (unchanged) |

Cache-hit latency dropped from roughly 300–350 ms to roughly 2–4 ms for the three cached read endpoints. The first request after a cache miss or invalidation still incurs a PostgreSQL round-trip. Write endpoints (`POST /signin`, `POST /room`, etc.) were not cached and remain database-bound.

---

## API Reference

| Method | Endpoint | Purpose | Auth | Cache |
|--------|----------|---------|------|-------|
| GET | `/health` | Health check | No | No |
| POST | `/signup` | Create user | No | No |
| POST | `/signin` | Sign in, receive JWT | No | No |
| GET | `/auth/github` | Start GitHub OAuth | No | No |
| GET | `/auth/github/callback` | GitHub OAuth callback | No | No |
| GET | `/auth/google` | Start Google OAuth | No | No |
| GET | `/auth/google/callback` | Google OAuth callback | No | No |
| POST | `/room` | Create room | JWT or guest | No |
| GET | `/room/:slug` | Get room by slug | No | **Yes** (600s) |
| GET | `/drawings/:roomId` | Get room drawings | No | **Yes** (300s) |
| GET | `/chats/:roomId` | Get chat history (last 50) | No | **Yes** (30s) |
| POST | `/drawings` | Persist drawing element | No | Invalidates drawings cache |
| DELETE | `/drawings/:elementId` | Delete drawing element | No | Invalidates drawings cache |

---

## Project Structure

```
draw-app/
├── apps/
│   ├── draw/                 # Next.js frontend (port 3000)
│   ├── http-backend/         # Express REST API (port 3002)
│   └── ws-backend/           # WebSocket server (port 8080)
├── packages/
│   ├── db/                   # Prisma schema, migrations, client
│   ├── common/               # Shared Zod validation schemas
│   ├── ui/                   # Shared UI components
│   ├── typescript-config/    # Shared TS configs
│   └── eslint-config/        # Shared ESLint configs
├── scripts/                  # Docker entrypoints
├── benchmarks/               # HTTP performance baseline results
├── docker-compose.yml
├── pnpm-workspace.yaml
└── turbo.json
```

| Path | Role |
|------|------|
| `apps/draw` | Pages: `/`, `/signin`, `/signup`, `/canvas/[roomId]`, `/auth/callback` |
| `apps/http-backend` | REST API, OAuth, Redis cache-aside |
| `apps/ws-backend` | Real-time sync, Redis Pub/Sub |
| `packages/db` | Prisma models: User, OAuthAccount, Room, Chat, Drawing |

---

## Local Development Setup

### Prerequisites

- Node.js 18+
- pnpm 9+
- PostgreSQL
- Redis

### Install

```bash
git clone <repository-url>
cd draw-app
pnpm install
```

### Environment variables

Create service-specific env files (see `.env.example` for reference):

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

### Database migration

```bash
cd packages/db
npx prisma migrate deploy
npx prisma generate
```

### Start services

**All services (Turborepo):**
```bash
pnpm dev
```

**Individual services:**
```bash
# HTTP backend
cd apps/http-backend && npm run build && npm run start

# WebSocket backend
cd apps/ws-backend && npm run build && npm run start

# Frontend
cd apps/draw && pnpm dev
```

**URLs:**
- Frontend: http://localhost:3000
- HTTP API: http://localhost:3002
- WebSocket: ws://localhost:8080

---

## Docker Setup

```bash
cp .env.example .env
docker compose up --build
```

Detached mode:

```bash
docker compose up -d --build
```

Stop:

```bash
docker compose down
```

Stop and remove persistent database volume:

```bash
docker compose down -v
```

> **Warning:** `docker compose down -v` deletes the PostgreSQL volume and all persisted data.

Ensure host ports `3000`, `3002`, and `8080` are free before starting.

---

## Testing and Verification

### HTTP performance benchmark

```bash
node apps/http-backend/scripts/benchmark-baseline.mjs
```

Optional env: `BENCHMARK_BASE_URL`, `BENCHMARK_REQUESTS` (default 21).

Results are written to `benchmarks/before-redis-baseline.json` and `.md`.

### WebSocket Redis Pub/Sub (cross-server)

Requires Redis and two WS server instances on different ports:

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

Verified behavior:
- Client A (Server 1) → drawing → Client B (Server 2) receives it
- Client B (Server 2) → chat → Client A (Server 1) receives it
- No duplicate messages (SERVER_ID deduplication)

---

## Environment Variables

| Variable | Service | Purpose |
|----------|---------|---------|
| `DATABASE_URL` | db, http-backend, ws-backend | PostgreSQL connection string |
| `REDIS_URL` | http-backend, ws-backend | Redis connection (`redis://host:6379`) |
| `JWT_SECRET` | http-backend, ws-backend | JWT sign/verify secret |
| `PORT` | http-backend (3002), ws-backend (8080) | Server listen port |
| `FRONTEND_URL` | http-backend | OAuth redirect target, CORS |
| `OAUTH_CALLBACK_BASE_URL` | http-backend | OAuth provider callback base URL |
| `GITHUB_CLIENT_ID` | http-backend | GitHub OAuth (optional) |
| `GITHUB_CLIENT_SECRET` | http-backend | GitHub OAuth (optional) |
| `GOOGLE_CLIENT_ID` | http-backend | Google OAuth (optional) |
| `GOOGLE_CLIENT_SECRET` | http-backend | Google OAuth (optional) |
| `NEXT_PUBLIC_HTTP_BACKEND` | draw (build-time) | Browser → HTTP API URL |
| `NEXT_PUBLIC_WS_URL` | draw (build-time) | Browser → WebSocket URL |
| `POSTGRES_USER` | Docker Compose | PostgreSQL user |
| `POSTGRES_PASSWORD` | Docker Compose | PostgreSQL password |
| `POSTGRES_DB` | Docker Compose | PostgreSQL database name |

Never commit `.env` files or real secrets to Git.

---

## Security

- JWT secret, OAuth credentials, and database credentials are loaded from environment variables
- `.env` files are gitignored; `.env.example` documents required variables without secrets
- OAuth state parameter prevents CSRF on OAuth callbacks
- WebSocket connections require a valid JWT or `guest_*` token
- Redis and PostgreSQL are not exposed to the host in Docker Compose (internal network only)

**Known limitation:** email/password sign-up stores passwords in plaintext in PostgreSQL (marked for hashing in source). Use OAuth or treat local credentials as development-only.

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
