require("../config");
const { buildPool } = require("../db");
const { rebuildSummaries } = require("../services/rebuildSummaries");

async function main() {
  const pool = buildPool();
  let connection;
  try {
    connection = await pool.getConnection();
    console.log(`Rebuilt ${await rebuildSummaries(connection)} constituency summaries from existing local records.`);
  } finally {
    connection?.release();
    await pool.end();
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
