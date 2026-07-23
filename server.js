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
const ADMIN_SESSION_TTL_SECONDS = 8 * 60 * 60;
const ADMIN_SESSION_COOKIE = "bpmsoft_admin";
const SECURE_ADMIN_SESSION_COOKIE = "__Host-bpmsoft_admin";
const PASSWORD_MIN_LENGTH = 10;
const PASSWORD_MAX_LENGTH = 128;
const SCRYPT_PARAMS = { N: 2 ** 15, r: 8, p: 3, maxmem: 64 * 1024 * 1024 };
const scryptAsync = promisify(scrypt);
const publicRootFiles = new Set([
  "index.html",
  "admin.html",
  "admin.css",
  "admin.js",
  "app.js",
  "styles.css",
  "chapter2.css",
  "chapter2-missions.js",
  "chapter2.js",
  "chapter3.css",
  "chapter3-missions.js",
  "chapter3.js",
  "chapter4.css",
  "chapter4-missions.js",
  "chapter4.js",
  "chapter5-prototype.html",
  "chapter5-prototype.css",
  "chapter5-prototype-data.js",
  "chapter5-prototype.js",
  "chapter5-simulation.js",
  "chapter5.css",
  "chapter5-missions.js",
  "chapter5.js"
]);
const missionKeys = ["interface", "data", "access", "process", "case", "integration", "insight", "classification", "solution"];
const chapter2MissionKeys = ["sorting", "portal", "signal", "cycle", "package", "trace", "change", "oracle", "contour"];
const chapter3MissionKeys = ["contact", "lead", "channel", "bpmn", "sla", "access", "integration", "ai", "orbit"];
const chapter4MissionKeys = ["migration", "consent", "campaign", "franchise", "order", "stock", "returns", "insight", "transformation"];
const chapter5MissionKeys = ["schedule", "connections", "baggage", "disruption", "rebooking", "partner", "integration", "forecast", "crisis"];

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
const chapter4CompletionFlags = chapter4MissionKeys.map((key) => `${key}Complete`);
const chapter5CompletionFlags = chapter5MissionKeys.map((key) => `${key}Complete`);
const chapterMissionDefinitions = [
  {
    id: "chapter1",
    title: "Академия",
    subtitle: "Базовый курс",
    keys: missionKeys,
    flags: completionFlags,
    titles: [
      "Навигация менеджера", "Основы модели данных", "Права отдела продаж",
      "Обработка входящего письма", "Жизненный цикл заявки", "Приём заявок с портала",
      "Панель руководителя", "Оценка требований", "Служба обработки обращений"
    ]
  },
  {
    id: "chapter2",
    title: "Медные машины",
    subtitle: "Первый проект",
    keys: chapter2MissionKeys,
    flags: chapter2CompletionFlags,
    titles: [
      "Импорт производственных заказов", "Дилерский портал", "Интеграция с перевозчиком",
      "Согласование заказов", "Пакеты и зависимости", "Аудит изменений",
      "Изменения и релизы", "ML и LLM в аналитике", "Приёмка релиза"
    ]
  },
  {
    id: "chapter3",
    title: "Семь дорог",
    subtitle: "Развитие CRM",
    keys: chapter3MissionKeys,
    flags: chapter3CompletionFlags,
    titles: [
      "Дубли в клиентской базе", "Квалификация лидов", "История коммуникаций",
      "Исполняемый BPMN", "Контроль SLA", "Сотрудники и портал",
      "Обмен с ERP", "AI и качество", "CRM-центр компетенций"
    ]
  },
  {
    id: "chapter4",
    title: "Золотая полка",
    subtitle: "Омниканальная трансформация",
    keys: chapter4MissionKeys,
    flags: chapter4CompletionFlags,
    titles: [
      "Мастер-данные покупателя", "Согласия по каналам", "Аудитория кампании",
      "Портал франчайзи", "Омниканальный заказ", "Остатки и резервы",
      "Возвраты и компенсации", "Метрики и качество", "Сквозная приёмка"
    ]
  },
  {
    id: "chapter5",
    title: "Гуд Авиа",
    subtitle: "Операционная устойчивость",
    keys: chapter5MissionKeys,
    flags: chapter5CompletionFlags,
    titles: [
      "Версия и идентичность рейса", "Время, зоны и SLA", "Идемпотентность багажа",
      "Один кейс ситуации", "Автоматизация и ответственность", "Права партнёров",
      "Корреляция и неизвестный исход", "AI под контролем качества", "Кризисная приёмка"
    ]
  }
];
const missionCatalog = chapterMissionDefinitions.flatMap((chapter, chapterIndex) => chapter.keys.map((key, missionIndex) => ({
  number: chapterIndex * 9 + missionIndex + 1,
  chapterId: chapter.id,
  chapterTitle: chapter.title,
  key,
  flag: chapter.flags[missionIndex],
  title: chapter.titles[missionIndex]
})));

const mimeTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".jpeg", "image/jpeg"],
  [".jpg", "image/jpeg"],
  [".md", "text/markdown; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".ttf", "font/ttf"]
]);

const adminAttempts = new Map();
const adminSessions = new Map();
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
  const entries = [];
  for (const [key, value] of Object.entries(input)) {
    if (entries.length >= 100) break;
    if (typeof key !== "string" || key.length > 100) continue;
    if (booleanValues && (value === true || value === false)) entries.push([key, value]);
    else if (arrayValues && Array.isArray(value)) {
      const strings = [...new Set(value.filter((item) => typeof item === "string" && item.length <= 100))].slice(0, 30);
      entries.push([key, strings]);
    } else if (!booleanValues && !arrayValues && typeof value === "string" && value.length <= 100) entries.push([key, value]);
  }
  return Object.fromEntries(entries);
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

export function sanitizeChapter4ProgressState(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const state = {
    chapterId: "golden-shelf",
    energy: Number.isInteger(input.energy) ? Math.max(0, Math.min(input.energy, 4)) : 4,
    introSeen: Array.isArray(input.introSeen)
      ? [...new Set(input.introSeen.filter((key) => chapter4MissionKeys.includes(key)))]
      : [],
    prologueSeen: input.prologueSeen === true,
    attempts: Math.max(1, Math.min(Number(input.attempts) || 1, 100)),
    missionProgress: {},
    achievementGranted: input.achievementGranted === true
  };
  let previousComplete = true;

  chapter4CompletionFlags.forEach((flag) => {
    const complete = previousComplete && input[flag] === true;
    state[flag] = complete;
    previousComplete = complete;
  });

  const missionProgress = input.missionProgress && typeof input.missionProgress === "object" && !Array.isArray(input.missionProgress)
    ? input.missionProgress
    : {};
  chapter4MissionKeys.forEach((key) => {
    const progress = missionProgress[key];
    if (!progress || typeof progress !== "object" || Array.isArray(progress)) return;
    state.missionProgress[key] = {
      stage: Math.max(0, Math.min(Number(progress.stage) || 0, 10)),
      seen: sanitizeStringRecord(progress.seen, { arrayValues: true }),
      placements: sanitizeStringRecord(progress.placements),
      cardOrders: sanitizeStringRecord(progress.cardOrders, { arrayValues: true }),
      lastWrong: Array.isArray(progress.lastWrong)
        ? [...new Set(progress.lastWrong.filter((value) => ["cause", "mechanism", "test"].includes(value)))].slice(0, 3)
        : [],
      tutorialGraceUsed: progress.tutorialGraceUsed === true
    };
  });
  return state;
}

function getChapter4ProgressScore(state) {
  return chapter4CompletionFlags.reduce((score, flag) => score + Number(state[flag] === true), 0);
}

