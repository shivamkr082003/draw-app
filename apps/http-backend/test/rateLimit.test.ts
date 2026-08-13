import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { authRateLimiter } from "../src/rateLimit.js";

describe("auth rate limiting", () => {
  it("returns HTTP 429 after exceeding the configured limit", async () => {
    const app = express();
    app.use(express.json());
    app.post("/signin", authRateLimiter, (_req, res) => {
      res.json({ ok: true });
    });

    for (let attempt = 1; attempt <= 10; attempt++) {
      const res = await request(app)
        .post("/signin")
        .send({ email: "user@example.com", password: "secret" });

      expect(res.status).toBe(200);
    }

    const limited = await request(app)
      .post("/signin")
      .send({ email: "user@example.com", password: "secret" });

    expect(limited.status).toBe(429);
    expect(limited.body.message).toBe(
      "Too many authentication attempts. Please try again later."
    );
    expect(JSON.stringify(limited.body)).not.toMatch(/password|secret|hash/i);
  });
});
