const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const bcrypt = require("bcrypt");
const { createApp } = require("../app");
const { signToken } = require("../auth");
const { loadConfig } = require("../config");

process.env.JWT_SECRET = "test-only-secret-with-at-least-32-characters";
const user = { id: 1, username: "demo", role_name: "civilian", area: null };
let server, base, dbFails = false;
const pool = {
  query: async () => { if (dbFails) throw new Error("private-database-details"); return [[{ ok: 1 }]]; },
  execute: async (_sql, params) => params[0] === "demo" ? [[{ ...user, password_hash: await bcrypt.hash("correct-password", 4) }]] : [[]],
};
before(async () => {
  const app = createApp({ pool, config: { origins: ["http://localhost:5173"], dashUrl: "http://127.0.0.1:1" } });
  server = app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => new Promise(resolve => server.close(resolve)));
const login = body => fetch(`${base}/api/auth/login`, {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
});

test("configuration rejects missing secrets and invalid ports", () => {
  assert.throws(() => loadConfig({}), /JWT_SECRET/);
  const env = { JWT_SECRET: "x".repeat(32), DB_HOST: "localhost", DB_USER: "u", DB_PASSWORD: "p", DB_NAME: "d" };
  assert.equal(loadConfig(env).port, 4000);
  assert.throws(() => loadConfig({ ...env, PORT: "0" }), /PORT/);
});
test("protected APIs and Dash reject missing or forged sessions", async () => {
  for (const path of ["/api/auth/me", "/api/dashboard/options", "/api/boundaries?year=2025", "/dash/", "/dash/_dash-update-component"]) {
    assert.equal((await fetch(base + path)).status, 401);
    assert.equal((await fetch(base + path, { headers: { Cookie: "token=forged" } })).status, 401);
  }
});
test("login validates input and rejects invalid credentials", async () => {
  assert.equal((await login({ username: {}, password: "password" })).status, 400);
  assert.equal((await login({ username: "demo", password: "x".repeat(73) })).status, 400);
  assert.equal((await login({ username: "demo", password: "wrong-password" })).status, 401);
  assert.equal((await login({ username: "unknown", password: "wrong-password" })).status, 401);
});
test("login sets a protected cookie that authenticates subsequent requests", async () => {
  const response = await login({ username: "demo", password: "correct-password" });
  assert.equal(response.status, 200);
  const cookie = response.headers.get("set-cookie");
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Lax/);
  const me = await fetch(base + "/api/auth/me", { headers: { Cookie: cookie.split(";")[0] } });
  assert.equal((await me.json()).user.username, "demo");
  const logout = await fetch(base + "/api/auth/logout", { method: "POST" });
  assert.match(logout.headers.get("set-cookie"), /Expires=Thu, 01 Jan 1970/);
});
test("cross-site writes are rejected and allowed origins receive CORS headers", async () => {
  const response = await fetch(base + "/api/auth/logout", { method: "POST", headers: { Origin: "https://untrusted.example" } });
  assert.equal(response.status, 403);
  const allowed = await fetch(base + "/api/auth/me", { headers: { Origin: "http://localhost:5173" } });
  assert.equal(allowed.headers.get("access-control-allow-origin"), "http://localhost:5173");
});
test("invalid boundary years fail before querying the database", async () => {
  for (const year of ["", "nope", "2025.5", "0"]) {
    const response = await fetch(base + `/api/boundaries?year=${year}`, { headers: { Cookie: `token=${signToken(user)}` } });
    assert.equal(response.status, 400);
  }
});
test("health reports an unavailable database without exposing details", async () => {
  assert.equal((await fetch(base + "/api/health")).status, 200);
  dbFails = true;
  try {
    const response = await fetch(base + "/api/health");
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { ok: false, db: false });
  } finally { dbFails = false; }
});
test("unknown routes return JSON and login attempts are rate limited", async () => {
  assert.equal((await fetch(base + "/api/proxy?url=https://example.com")).status, 404);
  let response;
  for (let i = 0; i < 21; i++) response = await login({ username: "missing", password: "wrong-password" });
  assert.equal(response.status, 429);
});

test("authenticated Dash callbacks preserve their path, body, and session cookie", async () => {
  const http = require("node:http");
  let received;
  const upstream = http.createServer(async (req, res) => {
    let body = "";
    for await (const chunk of req) body += chunk;
    received = { path: req.url, body, cookie: req.headers.cookie };
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ ok: true }));
  });
  upstream.listen(0, "127.0.0.1");
  await new Promise(resolve => upstream.once("listening", resolve));
  const proxy = createApp({ pool, config: {
    origins: ["http://localhost:5173"], dashUrl: `http://127.0.0.1:${upstream.address().port}`,
  } }).listen(0, "127.0.0.1");
  await new Promise(resolve => proxy.once("listening", resolve));
  try {
    const cookie = `token=${signToken(user)}`;
    const body = JSON.stringify({ output: "chart.figure", inputs: [] });
    const response = await fetch(`http://127.0.0.1:${proxy.address().port}/dash/_dash-update-component`, {
      method: "POST", headers: { Cookie: cookie, "Content-Type": "application/json" }, body,
    });
    assert.equal(response.status, 200);
    assert.deepEqual(received, { path: "/dash/_dash-update-component", body, cookie });
  } finally {
    await new Promise(resolve => proxy.close(resolve));
    await new Promise(resolve => upstream.close(resolve));
  }
});
