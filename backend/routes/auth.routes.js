const express = require("express");
const { rateLimit } = require("express-rate-limit");
const bcrypt = require("bcrypt");
const { signToken, requireAuth, cookieOptions } = require("../auth");

function createAuthRouter(pool) {
  const router = express.Router();
  router.post("/login", rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 20,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    message: { message: "Too many login attempts. Try again later." },
  }), async (req, res) => {
    const { username, password } = req.body || {};
    if (typeof username !== "string" || typeof password !== "string" ||
        !username.trim() || !password || username.length > 100 || Buffer.byteLength(password) > 72) {
      return res.status(400).json({ message: "Provide a username and password (maximum 72 bytes)." });
    }
    const [rows] = await pool.execute(
      "SELECT id, username, password_hash, role_name, area FROM users WHERE username = ?",
      [username.trim()],
    );
    const user = rows[0];
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ message: "Invalid credentials." });
    }
    res.cookie("token", signToken(user), { ...cookieOptions(), maxAge: 2 * 60 * 60 * 1000 });
    res.json({ username: user.username, role_name: user.role_name, area: user.area });
  });
  router.post("/logout", (_req, res) => {
    res.clearCookie("token", cookieOptions());
    res.json({ message: "Logged out." });
  });
  router.get("/me", requireAuth, (req, res) => res.json({ user: req.user }));
  return router;
}
module.exports = { createAuthRouter };
