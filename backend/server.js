const { loadConfig } = require("./config");
const { buildPool } = require("./db");
const { createApp } = require("./app");

const config = loadConfig();
const pool = buildPool();
const server = createApp({ pool, config }).listen(config.port, () => {
  console.log(`Singapore Election Explorer API listening on port ${config.port}`);
});
let stopping = false;
function shutdown() {
  if (stopping) return;
  stopping = true;
  const timeout = setTimeout(() => process.exit(1), 10000);
  timeout.unref();
  server.close(async () => {
    await pool.end();
    clearTimeout(timeout);
  });
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
