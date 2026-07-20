import { createHash, timingSafeEqual } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import pg from "pg";

const { Pool } = pg;
const ROOT_DIR = path.dirname(fileURLToPath(import.meta.url));
const SCHEMA_PATH = path.join(ROOT_DIR, "db", "schema.sql");
const BODY_LIMIT_BYTES = 32 * 1024;
const ADMIN_WINDOW_MS = 10 * 60 * 1000;
const ADMIN_ATTEMPT_LIMIT = 5;
const publicRootFiles = new Set([
  "index.html",
  "app.js",
  "styles.css",
  "chapter2.css",
  "chapter2-missions.js",
  "chapter2.js"
]);
const missionKeys = ["interface", "data", "access", "process", "case", "integration", "insight", "classification", "solution"];

const completionFlags = [
  "missionComplete",
  "dataMissionComplete",
  "accessMissionComplete",
  "processMissionComplete",
  "caseMissionComplete",
  "integrationMissionComplete",
  "insightMissionComplete",
  "classificationMissionComplete",
  "solutionMissionComplete"
];

const mimeTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".md", "text/markdown; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".ttf", "font/ttf"]
]);

const adminAttempts = new Map();
let pool = null;

function json(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  response.end(JSON.stringify(payload));
}

function applySecurityHeaders(response) {
  response.setHeader("Content-Security-Policy", "default-src 'self'; img-src 'self' data:; font-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'");
  response.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-Frame-Options", "DENY");
  response.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
}

function getClientAddress(request) {
  const forwarded = request.headers["x-forwarded-for"];
  return (Array.isArray(forwarded) ? forwarded[0] : forwarded?.split(",")[0])?.trim()
    || request.socket.remoteAddress
    || "unknown";
}

function isValidPlayerId(playerId) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(playerId);
}

export function sanitizeProgressState(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;

  const state = {
    energy: Number.isInteger(input.energy) ? Math.max(0, Math.min(input.energy, 3)) : 3,
    introSeen: Array.isArray(input.introSeen)
      ? [...new Set(input.introSeen.filter((key) => missionKeys.includes(key)))]
      : []
  };
  let previousComplete = true;

  completionFlags.forEach((flag) => {
    const complete = previousComplete && input[flag] === true;
    state[flag] = complete;
    previousComplete = complete;
  });

  return state;
}

function getProgressScore(state) {
  return completionFlags.reduce((score, flag) => score + Number(state[flag] === true), 0);
}

function getDatabasePool() {
  if (!process.env.DATABASE_URL) return null;
  if (pool) return pool;

  const ssl = process.env.PGSSLMODE === "disable"
    ? false
    : { rejectUnauthorized: false };

  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl,
    max: 8,
    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: 30_000
  });

  pool.on("error", (error) => {
    console.error("Unexpected PostgreSQL pool error", error);
  });

  return pool;
}

export async function initializeDatabase() {
  const database = getDatabasePool();
  if (!database) {
    if (process.env.REQUIRE_DATABASE === "true") {
      throw new Error("DATABASE_URL is required");
    }
    return false;
  }
  const schema = await readFile(SCHEMA_PATH, "utf8");
  await database.query(schema);
  return true;
}

export async function closeDatabase() {
  if (!pool) return;
  const currentPool = pool;
  pool = null;
  await currentPool.end();
}

async function readJsonBody(request) {
  return await new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;

    request.on("data", (chunk) => {
      size += chunk.length;
      if (size > BODY_LIMIT_BYTES) {
        const error = new Error("Request body is too large");
        error.statusCode = 413;
        reject(error);
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });

    request.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf8");
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        const error = new Error("Invalid JSON");
        error.statusCode = 400;
        reject(error);
      }
    });

    request.on("error", reject);
  });
}

function securePasswordMatches(candidate, expected) {
  const candidateHash = createHash("sha256").update(candidate).digest();
  const expectedHash = createHash("sha256").update(expected).digest();
  return timingSafeEqual(candidateHash, expectedHash);
}

async function handleHealth(response) {
  const database = getDatabasePool();
  if (!database) {
    json(response, 200, { status: "ok", database: "disabled" });
    return;
  }

  try {
    await database.query("SELECT 1");
    json(response, 200, { status: "ok", database: "connected" });
  } catch {
    json(response, 503, { status: "error", database: "unavailable" });
  }
}

async function handleAdminLogin(request, response) {
  const expectedPassword = process.env.ADMIN_PASSWORD;
  if (!expectedPassword) {
    json(response, 503, { error: "Admin login is not configured" });
    return;
  }

  const clientAddress = getClientAddress(request);
  const now = Date.now();
  const attempt = adminAttempts.get(clientAddress);
  const activeAttempt = attempt && now - attempt.startedAt < ADMIN_WINDOW_MS
    ? attempt
    : { count: 0, startedAt: now };

  if (activeAttempt.count >= ADMIN_ATTEMPT_LIMIT) {
    json(response, 429, { error: "Too many login attempts" });
    return;
  }

  const body = await readJsonBody(request);
  const candidate = typeof body.password === "string" ? body.password.slice(0, 256) : "";

  if (!securePasswordMatches(candidate, expectedPassword)) {
    activeAttempt.count += 1;
    adminAttempts.set(clientAddress, activeAttempt);
    json(response, 401, { error: "Invalid password" });
    return;
  }

  adminAttempts.delete(clientAddress);
  json(response, 200, { ok: true });
}

