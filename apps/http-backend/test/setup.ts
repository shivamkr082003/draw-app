import dotenv from "dotenv";

dotenv.config({ path: ".env.test" });
dotenv.config();

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = process.env.JWT_SECRET ?? "test-jwt-secret";
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  process.env.DATABASE_URL ??
  "postgresql://test:test@localhost:5432/drawapp_test";

delete process.env.REDIS_URL;
