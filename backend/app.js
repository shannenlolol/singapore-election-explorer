const express = require("express");
const cors = require("cors");
const dashboardRoutes = require("./routes/dashboard.routes");
const boundariesRoutes = require("./routes/boundaries.routes");

function createApp({ pool, config }) {
  const app = express();
  app.disable("x-powered-by");
  app.locals.pool = pool;
  app.use(cors({ origin: config.origins, credentials: false }));
  app.use((_req, res, next) => {
    res.set("X-Content-Type-Options", "nosniff");
    res.set("Cache-Control", "no-store");
    next();
  });
  app.use("/api/dashboard", dashboardRoutes);
  app.use("/api/boundaries", boundariesRoutes);
  app.get("/api/data-status", async (_req, res) => {
    const [rows] = await pool.query(
      "SELECT status, DATE_FORMAT(last_successful_at, '%Y-%m-%dT%H:%i:%sZ') AS last_updated FROM data_sync_status WHERE id = 1",
    );
    res.json({
      status: rows[0]?.status || "never_imported",
      lastUpdated: rows[0]?.last_updated || null,
      source: { name: "data.gov.sg", url: "https://data.gov.sg/" },
    });
  });
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
