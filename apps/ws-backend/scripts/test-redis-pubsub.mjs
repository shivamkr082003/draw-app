/**
 * Cross-server WebSocket Pub/Sub verification script.
 *
 * Prerequisites:
 *   - Redis running (redis-cli ping -> PONG)
 *   - Two ws-backend instances on ports 8080 and 8081
 *
 * Usage:
 *   node apps/ws-backend/scripts/test-redis-pubsub.mjs
 */

import WebSocket from "ws";

const SERVER_A = process.env.WS_TEST_SERVER_A || "ws://localhost:8080";
const SERVER_B = process.env.WS_TEST_SERVER_B || "ws://localhost:8081";
const TOKEN = process.env.WS_TEST_TOKEN || "guest_test-redis-pubsub";
const ROOM_ID = process.env.WS_TEST_ROOM_ID || "123";

function connect(url, label) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`${url}?token=${TOKEN}`);
    const received = [];

    ws.on("open", () => {
      ws.send(JSON.stringify({ type: "join_room", roomId: ROOM_ID }));
      resolve({ ws, label, received });
    });

    ws.on("message", (data) => {
      const parsed = JSON.parse(data.toString());
      received.push(parsed);
    });

    ws.on("error", reject);
  });
}

function waitForMessage(received, predicate, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();

    const check = () => {
      const match = received.find(predicate);
      if (match) {
        resolve(match);
        return;
      }

      if (Date.now() - start > timeoutMs) {
        reject(new Error("Timed out waiting for message"));
        return;
      }

      setTimeout(check, 50);
    };

    check();
  });
}

async function main() {
  console.log("Connecting clients...");
  const clientA = await connect(SERVER_A, "A");
  const clientB = await connect(SERVER_B, "B");

  await new Promise((r) => setTimeout(r, 500));

  console.log("A -> drawing");
  clientA.ws.send(
    JSON.stringify({
      type: "drawing",
      roomId: ROOM_ID,
      message: JSON.stringify({ id: "test-el-1", type: "rectangle" }),
    })
  );

  await waitForMessage(
    clientB.received,
    (m) => m.type === "drawing" && m.userId === TOKEN
  );
  console.log("PASS: B received drawing from A");

  const duplicateCount = clientB.received.filter((m) => m.type === "drawing").length;
  if (duplicateCount !== 1) {
    throw new Error(`FAIL: B received ${duplicateCount} drawing messages (expected 1)`);
  }
  console.log("PASS: B did not receive duplicate drawing");

  console.log("B -> chat");
  clientB.ws.send(
    JSON.stringify({
      type: "chat",
      roomId: ROOM_ID,
      message: "hello from server B",
    })
  );

  await waitForMessage(
    clientA.received,
    (m) => m.type === "chat" && m.message === "hello from server B"
  );
  console.log("PASS: A received chat from B");

  const chatDupes = clientA.received.filter(
    (m) => m.type === "chat" && m.message === "hello from server B"
  ).length;
  if (chatDupes !== 1) {
    throw new Error(`FAIL: A received ${chatDupes} chat messages (expected 1)`);
  }
  console.log("PASS: A did not receive duplicate chat");

  clientA.ws.close();
  clientB.ws.close();
  console.log("\nCross-server Redis Pub/Sub test PASSED");
}

main().catch((err) => {
  console.error("\nCross-server Redis Pub/Sub test FAILED:", err.message);
  process.exit(1);
});
