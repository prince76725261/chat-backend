const asyncHandler = require("express-async-handler");
const User = require("../models/userModel");
const ApiError = require("../utils/ApiError");
const {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  setRefreshCookie,
  clearRefreshCookie,
  REFRESH_COOKIE,
} = require("../utils/tokens");

const issue = (res, user) => {
  setRefreshCookie(res, signRefreshToken(user));
  return { user: user.toPublic(), accessToken: signAccessToken(user) };
};

// @desc   Register a new account
// @route  POST /api/auth/register
// @access Public
const register = asyncHandler(async (req, res) => {
  const { name, username, email, password, avatar } = req.body;

  const clash = await User.findOne({ $or: [{ email }, { username }] });
  if (clash) {
    throw ApiError.conflict(
      clash.email === email ? "Email already registered" : "Username is taken"
    );
  }

  const user = await User.create({ name, username, email, password, avatar });
  res.status(201).json({ success: true, ...issue(res, user) });
});

// @desc   Log in with email or username
// @route  POST /api/auth/login
// @access Public
const login = asyncHandler(async (req, res) => {
  const { identifier, password } = req.body;
  const key = identifier.toLowerCase();

  const user = await User.findOne({
    $or: [{ email: key }, { username: key }],
  }).select("+password");

  // Deliberately identical message for "no such user" and "wrong password":
  // a different one turns the login form into a user-enumeration oracle.
  if (!user || !(await user.matchPassword(password))) {
    throw ApiError.unauthorized("Invalid credentials");
  }

  res.json({ success: true, ...issue(res, user) });
});

// @desc   Exchange the refresh cookie for a fresh access token
// @route  POST /api/auth/refresh
// @access Public (cookie-authenticated)
const refresh = asyncHandler(async (req, res) => {
  const token = req.cookies?.[REFRESH_COOKIE];
  if (!token) throw ApiError.unauthorized("No refresh token");

  let payload;
  try {
    payload = verifyRefreshToken(token);
  } catch {
    clearRefreshCookie(res);
    throw ApiError.unauthorized("Refresh token invalid or expired");
  }

  const user = await User.findById(payload.sub);
  if (!user) throw ApiError.unauthorized("User no longer exists");

  // Rotate the refresh token on every use so a stolen one has a short life.
  res.json({ success: true, ...issue(res, user) });
});

// @desc   Log out (drops the refresh cookie)
// @route  POST /api/auth/logout
// @access Public
const logout = asyncHandler(async (_req, res) => {
  clearRefreshCookie(res);
  res.json({ success: true, message: "Logged out" });
});

// @desc   Current user profile
// @route  GET /api/auth/me
// @access Protected
const me = asyncHandler(async (req, res) => {
  res.json({ success: true, user: req.user.toPublic() });
});

module.exports = { register, login, refresh, logout, me };
