import dotenv from "dotenv";
import { createClient, RedisClientType } from "redis";

dotenv.config();

let client: RedisClientType | null = null;
let redisAvailable = false;

function getRedisUrl(): string | undefined {
  return process.env.REDIS_URL;
}

export async function connectRedisCache(): Promise<void> {
  const redisUrl = getRedisUrl();

  if (!redisUrl) {
    console.warn("[Redis] REDIS_URL not set — cache disabled, using PostgreSQL only");
    return;
  }

  try {
    client = createClient({ url: redisUrl });

    client.on("error", (err) => {
      console.error("[Redis] error:", err.message);
    });

    await client.connect();
    redisAvailable = true;
    console.log("[Redis] connected");
  } catch (err) {
    redisAvailable = false;
    client = null;
    console.error("[Redis] failed to connect — falling back to PostgreSQL:", err);
  }
}

export async function redisGet(key: string): Promise<string | null> {
  if (!redisAvailable || !client) {
    return null;
  }

  try {
    return await client.get(key);
  } catch (err) {
    console.error(`[Redis] GET failed for ${key}:`, err);
    return null;
  }
}

export async function redisSet(
  key: string,
  value: string,
  ttlSeconds: number
): Promise<void> {
  if (!redisAvailable || !client) {
    return;
  }

  try {
    await client.set(key, value, { EX: ttlSeconds });
    console.log(`[Redis] SET ${key}`);
  } catch (err) {
    console.error(`[Redis] SET failed for ${key}:`, err);
  }
}

export async function redisDel(key: string): Promise<void> {
  if (!redisAvailable || !client) {
    return;
  }

  try {
    await client.del(key);
    console.log(`[Redis] DEL ${key}`);
  } catch (err) {
    console.error(`[Redis] DEL failed for ${key}:`, err);
  }
}

export const CACHE_TTL = {
  DRAWINGS_SECONDS: 300,
  ROOM_SECONDS: 600,
  CHATS_SECONDS: 30,
} as const;

export function drawingsCacheKey(roomId: number | string): string {
  return `drawings:room:${roomId}`;
}

export function roomCacheKey(slug: string): string {
  return `room:slug:${slug}`;
}

export function chatsCacheKey(roomId: number | string): string {
  return `chats:room:${roomId}`;
}
