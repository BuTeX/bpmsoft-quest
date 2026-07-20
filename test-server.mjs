import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { createApplicationServer, sanitizeProgressState } from "./server.js";

let server;
let baseUrl;

before(async () => {
  delete process.env.DATABASE_URL;
  delete process.env.ADMIN_PASSWORD;
  server = createApplicationServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
});

test("health endpoint reports a running server", async () => {
  const response = await fetch(`${baseUrl}/health`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: "ok", database: "disabled" });
});

test("static application is served with security headers", async () => {
  const response = await fetch(`${baseUrl}/`);
  const html = await response.text();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type"), /text\/html/);
  assert.match(response.headers.get("content-security-policy"), /default-src 'self'/);
  assert.match(html, /BPMSoft Quest/);
});

test("chapter 2 scripts, styles and generated art are public", async () => {
  const files = [
    "chapter2.css",
    "chapter2-missions.js",
    "chapter2.js",
    "assets/chapter2-world-map.png",
    "assets/chapter2-mentor-hephaestus.png",
    "assets/chapter2-scout-bolt.png",
    "assets/mission-sorting-furnace.png",
    "assets/mission-portal-gate.png",
    "assets/mission-signal-yard.png",
    "assets/mission-cycle-foundry.png",
    "assets/mission-package-depot.png",
    "assets/mission-trace-furnace.png",
    "assets/mission-change-assembly.png",
    "assets/mission-oracle-forge.png",
    "assets/mission-contour-heart.png"
  ];

  const responses = await Promise.all(files.map((file) => fetch(`${baseUrl}/${file}`, { method: "HEAD" })));
  responses.forEach((response, index) => {
    assert.equal(response.status, 200, `${files[index]} is not served`);
  });
});

test("server-side source files are not exposed as static assets", async () => {
  const response = await fetch(`${baseUrl}/server.js`);
  assert.equal(response.status, 404);
});

test("progress API validates player identifiers before database access", async () => {
  const response = await fetch(`${baseUrl}/api/progress/not-a-player`);
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "Invalid player id" });
});

test("progress sanitizer keeps only known mission intros", () => {
  const state = sanitizeProgressState({
    energy: 2,
    introSeen: ["interface", "unknown", "data", "interface"]
  });
  assert.deepEqual(state.introSeen, ["interface", "data"]);
});

test("admin login stays disabled without a server-side secret", async () => {
  const response = await fetch(`${baseUrl}/api/admin/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: "admin" })
  });
  assert.equal(response.status, 503);
});