export function sanitizeChapter5ProgressState(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const state = {
    chapterId: "good-avia",
    energy: Number.isInteger(input.energy) ? Math.max(0, Math.min(input.energy, 4)) : 4,
    introSeen: Array.isArray(input.introSeen)
      ? [...new Set(input.introSeen.filter((key) => chapter5MissionKeys.includes(key)))]
      : [],
    prologueSeen: input.prologueSeen === true,
    attempts: Math.max(1, Math.min(Number(input.attempts) || 1, 100)),
    missionProgress: {},
    achievementGranted: input.achievementGranted === true
  };
  let previousComplete = true;

  chapter5CompletionFlags.forEach((flag) => {
    const complete = previousComplete && input[flag] === true;
    state[flag] = complete;
    previousComplete = complete;
  });

  const missionProgress = input.missionProgress && typeof input.missionProgress === "object" && !Array.isArray(input.missionProgress)
    ? input.missionProgress
    : {};
  chapter5MissionKeys.forEach((key) => {
    const progress = missionProgress[key];
    if (!progress || typeof progress !== "object" || Array.isArray(progress)) return;
    state.missionProgress[key] = {
      round: Math.max(0, Math.min(Number(progress.round) || 0, key === "crisis" ? 2 : 1)),
      completedRounds: Array.isArray(progress.completedRounds)
        ? [...new Set(progress.completedRounds.filter((value) => typeof value === "string" && /^[0-9]{2}[A-C]$/.test(value)))].slice(0, 3)
        : [],
      lastWrong: Array.isArray(progress.lastWrong)
        ? [...new Set(progress.lastWrong.filter((value) => typeof value === "string" && value.length <= 100))].slice(0, 6)
        : []
    };
  });
  return state;
}

