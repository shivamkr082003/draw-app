/**
 * BEFORE-REDIS baseline benchmark (non-invasive).
 * Does not modify server code or business logic.
 *
 * Usage:
 *   node apps/http-backend/scripts/benchmark-baseline.mjs
 *
 * Env (optional):
 *   BENCHMARK_BASE_URL=http://localhost:3002
 *   BENCHMARK_REQUESTS=21   # 1 warm-up + 20 measured
 */

import { writeFileSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASE_URL = process.env.BENCHMARK_BASE_URL || "http://localhost:3002";
const TOTAL_REQUESTS = Number(process.env.BENCHMARK_REQUESTS || 21);
const MEASURED_REQUESTS = TOTAL_REQUESTS - 1;

const stats = (times) => {
  const sorted = [...times].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  return {
    count: sorted.length,
    avg: sum / sorted.length,
    min: sorted[0],
    max: sorted[sorted.length - 1],
    p95: sorted[Math.floor(sorted.length * 0.95)] ?? sorted[sorted.length - 1],
  };
};

async function timedFetch(url, options = {}) {
  const start = performance.now();
  const response = await fetch(url, options);
  const body = await response.text();
  const end = performance.now();
  let json;
  try {
    json = JSON.parse(body);
  } catch {
    json = body;
  }
  return {
    ms: end - start,
    status: response.status,
    ok: response.ok,
    json,
  };
}

async function benchmark(name, fn, { requests = TOTAL_REQUESTS } = {}) {
  const times = [];
  let lastResult = null;

  for (let i = 0; i < requests; i++) {
    const result = await fn();
    lastResult = result;
    if (i === 0) continue; // warm-up
    times.push(result.ms);
  }

  return {
    name,
    ...stats(times),
    lastStatus: lastResult?.status,
    lastOk: lastResult?.ok,
  };
}

async function setupFixtures() {
  const suffix = String(Date.now()).slice(-8);
  const email = `b${suffix}@b.co`;
  const password = "benchmark-password-123";
  const name = "Benchmark User";

  const signup = await timedFetch(`${BASE_URL}/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, name }),
  });

  if (!signup.ok && signup.status !== 409) {
    throw new Error(`Setup signup failed: ${signup.status} ${JSON.stringify(signup.json)}`);
  }

  const signin = await timedFetch(`${BASE_URL}/signin`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

  if (!signin.ok) {
    throw new Error(`Setup signin failed: ${signin.status}`);
  }

  const token = signin.json.token;
  const userId = signin.json.userId;
  const roomSlug = `br-${suffix}`;

  const room = await timedFetch(`${BASE_URL}/room`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: token,
    },
    body: JSON.stringify({ name: roomSlug }),
  });

  if (!room.ok) {
    throw new Error(`Setup room failed: ${room.status} ${JSON.stringify(room.json)}`);
  }

  const roomId = room.json.roomId;

  // Seed drawings for realistic GET /drawings/:roomId load
  const seedCount = 25;
  for (let i = 0; i < seedCount; i++) {
    await timedFetch(`${BASE_URL}/drawings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        roomId,
        elementId: `bench-el-${suffix}-${i}`,
        userId,
        elementData: {
          id: `bench-el-${suffix}-${i}`,
          type: "rectangle",
          x: i * 10,
          y: i * 10,
          width: 100,
          height: 80,
          strokeColor: "#000000",
          backgroundColor: "transparent",
          fillStyle: "hachure",
          strokeWidth: 1,
          roughness: 1,
          opacity: 100,
        },
      }),
    });
  }

  // Seed chats for GET /chats/:roomId (direct DB insert via API not available; endpoint exists)
  // Chats are only created via WebSocket in ws-backend, so /chats/:roomId may return empty.
  // We still benchmark the query path.

  return { token, userId, roomSlug, roomId, email, password };
}

function formatMs(n) {
  return `${n.toFixed(2)} ms`;
}

function buildReport(endpoints, meta) {
  const lines = [];
  lines.push("# API Performance Baseline (BEFORE Redis)");
  lines.push("");
  lines.push(`Generated: ${meta.generatedAt}`);
  lines.push(`Base URL: ${meta.baseUrl}`);
  lines.push(`Requests per endpoint: ${meta.totalRequests} (1 warm-up + ${meta.measuredRequests} measured)`);
  lines.push(`Fixtures: roomId=${meta.roomId}, slug=${meta.roomSlug}`);
  lines.push("");
  lines.push("---");
  lines.push("");

  for (const ep of endpoints) {
    lines.push(`Endpoint: ${ep.endpoint}`);
    lines.push(`Method: ${ep.method}`);
    lines.push(`Requests tested: ${ep.requestsTested}`);
    lines.push(`Average: ${formatMs(ep.averageMs)}`);
    lines.push(`Min: ${formatMs(ep.minMs)}`);
    lines.push(`Max: ${formatMs(ep.maxMs)}`);
    lines.push(`Database involved: ${ep.databaseInvolved}`);
    lines.push(`Notes: ${ep.notes}`);
    lines.push("");
  }

  lines.push("---");
  lines.push("");
  lines.push("## Redis cache recommendations (pre-implementation)");
  lines.push("");
  for (const rec of meta.recommendations) {
    lines.push(`- **${rec.endpoint}** — ${rec.reason}`);
  }

  return lines.join("\n");
}

