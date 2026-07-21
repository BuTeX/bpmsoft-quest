import { createHash, randomBytes, randomUUID, scrypt, timingSafeEqual } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";
import pg from "pg";
import { MemoryAccountStore, PostgresAccountStore } from "./account-store.js";

const { Pool } = pg;
const ROOT_DIR = path.dirname(fileURLToPath(import.meta.url));
const SCHEMA_PATH = path.join(ROOT_DIR, "db", "schema.sql");
const BODY_LIMIT_BYTES = 64 * 1024;
const ADMIN_WINDOW_MS = 10 * 60 * 1000;
const ADMIN_ATTEMPT_LIMIT = 5;
const AUTH_WINDOW_MS = 15 * 60 * 1000;
const AUTH_ATTEMPT_LIMIT = 10;
const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;
const SESSION_COOKIE = "bpmsoft_session";
const SECURE_SESSION_COOKIE = "__Host-bpmsoft_session";
const PASSWORD_MIN_LENGTH = 10;
const PASSWORD_MAX_LENGTH = 128;
const SCRYPT_PARAMS = { N: 2 ** 15, r: 8, p: 3, maxmem: 64 * 1024 * 1024 };
const scryptAsync = promisify(scrypt);
const publicRootFiles = new Set([
  "index.html",
  "app.js",
  "styles.css",
  "chapter2.css",
  "chapter2-missions.js",
  "chapter2.js",
  "chapter3.css",
  "chapter3-missions.js",
  "chapter3.js"
]);
const missionKeys = ["interface", "data", "access", "process", "case", "integration", "insight", "classification", "solution"];
const chapter2MissionKeys = ["sorting", "portal", "signal", "cycle", "package", "trace", "change", "oracle", "contour"];
const chapter3MissionKeys = ["contact", "lead", "channel", "bpmn", "sla", "access", "integration", "ai", "orbit"];

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
const chapter2CompletionFlags = chapter2MissionKeys.map((key) => `${key}Complete`);
const chapter3CompletionFlags = chapter3MissionKeys.map((key) => `${key}Complete`);

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
const authAttempts = new Map();
let pool = null;
let accountStore = null;

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

function sanitizeStringRecord(input, { booleanValues = false, arrayValues = false } = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  return Object.fromEntries(
    Object.entries(input)
      .filter(([key, value]) => {
        if (typeof key !== "string" || key.length > 100) return false;
        if (booleanValues) return value === true || value === false;
        if (arrayValues) return Array.isArray(value) && value.length <= 30 && value.every((item) => typeof item === "string" && item.length <= 100);
        return typeof value === "string" && value.length <= 100;
      })
      .slice(0, 100)
  );
}

export function sanitizeChapter2ProgressState(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const state = {
    chapterId: "copper-frontier",
    energy: Number.isInteger(input.energy) ? Math.max(0, Math.min(input.energy, 3)) : 3,
    introSeen: Array.isArray(input.introSeen)
      ? [...new Set(input.introSeen.filter((key) => chapter2MissionKeys.includes(key)))]
      : [],
    prologueSeen: input.prologueSeen === true,
    attempts: Math.max(1, Math.min(Number(input.attempts) || 1, 100)),
    activePhase: Math.max(0, Math.min(Number(input.activePhase) || 0, 20)),
    answers: sanitizeStringRecord(input.answers),
    locked: sanitizeStringRecord(input.locked, { booleanValues: true }),
    missionProgress: {},
    achievementGranted: input.achievementGranted === true
  };
  let previousComplete = true;

  chapter2CompletionFlags.forEach((flag) => {
    const complete = previousComplete && input[flag] === true;
    state[flag] = complete;
    previousComplete = complete;
  });

  const missionProgress = input.missionProgress && typeof input.missionProgress === "object" && !Array.isArray(input.missionProgress)
    ? input.missionProgress
    : {};
  chapter2MissionKeys.forEach((key) => {
    const progress = missionProgress[key];
    if (!progress || typeof progress !== "object" || Array.isArray(progress)) return;
    state.missionProgress[key] = {
      phase: Math.max(0, Math.min(Number(progress.phase) || 0, 20)),
      answers: sanitizeStringRecord(progress.answers),
      locked: sanitizeStringRecord(progress.locked, { booleanValues: true }),
      optionOrders: sanitizeStringRecord(progress.optionOrders, { arrayValues: true }),
      lastWrong: Array.isArray(progress.lastWrong)
        ? progress.lastWrong.filter((value) => typeof value === "string" && value.length <= 100).slice(0, 30)
        : []
    };
  });

  return state;
}