function getChapter5ProgressScore(state) {
  return chapter5CompletionFlags.reduce((score, flag) => score + Number(state[flag] === true), 0);
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

function setAdminSessionCookie(request, response, token) {
  const secure = isSecureRequest(request);
  const name = secure ? SECURE_ADMIN_SESSION_COOKIE : ADMIN_SESSION_COOKIE;
  const attributes = [`${name}=${token}`, "Path=/", `Max-Age=${ADMIN_SESSION_TTL_SECONDS}`, "HttpOnly", "SameSite=Strict"];
  if (secure) attributes.push("Secure");
  response.setHeader("Set-Cookie", attributes.join("; "));
}

function clearAdminSessionCookies(response) {
  response.setHeader("Set-Cookie", [
    `${ADMIN_SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Strict`,
    `${SECURE_ADMIN_SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Strict; Secure`
  ]);
}

function getAdminSessionToken(request) {
  const cookies = parseCookies(request);
  const token = cookies[SECURE_ADMIN_SESSION_COOKIE] || cookies[ADMIN_SESSION_COOKIE] || "";
  return /^[A-Za-z0-9_-]{43}$/.test(token) ? token : "";
}

function issueAdminSession(request, response) {
  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashSessionToken(token);
  const expiresAt = Date.now() + ADMIN_SESSION_TTL_SECONDS * 1000;
  adminSessions.set(tokenHash, expiresAt);
  setAdminSessionCookie(request, response, token);
}

function hasValidAdminSession(request) {
  const token = getAdminSessionToken(request);
  if (!token) return false;
  const tokenHash = hashSessionToken(token);
  const expiresAt = adminSessions.get(tokenHash) || 0;
  if (expiresAt <= Date.now()) {
    adminSessions.delete(tokenHash);
    return false;
  }
  return true;
}

function requireAdminSession(request, response) {
  if (hasValidAdminSession(request)) return true;
  clearAdminSessionCookies(response);
  json(response, 401, { error: "Admin authentication required" });
  return false;
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

function timestamp(value) {
  const date = value ? new Date(value) : null;
  return date && Number.isFinite(date.getTime()) ? date.getTime() : 0;
}

function round(value, digits = 0) {
  const factor = 10 ** digits;
  return Math.round((Number(value) || 0) * factor) / factor;
}

function percent(numerator, denominator) {
  return denominator > 0 ? round((numerator / denominator) * 100, 1) : 0;
}

function chapterState(progress, chapterId) {
  return progress?.[chapterId]?.state && typeof progress[chapterId].state === "object"
    ? progress[chapterId].state
    : {};
}

function getLatestActivity(account, progress) {
  return Math.max(
    timestamp(account.lastLoginAt),
    ...chapterMissionDefinitions.map(({ id }) => timestamp(progress?.[id]?.updatedAt))
  );
}

function getMissionWrongCount(state, key) {
  const lastWrong = state?.missionProgress?.[key]?.lastWrong;
  return Array.isArray(lastWrong) ? lastWrong.length : 0;
}

function getAnswerVolume(state) {
  const topLevelAnswers = state?.answers && typeof state.answers === "object"
    ? Object.keys(state.answers).length
    : 0;
  const missionProgress = state?.missionProgress && typeof state.missionProgress === "object"
    ? Object.values(state.missionProgress)
    : [];
  return topLevelAnswers + missionProgress.reduce((total, item) => {
    const answers = item?.answers && typeof item.answers === "object" ? Object.keys(item.answers).length : 0;
    const placements = item?.placements && typeof item.placements === "object" ? Object.keys(item.placements).length : 0;
    return total + answers + placements;
  }, 0);
}

function normalizeAnalyticsRecord(record, now) {
  const { account, progress } = record;
  const chapters = chapterMissionDefinitions.map((chapter) => {
    const saved = progress?.[chapter.id];
    const state = chapterState(progress, chapter.id);
    const completed = chapter.flags.map((flag) => state[flag] === true);
    const started = chapter.keys.map((key, index) => completed[index]
      || state.introSeen?.includes?.(key)
      || Boolean(state.missionProgress?.[key]));
    const wrong = chapter.keys.map((key) => getMissionWrongCount(state, key));
    const score = Math.max(0, Math.min(Number(saved?.score) || completed.filter(Boolean).length, 9));
    return {
      id: chapter.id,
      score,
      completed,
      started,
      wrong,
      attempts: saved ? Math.max(1, Number(state.attempts) || 1) : 0,
      energy: saved ? Math.max(0, Number(state.energy) || 0) : null,
      maxEnergy: chapter.id === "chapter1" || chapter.id === "chapter2" ? 3 : 4,
      answerVolume: getAnswerVolume(state),
      updatedAt: timestamp(saved?.updatedAt)
    };
  });
  const totalScore = chapters.reduce((sum, chapter) => sum + chapter.score, 0);
  const latestActivity = getLatestActivity(account, progress);
  const daysInactive = latestActivity ? Math.floor((now - latestActivity) / 86_400_000) : null;
  return {
    id: account.id,
    email: account.email,
    displayName: account.displayName,
    mode: account.mode,
    createdAt: timestamp(account.createdAt),
    lastLoginAt: timestamp(account.lastLoginAt),
    latestActivity,
    daysInactive,
    chapters,
    totalScore,
    progressPercent: percent(totalScore, 45),
    wrongCount: chapters.reduce((sum, chapter) => sum + chapter.wrong.reduce((value, count) => value + count, 0), 0),
    answerVolume: chapters.reduce((sum, chapter) => sum + chapter.answerVolume, 0)
  };
}

function buildTimeline(users, periodDays, now) {
  const bucketDays = Math.max(1, Math.ceil(periodDays / 30));
  const bucketCount = Math.ceil(periodDays / bucketDays);
  return Array.from({ length: bucketCount }, (_, index) => {
    const end = now - (bucketCount - index - 1) * bucketDays * 86_400_000;
    const start = end - bucketDays * 86_400_000;
    return {
      label: new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "short" }).format(new Date(end)),
      registrations: users.filter((user) => user.createdAt > start && user.createdAt <= end).length,
      activity: users.filter((user) => user.latestActivity > start && user.latestActivity <= end).length
    };
  });
}

function buildCohorts(users, now) {
  return Array.from({ length: 8 }, (_, index) => {
    const weekEnd = now - index * 7 * 86_400_000;
    const weekStart = weekEnd - 7 * 86_400_000;
    const cohort = users.filter((user) => user.createdAt > weekStart && user.createdAt <= weekEnd);
    const retained = (days) => cohort.filter((user) => user.latestActivity >= user.createdAt + days * 86_400_000).length;
    return {
      label: `−${index} нед.`,
      size: cohort.length,
      day7: percent(retained(7), cohort.length),
      day14: percent(retained(14), cohort.length),
      day30: percent(retained(30), cohort.length)
    };
  }).reverse();
}

