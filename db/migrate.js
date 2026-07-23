import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import pg from "pg";
import { buildPostgresPoolConfig } from "./connection.js";

const { Pool } = pg;
const DB_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_MIGRATIONS_DIR = path.join(DB_DIR, "migrations");
const MIGRATION_NAME_PATTERN = /^\d{3}_[a-z0-9_]+\.sql$/;

async function loadMigrations(migrationsDirectory) {
  const names = (await readdir(migrationsDirectory))
    .filter((name) => MIGRATION_NAME_PATTERN.test(name))
    .sort();
  if (!names.length) throw new Error("No database migrations were found");
  return Promise.all(names.map(async (name) => ({
    name,
    sql: await readFile(path.join(migrationsDirectory, name), "utf8")
  })));
}

export async function runMigrations(database, { migrationsDirectory = DEFAULT_MIGRATIONS_DIR } = {}) {
  const migrations = await loadMigrations(migrationsDirectory);
  const client = typeof database.connect === "function" ? await database.connect() : database;
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext('bpmsoft_quest_migrations'))");
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    const appliedResult = await client.query("SELECT name FROM schema_migrations");
    const applied = new Set(appliedResult.rows.map((row) => row.name));
    const completed = [];
    for (const migration of migrations) {
      if (applied.has(migration.name)) continue;
      await client.query(migration.sql);
      await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [migration.name]);
      completed.push(migration.name);
    }
    await client.query("COMMIT");
    return completed;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    if (typeof client.release === "function") client.release();
  }
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required to run migrations");
  const database = new Pool(buildPostgresPoolConfig(process.env.DATABASE_URL));
  try {
    const applied = await runMigrations(database);
    console.log(applied.length ? `Applied migrations: ${applied.join(", ")}` : "Database is already up to date");
  } finally {
    await database.end();
  }
}

const executedDirectly = process.argv[1]
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (executedDirectly) {
  main().catch((error) => {
    console.error("Database migration failed", error);
    process.exit(1);
  });
}