function getChapter2ProgressScore(state) {
  return chapter2CompletionFlags.reduce((score, flag) => score + Number(state[flag] === true), 0);
}

export function sanitizeChapter3ProgressState(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const state = {
    chapterId: "orbit-360",
    energy: Number.isInteger(input.energy) ? Math.max(0, Math.min(input.energy, 4)) : 4,
    introSeen: Array.isArray(input.introSeen)
      ? [...new Set(input.introSeen.filter((key) => chapter3MissionKeys.includes(key)))]
      : [],
    prologueSeen: input.prologueSeen === true,
    attempts: Math.max(1, Math.min(Number(input.attempts) || 1, 100)),
    activePhase: Math.max(0, Math.min(Number(input.activePhase) || 0, 20)),
    answers: sanitizeStringRecord(input.answers),
    locked: sanitizeStringRecord(input.locked, { booleanValues: true }),
    missionProgress: {},
    achievementGranted: input.achievementGranted === true
  };
  let previousComplete = true;

  chapter3CompletionFlags.forEach((flag) => {
    const complete = previousComplete && input[flag] === true;
    state[flag] = complete;
    previousComplete = complete;
  });

  const missionProgress = input.missionProgress && typeof input.missionProgress === "object" && !Array.isArray(input.missionProgress)
    ? input.missionProgress
    : {};
  chapter3MissionKeys.forEach((key) => {
    const progress = missionProgress[key];
    if (!progress || typeof progress !== "object" || Array.isArray(progress)) return;
    state.missionProgress[key] = {
      phase: Math.max(0, Math.min(Number(progress.phase) || 0, 20)),
      answers: sanitizeStringRecord(progress.answers),
      locked: sanitizeStringRecord(progress.locked, { booleanValues: true }),
      optionOrders: sanitizeStringRecord(progress.optionOrders, { arrayValues: true }),
      lastWrong: Array.isArray(progress.lastWrong)
        ? progress.lastWrong.filter((value) => typeof value === "string" && value.length <= 100).slice(0, 30)
        : []
    };
  });
  return state;
}

function getChapter3ProgressScore(state) {
  return chapter3CompletionFlags.reduce((score, flag) => score + Number(state[flag] === true), 0);
}

