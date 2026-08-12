import dotenv from "dotenv";
dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET!;

import { WebSocket, WebSocketServer } from "ws";
import jwt, { JwtPayload } from "jsonwebtoken";

import { prismaClient } from "@repo/db/index";
import {
  connectRedis,
  publishToRedis,
  SERVER_ID,
  subscribeToRoom,
  unsubscribeFromRoom,
} from "./redis.js";

const PORT = Number(process.env.PORT);

if (!PORT) {
  throw new Error("PORT is not defined in .env");
}

interface Users {
  ws: WebSocket;
  rooms: string[];
  userId: string;
}

const users: Users[] = [];

function normalizeRoomId(roomId: string | number): string {
  return roomId.toString();
}

function getLocalUsersInRoom(roomId: string): Users[] {
  return users.filter((u) => u.rooms.includes(roomId));
}

function broadcastToLocalRoom(
  roomId: string,
  message: string,
  excludeWs?: WebSocket
) {
  users.forEach((u) => {
    if (u.rooms.includes(roomId) && u.ws !== excludeWs) {
      u.ws.send(message);
    }
  });
}

async function ensureRoomSubscribed(roomId: string) {
  const normalizedRoomId = normalizeRoomId(roomId);
  if (getLocalUsersInRoom(normalizedRoomId).length > 0) {
    await subscribeToRoom(normalizedRoomId);
  }
}

async function maybeUnsubscribeRoom(roomId: string) {
  const normalizedRoomId = normalizeRoomId(roomId);
  if (getLocalUsersInRoom(normalizedRoomId).length === 0) {
    await unsubscribeFromRoom(normalizedRoomId);
  }
}

async function publishToRoom(
  roomId: string | number,
  message: object,
  excludeWs?: WebSocket
) {
  const normalizedRoomId = normalizeRoomId(roomId);
  const serialized = JSON.stringify(message);

  broadcastToLocalRoom(normalizedRoomId, serialized, excludeWs);
  await publishToRedis(normalizedRoomId, serialized);
}

function broadcastUserCount(roomId: string | number) {
  const normalizedRoomId = normalizeRoomId(roomId);
  const usersInRoom = getLocalUsersInRoom(normalizedRoomId);

  void publishToRoom(normalizedRoomId, {
    type: "userCount",
    count: usersInRoom.length,
    roomId: normalizedRoomId,
  });
}

function CheckUser(token: string): string | null {
  if (token.startsWith("guest_")) {
    return token;
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload;

    if (!decoded || !decoded.userId) {
      return null;
    }

    return decoded.userId;
  } catch (err: any) {
    if (err.name === "TokenExpiredError") {
      console.error("Token expired");
    } else {
      console.error("Invalid token:", err.message);
    }
    return null;
  }
}