function buildAnalyticsSnapshot(records, { periodDays = 30, mode = "all", chapterId = "all" } = {}) {
  const now = Date.now();
  const allUsers = records.map((record) => normalizeAnalyticsRecord(record, now));
  const users = mode === "all" ? allUsers : allUsers.filter((user) => user.mode === mode);
  const chapters = chapterMissionDefinitions.map((definition, chapterIndex) => {
    const userChapters = users.map((user) => user.chapters[chapterIndex]);
    const started = userChapters.filter((chapter) => chapter.started.some(Boolean) || chapter.score > 0).length;
    const completed = userChapters.filter((chapter) => chapter.score === 9).length;
    const scores = userChapters.reduce((sum, chapter) => sum + chapter.score, 0);
    return {
      id: definition.id,
      title: definition.title,
      subtitle: definition.subtitle,
      started,
      completed,
      completionRate: percent(completed, users.length),
      conversionRate: percent(completed, started),
      averageScore: users.length ? round(scores / users.length, 1) : 0,
      attempts: userChapters.reduce((sum, chapter) => sum + chapter.attempts, 0),
      averageAttempts: started ? round(userChapters.reduce((sum, chapter) => sum + chapter.attempts, 0) / started, 1) : 0,
      errors: userChapters.reduce((sum, chapter) => sum + chapter.wrong.reduce((value, count) => value + count, 0), 0),
      answerVolume: userChapters.reduce((sum, chapter) => sum + chapter.answerVolume, 0),
      averageEnergy: round(userChapters.reduce((sum, chapter) => sum + (chapter.energy ?? chapter.maxEnergy), 0) / Math.max(users.length, 1), 1),
      maxEnergy: userChapters[0]?.maxEnergy || 4
    };
  });

  const quests = missionCatalog.map((mission) => {
    const chapterIndex = Number(mission.chapterId.slice(-1)) - 1;
    const missionIndex = (mission.number - 1) % 9;
    const started = users.filter((user) => user.chapters[chapterIndex].started[missionIndex]).length;
    const completed = users.filter((user) => user.chapters[chapterIndex].completed[missionIndex]).length;
    const errors = users.reduce((sum, user) => sum + user.chapters[chapterIndex].wrong[missionIndex], 0);
    return {
      ...mission,
      started,
      completed,
      errors,
      completionRate: percent(completed, users.length),
      conversionRate: percent(completed, started),
      dropoffRate: started ? round(100 - percent(completed, started), 1) : 0
    };
  }).filter((mission) => chapterId === "all" || mission.chapterId === chapterId);

  const activeSince = now - periodDays * 86_400_000;
  const previousPeriodStart = now - periodDays * 2 * 86_400_000;
  const newUsers = users.filter((user) => user.createdAt >= activeSince).length;
  const previousNewUsers = users.filter((user) => user.createdAt >= previousPeriodStart && user.createdAt < activeSince).length;
  const activeUsers = users.filter((user) => user.latestActivity >= activeSince).length;
  const completedUsers = users.filter((user) => user.totalScore === 45).length;
  const progressionUsers = users.filter((user) => user.mode === "progression");
  const studyUsers = users.filter((user) => user.mode === "study");
  const status = {
    new: users.filter((user) => user.createdAt >= now - 7 * 86_400_000).length,
    active: users.filter((user) => user.latestActivity >= now - 7 * 86_400_000).length,
    champions: completedUsers,
    atRisk: users.filter((user) => user.totalScore < 45 && user.daysInactive != null && user.daysInactive >= 14 && user.daysInactive < 30).length,
    inactive: users.filter((user) => user.daysInactive == null || user.daysInactive >= 30).length
  };
  const attention = users
    .filter((user) => user.totalScore < 45 && (user.daysInactive == null || user.daysInactive >= 7 || user.wrongCount >= 3))
    .sort((left, right) => (right.daysInactive ?? 999) - (left.daysInactive ?? 999) || right.wrongCount - left.wrongCount)
    .slice(0, 8)
    .map((user) => ({
      id: user.id,
      name: user.displayName,
      email: user.email,
      progress: user.progressPercent,
      daysInactive: user.daysInactive,
      wrongCount: user.wrongCount,
      reason: user.daysInactive == null ? "Не приступал" : user.daysInactive >= 30 ? "Давно не заходил" : user.wrongCount >= 3 ? "Есть затруднения" : "Теряет темп"
    }));
  const recency = [
    { label: "Сегодня", value: users.filter((user) => user.daysInactive === 0).length },
    { label: "1–7 дней", value: users.filter((user) => user.daysInactive != null && user.daysInactive >= 1 && user.daysInactive <= 7).length },
    { label: "8–30 дней", value: users.filter((user) => user.daysInactive != null && user.daysInactive >= 8 && user.daysInactive <= 30).length },
    { label: "> 30 дней", value: users.filter((user) => user.daysInactive == null || user.daysInactive > 30).length }
  ];
  const leaderboard = [...users]
    .sort((left, right) => right.totalScore - left.totalScore || right.latestActivity - left.latestActivity)
    .slice(0, 10)
    .map((user) => ({ id: user.id, name: user.displayName, email: user.email, score: user.totalScore, progress: user.progressPercent, mode: user.mode }));
  const directory = users.slice(0, 250).map((user) => ({
    id: user.id,
    name: user.displayName,
    email: user.email,
    mode: user.mode,
    createdAt: user.createdAt ? new Date(user.createdAt).toISOString() : null,
    lastActivityAt: user.latestActivity ? new Date(user.latestActivity).toISOString() : null,
    progress: user.progressPercent,
    score: user.totalScore,
    status: user.totalScore === 45 ? "Выпускник" : user.daysInactive == null || user.daysInactive >= 30 ? "Неактивен" : user.daysInactive >= 14 ? "Риск" : "Учится"
  }));
  const scoreDistribution = [
    { label: "0", min: 0, max: 0 },
    { label: "1–9", min: 1, max: 9 },
    { label: "10–18", min: 10, max: 18 },
    { label: "19–27", min: 19, max: 27 },
    { label: "28–36", min: 28, max: 36 },
    { label: "37–44", min: 37, max: 44 },
    { label: "45", min: 45, max: 45 }
  ].map((bucket) => ({ ...bucket, value: users.filter((user) => user.totalScore >= bucket.min && user.totalScore <= bucket.max).length }));
  const journey = [
    { label: "Зарегистрировались", value: users.length },
    ...chapterMissionDefinitions.map((chapter, index) => ({
      label: chapter.title,
      value: users.filter((user) => user.chapters[index].started.some(Boolean) || user.chapters[index].score > 0).length
    })),
    { label: "Завершили путь", value: completedUsers }
  ];
  const recentActivity = [...users]
    .filter((user) => user.latestActivity)
    .sort((left, right) => right.latestActivity - left.latestActivity)
    .slice(0, 10)
    .map((user) => ({
      id: user.id,
      name: user.displayName,
      at: new Date(user.latestActivity).toISOString(),
      progress: user.progressPercent,
      action: user.totalScore === 45 ? "Завершил обучение" : `Прогресс: ${user.totalScore} из 45`
    }));

  return {
    meta: {
      generatedAt: new Date(now).toISOString(),
      periodDays,
      mode,
      chapterId,
      widgets: 30,
      source: getDatabasePool() ? "postgres" : "memory"
    },
    summary: {
      totalUsers: users.length,
      newUsers,
      newUsersGrowth: previousNewUsers ? round(((newUsers - previousNewUsers) / previousNewUsers) * 100, 1) : newUsers ? 100 : 0,
      activeUsers,
      activeRate: percent(activeUsers, users.length),
      completedUsers,
      completionRate: percent(completedUsers, users.length),
      averageProgress: users.length ? round(users.reduce((sum, user) => sum + user.progressPercent, 0) / users.length, 1) : 0,
      averageErrors: users.length ? round(users.reduce((sum, user) => sum + user.wrongCount, 0) / users.length, 1) : 0
    },
    timeline: buildTimeline(users, periodDays, now),
    modes: [
      { id: "progression", label: "Прохождение", value: progressionUsers.length, averageProgress: progressionUsers.length ? round(progressionUsers.reduce((sum, user) => sum + user.progressPercent, 0) / progressionUsers.length, 1) : 0 },
      { id: "study", label: "Изучение", value: studyUsers.length, averageProgress: studyUsers.length ? round(studyUsers.reduce((sum, user) => sum + user.progressPercent, 0) / studyUsers.length, 1) : 0 }
    ],
    status,
    attention,
    recency,
    cohorts: buildCohorts(users, now),
    leaderboard,
    directory,
    chapters,
    quests,
    scoreDistribution,
    journey,
    completionSegments: [
      { label: "Не приступили", value: users.filter((user) => user.totalScore === 0).length },
      { label: "В процессе", value: users.filter((user) => user.totalScore > 0 && user.totalScore < 45).length },
      { label: "Завершили", value: completedUsers }
    ],
    recentActivity,
    telemetry: [
      { label: "Профиль заполнен", value: percent(users.filter((user) => user.displayName && user.email).length, users.length) },
      { label: "Есть вход", value: percent(users.filter((user) => user.lastLoginAt).length, users.length) },
      { label: "Есть прогресс", value: percent(users.filter((user) => user.totalScore > 0).length, users.length) },
      { label: "Есть ответы", value: percent(users.filter((user) => user.answerVolume > 0).length, users.length) }
    ]
  };
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
  issueAdminSession(request, response);
  json(response, 200, { ok: true });
}

