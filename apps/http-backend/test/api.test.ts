import { randomUUID } from "crypto";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prismaClient } from "@repo/db/index";
import { app } from "../src/index.js";
import { isBcryptHash } from "../src/password.js";

describe("HTTP API integration", () => {
  const runId = randomUUID().slice(0, 8);
  const email = `test-${runId}@example.com`;
  const password = `TestPass-${runId}`;
  const name = "Test User";

  let userId = "";
  let token = "";
  let roomId = 0;
  let roomSlug = "";
  let elementId = "";
  const createdUserIds: string[] = [];

  beforeAll(async () => {
    const signup = await request(app)
      .post("/signup")
      .send({ email, password, name });

    expect(signup.status).toBe(201);
    userId = signup.body.user.id;
    createdUserIds.push(userId);

    const signin = await request(app)
      .post("/signin")
      .send({ email, password });

    expect(signin.status).toBe(200);
    token = signin.body.token;
  });

  afterAll(async () => {
    if (roomId) {
      await prismaClient.drawing.deleteMany({ where: { roomId } });
      await prismaClient.chat.deleteMany({ where: { roomId } });
      await prismaClient.room.deleteMany({ where: { id: roomId } });
    }

    for (const id of createdUserIds) {
      await prismaClient.drawing.deleteMany({ where: { userId: id } });
      await prismaClient.chat.deleteMany({ where: { userId: id } });
      await prismaClient.room.deleteMany({ where: { adminId: id } });
      await prismaClient.user.deleteMany({ where: { id } });
    }

    await prismaClient.$disconnect();
  });

  it("GET /health returns OK", async () => {
    const res = await request(app).get("/health");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      status: "OK",
      message: "Server is running",
    });
  });

  it("POST /signup succeeds and does not return a password", async () => {
    const isolatedEmail = `signup-${runId}@example.com`;
    const res = await request(app)
      .post("/signup")
      .send({
        email: isolatedEmail,
        password: `Signup-${runId}`,
        name: "Signup Test",
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.user.email).toBe(isolatedEmail);
    expect(res.body.user).not.toHaveProperty("password");

    const user = await prismaClient.user.findUnique({
      where: { email: isolatedEmail },
    });

    expect(user).not.toBeNull();
    expect(user!.password).toBeTruthy();
    expect(isBcryptHash(user!.password!)).toBe(true);
    expect(user!.password).not.toBe(`Signup-${runId}`);

    createdUserIds.push(user!.id);
  });

  it("POST /signin returns JWT for correct credentials", async () => {
    const res = await request(app).post("/signin").send({ email, password });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeTypeOf("string");
    expect(res.body.userId).toBe(userId);
    expect(res.body.name).toBe(name);
    expect(res.body).not.toHaveProperty("password");
  });

  it("POST /signin rejects incorrect credentials", async () => {
    const res = await request(app)
      .post("/signin")
      .send({ email, password: "wrong-password" });

    expect(res.status).toBe(403);
    expect(res.body.message).toBe("Invalid email or password");
  });

  it("POST /room rejects unauthenticated requests", async () => {
    const res = await request(app)
      .post("/room")
      .send({ name: `room-${runId}` });

    expect(res.status).toBe(403);
    expect(res.body.message).toBe("Invalid token");
  });

  it("POST /room creates a room for authenticated users", async () => {
    roomSlug = `room-${runId}`;
    const res = await request(app)
      .post("/room")
      .set("Authorization", token)
      .send({ name: roomSlug });

    expect(res.status).toBe(200);
    expect(res.body.roomId).toBeTypeOf("number");
    expect(res.body.slug).toBe(roomSlug);
    expect(res.body.message).toBe("Room created successfully");

    roomId = res.body.roomId;
  });

  it("POST /drawings saves a drawing element", async () => {
    elementId = `element-${runId}`;
    const res = await request(app).post("/drawings").send({
      roomId,
      elementId,
      userId,
      elementData: { type: "rectangle", x: 1, y: 2, width: 10, height: 10 },
    });

    expect(res.status).toBe(200);
    expect(res.body.message).toBe("Drawing saved successfully");
    expect(res.body.id).toBeTypeOf("number");
  });

  it("GET /drawings/:roomId returns saved drawings", async () => {
    const res = await request(app).get(`/drawings/${roomId}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.drawings)).toBe(true);
    expect(res.body.drawings.length).toBeGreaterThan(0);
    expect(res.body.drawings[0].type).toBe("rectangle");
  });

  it("GET /room/:slug returns the room", async () => {
    const res = await request(app).get(`/room/${roomSlug}`);

    expect(res.status).toBe(200);
    expect(res.body.room.id).toBe(roomId);
    expect(res.body.room.slug).toBe(roomSlug);
  });

  it("GET /chats/:roomId returns chat messages", async () => {
    const res = await request(app).get(`/chats/${roomId}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.messages)).toBe(true);
  });

  it("DELETE /drawings/:elementId deletes a drawing element", async () => {
    const res = await request(app)
      .delete(`/drawings/${elementId}`)
      .send({ roomId });

    expect(res.status).toBe(200);
    expect(res.body.message).toBe("Drawing deleted successfully");

    const remaining = await prismaClient.drawing.findMany({
      where: { roomId, elementId },
    });
    expect(remaining).toHaveLength(0);
  });

  let createdWorkspaceId = "";
  let workspaceRoomSlug = "";

  it("POST /workspaces creates a new workspace for authenticated user", async () => {
    const res = await request(app)
      .post("/workspaces")
      .set("authorization", token)
      .send({
        name: `Workspace ${runId}`,
        description: "Test workspace description",
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.workspace.name).toBe(`Workspace ${runId}`);
    expect(res.body.workspace.id).toBeDefined();
    createdWorkspaceId = res.body.workspace.id;
  });

  it("GET /workspaces returns user workspaces", async () => {
    const res = await request(app)
      .get("/workspaces")
      .set("authorization", token);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.workspaces)).toBe(true);
    const found = res.body.workspaces.find((w: any) => w.id === createdWorkspaceId);
    expect(found).toBeDefined();
    expect(found.name).toBe(`Workspace ${runId}`);
  });

  it("POST /workspaces/:workspaceId/rooms creates a room inside the workspace", async () => {
    const res = await request(app)
      .post(`/workspaces/${createdWorkspaceId}/rooms`)
      .set("authorization", token)
      .send({
        name: `Sprint Board ${runId}`,
      });

    expect(res.status).toBe(201);
    expect(res.body.name).toBe(`Sprint Board ${runId}`);
    expect(res.body.roomId).toBeDefined();
    expect(res.body.slug).toBeDefined();
    workspaceRoomSlug = res.body.slug;
  });

  it("POST /rooms/join validates and returns room info", async () => {
    const res = await request(app)
      .post("/rooms/join")
      .set("authorization", token)
      .send({
        workspaceId: createdWorkspaceId,
        roomId: workspaceRoomSlug,
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.workspace.id).toBe(createdWorkspaceId);
    expect(res.body.room.slug).toBe(workspaceRoomSlug);
  });

  it("POST /drawings/save bulk saves canvas drawings", async () => {
    const res = await request(app)
      .post("/drawings/save")
      .set("authorization", token)
      .send({
        roomId,
        userId,
        elements: [
          { type: "circle", x: 10, y: 20, radius: 15, strokeColor: "#000" },
          { type: "rectangle", x: 30, y: 40, width: 50, height: 50, strokeColor: "#f00" },
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.count).toBe(2);
  });

  it("DELETE /workspaces/:workspaceId deletes workspace and cascades rooms", async () => {
    const res = await request(app)
      .delete(`/workspaces/${createdWorkspaceId}`)
      .set("authorization", token);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const check = await prismaClient.workspace.findUnique({
      where: { id: createdWorkspaceId },
    });
    expect(check).toBeNull();
  });
});
