import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import {
  createApplicationServer,
  hashPassword,
  resetMemoryAccountStore,
  sanitizeChapter2ProgressState,
  sanitizeChapter3ProgressState,
  sanitizeChapter4ProgressState,
  sanitizeChapter5ProgressState,
  sanitizeProgressState,
  verifyPassword
} from "./server.js";

let server;
let baseUrl;

before(async () => {
  delete process.env.DATABASE_URL;
  delete process.env.ADMIN_PASSWORD;
  resetMemoryAccountStore();
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

test("admin analytics page and its assets are public", async () => {
  const files = ["admin.html", "admin.css", "admin.js"];
  const responses = await Promise.all(files.map((file) => fetch(`${baseUrl}/${file}`, { method: "HEAD" })));
  responses.forEach((response, index) => assert.equal(response.status, 200, `${files[index]} is not served`));
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

test("chapter 3 scripts, styles and generated art are public", async () => {
  const files = [
    "chapter3.css",
    "chapter3-missions.js",
    "chapter3.js",
    "assets/chapter3-world-map.png",
    "assets/chapter3-mentor-nova.png",
    "assets/chapter3-scout-pico.png",
    "assets/mission-contact-genome.png",
    "assets/mission-lead-spectrum.png",
    "assets/mission-channel-array.png",
    "assets/mission-bpmn-navigator.png",
    "assets/mission-sla-rings.png",
    "assets/mission-access-prism.png",
    "assets/mission-integration-dock.png",
    "assets/mission-ai-core.png",
    "assets/mission-orbit-360.png"
  ];
  const responses = await Promise.all(files.map((file) => fetch(`${baseUrl}/${file}`, { method: "HEAD" })));
  responses.forEach((response, index) => assert.equal(response.status, 200, `${files[index]} is not served`));
});

test("chapter 4 scripts, styles and generated art are public", async () => {
  const files = [
    "chapter4.css",
    "chapter4-missions.js",
    "chapter4.js",
    "assets/chapter4-world-map.png",
    "assets/chapter4-mentor-ruta.png",
    "assets/chapter4-scout-tally.png",
    "assets/mission-legacy-ledgers.png",
    "assets/mission-consent-pavilion.png",
    "assets/mission-campaign-house.png",
    "assets/mission-franchise-arcade.png",
    "assets/mission-order-courtyard.png",
    "assets/mission-stock-exchange.png",
    "assets/mission-returns-center.png",
    "assets/mission-insight-ledger.png",
    "assets/mission-transformation-room.png"
  ];
  const responses = await Promise.all(files.map((file) => fetch(`${baseUrl}/${file}`, { method: "HEAD" })));
  responses.forEach((response, index) => assert.equal(response.status, 200, `${files[index]} is not served`));
});

test("chapter 5 UX prototype and simulation modules are public", async () => {
  const files = [
    "chapter5-prototype.html",
    "chapter5-prototype.css",
    "chapter5-prototype-data.js",
    "chapter5-prototype.js",
    "chapter5-simulation.js"
  ];
  const responses = await Promise.all(files.map((file) => fetch(`${baseUrl}/${file}`, { method: "HEAD" })));
  responses.forEach((response, index) => assert.equal(response.status, 200, `${files[index]} is not served`));
});

test("chapter 5 production map, missions and selected world art are public", async () => {
  const files = [
    "chapter5.css",
    "chapter5-missions.js",
    "chapter5.js",
    "chapter5-simulation.js",
    "assets/concepts/chapter5-good-avia-infinity-megahub.png"
  ];
  const responses = await Promise.all(files.map((file) => fetch(`${baseUrl}/${file}`, { method: "HEAD" })));
  responses.forEach((response, index) => assert.equal(response.status, 200, `${files[index]} is not served`));
});

test("server-side source files are not exposed as static assets", async () => {
  for (const file of ["server.js", "account-store.js", "db/schema.sql", ".env"]) {
    const response = await fetch(`${baseUrl}/${file}`);
    assert.equal(response.status, 404, `${file} is publicly exposed`);
  }
});

test("account progress requires an authenticated session", async () => {
  const response = await fetch(`${baseUrl}/api/account/progress`);
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "Authentication required" });
});

test("progress sanitizer keeps only known mission intros", () => {
  const state = sanitizeProgressState({
    energy: 2,
    introSeen: ["interface", "unknown", "data", "interface"]
  });
  assert.deepEqual(state.introSeen, ["interface", "data"]);
});

test("chapter 2 sanitizer enforces canonical completion order", () => {
  const state = sanitizeChapter2ProgressState({
    introSeen: ["sorting", "unknown", "sorting"],
    sortingComplete: true,
    portalComplete: false,
    signalComplete: true,
    missionProgress: {
      sorting: { phase: 1, answers: { source: "import" }, locked: {}, optionOrders: {}, lastWrong: [] },
      unknown: { phase: 99 }
    }
  });
  assert.deepEqual(state.introSeen, ["sorting"]);
  assert.equal(state.sortingComplete, true);
  assert.equal(state.portalComplete, false);
  assert.equal(state.signalComplete, false);
  assert.equal(state.missionProgress.sorting.answers.source, "import");
  assert.equal(state.missionProgress.unknown, undefined);
});

test("chapter 3 sanitizer enforces canonical completion order and four energy cells", () => {
  const state = sanitizeChapter3ProgressState({
    energy: 99,
    introSeen: ["contact", "unknown", "contact"],
    contactComplete: true,
    leadComplete: false,
    channelComplete: true,
    missionProgress: {
      contact: { phase: 2, answers: { person: "contact" }, locked: {}, optionOrders: {}, lastWrong: [] },
      unknown: { phase: 99 }
    }
  });
  assert.deepEqual(state.introSeen, ["contact"]);
  assert.equal(state.energy, 4);
  assert.equal(state.contactComplete, true);
  assert.equal(state.leadComplete, false);
  assert.equal(state.channelComplete, false);
  assert.equal(state.missionProgress.contact.answers.person, "contact");
  assert.equal(state.missionProgress.unknown, undefined);
});

test("chapter 4 sanitizer keeps only valid audit evidence and chain cards", () => {
  const state = sanitizeChapter4ProgressState({
    energy: 99,
    introSeen: ["migration", "unknown", "migration"],
    migrationComplete: true,
    consentComplete: false,
    campaignComplete: true,
    missionProgress: {
      migration: {
        stage: 1,
        seen: { match: ["legacy", "legacy", 42] },
        placements: { "match:cause": "cause-collision", invalid: 42 },
        cardOrders: { match: ["cause-collision", 42] },
        lastWrong: ["cause", "unknown", "cause"]
      },
      unknown: { stage: 99 }
    }
  });
  assert.deepEqual(state.introSeen, ["migration"]);
  assert.equal(state.energy, 4);
  assert.equal(state.migrationComplete, true);
  assert.equal(state.consentComplete, false);
  assert.equal(state.campaignComplete, false);
  assert.deepEqual(state.missionProgress.migration.seen.match, ["legacy"]);
  assert.equal(state.missionProgress.migration.placements["match:cause"], "cause-collision");
  assert.deepEqual(state.missionProgress.migration.lastWrong, ["cause"]);
  assert.equal(state.missionProgress.unknown, undefined);
});

test("chapter 5 sanitizer keeps operational-twin progress canonical", () => {
  const state = sanitizeChapter5ProgressState({
    energy: 99,
    introSeen: ["schedule", "unknown"],
    scheduleComplete: true,
    connectionsComplete: false,
    baggageComplete: true,
    missionProgress: { schedule: { round: 9, completedRounds: ["37A", "bad"], lastWrong: ["checkpoint"] } }
  });
  assert.equal(state.energy, 4);
  assert.deepEqual(state.introSeen, ["schedule"]);
  assert.equal(state.scheduleComplete, true);
  assert.equal(state.connectionsComplete, false);
  assert.equal(state.baggageComplete, false);
  assert.equal(state.missionProgress.schedule.round, 1);
  assert.deepEqual(state.missionProgress.schedule.completedRounds, ["37A"]);
});

test("password hashes use salted scrypt and constant-time verification", async () => {
  const first = await hashPassword("correct horse battery staple");
  const second = await hashPassword("correct horse battery staple");
  assert.notEqual(first, second);
  assert.equal(await verifyPassword("correct horse battery staple", first), true);
  assert.equal(await verifyPassword("wrong password", first), false);
});

test("account registration, session and all chapter saves work together", async () => {
  const registration = await fetch(`${baseUrl}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: "Colleague@Example.com",
      displayName: "Коллега",
      password: "long-test-password",
      mode: "progression"
    })
  });
  assert.equal(registration.status, 201);
  const cookie = registration.headers.get("set-cookie").split(";")[0];
  assert.match(registration.headers.get("set-cookie"), /HttpOnly/);
  assert.match(registration.headers.get("set-cookie"), /SameSite=Lax/);
  const registered = await registration.json();
  assert.equal(registered.account.email, "colleague@example.com");
  assert.equal(registered.account.passwordHash, undefined);

  const session = await fetch(`${baseUrl}/api/auth/session`, { headers: { Cookie: cookie } });
  assert.equal(session.status, 200);
  assert.equal((await session.json()).account.displayName, "Коллега");

  const chapter1 = await fetch(`${baseUrl}/api/account/progress/chapter1`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ state: { missionComplete: true, dataMissionComplete: true, energy: 2 } })
  });
  assert.equal(chapter1.status, 200);
  assert.equal((await chapter1.json()).progress.score, 2);

  const chapter2 = await fetch(`${baseUrl}/api/account/progress/chapter2`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ state: { sortingComplete: true, energy: 3 } })
  });
  assert.equal(chapter2.status, 200);
  assert.equal((await chapter2.json()).progress.score, 1);

  const chapter3 = await fetch(`${baseUrl}/api/account/progress/chapter3`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ state: { contactComplete: true, energy: 4 } })
  });
  assert.equal(chapter3.status, 200);
  assert.equal((await chapter3.json()).progress.score, 1);

  const chapter4 = await fetch(`${baseUrl}/api/account/progress/chapter4`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ state: { migrationComplete: true, energy: 4 } })
  });
  assert.equal(chapter4.status, 200);
  assert.equal((await chapter4.json()).progress.score, 1);

  const chapter5 = await fetch(`${baseUrl}/api/account/progress/chapter5`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ state: { scheduleComplete: true, energy: 4 } })
  });
  assert.equal(chapter5.status, 200);
  assert.equal((await chapter5.json()).progress.score, 1);

  const progress = await fetch(`${baseUrl}/api/account/progress`, { headers: { Cookie: cookie } });
  assert.equal(progress.status, 200);
  const saved = (await progress.json()).progress;
  assert.equal(saved.chapter1.state.dataMissionComplete, true);
  assert.equal(saved.chapter2.state.sortingComplete, true);
  assert.equal(saved.chapter3.state.contactComplete, true);
  assert.equal(saved.chapter4.state.migrationComplete, true);
  assert.equal(saved.chapter5.state.scheduleComplete, true);

  const profile = await fetch(`${baseUrl}/api/auth/profile`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ displayName: "Инспектор", mode: "study" })
  });
  assert.equal(profile.status, 200);

  const blockedStudySave = await fetch(`${baseUrl}/api/account/progress/chapter1`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ state: {} })
  });
  assert.equal(blockedStudySave.status, 409);

  const logout = await fetch(`${baseUrl}/api/auth/logout`, { method: "POST", headers: { Cookie: cookie } });
  assert.equal(logout.status, 200);
  const expiredSession = await fetch(`${baseUrl}/api/auth/session`, { headers: { Cookie: cookie } });
  assert.equal(expiredSession.status, 401);

  const login = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: "colleague@example.com",
      password: "long-test-password",
      mode: "progression"
    })
  });
  assert.equal(login.status, 200);
  const loginCookie = login.headers.get("set-cookie").split(";")[0];
  const restoredProgress = await fetch(`${baseUrl}/api/account/progress`, { headers: { Cookie: loginCookie } });
  assert.equal(restoredProgress.status, 200);
  const restored = (await restoredProgress.json()).progress;
  assert.equal(restored.chapter1.score, 2);
  assert.equal(restored.chapter2.score, 1);
  assert.equal(restored.chapter3.score, 1);
  assert.equal(restored.chapter4.score, 1);
  assert.equal(restored.chapter5.score, 1);
});

test("admin login stays disabled without a server-side secret", async () => {
  const response = await fetch(`${baseUrl}/api/admin/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: "admin" })
  });
  assert.equal(response.status, 503);
});