async function handleProgress(request, response, playerId) {
  if (!isValidPlayerId(playerId)) {
    json(response, 400, { error: "Invalid player id" });
    return;
  }

  const database = getDatabasePool();
  if (!database) {
    json(response, 503, { error: "Database is not configured" });
    return;
  }

  if (request.method === "GET") {
    const result = await database.query(
      "SELECT state, progress_score, updated_at FROM player_progress WHERE player_id = $1",
      [playerId]
    );

    if (result.rowCount === 0) {
      json(response, 404, { error: "Progress not found" });
      return;
    }

    const row = result.rows[0];
    json(response, 200, {
      state: row.state,
      progressScore: row.progress_score,
      updatedAt: row.updated_at
    });
    return;
  }

  if (request.method === "PUT") {
    const body = await readJsonBody(request);
    const state = sanitizeProgressState(body.state);
    if (!state) {
      json(response, 400, { error: "Invalid progress state" });
      return;
    }

    const result = await database.query(
      `INSERT INTO player_progress (player_id, state, progress_score)
       VALUES ($1, $2::jsonb, $3)
       ON CONFLICT (player_id) DO UPDATE
       SET state = EXCLUDED.state,
           progress_score = EXCLUDED.progress_score,
           updated_at = NOW()
       RETURNING progress_score, updated_at`,
      [playerId, JSON.stringify(state), getProgressScore(state)]
    );

    json(response, 200, {
      ok: true,
      progressScore: result.rows[0].progress_score,
      updatedAt: result.rows[0].updated_at
    });
    return;
  }

  response.setHeader("Allow", "GET, PUT");
  json(response, 405, { error: "Method not allowed" });
}

async function serveStatic(request, response, pathname) {
  let decodedPath;
  try {
    decodedPath = decodeURIComponent(pathname);
  } catch {
    json(response, 400, { error: "Invalid path" });
    return;
  }

  const relativePath = decodedPath === "/" ? "index.html" : decodedPath.replace(/^\/+/, "");
  if (relativePath.split("/").some((segment) => segment.startsWith("."))) {
    json(response, 404, { error: "Not found" });
    return;
  }

  if (!publicRootFiles.has(relativePath) && !relativePath.startsWith("assets/")) {
    json(response, 404, { error: "Not found" });
    return;
  }

  const filePath = path.resolve(ROOT_DIR, relativePath);
  if (!filePath.startsWith(`${ROOT_DIR}${path.sep}`)) {
    json(response, 404, { error: "Not found" });
    return;
  }

  try {
    const fileStats = await stat(filePath);
    if (!fileStats.isFile()) throw new Error("Not a file");

    const extension = path.extname(filePath).toLowerCase();
    response.statusCode = 200;
    response.setHeader("Content-Type", mimeTypes.get(extension) || "application/octet-stream");
    response.setHeader("Content-Length", fileStats.size);
    response.setHeader(
      "Cache-Control",
      relativePath === "index.html" ? "no-cache" : "public, max-age=3600"
    );

    if (request.method === "HEAD") {
      response.end();
      return;
    }

    createReadStream(filePath).pipe(response);
  } catch {
    json(response, 404, { error: "Not found" });
  }
}

export function createApplicationServer() {
  return createServer(async (request, response) => {
    applySecurityHeaders(response);

    try {
      const url = new URL(request.url || "/", "http://localhost");

      if (url.pathname === "/health" && request.method === "GET") {
        await handleHealth(response);
        return;
      }

      if (url.pathname === "/api/admin/login" && request.method === "POST") {
        await handleAdminLogin(request, response);
        return;
      }

      const progressMatch = url.pathname.match(/^\/api\/progress\/([^/]+)$/);
      if (progressMatch) {
        await handleProgress(request, response, progressMatch[1]);
        return;
      }

      if (url.pathname.startsWith("/api/")) {
        json(response, 404, { error: "Not found" });
        return;
      }

      if (request.method !== "GET" && request.method !== "HEAD") {
        response.setHeader("Allow", "GET, HEAD");
        json(response, 405, { error: "Method not allowed" });
        return;
      }

      await serveStatic(request, response, url.pathname);
    } catch (error) {
      console.error("Request failed", error);
      if (!response.headersSent) {
        json(response, error.statusCode || 500, { error: error.statusCode ? error.message : "Internal server error" });
      } else {
        response.end();
      }
    }
  });
}

async function start() {
  await initializeDatabase();
  const server = createApplicationServer();
  const port = Number(process.env.PORT) || 4173;

  server.listen(port, "0.0.0.0", () => {
    console.log(`BPMSoft Quest is listening on port ${port}`);
  });

  const shutdown = async () => {
    server.close(async () => {
      await closeDatabase();
      process.exit(0);
    });
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

const executedDirectly = process.argv[1]
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (executedDirectly) {
  start().catch((error) => {
    console.error("Failed to start BPMSoft Quest", error);
    process.exit(1);
  });
}
