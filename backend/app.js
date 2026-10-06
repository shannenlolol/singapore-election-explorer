const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const { createProxyMiddleware } = require("http-proxy-middleware");
const { requireAuth } = require("./auth");
const { createAuthRouter } = require("./routes/auth.routes");
const dashboardRoutes = require("./routes/dashboard.routes");
const boundariesRoutes = require("./routes/boundaries.routes");

function createApp({ pool, config }) {
  const app = express();
  app.disable("x-powered-by");
  app.locals.pool = pool;
  app.use(cors({ origin: config.origins, credentials: true }));
  app.use(cookieParser());
  app.use((_req, res, next) => {
    res.set("X-Content-Type-Options", "nosniff");
    res.set("Cache-Control", "no-store");
    next();
  });
  // Reject cross-site writes before auth handlers, including login and logout.
  app.use((req, res, next) => {
    const origin = req.get("origin");
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method) &&
        (req.get("sec-fetch-site") === "cross-site" || (origin && !config.origins.includes(origin)))) {
      return res.status(403).json({ message: "Origin is not allowed." });
    }
    next();
  });
  // Proxy before JSON parsing so Dash receives callback request bodies intact.
  app.use("/dash", requireAuth, createProxyMiddleware({
    target: config.dashUrl,
    changeOrigin: true,
    pathRewrite: path => `/dash${path}`,
    proxyTimeout: 30000,
    on: {
      error: (_err, _req, res) => {
        if (!res.headersSent) res.writeHead(502, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ message: "Dashboard service is unavailable." }));
      },
    },
  }));
  app.use(express.json({ limit: "16kb" }));
  app.use("/api/auth", createAuthRouter(pool));
  app.use("/api/dashboard", requireAuth, dashboardRoutes);
  app.use("/api/boundaries", requireAuth, boundariesRoutes);
  app.get("/api/health", async (_req, res) => {
    try {
      await pool.query("SELECT 1");
      res.json({ ok: true, db: true });
    } catch {
      res.status(503).json({ ok: false, db: false });
    }
  });
  app.use((_req, res) => res.status(404).json({ message: "Route not found." }));
  app.use((err, _req, res, _next) => {
    const status = err.status >= 400 && err.status < 500 ? err.status : 500;
    if (status === 500) console.error("Request failed:", err.message);
    res.status(status).json({ message: status === 500 ? "An unexpected server error occurred." : "Invalid request." });
  });
  return app;
}
module.exports = { createApp };