test("admin session protects analytics and returns all 45 quest metrics", async () => {
  const unauthenticated = await fetch(`${baseUrl}/api/admin/analytics`);
  assert.equal(unauthenticated.status, 401);

  process.env.ADMIN_PASSWORD = "test-admin-secret";
  try {
    const login = await fetch(`${baseUrl}/api/admin/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: "test-admin-secret" })
    });
    assert.equal(login.status, 200);
    const cookie = login.headers.get("set-cookie").split(";", 1)[0];
    const analytics = await fetch(`${baseUrl}/api/admin/analytics?period=7&mode=all&chapter=all`, {
      headers: { Cookie: cookie }
    });
    assert.equal(analytics.status, 200);
    const payload = await analytics.json();
    assert.equal(payload.meta.widgets, 30);
    assert.equal(payload.meta.periodDays, 7);
    assert.equal(payload.quests.length, 45);
    assert.equal(payload.chapters.length, 5);

    const logout = await fetch(`${baseUrl}/api/admin/logout`, { method: "POST", headers: { Cookie: cookie } });
    assert.equal(logout.status, 200);
    const expired = await fetch(`${baseUrl}/api/admin/analytics`, { headers: { Cookie: cookie } });
    assert.equal(expired.status, 401);
  } finally {
    delete process.env.ADMIN_PASSWORD;
  }
});
