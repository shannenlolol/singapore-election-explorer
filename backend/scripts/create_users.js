require("../config");
const bcrypt = require("bcrypt");
const { buildPool } = require("../db");

async function main() {
  const username = process.env.DEMO_USERNAME?.trim();
  const password = process.env.DEMO_PASSWORD;
  if (!username || username.length > 100 || !password || password.length < 12 || Buffer.byteLength(password) > 72) {
    throw new Error("Set DEMO_USERNAME (up to 100 characters) and DEMO_PASSWORD (12 characters minimum, 72 bytes maximum).");
  }
  const pool = buildPool();
  try {
    const hash = await bcrypt.hash(password, 12);
    await pool.execute(
      `INSERT INTO users (username, password_hash, role_name, area)
       VALUES (?, ?, 'civilian', NULL)
       ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash)`,
      [username, hash],
    );
    console.log("Demo account created or updated.");
  } finally {
    await pool.end();
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
