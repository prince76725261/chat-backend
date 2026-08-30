const path = require("path");
const http = require("http");
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const cookieParser = require("cookie-parser");

const { port, clientOrigins, isProd } = require("./config/env");
const connectDB = require("./config/db");
const { initSocket } = require("./socket");
const { notFound, errorHandler } = require("./middleware/errorMiddleware");
const { apiLimiter } = require("./middleware/rateLimit");

const app = express();

// --- security & parsing -----------------------------------------------------
app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
// credentials:true is required for the httpOnly refresh cookie to be sent, and
// that in turn forbids a wildcard origin — so the client origin is explicit.
app.use(
  cors({
    // Allow listed origins, plus any Vercel preview deploy of this project.
    origin(origin, cb) {
      if (!origin) return cb(null, true); // curl / same-origin / server-to-server
      const ok =
        clientOrigins.includes(origin) ||
        /^https:\/\/[a-z0-9-]+\.vercel\.app$/.test(origin);
      cb(ok ? null : new Error(`Origin not allowed by CORS: ${origin}`), ok);
    },
    credentials: true,
  })
);
// Behind a proxy (Render/Railway/Fly) this is required for secure cookies and
// for express-rate-limit to see the real client IP instead of the proxy's.
app.set("trust proxy", 1);
app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());
if (!isProd) app.use(morgan("dev"));

// --- routes -----------------------------------------------------------------
app.get("/api/health", (_req, res) =>
  res.json({ success: true, status: "ok", uptime: process.uptime() })
);

app.use("/api", apiLimiter);
app.use("/api/auth", require("./routes/authRoutes"));
app.use("/api/users", require("./routes/userRoutes"));
app.use("/api/friends", require("./routes/friendRoutes"));
app.use("/api/chats", require("./routes/chatRoutes"));
app.use("/api/messages", require("./routes/messageRoutes"));

// --- static frontend in production -----------------------------------------
if (isProd) {
  const dist = path.join(__dirname, "..", "frontend", "dist");
  app.use(express.static(dist));
  // SPA fallback, but never swallow unmatched /api/* routes.
  app.get(/^\/(?!api).*/, (_req, res) => res.sendFile(path.join(dist, "index.html")));
}

// Error handlers must be registered last, after every route.
app.use(notFound);
app.use(errorHandler);

// --- boot -------------------------------------------------------------------
const server = http.createServer(app);

(async () => {
  try {
    // Connect before listening so the first request never hits a cold DB.
    await connectDB();
    initSocket(server);
    server.listen(port, () =>
      console.log(`[server] listening on http://localhost:${port} (${process.env.NODE_ENV || "development"})`)
    );
  } catch (err) {
    console.error("[server] failed to start:", err.message);
    process.exit(1);
  }
})();

// A rejected promise that nobody handled leaves the process in an unknown
// state; close the socket cleanly rather than limping on.
process.on("unhandledRejection", (reason) => {
  console.error("[fatal] unhandled rejection:", reason);
  server.close(() => process.exit(1));
});

const shutdown = (signal) => () => {
  console.log(`[server] ${signal} received, shutting down`);
  server.close(() => process.exit(0));
};
process.on("SIGTERM", shutdown("SIGTERM"));
process.on("SIGINT", shutdown("SIGINT"));

module.exports = app;