async function start() {
  await connectRedis((roomId, message) => {
    broadcastToLocalRoom(roomId, message);
  });

  const wss = new WebSocketServer({ port: PORT });
  console.log(`WebSocket server running on ws://localhost:${PORT} (serverId=${SERVER_ID})`);

  wss.on("connection", (ws: WebSocket, request) => {
  const url = request.url;

  if (!url) {
    ws.close();
    return;
  }

  const queryParams = new URLSearchParams(url.split("?")[1]);
  const token = queryParams.get("token");

  if (!token) {
    ws.send(
      JSON.stringify({
        message: "Unauthorized",
      })
    );
    ws.close();
    return;
  }

  const userAuthenticated = CheckUser(token);

  if (!userAuthenticated) {
    ws.close();
    return;
  }

  users.push({
    userId: userAuthenticated,
    rooms: [],
    ws,
  });

  ws.on("message", async function message(data) {
    let ParseData;

    try {
      ParseData = JSON.parse(data.toString());
    } catch (err) {
      ws.send(JSON.stringify({ message: "Invalid message format" }));
      return;
    }
    if (ParseData.type === "join_room") {
      const user = users.find((x) => x.ws === ws);
      if (user) {
        const roomId = normalizeRoomId(ParseData.roomId);
        user.rooms.push(roomId);
        await ensureRoomSubscribed(roomId);
        broadcastUserCount(roomId);
      }
    }
    if (ParseData.type === "leave_room") {
      const user = users.find((x) => x.ws === ws);
      if (user) {
        const roomId = normalizeRoomId(ParseData.roomId || ParseData.room);
        user.rooms = user.rooms.filter((x) => x !== roomId);
        broadcastUserCount(roomId);
        await maybeUnsubscribeRoom(roomId);
      }
    }
    if (ParseData.type === "chat") {
      const { roomId, message } = ParseData;

      if (!roomId || typeof message !== "string") {
        ws.send(JSON.stringify({ message: "Invalid chat payload" }));
        return;
      }

      const user = users.find((x) => x.ws === ws);
      if (user) {
        if (!user.userId.startsWith("guest_")) {
          try {
            await prismaClient.chat.create({
              data: {
                roomId: Number(roomId),
                message,
                userId: user.userId,
              },
            });
          } catch (error) {
            console.error("Failed to save chat message to database:", error);
          }
        }

        await publishToRoom(roomId, {
          type: "chat",
          message: message,
          roomId,
          userId: user.userId,
        });
      }
    }

    if (ParseData.type === "drawing") {
      const { roomId, message } = ParseData;

      if (!roomId) {
        ws.send(JSON.stringify({ message: "Invalid drawing payload - missing roomId" }));
        return;
      }

      const user = users.find((x) => x.ws === ws);
      if (user) {
        try {
          const element = JSON.parse(message);
          
          if (!user.userId.startsWith("guest_")) {
            try {
              await prismaClient.drawing.create({
                data: {
                  roomId: Number(roomId),
                  elementId: element.id,
                  elementData: message,
                  userId: user.userId,
                },
              });
            } catch (error) {
              console.error("Failed to save drawing to database:", error);
            }
          }
        } catch (e) {
          console.error("Failed to parse drawing element:", e);
        }

        await publishToRoom(
          roomId,
          {
            type: "drawing",
            message: message,
            roomId,
            userId: user.userId,
          },
          ws
        );
      }
    }

    if (ParseData.type === "elementRemoved") {
      const { roomId, elementId } = ParseData;

      if (!roomId || !elementId) {
        ws.send(JSON.stringify({ message: "Invalid elementRemoved payload" }));
        return;
      }

      const user = users.find((x) => x.ws === ws);
      if (user) {
        if (!user.userId.startsWith("guest_")) {
          try {
            await prismaClient.drawing.deleteMany({
              where: {
                elementId: elementId,
                roomId: Number(roomId),
              },
            });
          } catch (error) {
            console.error("Failed to delete drawing from database:", error);
          }
        }

        await publishToRoom(
          roomId,
          {
            type: "elementRemoved",
            elementId: elementId,
            roomId,
            userId: user.userId,
          },
          ws
        );
      }
    }

    if (ParseData.type === "elementUpdated") {
      const { roomId, element } = ParseData;

      if (!roomId || !element) {
        ws.send(JSON.stringify({ message: "Invalid elementUpdated payload" }));
        return;
      }

      const user = users.find((x) => x.ws === ws);
      if (user) {
        if (!user.userId.startsWith("guest_")) {
          try {
            await prismaClient.drawing.updateMany({
              where: {
                elementId: element.id,
                roomId: Number(roomId),
              },
              data: {
                elementData: JSON.stringify(element),
              },
            });
          } catch (error) {
            console.error("Failed to update drawing in database:", error);
          }
        }

        await publishToRoom(
          roomId,
          {
            type: "elementUpdated",
            element: element,
            roomId,
            userId: user.userId,
          },
          ws
        );
      }
    }

    if (ParseData.type === "clearCanvas") {
      const { roomId } = ParseData;
      console.log("Received clearCanvas request for room:", roomId);

      if (!roomId) {
        ws.send(JSON.stringify({ message: "Invalid clearCanvas payload" }));
        return;
      }

      const user = users.find((x) => x.ws === ws);
      if (user) {
        console.log("User found, clearing room:", roomId);
        
        if (!user.userId.startsWith("guest_")) {
          try {
            await prismaClient.drawing.deleteMany({
              where: {
                roomId: Number(roomId),
              },
            });
            console.log("Cleared database drawings for room:", roomId);
          } catch (error) {
            console.error("Failed to clear drawings from database:", error);
          }
        }

        console.log("Broadcasting clearCanvas to room:", roomId);

        await publishToRoom(
          roomId,
          {
            type: "clearCanvas",
            roomId,
            userId: user.userId,
          },
          ws
        );
      }
    }

    if (ParseData.type === "undo") {
      const { roomId, elements } = ParseData;
      console.log("Received undo request for room:", roomId);

      if (!roomId || !Array.isArray(elements)) {
        ws.send(JSON.stringify({ message: "Invalid undo payload" }));
        return;
      }

      const user = users.find((x) => x.ws === ws);
      if (user) {
        console.log("Broadcasting undo to room:", roomId);
        
        if (!user.userId.startsWith("guest_")) {
          try {
            await prismaClient.drawing.deleteMany({
              where: {
                roomId: Number(roomId),
              },
            });

            if (elements.length > 0) {
              await prismaClient.drawing.createMany({
                data: elements.map((element: any) => ({
                  roomId: Number(roomId),
                  elementId: element.id,
                  elementData: JSON.stringify(element),
                  userId: user.userId,
                })),
              });
            }
          } catch (error) {
            console.error("Failed to sync undo to database:", error);
          }
        }

        await publishToRoom(
          roomId,
          {
            type: "undo",
            elements: elements,
            roomId,
            userId: user.userId,
          },
          ws
        );
      }
    }

    if (ParseData.type === "redo") {
      const { roomId, elements } = ParseData;
      console.log("Received redo request for room:", roomId);

      if (!roomId || !Array.isArray(elements)) {
        ws.send(JSON.stringify({ message: "Invalid redo payload" }));
        return;
      }

      const user = users.find((x) => x.ws === ws);
      if (user) {
        console.log("Broadcasting redo to room:", roomId);
        
        if (!user.userId.startsWith("guest_")) {
          try {
            await prismaClient.drawing.deleteMany({
              where: {
                roomId: Number(roomId),
              },
            });

            if (elements.length > 0) {
              await prismaClient.drawing.createMany({
                data: elements.map((element: any) => ({
                  roomId: Number(roomId),
                  elementId: element.id,
                  elementData: JSON.stringify(element),
                  userId: user.userId,
                })),
              });
            }
          } catch (error) {
            console.error("Failed to sync redo to database:", error);
          }
        }

        await publishToRoom(
          roomId,
          {
            type: "redo",
            elements: elements,
            roomId,
            userId: user.userId,
          },
          ws
        );
      }
    }
  });
  ws.on("close", () => {
    const userIndex = users.findIndex((x) => x.ws === ws);
    if (userIndex !== -1) {
      const user = users[userIndex];
      const userRooms = user ? [...user.rooms] : [];

      users.splice(userIndex, 1);

      userRooms.forEach((roomId) => {
        broadcastUserCount(roomId);
        void maybeUnsubscribeRoom(roomId);
      });
    }
    console.log("Client disconnected");
  });
  });
}

start().catch((err) => {
  console.error("Failed to start WebSocket server:", err);
  process.exit(1);
});