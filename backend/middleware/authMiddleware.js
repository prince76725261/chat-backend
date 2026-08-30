const asyncHandler = require("express-async-handler");
const User = require("../models/userModel");
const ApiError = require("../utils/ApiError");
const { verifyAccessToken } = require("../utils/tokens");

const protect = asyncHandler(async (req, _res, next) => {
  const header = req.headers.authorization || "";
  if (!header.startsWith("Bearer ")) {
    throw ApiError.unauthorized("Not authorized, no token");
  }

  let payload;
  try {
    payload = verifyAccessToken(header.slice(7));
  } catch (err) {
    // Distinguish expiry from tampering so the client knows to hit /refresh
    // instead of bouncing the user to the login screen.
    throw new ApiError(
      401,
      err.name === "TokenExpiredError" ? "Access token expired" : "Invalid token"
    );
  }

  const user = await User.findById(payload.sub);
  if (!user) throw ApiError.unauthorized("User no longer exists");

  req.user = user;
  next();
});

module.exports = { protect };
