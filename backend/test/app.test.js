const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const { createApp } = require("../app");
const { loadConfig } = require("../config");
let server, base, dbFails = false, statusRows = [];
const pool = {
  query: async sql => {
    if (dbFails) throw new Error("private-database-details");
    if (sql.includes("data_sync_status")) return [statusRows];
    return [[]];
  },
  execute: async () => [[]],
};
before(async () => {
  server = createApp({ pool, config: { origins: ["http://localhost:5173"], dashUrl: "http://127.0.0.1:1" } }).listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => new Promise(resolve => server.close(resolve)));

test("configuration requires database settings but no account secrets", () => {
  assert.throws(() => loadConfig({}), /DB_HOST/);
  const env = { DB_HOST: "localhost", DB_USER: "u", DB_PASSWORD: "p", DB_NAME: "d" };
  assert.equal(loadConfig(env).port, 4000);
  assert.throws(() => loadConfig({ ...env, PORT: "0" }), /PORT/);
});
test("election APIs are accessible without a session", async () => {
  for (const path of ["/api/dashboard/options", "/api/dashboard/search", "/api/dashboard/details?year=2025&constituency=Test", "/api/boundaries/summary?year=2025"]) {
    const response = await fetch(base + path);
    assert.equal(response.status, 200, path);
    assert.equal(response.headers.get("set-cookie"), null);
  }
  assert.equal((await fetch(base + "/api/boundaries?year=2025")).status, 404); // No fixture boundaries.
});
test("account and refresh endpoints are not exposed", async () => {
  for (const path of ["/api/auth/login", "/api/auth/logout", "/api/auth/me", "/api/sync", "/api/refresh"]) {
    assert.equal((await fetch(base + path, { method: "POST" })).status, 404);
  }
});
test("data freshness distinguishes unknown, successful, running and failed imports", async () => {
  let data = await (await fetch(base + "/api/data-status")).json();
  assert.equal(data.status, "never_imported");
  assert.equal(data.lastUpdated, null);
  assert.equal(data.source.url, "https://data.gov.sg/");
  for (const status of ["succeeded", "running", "failed"]) {
    statusRows = [{ status, last_updated: "2026-10-07T01:02:03Z" }];
    data = await (await fetch(base + "/api/data-status")).json();
    assert.equal(data.status, status);
    assert.equal(data.lastUpdated, "2026-10-07T01:02:03Z");
  }
  statusRows = [];
});
test("cross-site callbacks are rejected", async () => {
  const response = await fetch(base + "/dash/_dash-update-component", { method: "POST", headers: { Origin: "https://untrusted.example" } });
  assert.equal(response.status, 403);
});
test("invalid boundary years fail before querying the database", async () => {
  for (const year of ["", "nope", "2025.5", "0"]) {
    assert.equal((await fetch(base + `/api/boundaries?year=${year}`)).status, 400);
  }
});
test("database failures do not expose connection details", async () => {
  assert.equal((await fetch(base + "/api/health")).status, 200);
  dbFails = true;
  try {
    const response = await fetch(base + "/api/health");
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { ok: false, db: false });
    const status = await fetch(base + "/api/data-status");
    assert.equal(status.status, 500);
    assert.deepEqual(await status.json(), { message: "An unexpected server error occurred." });
  } finally { dbFails = false; }
});
test("public Dash callbacks preserve paths and JSON bodies without cookies", async () => {
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
  const proxy = createApp({ pool, config: { origins: ["http://localhost:5173"], dashUrl: `http://127.0.0.1:${upstream.address().port}` } }).listen(0, "127.0.0.1");
  await new Promise(resolve => proxy.once("listening", resolve));
  try {
    const body = JSON.stringify({ output: "chart.figure", inputs: [] });
    const response = await fetch(`http://127.0.0.1:${proxy.address().port}/dash/_dash-update-component`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body,
    });
    assert.equal(response.status, 200);
    assert.deepEqual(received, { path: "/dash/_dash-update-component", body, cookie: undefined });
  } finally {
    await new Promise(resolve => proxy.close(resolve));
    await new Promise(resolve => upstream.close(resolve));
  }
});
