import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import pg from "pg";
import { PostgresAccountStore } from "./account-store.js";
import { buildPostgresPoolConfig } from "./db/connection.js";
import { runMigrations } from "./db/migrate.js";

const { Pool } = pg;
const connectionString = process.env.TEST_DATABASE_URL;

test("PostgreSQL migrations and account store work together", { skip: !connectionString }, async () => {
  const schema = `bpmsoft_test_${process.pid}_${Date.now()}`;
  assert.match(schema, /^[a-z0-9_]+$/);
  const baseConfig = buildPostgresPoolConfig(connectionString);
  const administrationPool = new Pool(baseConfig);
  let applicationPool;
  try {
    await administrationPool.query(`CREATE SCHEMA ${schema}`);
    applicationPool = new Pool({ ...baseConfig, options: `-c search_path=${schema}` });

    const firstRun = await runMigrations(applicationPool);
    assert.deepEqual(firstRun, [
      "001_accounts_and_progress.sql",
      "002_learning_events.sql",
      "003_progress_revisions.sql",
      "004_account_lifecycle.sql",
      "005_legal_policy_version.sql"
    ]);
    assert.deepEqual(await runMigrations(applicationPool), []);

    const store = new PostgresAccountStore(applicationPool);
    const account = await store.createAccount({
      id: randomUUID(),
      email: `postgres-${Date.now()}@example.com`,
      displayName: "PostgreSQL Test",
      passwordHash: "test-hash",
      mode: "progression"
    });
    const firstSave = await store.saveProgress(
      account.id,
      "chapter1",
      { missionComplete: true },
      1,
      0
    );
    assert.equal(firstSave.conflict, false);
    assert.equal(firstSave.progress.revision, 1);

    const staleSave = await store.saveProgress(
      account.id,
      "chapter1",
      { missionComplete: true },
      1,
      0
    );
    assert.equal(staleSave.conflict, true);
    assert.equal(staleSave.progress.revision, 1);

    const eventId = randomUUID();
    assert.equal(await store.recordLearningEvents(account.id, [{
      id: eventId,
      sessionId: randomUUID(),
      chapterId: "chapter1",
      missionKey: "interface",
      eventType: "answer_checked",
      outcome: "success",
      attempt: 1,
      durationMs: 1200,
      details: { source: "postgres-test" },
      occurredAt: new Date().toISOString()
    }]), 1);
    assert.equal(await store.recordLearningEvents(account.id, [{
      id: eventId,
      sessionId: randomUUID(),
      chapterId: "chapter1",
      missionKey: "interface",
      eventType: "answer_checked",
      outcome: "success",
      attempt: 1,
      durationMs: 1200,
      details: {},
      occurredAt: new Date().toISOString()
    }]), 0);
    assert.equal((await store.getAnalyticsEvents("2000-01-01T00:00:00.000Z")).length, 1);
  } finally {
    if (applicationPool) await applicationPool.end();
    await administrationPool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await administrationPool.end();
  }
});
