import dotenv from "dotenv";
dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET!;


import express, { Express, Request, Response } from "express";



import jwt from "jsonwebtoken";

import {
  handleGitHubCallback,
  handleGoogleCallback,
  startGitHubAuth,
  startGoogleAuth,
} from "./oauth.js";
import { middleware } from "./middleware.js";
import cors from "cors";

import {
  CreateRoomSchema,
  CreateUserSchema,
  SigninSchema,
  CreateWorkspaceSchema,
  UpdateWorkspaceSchema,
  CreateWorkspaceRoomSchema,
  JoinRoomSchema,
} from "@repo/common/types";
import { prismaClient } from "@repo/db/index";
import {
  CACHE_TTL,
  chatsCacheKey,
  connectRedisCache,
  drawingsCacheKey,
  redisDel,
  redisGet,
  redisSet,
  roomCacheKey,
} from "./redis.js";
import { hashPassword, verifyPassword } from "./password.js";
import { authRateLimiter } from "./rateLimit.js";
const PORT = process.env.PORT || 3002;

const app: Express = express();
app.use(express.json());

app.use(
  cors({
    origin: [
      "http://localhost:3000",
      "http://localhost:3001",
      process.env.FRONTEND_URL,
    ].filter(Boolean) as string[],
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

// app.options("*", cors());

async function resolveUserId(userId: string): Promise<string> {
  if (userId.startsWith("guest_")) {
    let guestUser = await prismaClient.user.findFirst({
      where: {
        email: `${userId}@guest.local`,
      },
    });

    if (!guestUser) {
      guestUser = await prismaClient.user.create({
        data: {
          email: `${userId}@guest.local`,
          password: "guest_password_not_used",
          name: "Guest User",
        },
      });
      console.log("Created guest user:", guestUser.id);
    }
    return guestUser.id;
  }
  return userId;
}

app.get("/health", (req, res) => {
  res.json({ status: "OK", message: "Server is running" });
});

app.post("/signup", authRateLimiter, async function (req, res) {
  const ParseData = CreateUserSchema.safeParse(req.body);
  if (!ParseData.success) {
    return res.status(400).json({
      message: "Incorrect inputs. Please check your form data.",
    });
  }

  try {
    const hashedPassword = await hashPassword(ParseData.data.password);
    const user = await prismaClient.user.create({
      data: {
        email: ParseData.data.email,
        password: hashedPassword,
        name: ParseData.data.name,
      },
    });

    // ✅ IMPORTANT: 201 status
    return res.status(201).json({
      success: true,
      message: "Signup successful",
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
    });
  } catch (error: any) {
    // ✅ Only duplicate email error → 409
    if (error.code === "P2002") {
      return res.status(409).json({
        success: false,
        message: "User already exists with this email address",
      });
    }

    // ✅ Any other error
    console.error("Signup error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});


app.post("/signin", authRateLimiter, async function (req: any, res: any) {

  const ParseData = SigninSchema.safeParse(req.body);
  if (!ParseData.success) {
    console.log("Validation failed:", ParseData.error);
    res.status(400).json({
      message: "Incorrect inputs. Please check your form data.",
      
    });
    return;
  }
  const user = await prismaClient.user.findFirst({
    where: {
      email: ParseData.data.email,
    },
  });

  if (!user) {
    return res.status(403).json({
      message: "Invalid email or password",
    });
  }

  if (!user.password) {
    return res.status(403).json({
      message: "This account uses social login. Please sign in with GitHub or Google.",
    });
  }

  const { valid, upgradedHash } = await verifyPassword(
    ParseData.data.password,
    user.password
  );

  if (!valid) {
    return res.status(403).json({
      message: "Invalid email or password",
    });
  }

  if (upgradedHash) {
    await prismaClient.user.update({
      where: { id: user.id },
      data: { password: upgradedHash },
    });
  }

  const token = jwt.sign(
    {
      userId: user.id,
    },
    JWT_SECRET
  );
  res.json({
    token,
    userId: user.id,
    name: user.name,
  });
});

app.get("/auth/github", startGitHubAuth);
app.get("/auth/github/callback", handleGitHubCallback);
app.get("/auth/google", startGoogleAuth);
app.get("/auth/google/callback", handleGoogleCallback);

// ==========================================
// WORKSPACE ENDPOINTS
// ==========================================

app.get("/workspaces", middleware, async function (req, res) {
  let userId = req.userId;
  if (!userId) {
    res.status(401).json({ message: "User not authenticated" });
    return;
  }

  try {
    userId = await resolveUserId(userId);
    const workspaces = await prismaClient.workspace.findMany({
      where: { ownerId: userId },
      include: {
        _count: {
          select: { rooms: true },
        },
        rooms: {
          select: {
            id: true,
            name: true,
            slug: true,
            createdAt: true,
            updatedAt: true,
          },
          orderBy: { updatedAt: "desc" },
        },
      },
      orderBy: { updatedAt: "desc" },
    });

    res.json({
      workspaces: workspaces.map((ws) => ({
        id: ws.id,
        name: ws.name,
        slug: ws.slug,
        description: ws.description,
        createdAt: ws.createdAt,
        updatedAt: ws.updatedAt,
        roomCount: ws._count.rooms,
        rooms: ws.rooms,
      })),
    });
  } catch (error) {
    console.error("Failed to fetch workspaces:", error);
    res.status(500).json({ message: "Failed to fetch workspaces" });
  }
});

app.post("/workspaces", middleware, async function (req, res) {
  const parseData = CreateWorkspaceSchema.safeParse(req.body);
  if (!parseData.success) {
    res.status(400).json({
      message: parseData.error.issues[0]?.message || "Invalid workspace data",
    });
    return;
  }

  let userId = req.userId;
  if (!userId) {
    res.status(401).json({ message: "User not authenticated" });
    return;
  }

  try {
    userId = await resolveUserId(userId);
    const workspace = await prismaClient.workspace.create({
      data: {
        name: parseData.data.name.trim(),
        description: parseData.data.description?.trim() || null,
        ownerId: userId,
      },
    });

    res.status(201).json({
      success: true,
      message: "Workspace created successfully",
      workspace: {
        id: workspace.id,
        name: workspace.name,
        description: workspace.description,
        createdAt: workspace.createdAt,
        updatedAt: workspace.updatedAt,
        roomCount: 0,
        rooms: [],
      },
    });
  } catch (error) {
    console.error("Failed to create workspace:", error);
    res.status(500).json({ message: "Failed to create workspace" });
  }
});

app.get("/workspaces/:workspaceId", middleware, async function (req, res) {
  const workspaceId = String(req.params.workspaceId);
  let userId = req.userId;
  if (!userId) {
    res.status(401).json({ message: "User not authenticated" });
    return;
  }

  try {
    userId = await resolveUserId(userId);
    const workspace: any = await prismaClient.workspace.findUnique({
      where: { id: workspaceId },
      include: {
        _count: { select: { rooms: true } },
        owner: { select: { id: true, name: true, email: true } },
        rooms: {
          select: {
            id: true,
            name: true,
            slug: true,
            createdAt: true,
            updatedAt: true,
            adminId: true,
          },
          orderBy: { updatedAt: "desc" },
        },
      },
    });

    if (!workspace) {
      res.status(404).json({ message: "Workspace not found" });
      return;
    }

    if (workspace.ownerId !== userId && !userId.startsWith("guest_")) {
      res.status(403).json({ message: "You don't have access to this workspace" });
      return;
    }

    res.json({
      workspace: {
        id: workspace.id,
        name: workspace.name,
        description: workspace.description,
        createdAt: workspace.createdAt,
        updatedAt: workspace.updatedAt,
        ownerId: workspace.ownerId,
        owner: workspace.owner,
        roomCount: workspace._count?.rooms ?? (workspace.rooms ? workspace.rooms.length : 0),
        rooms: workspace.rooms || [],
      },
    });
  } catch (error) {
    console.error("Failed to fetch workspace:", error);
    res.status(500).json({ message: "Failed to fetch workspace" });
  }
});

app.put("/workspaces/:workspaceId", middleware, async function (req, res) {
  const workspaceId = String(req.params.workspaceId);
  const parseData = UpdateWorkspaceSchema.safeParse(req.body);
  if (!parseData.success) {
    res.status(400).json({
      message: parseData.error.issues[0]?.message || "Invalid input data",
    });
    return;
  }

  let userId = req.userId;
  if (!userId) {
    res.status(401).json({ message: "User not authenticated" });
    return;
  }

  try {
    userId = await resolveUserId(userId);
    const workspace = await prismaClient.workspace.findUnique({
      where: { id: workspaceId },
    });

    if (!workspace) {
      res.status(404).json({ message: "Workspace not found" });
      return;
    }

    if (workspace.ownerId !== userId) {
      res.status(403).json({ message: "You don't have access to this workspace" });
      return;
    }

    const updated = await prismaClient.workspace.update({
      where: { id: workspaceId },
      data: {
        ...(parseData.data.name ? { name: parseData.data.name.trim() } : {}),
        ...(parseData.data.description !== undefined
          ? { description: parseData.data.description?.trim() || null }
          : {}),
      },
    });

    res.json({
      success: true,
      message: "Workspace updated successfully",
      workspace: updated,
    });
  } catch (error) {
    console.error("Failed to update workspace:", error);
    res.status(500).json({ message: "Failed to update workspace" });
  }
});

app.delete("/workspaces/:workspaceId", middleware, async function (req, res) {
  const workspaceId = String(req.params.workspaceId);
  let userId = req.userId;
  if (!userId) {
    res.status(401).json({ message: "User not authenticated" });
    return;
  }

  try {
    userId = await resolveUserId(userId);
    const workspace = await prismaClient.workspace.findUnique({
      where: { id: workspaceId },
    });

    if (!workspace) {
      res.status(404).json({ message: "Workspace not found" });
      return;
    }

    if (workspace.ownerId !== userId) {
      res.status(403).json({ message: "You don't have access to this workspace" });
      return;
    }

    await prismaClient.workspace.delete({
      where: { id: workspaceId },
    });

    res.json({
      success: true,
      message: "Workspace deleted successfully",
    });
  } catch (error) {
    console.error("Failed to delete workspace:", error);
    res.status(500).json({ message: "Failed to delete workspace" });
  }
});

app.get("/workspaces/:workspaceId/rooms", middleware, async function (req, res) {
  const workspaceId = String(req.params.workspaceId);
  let userId = req.userId;
  if (!userId) {
    res.status(401).json({ message: "User not authenticated" });
    return;
  }

  try {
    const workspace = await prismaClient.workspace.findUnique({
      where: { id: workspaceId },
    });

    if (!workspace) {
      res.status(404).json({ message: "Workspace not found" });
      return;
    }

    const rooms = await prismaClient.room.findMany({
      where: { workspaceId },
      orderBy: { updatedAt: "desc" },
    });

    res.json({ rooms });
  } catch (error) {
    console.error("Failed to fetch workspace rooms:", error);
    res.status(500).json({ message: "Failed to fetch rooms" });
  }
});

app.post("/workspaces/:workspaceId/rooms", middleware, async function (req, res) {
  const workspaceId = String(req.params.workspaceId);
  const parseData = CreateWorkspaceRoomSchema.safeParse(req.body);
  if (!parseData.success) {
    res.status(400).json({
      message: parseData.error.issues[0]?.message || "Invalid room data",
    });
    return;
  }

  let userId = req.userId;
  if (!userId) {
    res.status(401).json({ message: "User not authenticated" });
    return;
  }

  try {
    userId = await resolveUserId(userId);
    const workspace = await prismaClient.workspace.findUnique({
      where: { id: workspaceId },
    });

    if (!workspace) {
      res.status(404).json({ message: "Workspace not found" });
      return;
    }

    const baseSlug = (parseData.data.slug || parseData.data.name)
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "room";

    let roomSlug = baseSlug;
    let attempt = 0;
    let room: any = null;

    while (attempt < 5) {
      try {
        room = await prismaClient.room.create({
          data: {
            name: parseData.data.name.trim(),
            slug: roomSlug,
            adminId: userId,
            workspaceId: workspaceId,
          },
        });
        break;
      } catch (e: any) {
        if (e.code === "P2002" && e.meta?.target?.includes("slug")) {
          attempt++;
          const randomSuffix = Math.random().toString(36).substring(2, 8);
          roomSlug = `${baseSlug}-${randomSuffix}`;
        } else {
          throw e;
        }
      }
    }

    if (!room) {
      res.status(400).json({
        message: "Unable to create room with a unique name. Please try a different name.",
      });
      return;
    }

    // Touch workspace updatedAt
    await prismaClient.workspace.update({
      where: { id: workspaceId },
      data: { updatedAt: new Date() },
    });

    res.status(201).json({
      roomId: room.id,
      slug: room.slug,
      name: room.name,
      workspaceId: room.workspaceId,
      message: "Room created successfully",
    });
  } catch (error) {
    console.error("Failed to create workspace room:", error);
    res.status(500).json({ message: "Failed to create room" });
  }
});

app.post("/rooms/join", middleware, async function (req, res) {
  const parseData = JoinRoomSchema.safeParse(req.body);
  if (!parseData.success) {
    res.status(400).json({
      message: parseData.error.issues[0]?.message || "Invalid join inputs",
    });
    return;
  }

  const { workspaceId, roomId } = parseData.data;

  try {
    const workspace = await prismaClient.workspace.findUnique({
      where: { id: workspaceId.trim() },
    });

    if (!workspace) {
      res.status(404).json({ message: "Workspace not found" });
      return;
    }

    const trimmedRoomId = roomId.trim();
    const isNumeric = !isNaN(Number(trimmedRoomId));

    const room = await prismaClient.room.findFirst({
      where: {
        workspaceId: workspace.id,
        OR: [
          ...(isNumeric ? [{ id: Number(trimmedRoomId) }] : []),
          { slug: trimmedRoomId },
          { name: trimmedRoomId },
        ],
      },
    });

    if (!room) {
      res.status(404).json({
        message: "Room not found in this workspace",
      });
      return;
    }

    res.json({
      success: true,
      workspace: {
        id: workspace.id,
        name: workspace.name,
      },
      room: {
        id: room.id,
        slug: room.slug,
        name: room.name || room.slug,
      },
    });
  } catch (error) {
    console.error("Failed to join room:", error);
    res.status(500).json({ message: "Failed to join room" });
  }
});


// ==========================================
// ROOM ENDPOINTS
// ==========================================

app.post("/room", middleware, async function (req, res) {
  const ParseData = CreateRoomSchema.safeParse(req.body);
  if (!ParseData.success) {
    console.log("Room validation failed:", ParseData.error);
    res.status(400).json({
      message: "Incorrect inputs",
    });
    return;
  }

  let userId = req.userId;
  if (!userId) {
    console.log("No user ID found");
    res.status(401).json({
      message: "User not authenticated",
    });
    return;
  }

  try {
    userId = await resolveUserId(userId);

    const baseSlug = ParseData.data.name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "room";

    let roomSlug = baseSlug;
    let attempt = 0;
    let room: any = null;

    while (attempt < 5) {
      try {
        console.log("Attempting to create room with slug:", roomSlug);
        room = await prismaClient.room.create({
          data: {
            name: ParseData.data.name,
            slug: roomSlug,
            adminId: userId,
            workspaceId: ParseData.data.workspaceId || null,
          },
        });
        break;
      } catch (e: any) {
        if (e.code === "P2002" && e.meta?.target?.includes("slug")) {
          attempt++;
          const randomSuffix = Math.random().toString(36).substring(2, 8);
          roomSlug = `${baseSlug}-${randomSuffix}`;
          console.log(`Room name taken, trying with suffix: ${roomSlug}`);
        } else {
          throw e;
        }
      }
    }

    if (!room) {
      console.log("Failed to create room after multiple attempts");
      res.status(400).json({
        message:
          "Unable to create room with a unique name. Please try a different name.",
      });
      return;
    }

    console.log("Room created successfully:", room);
    res.status(200).json({
      roomId: room.id,
      slug: room.slug,
      name: room.name,
      workspaceId: room.workspaceId,
      message: "Room created successfully",
    });
  } catch (e) {
    console.error("Room creation error:", e);
    res.status(400).json({
      message: "Room creation failed. Please try again.",
    });
  }
});

app.get("/rooms/:roomId", async function (req, res) {
  try {
    const roomId = Number(req.params.roomId);
    if (isNaN(roomId)) {
      res.status(400).json({ message: "Invalid room ID", room: null });
      return;
    }

    const room = await prismaClient.room.findUnique({
      where: { id: roomId },
      include: {
        workspace: { select: { id: true, name: true } },
        admin: { select: { id: true, name: true } },
      },
    });

    if (!room) {
      res.status(404).json({ message: "Room not found", room: null });
      return;
    }

    res.json({ room });
  } catch (error) {
    console.error("Failed to get room by ID:", error);
    res.status(500).json({ message: "Failed to get room", room: null });
  }
});

app.get("/chats/:roomId", async function (req, res) {
  try {
    const roomId = Number(req.params.roomId);
    const cacheKey = chatsCacheKey(roomId);

    const cached = await redisGet(cacheKey);
    if (cached !== null) {
      console.log(`[Redis] HIT ${cacheKey}`);
      res.json(JSON.parse(cached));
      return;
    }

    console.log(`[Redis] MISS ${cacheKey}`);
    console.log(req.params.roomId);
    const messages = await prismaClient.chat.findMany({
      where: {
        roomId: roomId,
      },
      orderBy: {
        id: "desc",
      },
      take: 50,
    });

    const response = { messages };
    await redisSet(cacheKey, JSON.stringify(response), CACHE_TTL.CHATS_SECONDS);
    res.json(response);
  } catch (e) {
    console.log(e);
    res.json({
      messages: [],
    });
  }
});

app.get("/room/:slug", async function (req, res) {
  const slug = req.params.slug;
  const cacheKey = roomCacheKey(slug);

  const cached = await redisGet(cacheKey);
  if (cached !== null) {
    console.log(`[Redis] HIT ${cacheKey}`);
    res.json(JSON.parse(cached));
    return;
  }

  console.log(`[Redis] MISS ${cacheKey}`);
  let room = await prismaClient.room.findFirst({
    where: {
      slug,
    },
    include: {
      workspace: { select: { id: true, name: true } },
      admin: { select: { id: true, name: true } },
    },
  });

  if (!room) {
    try {
      let guestUser = await prismaClient.user.findFirst({
        where: {
          email: "guest@excalidraw.local",
        },
      });

      if (!guestUser) {
        guestUser = await prismaClient.user.create({
          data: {
            email: "guest@excalidraw.local",
            password: "guest_password_not_used",
            name: "Guest User",
          },
        });
      }

      room = await prismaClient.room.create({
        data: {
          slug,
          name: slug,
          adminId: guestUser.id,
        },
        include: {
          workspace: { select: { id: true, name: true } },
          admin: { select: { id: true, name: true } },
        },
      });
      console.log(`Auto-created room for slug: ${slug}`);
    } catch (error) {
      console.error("Failed to auto-create room:", error);
      res.status(500).json({
        room: null,
        error: "Failed to create room",
      });
      return;
    }
  }

  const response = { room };
  await redisSet(cacheKey, JSON.stringify(response), CACHE_TTL.ROOM_SECONDS);
  res.json(response);
});


app.get("/drawings/:roomId", async function (req, res) {
  try {
    const roomId = Number(req.params.roomId);
    
    if (isNaN(roomId)) {
      res.status(400).json({
        message: "Invalid room ID",
        drawings: [],
      });
      return;
    }

    const cacheKey = drawingsCacheKey(roomId);
    const cached = await redisGet(cacheKey);
    if (cached !== null) {
      console.log(`[Redis] HIT ${cacheKey}`);
      res.json(JSON.parse(cached));
      return;
    }

    console.log(`[Redis] MISS ${cacheKey}`);
    const drawings = await prismaClient.drawing.findMany({
      where: {
        roomId: roomId,
      },
      orderBy: {
        createdAt: "asc",
      },
    });

    const elements = drawings.map((drawing: any) => JSON.parse(drawing.elementData));
    const response = { drawings: elements };

    await redisSet(cacheKey, JSON.stringify(response), CACHE_TTL.DRAWINGS_SECONDS);
    res.json(response);
  } catch (e) {
    console.log(e);
    res.status(500).json({
      message: "Failed to fetch drawings",
      drawings: [],
    });
  }
});

app.post("/drawings", async function (req, res) {
  try {
    const { roomId, elementData, elementId, userId } = req.body;

    if (!roomId || !elementData || !elementId) {
      res.status(400).json({
        message: "Missing required fields",
      });
      return;
    }

    const drawing = await prismaClient.drawing.create({
      data: {
        roomId: Number(roomId),
        elementId: elementId,
        elementData: JSON.stringify(elementData),
        userId: userId || "guest",
      },
    });

    await redisDel(drawingsCacheKey(roomId));

    res.json({
      message: "Drawing saved successfully",
      id: drawing.id,
    });
  } catch (e) {
    console.error("Failed to save drawing:", e);
    res.status(500).json({
      message: "Failed to save drawing",
    });
  }
});

app.post("/drawings/save", async function (req, res) {
  try {
    const { roomId, elements, userId } = req.body;

    if (!roomId || !Array.isArray(elements)) {
      res.status(400).json({ message: "Invalid payload: roomId and elements array are required" });
      return;
    }

    const numericRoomId = Number(roomId);
    if (isNaN(numericRoomId)) {
      res.status(400).json({ message: "Invalid room ID" });
      return;
    }

    const room = await prismaClient.room.findUnique({
      where: { id: numericRoomId },
    });

    if (!room) {
      res.status(404).json({ message: "Room not found" });
      return;
    }

    const resolvedUserId = userId && !userId.startsWith("guest_")
      ? userId
      : room.adminId;

    await prismaClient.drawing.deleteMany({
      where: { roomId: numericRoomId },
    });

    if (elements.length > 0) {
      await prismaClient.drawing.createMany({
        data: elements.map((element: any) => ({
          roomId: numericRoomId,
          elementId: element.id || Math.random().toString(36).substring(2, 10),
          elementData: typeof element === "string" ? element : JSON.stringify(element),
          userId: resolvedUserId,
        })),
      });
    }

    await prismaClient.room.update({
      where: { id: numericRoomId },
      data: { updatedAt: new Date() },
    });

    if (room.workspaceId) {
      await prismaClient.workspace.update({
        where: { id: room.workspaceId },
        data: { updatedAt: new Date() },
      });
    }

    await redisDel(drawingsCacheKey(numericRoomId));

    res.json({
      success: true,
      message: "Drawings saved successfully",
      count: elements.length,
    });
  } catch (e) {
    console.error("Failed to save drawings:", e);
    res.status(500).json({ message: "Failed to save drawings" });
  }
});


app.delete("/drawings/:elementId", async function (req, res) {
  try {
    const { elementId } = req.params;
    const { roomId } = req.body;

    if (!roomId) {
      res.status(400).json({
        message: "Room ID is required",
      });
      return;
    }

    await prismaClient.drawing.deleteMany({
      where: {
        elementId: elementId,
        roomId: Number(roomId),
      },
    });

    await redisDel(drawingsCacheKey(roomId));

    res.json({
      message: "Drawing deleted successfully",
    });
  } catch (e) {
    console.error("Failed to delete drawing:", e);
    res.status(500).json({
      message: "Failed to delete drawing",
    });
  }
});

async function start() {
  await connectRedisCache();

  app.listen(PORT, function () {
    console.log(`Server is running on http://localhost:${PORT}`);
  });
}

export { app };

if (process.env.NODE_ENV !== "test") {
  start().catch((err) => {
    console.error("Failed to start HTTP server:", err);
    process.exit(1);
  });
}