function normalizeEmail(value) {
  if (typeof value !== "string") return "";
  const email = value.trim().normalize("NFKC").toLowerCase();
  if (email.length < 5 || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "";
  return email;
}

function normalizeDisplayName(value) {
  if (typeof value !== "string") return "";
  const name = value.trim().replace(/\s+/g, " ").slice(0, 40);
  return name.length >= 2 ? name : "";
}

function normalizeAccessMode(value) {
  return value === "study" ? "study" : value === "progression" ? "progression" : "";
}

function publicAccount(account) {
  return account ? {
    id: account.id,
    email: account.email,
    displayName: account.displayName,
    mode: account.mode
  } : null;
}

export async function hashPassword(password) {
  const salt = randomBytes(16);
  const derived = await scryptAsync(password, salt, 64, SCRYPT_PARAMS);
  return `scrypt$${SCRYPT_PARAMS.N}$${SCRYPT_PARAMS.r}$${SCRYPT_PARAMS.p}$${salt.toString("base64url")}$${derived.toString("base64url")}`;
}

export async function verifyPassword(password, encodedHash) {
  try {
    const [algorithm, rawN, rawR, rawP, rawSalt, rawHash] = String(encodedHash).split("$");
    if (algorithm !== "scrypt") return false;
    const params = { N: Number(rawN), r: Number(rawR), p: Number(rawP), maxmem: SCRYPT_PARAMS.maxmem };
    if (params.N !== SCRYPT_PARAMS.N || params.r !== SCRYPT_PARAMS.r || params.p !== SCRYPT_PARAMS.p) return false;
    const salt = Buffer.from(rawSalt, "base64url");
    const expected = Buffer.from(rawHash, "base64url");
    if (salt.length !== 16 || expected.length !== 64) return false;
    const candidate = await scryptAsync(password, salt, expected.length, params);
    return timingSafeEqual(candidate, expected);
  } catch {
    return false;
  }
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

function getAccountStore() {
  if (accountStore) return accountStore;
  const database = getDatabasePool();
  accountStore = database ? new PostgresAccountStore(database) : new MemoryAccountStore();
  return accountStore;
}

export function resetMemoryAccountStore() {
  if (getDatabasePool()) throw new Error("Cannot reset the PostgreSQL account store");
  accountStore = new MemoryAccountStore();
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
  accountStore = null;
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

function parseCookies(request) {
  const header = request.headers.cookie;
  if (!header) return {};
  return Object.fromEntries(header.split(";").map((part) => {
    const separator = part.indexOf("=");
    if (separator < 0) return [part.trim(), ""];
    const key = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    return [key, value];
  }));
}

function isSecureRequest(request) {
  const forwardedProto = request.headers["x-forwarded-proto"];
  return request.socket.encrypted === true
    || (Array.isArray(forwardedProto) ? forwardedProto[0] : forwardedProto?.split(",")[0])?.trim() === "https";
}

function setSessionCookie(request, response, token) {
  const secure = isSecureRequest(request);
  const name = secure ? SECURE_SESSION_COOKIE : SESSION_COOKIE;
  const attributes = [`${name}=${token}`, "Path=/", `Max-Age=${SESSION_TTL_SECONDS}`, "HttpOnly", "SameSite=Lax"];
  if (secure) attributes.push("Secure");
  response.setHeader("Set-Cookie", attributes.join("; "));
}

function clearSessionCookies(response) {
  response.setHeader("Set-Cookie", [
    `${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`,
    `${SECURE_SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax; Secure`
  ]);
}

function getSessionToken(request) {
  const cookies = parseCookies(request);
  const token = cookies[SECURE_SESSION_COOKIE] || cookies[SESSION_COOKIE] || "";
  return /^[A-Za-z0-9_-]{43}$/.test(token) ? token : "";
}

function hashSessionToken(token) {
  return createHash("sha256").update(token).digest("hex");
}

async function getAuthenticatedAccount(request) {
  const token = getSessionToken(request);
  if (!token) return null;
  return await getAccountStore().findAccountBySession(hashSessionToken(token));
}

async function requireAuthenticatedAccount(request, response) {
  const account = await getAuthenticatedAccount(request);
  if (!account) {
    clearSessionCookies(response);
    json(response, 401, { error: "Authentication required" });
    return null;
  }
  return account;
}

async function issueSession(request, response, accountId) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000);
  await getAccountStore().createSession({
    tokenHash: hashSessionToken(token),
    accountId,
    expiresAt
  });
  setSessionCookie(request, response, token);
}

function getActiveAuthAttempt(request) {
  const key = getClientAddress(request);
  const now = Date.now();
  const saved = authAttempts.get(key);
  const attempt = saved && now - saved.startedAt < AUTH_WINDOW_MS
    ? saved
    : { count: 0, startedAt: now };
  authAttempts.set(key, attempt);
  return { key, attempt };
}

function rejectRateLimitedAuth(request, response) {
  const { attempt } = getActiveAuthAttempt(request);
  if (attempt.count < AUTH_ATTEMPT_LIMIT) return false;
  response.setHeader("Retry-After", String(Math.ceil((attempt.startedAt + AUTH_WINDOW_MS - Date.now()) / 1000)));
  json(response, 429, { error: "Too many authentication attempts" });
  return true;
}

function recordAuthFailure(request) {
  const { key, attempt } = getActiveAuthAttempt(request);
  attempt.count += 1;
  authAttempts.set(key, attempt);
}

function clearAuthFailures(request) {
  authAttempts.delete(getClientAddress(request));
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

function validatePassword(password) {
  return typeof password === "string"
    && password.length >= PASSWORD_MIN_LENGTH
    && password.length <= PASSWORD_MAX_LENGTH;
}

async function handleAccountRegistration(request, response) {
  if (rejectRateLimitedAuth(request, response)) return;
  const body = await readJsonBody(request);
  const email = normalizeEmail(body.email);
  const displayName = normalizeDisplayName(body.displayName);
  const password = body.password;
  const mode = normalizeAccessMode(body.mode);
  if (!email || !displayName || !validatePassword(password) || !mode) {
    recordAuthFailure(request);
    json(response, 400, { error: "Invalid registration data" });
    return;
  }

  try {
    const account = await getAccountStore().createAccount({
      id: randomUUID(),
      email,
      displayName,
      passwordHash: await hashPassword(password),
      mode
    });
    await issueSession(request, response, account.id);
    clearAuthFailures(request);
    json(response, 201, { account: publicAccount(account) });
  } catch (error) {
    if (error.code === "23505") {
      recordAuthFailure(request);
      json(response, 409, { error: "Email is already registered" });
      return;
    }
    throw error;
  }
}

async function handleAccountLogin(request, response) {
  if (rejectRateLimitedAuth(request, response)) return;
  const body = await readJsonBody(request);
  const email = normalizeEmail(body.email);
  const password = typeof body.password === "string" ? body.password.slice(0, PASSWORD_MAX_LENGTH + 1) : "";
  const mode = normalizeAccessMode(body.mode);
  const account = email ? await getAccountStore().findAccountByEmail(email) : null;
  const passwordMatches = account
    ? await verifyPassword(password, account.passwordHash)
    : await scryptAsync(password || "invalid-password", Buffer.alloc(16), 64, SCRYPT_PARAMS).then(() => false);

  if (!email || !validatePassword(password) || !mode || !account || !passwordMatches) {
    recordAuthFailure(request);
    json(response, 401, { error: "Invalid email or password" });
    return;
  }

  const updatedAccount = await getAccountStore().updateAccount(account.id, { mode, markLogin: true });
  await issueSession(request, response, account.id);
  clearAuthFailures(request);
  json(response, 200, { account: publicAccount(updatedAccount) });
}

async function handleAccountSession(request, response) {
  const account = await getAuthenticatedAccount(request);
  if (!account) {
    clearSessionCookies(response);
    json(response, 401, { error: "Authentication required" });
    return;
  }
  json(response, 200, { account: publicAccount(account) });
}

async function handleAccountLogout(request, response) {
  const token = getSessionToken(request);
  if (token) await getAccountStore().deleteSession(hashSessionToken(token));
  clearSessionCookies(response);
  json(response, 200, { ok: true });
}

async function handleAccountProfile(request, response) {
  const account = await requireAuthenticatedAccount(request, response);
  if (!account) return;
  const body = await readJsonBody(request);
  const displayName = normalizeDisplayName(body.displayName);
  const mode = normalizeAccessMode(body.mode);
  if (!displayName || !mode) {
    json(response, 400, { error: "Invalid profile data" });
    return;
  }
  const updatedAccount = await getAccountStore().updateAccount(account.id, { displayName, mode });
  json(response, 200, { account: publicAccount(updatedAccount) });
}

async function handleAccountProgress(request, response, chapter = null) {
  const account = await requireAuthenticatedAccount(request, response);
  if (!account) return;
  const store = getAccountStore();

  if (request.method === "GET" && chapter === null) {
    json(response, 200, { progress: await store.getProgress(account.id) });
    return;
  }

  if (!chapter || !["chapter1", "chapter2", "chapter3"].includes(chapter)) {
    json(response, 404, { error: "Not found" });
    return;
  }

  if (account.mode === "study") {
    json(response, 409, { error: "Study mode does not change canonical progress" });
    return;
  }

  if (request.method === "PUT") {
    const body = await readJsonBody(request);
    const state = chapter === "chapter1"
      ? sanitizeProgressState(body.state)
      : chapter === "chapter2"
        ? sanitizeChapter2ProgressState(body.state)
        : sanitizeChapter3ProgressState(body.state);
    if (!state) {
      json(response, 400, { error: "Invalid progress state" });
      return;
    }
    const score = chapter === "chapter1"
      ? getProgressScore(state)
      : chapter === "chapter2"
        ? getChapter2ProgressScore(state)
        : getChapter3ProgressScore(state);
    const saved = await store.saveProgress(account.id, chapter, state, score);
    json(response, 200, { ok: true, progress: saved });
    return;
  }

  if (request.method === "DELETE") {
    await store.resetProgress(account.id, chapter);
    json(response, 200, { ok: true });
    return;
  }

  response.setHeader("Allow", "GET, PUT, DELETE");
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

      if (url.pathname === "/api/auth/register" && request.method === "POST") {
        await handleAccountRegistration(request, response);
        return;
      }

      if (url.pathname === "/api/auth/login" && request.method === "POST") {
        await handleAccountLogin(request, response);
        return;
      }

      if (url.pathname === "/api/auth/session" && request.method === "GET") {
        await handleAccountSession(request, response);
        return;
      }

      if (url.pathname === "/api/auth/logout" && request.method === "POST") {
        await handleAccountLogout(request, response);
        return;
      }

      if (url.pathname === "/api/auth/profile" && request.method === "PUT") {
        await handleAccountProfile(request, response);
        return;
      }

      if (url.pathname === "/api/account/progress") {
        await handleAccountProgress(request, response);
        return;
      }

      const accountProgressMatch = url.pathname.match(/^\/api\/account\/progress\/(chapter1|chapter2|chapter3)$/);
      if (accountProgressMatch) {
        await handleAccountProgress(request, response, accountProgressMatch[1]);
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
