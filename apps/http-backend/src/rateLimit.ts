import rateLimit from "express-rate-limit";

/** IP-based limit for email/password authentication endpoints. */
export const authRateLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).json({
      message: "Too many authentication attempts. Please try again later.",
    });
  },
});
