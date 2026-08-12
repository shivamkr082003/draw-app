import { randomUUID } from "crypto";
import { createClient, RedisClientType } from "redis";
import dotenv from "dotenv";

dotenv.config();

export const SERVER_ID = randomUUID();

function getRedisUrl(): string {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    throw new Error("REDIS_URL is not defined in environment variables");
  }
  return redisUrl;
}

export type RedisRoomMessageHandler = (
  roomId: string,
  message: string
) => void;

let publisher: RedisClientType | null = null;
let subscriber: RedisClientType | null = null;
let roomMessageHandler: RedisRoomMessageHandler | null = null;
const subscribedRooms = new Set<string>();

function roomChannel(roomId: string): string {
  return `ws:room:${roomId}`;
}

function handleIncomingRedisMessage(raw: string): void {
  let payload: { serverId?: string; roomId?: string; message?: string };

  try {
    payload = JSON.parse(raw);
  } catch {
    console.error("[Redis] failed to parse message payload");
    return;
  }

  if (!payload.roomId || typeof payload.message !== "string") {
    console.error("[Redis] invalid message payload");
    return;
  }

  if (payload.serverId === SERVER_ID) {
    console.log("[Redis] ignored own message");
    return;
  }

  console.log(`[Redis] received from server ${payload.serverId}`);
  roomMessageHandler?.(payload.roomId, payload.message);
}

export async function connectRedis(
  onRoomMessage: RedisRoomMessageHandler
): Promise<void> {
  roomMessageHandler = onRoomMessage;

  const redisUrl = getRedisUrl();
  publisher = createClient({ url: redisUrl });
  subscriber = createClient({ url: redisUrl });

  publisher.on("error", (err) => {
    console.error("[Redis] publisher error:", err.message);
  });

  subscriber.on("error", (err) => {
    console.error("[Redis] subscriber error:", err.message);
  });

  await publisher.connect();
  console.log("[Redis] connected");

  await subscriber.connect();
  console.log("[Redis] connected");
}

export async function subscribeToRoom(roomId: string): Promise<void> {
  if (!subscriber) {
    throw new Error("[Redis] subscriber is not connected");
  }

  const channel = roomChannel(roomId);
  if (subscribedRooms.has(channel)) {
    return;
  }

  await subscriber.subscribe(channel, (message) => {
    handleIncomingRedisMessage(message);
  });

  subscribedRooms.add(channel);
  console.log(`[Redis] subscribed to room ${roomId}`);
}

export async function unsubscribeFromRoom(roomId: string): Promise<void> {
  if (!subscriber) {
    throw new Error("[Redis] subscriber is not connected");
  }

  const channel = roomChannel(roomId);
  if (!subscribedRooms.has(channel)) {
    return;
  }

  await subscriber.unsubscribe(channel);
  subscribedRooms.delete(channel);
  console.log(`[Redis] unsubscribed from room ${roomId}`);
}

export async function publishToRedis(
  roomId: string,
  message: string
): Promise<void> {
  if (!publisher) {
    throw new Error("[Redis] publisher is not connected");
  }

  const payload = JSON.stringify({
    serverId: SERVER_ID,
    roomId,
    message,
  });

  await publisher.publish(roomChannel(roomId), payload);
  console.log(`[Redis] published to room ${roomId}`);
}
