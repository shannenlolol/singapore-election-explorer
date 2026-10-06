const jwt = require("jsonwebtoken");

const cookieOptions = () => ({
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  path: "/",
});

function signToken(user) {
  const { id, username, role_name, area } = user;
  return jwt.sign({ id, username, role_name, area }, process.env.JWT_SECRET, {
    algorithm: "HS256",
    expiresIn: "2h",
  });
}

function requireAuth(req, res, next) {
  const token = req.cookies?.token;
  if (!token) return res.status(401).json({ message: "Not authenticated." });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ["HS256"] });
    next();
  } catch {
    res.status(401).json({ message: "Session expired or invalid. Please sign in again." });
  }
}

module.exports = { signToken, requireAuth, cookieOptions };