async function handleAdminSession(request, response) {
  if (!requireAdminSession(request, response)) return;
  json(response, 200, { ok: true });
}

async function handleAdminLogout(request, response) {
  const token = getAdminSessionToken(request);
  if (token) adminSessions.delete(hashSessionToken(token));
  clearAdminSessionCookies(response);
  json(response, 200, { ok: true });
}

async function handleAdminAnalytics(request, response, url) {
  if (!requireAdminSession(request, response)) return;
  const period = Number(url.searchParams.get("period"));
  const periodDays = [7, 30, 90].includes(period) ? period : 30;
  const rawMode = url.searchParams.get("mode") || "all";
  const mode = ["all", "progression", "study"].includes(rawMode) ? rawMode : "all";
  const rawChapter = url.searchParams.get("chapter") || "all";
  const chapterId = ["all", "chapter1", "chapter2", "chapter3", "chapter4", "chapter5"].includes(rawChapter) ? rawChapter : "all";
  const records = await getAccountStore().getAnalyticsRecords();
  json(response, 200, buildAnalyticsSnapshot(records, { periodDays, mode, chapterId }));
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

  if (!chapter || !["chapter1", "chapter2", "chapter3", "chapter4", "chapter5"].includes(chapter)) {
    json(response, 404, { error: "Not found" });
    return;
  }

  if (account.mode === "study") {
    json(response, 409, { error: "Study mode does not change canonical progress" });
    return;
  }

  if (request.method === "PUT") {
    const body = await readJsonBody(request);
    const sanitizers = {
      chapter1: sanitizeProgressState,
      chapter2: sanitizeChapter2ProgressState,
      chapter3: sanitizeChapter3ProgressState,
      chapter4: sanitizeChapter4ProgressState,
      chapter5: sanitizeChapter5ProgressState
    };
    const scoreReaders = {
      chapter1: getProgressScore,
      chapter2: getChapter2ProgressScore,
      chapter3: getChapter3ProgressScore,
      chapter4: getChapter4ProgressScore,
      chapter5: getChapter5ProgressScore
    };
    const state = sanitizers[chapter](body.state);
    if (!state) {
      json(response, 400, { error: "Invalid progress state" });
      return;
    }
    const score = scoreReaders[chapter](state);
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

      if (url.pathname === "/api/admin/session" && request.method === "GET") {
        await handleAdminSession(request, response);
        return;
      }

      if (url.pathname === "/api/admin/logout" && request.method === "POST") {
        await handleAdminLogout(request, response);
        return;
      }

      if (url.pathname === "/api/admin/analytics" && request.method === "GET") {
        await handleAdminAnalytics(request, response, url);
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

      const accountProgressMatch = url.pathname.match(/^\/api\/account\/progress\/(chapter1|chapter2|chapter3|chapter4|chapter5)$/);
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
