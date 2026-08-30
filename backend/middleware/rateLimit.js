const rateLimit = require("express-rate-limit");

// Credential stuffing protection: brute-forcing a password is the one endpoint
// where a strict limit costs legitimate users almost nothing.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { success: false, message: "Too many attempts, try again later." },
});

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 300,
  standardHeaders: "draft-7",
  legacyHeaders: false,
});

module.exports = { authLimiter, apiLimiter };
