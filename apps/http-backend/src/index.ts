import express, { Request, Response } from "express";
import jwt from "jsonwebtoken";
import { JWT_SECRET } from "@repo/backend-comman/config";
import { middleware } from "./middleware.js";
import cors from "cors";

import {
  CreateRoomSchema,
  CreateUserSchema,
  SigninSchema,
} from "@repo/common/types";
import { prismaClient } from "@repo/db/index";
const PORT = process.env.PORT || 3002;

const app = express();
app.use(express.json());

app.use(
  cors({
    origin: ["http://localhost:3000", "http://localhost:3001"],
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

// app.options("*", cors());

app.get("/health", (req, res) => {
  res.json({ status: "OK", message: "Server is running" });
});

app.post("/signup", async function (req, res) {
  const ParseData = CreateUserSchema.safeParse(req.body);
  if (!ParseData.success) {
    return res.status(400).json({
      message: "Incorrect inputs. Please check your form data.",
    });
  }

  try {
    const user = await prismaClient.user.create({
      data: {
        email: ParseData.data.email,
        password: ParseData.data.password, // ⚠️ hashing later
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


app.post("/signin", async function (req: any, res: any) {

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
      password: ParseData.data.password,
    },
  });

  if (!user) {
    return res.status(403).json({
      message: "Invalid email or password",
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
      userId = guestUser.id;
    }

    let roomSlug = ParseData.data.name;
    let attempt = 0;
    let room = null;

    while (attempt < 5) {
      try {
        console.log("Attempting to create room with slug:", roomSlug);
        room = await prismaClient.room.create({
          data: {
            slug: roomSlug,
            adminId: userId,
          },
        });
        break;
      } catch (e: any) {
        if (e.code === "P2002" && e.meta?.target?.includes("slug")) {
          attempt++;
          const randomSuffix = Math.random().toString(36).substring(2, 8);
          roomSlug = `${ParseData.data.name}-${randomSuffix}`;
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
      message: "Room created successfully",
    });
  } catch (e) {
    console.error("Room creation error:", e);
    res.status(400).json({
      message: "Room creation failed. Please try again.",
    });
  }
});

app.get("/chats/:roomId", async function (req, res) {
  try {
    const roomId = Number(req.params.roomId);
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

    res.json({
      messages,
    });
  } catch (e) {
    console.log(e);
    res.json({
      messages: [],
    });
  }
});

app.get("/room/:slug", async function (req, res) {
  const slug = req.params.slug;
  let room = await prismaClient.room.findFirst({
    where: {
      slug,
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
          adminId: guestUser.id,
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

  res.json({
    room,
  });
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

    const drawings = await prismaClient.drawing.findMany({
      where: {
        roomId: roomId,
      },
      orderBy: {
        createdAt: "asc",
      },
    });

    const elements = drawings.map(drawing => JSON.parse(drawing.elementData));

    res.json({
      drawings: elements,
    });
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

app.listen(PORT, function () {
  console.log(`Server is running on http://localhost:${PORT}`);
 });