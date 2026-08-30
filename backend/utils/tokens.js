const jwt = require("jsonwebtoken");
const { jwt: cfg, isProd } = require("../config/env");

/**
 * Two-token scheme:
 *  - access  : short-lived, sent in the Authorization header, never stored in a cookie
 *  - refresh : long-lived, httpOnly cookie so JS (and therefore XSS) cannot read it
 */
const signAccessToken = (user) =>
  jwt.sign({ sub: String(user._id), username: user.username }, cfg.accessSecret, {
    expiresIn: cfg.accessTtl,
  });

const signRefreshToken = (user) =>
  jwt.sign({ sub: String(user._id) }, cfg.refreshSecret, {
    expiresIn: cfg.refreshTtl,
  });

const verifyAccessToken = (token) => jwt.verify(token, cfg.accessSecret);
const verifyRefreshToken = (token) => jwt.verify(token, cfg.refreshSecret);

const REFRESH_COOKIE = "refresh_token";

const setRefreshCookie = (res, token) =>
  res.cookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? "none" : "lax",
    path: "/api/auth",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });

const clearRefreshCookie = (res) =>
  res.clearCookie(REFRESH_COOKIE, { path: "/api/auth" });

module.exports = {
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  setRefreshCookie,
  clearRefreshCookie,
  REFRESH_COOKIE,
};