async function main() {
  console.log(`Benchmark target: ${BASE_URL}`);
  console.log(`Running health check...`);

  const health = await timedFetch(`${BASE_URL}/health`);
  if (!health.ok) {
    throw new Error(`Backend not reachable at ${BASE_URL} (status ${health.status})`);
  }

  console.log("Setting up fixtures (one-time, not part of measured loops)...");
  const fixtures = await setupFixtures();

  const endpointDefs = [
    {
      endpoint: "/health",
      method: "GET",
      auth: false,
      params: "None",
      databaseInvolved: "No — in-memory JSON response only",
      dbQueries: "None",
      bottleneck: "Network + Express overhead only; useful control baseline",
      redisCandidate: false,
      reason: "No database access; caching would add no meaningful benefit",
      run: () => timedFetch(`${BASE_URL}/health`),
    },
    {
      endpoint: "/room/:slug",
      method: "GET",
      auth: false,
      params: `Path: slug=${fixtures.roomSlug}`,
      databaseInvolved: "Yes — PostgreSQL via Prisma",
      dbQueries: "Room.findFirst({ where: { slug } })",
      bottleneck: "DB round-trip on every room page load; called when opening a canvas",
      redisCandidate: true,
      reason: "Read-heavy, keyable by slug, same data served to many users entering a room",
      run: () => timedFetch(`${BASE_URL}/room/${fixtures.roomSlug}`),
    },
    {
      endpoint: "/drawings/:roomId",
      method: "GET",
      auth: false,
      params: `Path: roomId=${fixtures.roomId}`,
      databaseInvolved: "Yes — PostgreSQL via Prisma",
      dbQueries: "Drawing.findMany({ where: { roomId }, orderBy: { createdAt: 'asc' } }) + JSON.parse per row",
      bottleneck: "Full table scan for room drawings + CPU for JSON.parse on every element; payload grows with canvas size",
      redisCandidate: true,
      reason: "Highest-impact read endpoint; loaded on every canvas open; large payloads; ideal cache-aside by roomId",
      run: () => timedFetch(`${BASE_URL}/drawings/${fixtures.roomId}`),
    },
    {
      endpoint: "/chats/:roomId",
      method: "GET",
      auth: false,
      params: `Path: roomId=${fixtures.roomId}`,
      databaseInvolved: "Yes — PostgreSQL via Prisma",
      dbQueries: "Chat.findMany({ where: { roomId }, orderBy: { id: 'desc' }, take: 50 })",
      bottleneck: "Repeated polling would hammer DB; currently may return empty if chats only via WebSocket",
      redisCandidate: true,
      reason: "Read-heavy chat history; short TTL cache or cache-aside reduces DB load for message fetches",
      run: () => timedFetch(`${BASE_URL}/chats/${fixtures.roomId}`),
    },
    {
      endpoint: "/signin",
      method: "POST",
      auth: false,
      params: `Body: { email, password }`,
      databaseInvolved: "Yes — PostgreSQL via Prisma + JWT sign",
      dbQueries: "User.findFirst({ where: { email } })",
      bottleneck: "User lookup by email on every login; not a hot read path after session established",
      redisCandidate: false,
      reason: "Write-like auth flow; session/token caching is a different pattern than response caching",
      run: () =>
        timedFetch(`${BASE_URL}/signin`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: fixtures.email,
            password: fixtures.password,
          }),
        }),
    },
    {
      endpoint: "/room",
      method: "POST",
      auth: true,
      params: `Body: { name: string }, Header: Authorization: <JWT>`,
      databaseInvolved: "Yes — PostgreSQL writes",
      dbQueries: "Room.create({ slug, adminId }) (+ possible guest User find/create)",
      bottleneck: "Write path; slug uniqueness retry loop on conflict",
      redisCandidate: false,
      reason: "Mutating endpoint; cache invalidation on create, not a read cache target",
      run: () =>
        timedFetch(`${BASE_URL}/room`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: fixtures.token,
          },
          body: JSON.stringify({
            name: `bx-${String(Date.now()).slice(-6)}`,
          }),
        }),
      mutateWarning: true,
    },
    {
      endpoint: "/drawings",
      method: "POST",
      auth: false,
      params: "Body: { roomId, elementId, elementData, userId? }",
      databaseInvolved: "Yes — PostgreSQL write",
      dbQueries: "Drawing.create(...)",
      bottleneck: "Write on every stroke sync fallback; WebSocket is primary path",
      redisCandidate: false,
      reason: "Write endpoint; Redis would be used for cache invalidation later, not caching POST responses",
      run: () => {
        const id = `bench-write-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        return timedFetch(`${BASE_URL}/drawings`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            roomId: fixtures.roomId,
            elementId: id,
            userId: fixtures.userId,
            elementData: { id, type: "rectangle", x: 0, y: 0, width: 10, height: 10 },
          }),
        });
      },
      mutateWarning: true,
    },
    {
      endpoint: "/drawings/:elementId",
      method: "DELETE",
      auth: false,
      params: "Path: elementId; Body: { roomId }",
      databaseInvolved: "Yes — PostgreSQL delete",
      dbQueries: "Drawing.deleteMany({ where: { elementId, roomId } })",
      bottleneck: "Write/delete path",
      redisCandidate: false,
      reason: "Mutating endpoint; triggers cache invalidation for room drawings, not a cache read",
      run: () => {
        const id = `bench-del-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        return timedFetch(`${BASE_URL}/drawings`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            roomId: fixtures.roomId,
            elementId: id,
            userId: fixtures.userId,
            elementData: { id, type: "rectangle", x: 0, y: 0, width: 1, height: 1 },
          }),
        }).then(() =>
          timedFetch(`${BASE_URL}/drawings/${id}`, {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ roomId: fixtures.roomId }),
          })
        );
      },
      mutateWarning: true,
    },
  ];

  const results = [];

  for (const def of endpointDefs) {
    process.stdout.write(`Benchmarking ${def.method} ${def.endpoint} ... `);
    const result = await benchmark(`${def.method} ${def.endpoint}`, def.run);
    console.log(`avg ${result.avg.toFixed(2)} ms`);

    results.push({
      endpoint: def.endpoint,
      method: def.method,
      authRequired: def.auth,
      params: def.params,
      requestsTested: result.count,
      averageMs: result.avg,
      minMs: result.min,
      maxMs: result.max,
      p95Ms: result.p95,
      databaseInvolved: def.databaseInvolved,
      dbQueries: def.dbQueries,
      bottleneck: def.bottleneck,
      redisCandidate: def.redisCandidate,
      redisReason: def.reason,
      mutateWarning: def.mutateWarning ?? false,
      lastStatus: result.lastStatus,
    });
  }

  const recommendations = results
    .filter((r) => r.redisCandidate)
    .sort((a, b) => b.averageMs - a.averageMs)
    .map((r) => ({
      endpoint: `${r.method} ${r.endpoint}`,
      reason: r.redisReason,
      averageMs: r.averageMs,
    }));

  const meta = {
    generatedAt: new Date().toISOString(),
    baseUrl: BASE_URL,
    totalRequests: TOTAL_REQUESTS,
    measuredRequests: MEASURED_REQUESTS,
    roomId: fixtures.roomId,
    roomSlug: fixtures.roomSlug,
    recommendations,
  };

  const outDir = join(__dirname, "../../../benchmarks");
  mkdirSync(outDir, { recursive: true });

  const jsonPath = join(outDir, "before-redis-baseline.json");
  const mdPath = join(outDir, "before-redis-baseline.md");

  writeFileSync(jsonPath, JSON.stringify({ meta, results }, null, 2));
  writeFileSync(
    mdPath,
    buildReport(
      results.map((r) => ({
        endpoint: r.endpoint,
        method: r.method,
        requestsTested: r.requestsTested,
        averageMs: r.averageMs,
        minMs: r.minMs,
        maxMs: r.maxMs,
        databaseInvolved: r.databaseInvolved,
        notes: [
          r.authRequired ? "Auth required" : "No auth",
          r.params,
          `DB queries: ${r.dbQueries}`,
          `Bottleneck: ${r.bottleneck}`,
          r.mutateWarning ? "Mutating endpoint (each request changes data)" : "",
          `Redis candidate: ${r.redisCandidate ? "YES" : "NO"}`,
        ]
          .filter(Boolean)
          .join(" | "),
      })),
      meta
    )
  );

  console.log("\nSaved:");
  console.log(`  ${jsonPath}`);
  console.log(`  ${mdPath}`);

  return { meta, results };
}

main().catch((err) => {
  console.error("Benchmark failed:", err.message);
  process.exit(1);
});
