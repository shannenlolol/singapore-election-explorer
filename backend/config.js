const path = require("node:path");
require("dotenv").config({ path: path.join(__dirname, ".env"), quiet: true });

function loadConfig(env = process.env) {
  const required = ["DB_HOST", "DB_USER", "DB_PASSWORD", "DB_NAME"];
  for (const key of required) {
    if (!env[key]?.trim()) throw new Error(`Missing required environment variable: ${key}`);
  }
  const port = Number(env.PORT || 4000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid PORT.");
  return {
    port,
    dashUrl: env.DASH_URL || "http://127.0.0.1:8050",
    origins: (env.CORS_ORIGINS || "http://localhost:5173,http://127.0.0.1:5173").split(",").map(value => value.trim()),
  };
}
module.exports = { loadConfig };
