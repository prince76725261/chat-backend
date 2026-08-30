const express = require("express");
const { register, login, refresh, logout, me } = require("../controllers/authController");
const { protect } = require("../middleware/authMiddleware");
const { validate } = require("../middleware/validate");
const { authLimiter } = require("../middleware/rateLimit");
const { registerSchema, loginSchema } = require("../validators/schemas");

const router = express.Router();

router.post("/register", authLimiter, validate(registerSchema), register);
router.post("/login", authLimiter, validate(loginSchema), login);
router.post("/refresh", refresh);
router.post("/logout", logout);
router.get("/me", protect, me);

module.exports = router;
