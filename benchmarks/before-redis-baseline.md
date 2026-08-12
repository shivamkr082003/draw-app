# API Performance Baseline (BEFORE Redis)

Generated: 2026-08-12T19:57:59.131Z
Base URL: http://localhost:3002
Requests per endpoint: 21 (1 warm-up + 20 measured)
Fixtures: roomId=33, slug=br-64627448

---

Endpoint: /health
Method: GET
Requests tested: 20
Average: 2.15 ms
Min: 1.59 ms
Max: 3.41 ms
Database involved: No — in-memory JSON response only
Notes: No auth | None | DB queries: None | Bottleneck: Network + Express overhead only; useful control baseline | Redis candidate: NO

Endpoint: /room/:slug
Method: GET
Requests tested: 20
Average: 2.59 ms
Min: 1.22 ms
Max: 7.31 ms
Database involved: Yes — PostgreSQL via Prisma
Notes: No auth | Path: slug=br-64627448 | DB queries: Room.findFirst({ where: { slug } }) | Bottleneck: DB round-trip on every room page load; called when opening a canvas | Redis candidate: YES

Endpoint: /drawings/:roomId
Method: GET
Requests tested: 20
Average: 3.39 ms
Min: 1.41 ms
Max: 5.54 ms
Database involved: Yes — PostgreSQL via Prisma
Notes: No auth | Path: roomId=33 | DB queries: Drawing.findMany({ where: { roomId }, orderBy: { createdAt: 'asc' } }) + JSON.parse per row | Bottleneck: Full table scan for room drawings + CPU for JSON.parse on every element; payload grows with canvas size | Redis candidate: YES

Endpoint: /chats/:roomId
Method: GET
Requests tested: 20
Average: 3.29 ms
Min: 2.09 ms
Max: 5.20 ms
Database involved: Yes — PostgreSQL via Prisma
Notes: No auth | Path: roomId=33 | DB queries: Chat.findMany({ where: { roomId }, orderBy: { id: 'desc' }, take: 50 }) | Bottleneck: Repeated polling would hammer DB; currently may return empty if chats only via WebSocket | Redis candidate: YES

Endpoint: /signin
Method: POST
Requests tested: 20
Average: 313.74 ms
Min: 273.51 ms
Max: 572.07 ms
Database involved: Yes — PostgreSQL via Prisma + JWT sign
Notes: No auth | Body: { email, password } | DB queries: User.findFirst({ where: { email } }) | Bottleneck: User lookup by email on every login; not a hot read path after session established | Redis candidate: NO

Endpoint: /room
Method: POST
Requests tested: 20
Average: 286.58 ms
Min: 276.32 ms
Max: 301.84 ms
Database involved: Yes — PostgreSQL writes
Notes: Auth required | Body: { name: string }, Header: Authorization: <JWT> | DB queries: Room.create({ slug, adminId }) (+ possible guest User find/create) | Bottleneck: Write path; slug uniqueness retry loop on conflict | Mutating endpoint (each request changes data) | Redis candidate: NO

Endpoint: /drawings
Method: POST
Requests tested: 20
Average: 422.59 ms
Min: 277.18 ms
Max: 857.16 ms
Database involved: Yes — PostgreSQL write
Notes: No auth | Body: { roomId, elementId, elementData, userId? } | DB queries: Drawing.create(...) | Bottleneck: Write on every stroke sync fallback; WebSocket is primary path | Mutating endpoint (each request changes data) | Redis candidate: NO

Endpoint: /drawings/:elementId
Method: DELETE
Requests tested: 20
Average: 324.66 ms
Min: 276.08 ms
Max: 718.46 ms
Database involved: Yes — PostgreSQL delete
Notes: No auth | Path: elementId; Body: { roomId } | DB queries: Drawing.deleteMany({ where: { elementId, roomId } }) | Bottleneck: Write/delete path | Mutating endpoint (each request changes data) | Redis candidate: NO

---

## Redis cache recommendations (pre-implementation)

- **GET /drawings/:roomId** — Highest-impact read endpoint; loaded on every canvas open; large payloads; ideal cache-aside by roomId
- **GET /chats/:roomId** — Read-heavy chat history; short TTL cache or cache-aside reduces DB load for message fetches
- **GET /room/:slug** — Read-heavy, keyable by slug, same data served to many users entering a room