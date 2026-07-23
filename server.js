import { createHash, randomBytes, randomUUID, scrypt, timingSafeEqual } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";
import pg from "pg";
import { MemoryAccountStore, PostgresAccountStore } from "./account-store.js";
import { buildPostgresPoolConfig } from "./db/connection.js";
import { runMigrations } from "./db/migrate.js";

const { Pool } = pg;
const ROOT_DIR = path.dirname(fileURLToPath(import.meta.url));
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
const EMAIL_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;
const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;
const EMAIL_CHANGE_TTL_MS = 60 * 60 * 1000;
const SCRYPT_PARAMS = { N: 2 ** 15, r: 8, p: 3, maxmem: 64 * 1024 * 1024 };
const scryptAsync = promisify(scrypt);
const publicRootFiles = new Set([
  "index.html",
  "landing.html",
  "landing.css",
  "privacy.html",
  "terms.html",
  "legal.css",
  "admin.html",
  "admin.css",
  "admin.js",
  "app.js",
  "progress-core.js",
  "update.css",
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
const learningEventTypes = new Set([
  "session_started",
  "mission_started",
  "answer_checked",
  "hint_used",
  "mission_completed",
  "chapter_reset"
]);
const learningEventOutcomes = new Set(["success", "failure", "cancelled"]);
const missionKeysByChapter = {
  chapter1: new Set(missionKeys),
  chapter2: new Set(chapter2MissionKeys),
  chapter3: new Set(chapter3MissionKeys),
  chapter4: new Set(chapter4MissionKeys),
  chapter5: new Set(chapter5MissionKeys)
};

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
const operationalMetrics = {
  startedAt: Date.now(),
  activeRequests: 0,
  requests: new Map(),
  durationMs: new Map()
};

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
  response.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  response.setHeader("Cross-Origin-Resource-Policy", "same-origin");
  if (process.env.NODE_ENV === "production") {
    response.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
}

function metricRoute(pathname) {
  if (pathname.startsWith("/assets/")) return "/assets/*";
  if (/^\/api\/account\/progress\/chapter[1-5]$/.test(pathname)) return "/api/account/progress/:chapter";
  return pathname;
}

function recordRequestMetric(method, pathname, statusCode, durationMs) {
  const key = `${method} ${metricRoute(pathname)} ${statusCode}`;
  operationalMetrics.requests.set(key, (operationalMetrics.requests.get(key) || 0) + 1);
  operationalMetrics.durationMs.set(key, (operationalMetrics.durationMs.get(key) || 0) + durationMs);
}

function renderPrometheusMetrics() {
  const lines = [
    "# HELP bpmsoft_uptime_seconds Process uptime in seconds.",
    "# TYPE bpmsoft_uptime_seconds gauge",
    `bpmsoft_uptime_seconds ${Math.floor((Date.now() - operationalMetrics.startedAt) / 1000)}`,
    "# HELP bpmsoft_http_active_requests Current active HTTP requests.",
    "# TYPE bpmsoft_http_active_requests gauge",
    `bpmsoft_http_active_requests ${operationalMetrics.activeRequests}`,
    "# HELP bpmsoft_http_requests_total Completed HTTP requests.",
    "# TYPE bpmsoft_http_requests_total counter"
  ];
  for (const [key, count] of operationalMetrics.requests) {
    const [method, route, status] = key.split(" ");
    lines.push(`bpmsoft_http_requests_total{method="${method}",route="${route}",status="${status}"} ${count}`);
  }
  lines.push(
    "# HELP bpmsoft_http_request_duration_ms_sum Total request duration in milliseconds.",
    "# TYPE bpmsoft_http_request_duration_ms_sum counter"
  );
  for (const [key, duration] of operationalMetrics.durationMs) {
    const [method, route, status] = key.split(" ");
    lines.push(`bpmsoft_http_request_duration_ms_sum{method="${method}",route="${route}",status="${status}"} ${duration.toFixed(3)}`);
  }
  return `${lines.join("\n")}\n`;
}

function handleMetrics(request, response) {
  const expectedToken = process.env.METRICS_TOKEN;
  if (expectedToken) {
    const candidate = String(request.headers.authorization || "").replace(/^Bearer\s+/i, "");
    if (!securePasswordMatches(candidate, expectedToken)) {
      json(response, 401, { error: "Metrics authentication required" });
      return;
    }
  }
  const body = renderPrometheusMetrics();
  response.writeHead(200, {
    "Content-Type": "text/plain; version=0.0.4; charset=utf-8",
    "Cache-Control": "no-store",
    "Content-Length": Buffer.byteLength(body)
  });
  response.end(body);
}

function getClientAddress(request) {
  const forwarded = process.env.TRUST_PROXY === "true" ? request.headers["x-forwarded-for"] : null;
  return (Array.isArray(forwarded) ? forwarded[0] : forwarded?.split(",")[0])?.trim()
    || request.socket.remoteAddress
    || "unknown";
}

export function sanitizeProgressState(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;

  const state = {
    energy: Number.isInteger(input.energy) ? Math.max(0, Math.min(input.energy, 3)) : 3,
    revealedLevelHints: Array.isArray(input.revealedLevelHints)
      ? [...new Set(input.revealedLevelHints.filter((id) => (
        typeof id === "string"
        && id.length <= 120
        && /^[a-z0-9:_-]+$/i.test(id)
      )))].slice(0, 5)
      : [],
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

function isUuid(value) {
  return typeof value === "string"
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function sanitizeEventDetails(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  const entries = [];
  for (const [key, value] of Object.entries(input)) {
    if (entries.length >= 20 || !/^[a-z][a-z0-9_]{0,39}$/i.test(key)) continue;
    if (typeof value === "string") entries.push([key, value.slice(0, 240)]);
    else if (typeof value === "boolean") entries.push([key, value]);
    else if (typeof value === "number" && Number.isFinite(value)) entries.push([key, Math.max(-1_000_000, Math.min(value, 1_000_000))]);
    else if (Array.isArray(value)) {
      entries.push([key, value
        .filter((item) => ["string", "boolean", "number"].includes(typeof item))
        .slice(0, 20)
        .map((item) => typeof item === "string" ? item.slice(0, 120) : item)]);
    }
  }
  return Object.fromEntries(entries);
}

function sanitizeLearningEvent(input, now = Date.now()) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const chapterId = typeof input.chapterId === "string" ? input.chapterId : "";
  const eventType = typeof input.eventType === "string" ? input.eventType : "";
  const missionKey = typeof input.missionKey === "string" ? input.missionKey : null;
  const outcome = typeof input.outcome === "string" ? input.outcome : null;
  const occurredAt = new Date(input.occurredAt);
  const occurredAtMs = occurredAt.getTime();
  if (
    !isUuid(input.id)
    || !isUuid(input.sessionId)
    || !missionKeysByChapter[chapterId]
    || !learningEventTypes.has(eventType)
    || (missionKey != null && !missionKeysByChapter[chapterId].has(missionKey))
    || (outcome != null && !learningEventOutcomes.has(outcome))
    || !Number.isFinite(occurredAtMs)
    || occurredAtMs < now - 90 * 86_400_000
    || occurredAtMs > now + 5 * 60_000
  ) return null;
  const attempt = input.attempt == null ? null : Math.max(1, Math.min(Number(input.attempt) || 1, 100));
  const durationMs = input.durationMs == null
    ? null
    : Math.max(0, Math.min(Math.round(Number(input.durationMs) || 0), 86_400_000));
  return {
    id: input.id,
    sessionId: input.sessionId,
    chapterId,
    missionKey,
    eventType,
    outcome,
    attempt,
    durationMs,
    details: sanitizeEventDetails(input.details),
    occurredAt: occurredAt.toISOString()
  };
}

function publicAccount(account) {
  return account ? {
    id: account.id,
    email: account.email,
    displayName: account.displayName,
    mode: account.mode,
    emailVerified: Boolean(account.emailVerifiedAt),
    policyVersion: account.policyVersion || null
  } : null;
}

function lifecycleTokenHash(token) {
  return createHash("sha256").update(token).digest("hex");
}

async function sendLifecycleMessage({ to, template, actionUrl, expiresInMinutes }) {
  const webhookUrl = process.env.MAIL_WEBHOOK_URL;
  if (!webhookUrl) return false;
  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(process.env.MAIL_WEBHOOK_TOKEN
        ? { Authorization: `Bearer ${process.env.MAIL_WEBHOOK_TOKEN}` }
        : {})
    },
    body: JSON.stringify({
      to,
      template,
      actionUrl,
      expiresInMinutes
    }),
    signal: AbortSignal.timeout(10_000)
  });
  if (!response.ok) throw new Error(`Mail webhook failed with status ${response.status}`);
  return true;
}

async function createLifecycleToken(account, purpose, payload = {}) {
  const token = randomBytes(32).toString("base64url");
  const ttlByPurpose = {
    verify_email: EMAIL_VERIFICATION_TTL_MS,
    reset_password: PASSWORD_RESET_TTL_MS,
    change_email: EMAIL_CHANGE_TTL_MS
  };
  const ttl = ttlByPurpose[purpose];
  const expiresAt = new Date(Date.now() + ttl);
  await getAccountStore().createAccountToken({
    id: randomUUID(),
    accountId: account.id,
    purpose,
    tokenHash: lifecycleTokenHash(token),
    payload,
    expiresAt
  });
  const baseUrl = process.env.APP_BASE_URL || `http://localhost:${Number(process.env.PORT) || 4173}`;
  const actionUrl = new URL("/academy.html", baseUrl);
  actionUrl.searchParams.set(purpose === "reset_password" ? "resetToken" : "verifyToken", token);
  const delivered = await sendLifecycleMessage({
    to: purpose === "change_email" ? payload.email : account.email,
    template: purpose,
    actionUrl: actionUrl.toString(),
    expiresInMinutes: Math.round(ttl / 60_000)
  });
  if (!delivered && process.env.REQUIRE_EMAIL_DELIVERY === "true") {
    throw new Error("Email delivery is required but MAIL_WEBHOOK_URL is not configured");
  }
  return delivered;
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

  pool = new Pool(buildPostgresPoolConfig(process.env.DATABASE_URL));

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
  await runMigrations(database);
  return true;
}

export async function closeDatabase() {
  if (!pool) return;
  const currentPool = pool;
  pool = null;
  accountStore = null;
  await currentPool.end();
}

export function validateProductionConfiguration(environment = process.env) {
  if (environment.NODE_ENV !== "production") return true;
  const errors = [];
  if (!environment.DATABASE_URL) errors.push("DATABASE_URL is required");
  if (environment.REQUIRE_DATABASE !== "true") errors.push("REQUIRE_DATABASE must be true");
  if (!environment.ADMIN_PASSWORD || environment.ADMIN_PASSWORD.length < 16) {
    errors.push("ADMIN_PASSWORD must contain at least 16 characters");
  }
  if (environment.REQUIRE_EMAIL_VERIFICATION !== "true") {
    errors.push("REQUIRE_EMAIL_VERIFICATION must be true");
  }
  if (environment.REQUIRE_EMAIL_DELIVERY !== "true") {
    errors.push("REQUIRE_EMAIL_DELIVERY must be true");
  }
  if (!environment.MAIL_WEBHOOK_URL) errors.push("MAIL_WEBHOOK_URL is required");
  if (!environment.MAIL_WEBHOOK_TOKEN) errors.push("MAIL_WEBHOOK_TOKEN is required");
  if (environment.TRUST_PROXY !== "true") errors.push("TRUST_PROXY must be true");
  if (!environment.METRICS_TOKEN || environment.METRICS_TOKEN.length < 16) {
    errors.push("METRICS_TOKEN must contain at least 16 characters");
  }
  if (!environment.LEGAL_ENTITY_NAME) errors.push("LEGAL_ENTITY_NAME is required");
  if (!environment.PRIVACY_CONTACT_EMAIL || !normalizeEmail(environment.PRIVACY_CONTACT_EMAIL)) {
    errors.push("PRIVACY_CONTACT_EMAIL must be a valid email");
  }
  if (!environment.LEGAL_JURISDICTION) errors.push("LEGAL_JURISDICTION is required");
  if (!environment.POLICY_VERSION) errors.push("POLICY_VERSION is required");
  try {
    if (!environment.APP_BASE_URL || new URL(environment.APP_BASE_URL).protocol !== "https:") {
      errors.push("APP_BASE_URL must use HTTPS");
    }
  } catch {
    errors.push("APP_BASE_URL must be a valid HTTPS URL");
  }
  if (errors.length) throw new Error(`Unsafe production configuration: ${errors.join("; ")}`);
  buildPostgresPoolConfig(environment.DATABASE_URL, environment);
  return true;
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
  const forwardedProto = process.env.TRUST_PROXY === "true" ? request.headers["x-forwarded-proto"] : null;
  return process.env.NODE_ENV === "production"
    || request.socket.encrypted === true
    || (Array.isArray(forwardedProto) ? forwardedProto[0] : forwardedProto?.split(",")[0])?.trim() === "https";
}

function hasTrustedMutationOrigin(request) {
  const origin = request.headers.origin;
  if (!origin) return true;
  const allowed = new Set();
  if (process.env.APP_BASE_URL) {
    try {
      allowed.add(new URL(process.env.APP_BASE_URL).origin);
    } catch {
      return false;
    }
  }
  const host = request.headers.host;
  if (host) allowed.add(`${isSecureRequest(request) ? "https" : "http"}://${host}`);
  return allowed.has(origin);
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

function buildTimeline(users, events, periodDays, now) {
  const bucketDays = Math.max(1, Math.ceil(periodDays / 30));
  const bucketCount = Math.ceil(periodDays / bucketDays);
  return Array.from({ length: bucketCount }, (_, index) => {
    const end = now - (bucketCount - index - 1) * bucketDays * 86_400_000;
    const start = end - bucketDays * 86_400_000;
    const activeAccounts = new Set(events
      .filter((event) => timestamp(event.occurredAt) > start && timestamp(event.occurredAt) <= end)
      .map((event) => event.accountId));
    return {
      label: new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "short" }).format(new Date(end)),
      registrations: users.filter((user) => user.createdAt > start && user.createdAt <= end).length,
      activity: activeAccounts.size
    };
  });
}

function buildCohorts(users, events, now) {
  const eventsByAccount = new Map();
  events.forEach((event) => {
    const saved = eventsByAccount.get(event.accountId) || [];
    saved.push(timestamp(event.occurredAt));
    eventsByAccount.set(event.accountId, saved);
  });
  return Array.from({ length: 8 }, (_, index) => {
    const weekEnd = now - index * 7 * 86_400_000;
    const weekStart = weekEnd - 7 * 86_400_000;
    const cohort = users.filter((user) => user.createdAt > weekStart && user.createdAt <= weekEnd);
    const retention = (days) => {
      const eligible = cohort.filter((user) => now >= user.createdAt + days * 86_400_000);
      const retained = eligible.filter((user) => {
        const windowStart = user.createdAt + days * 86_400_000;
        const windowEnd = windowStart + 7 * 86_400_000;
        return (eventsByAccount.get(user.id) || []).some((eventAt) => eventAt >= windowStart && eventAt < windowEnd);
      });
      return {
        value: eligible.length ? percent(retained.length, eligible.length) : null,
        eligible: eligible.length
      };
    };
    const day7 = retention(7);
    const day14 = retention(14);
    const day30 = retention(30);
    return {
      label: `−${index} нед.`,
      size: cohort.length,
      day7: day7.value,
      day7Eligible: day7.eligible,
      day14: day14.value,
      day14Eligible: day14.eligible,
      day30: day30.value,
      day30Eligible: day30.eligible
    };
  }).reverse();
}

function buildAnalyticsSnapshot(records, rawEvents, { periodDays = 30, mode = "all", chapterId = "all" } = {}) {
  const now = Date.now();
  const activeSince = now - periodDays * 86_400_000;
  const scopedEvents = rawEvents.filter((event) => (
    (mode === "all" || event.mode === mode)
    && (chapterId === "all" || event.chapterId === chapterId)
  ));
  const events = scopedEvents.filter((event) => timestamp(event.occurredAt) >= activeSince);
  const allUsers = records.map((record) => normalizeAnalyticsRecord(record, now));
  const users = mode === "all" ? allUsers : allUsers.filter((user) => user.mode === mode);
  const latestEventByAccount = new Map();
  events.forEach((event) => {
    latestEventByAccount.set(event.accountId, Math.max(
      latestEventByAccount.get(event.accountId) || 0,
      timestamp(event.occurredAt)
    ));
  });
  users.forEach((user) => {
    user.latestActivity = Math.max(user.latestActivity, latestEventByAccount.get(user.id) || 0);
    user.daysInactive = user.latestActivity ? Math.floor((now - user.latestActivity) / 86_400_000) : null;
  });
  const missionEvents = (chapter, key) => events.filter((event) => (
    event.chapterId === chapter && event.missionKey === key
  ));
  const chapters = chapterMissionDefinitions.map((definition, chapterIndex) => {
    const userChapters = users.map((user) => user.chapters[chapterIndex]);
    const chapterEvents = events.filter((event) => event.chapterId === definition.id);
    const started = new Set(chapterEvents
      .filter((event) => ["mission_started", "answer_checked", "hint_used", "mission_completed"].includes(event.eventType))
      .map((event) => event.accountId)).size;
    const completedMissionKeysByAccount = new Map();
    chapterEvents.filter((event) => event.eventType === "mission_completed").forEach((event) => {
      const completedKeys = completedMissionKeysByAccount.get(event.accountId) || new Set();
      completedKeys.add(event.missionKey);
      completedMissionKeysByAccount.set(event.accountId, completedKeys);
    });
    const completed = [...completedMissionKeysByAccount.values()].filter((keys) => keys.size === definition.keys.length).length;
    const scores = userChapters.reduce((sum, chapter) => sum + chapter.score, 0);
    const attempts = chapterEvents.filter((event) => event.eventType === "answer_checked").length;
    const errors = chapterEvents.filter((event) => event.eventType === "answer_checked" && event.outcome === "failure").length;
    return {
      id: definition.id,
      title: definition.title,
      subtitle: definition.subtitle,
      started,
      completed,
      completionRate: percent(completed, users.length),
      conversionRate: percent(completed, started),
      averageScore: users.length ? round(scores / users.length, 1) : 0,
      attempts,
      averageAttempts: started ? round(attempts / started, 1) : 0,
      errors,
      answerVolume: attempts,
      averageEnergy: round(userChapters.reduce((sum, chapter) => sum + (chapter.energy ?? chapter.maxEnergy), 0) / Math.max(users.length, 1), 1),
      maxEnergy: userChapters[0]?.maxEnergy || 4
    };
  });

  const quests = missionCatalog.map((mission) => {
    const chapterIndex = Number(mission.chapterId.slice(-1)) - 1;
    const missionIndex = (mission.number - 1) % 9;
    const scopedEvents = missionEvents(mission.chapterId, mission.key);
    const started = new Set(scopedEvents
      .filter((event) => ["mission_started", "answer_checked", "hint_used", "mission_completed"].includes(event.eventType))
      .map((event) => event.accountId)).size;
    const completed = new Set(scopedEvents
      .filter((event) => event.eventType === "mission_completed")
      .map((event) => event.accountId)).size;
    const errors = scopedEvents.filter((event) => event.eventType === "answer_checked" && event.outcome === "failure").length;
    const attempts = scopedEvents.filter((event) => event.eventType === "answer_checked").length;
    return {
      ...mission,
      started,
      completed,
      errors,
      attempts,
      completionRate: percent(completed, users.length),
      conversionRate: percent(completed, started),
      dropoffRate: started ? round(100 - percent(completed, started), 1) : 0
    };
  }).filter((mission) => chapterId === "all" || mission.chapterId === chapterId);

  const previousPeriodStart = now - periodDays * 2 * 86_400_000;
  const newUsers = users.filter((user) => user.createdAt >= activeSince).length;
  const previousNewUsers = users.filter((user) => user.createdAt >= previousPeriodStart && user.createdAt < activeSince).length;
  const activeUsers = new Set(events.map((event) => event.accountId)).size;
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
  const eventLabels = {
    session_started: "Начал учебную сессию",
    mission_started: "Открыл задание",
    answer_checked: "Проверил решение",
    hint_used: "Использовал подсказку",
    mission_completed: "Завершил задание",
    chapter_reset: "Сбросил прогресс карты"
  };
  const recentActivity = [...events]
    .sort((left, right) => timestamp(right.occurredAt) - timestamp(left.occurredAt))
    .slice(0, 10)
    .map((event) => ({
      id: event.id,
      name: event.displayName,
      at: new Date(event.occurredAt).toISOString(),
      progress: users.find((user) => user.id === event.accountId)?.progressPercent || 0,
      action: `${eventLabels[event.eventType] || event.eventType}${event.missionKey ? ` · ${event.missionKey}` : ""}`
    }));

  return {
    meta: {
      generatedAt: new Date(now).toISOString(),
      periodDays,
      mode,
      chapterId,
      widgets: 30,
      source: getDatabasePool() ? "postgres" : "memory",
      eventCount: events.length,
      telemetryWindowStartedAt: new Date(activeSince).toISOString()
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
    timeline: buildTimeline(users, events, periodDays, now),
    modes: [
      { id: "progression", label: "Прохождение", value: progressionUsers.length, averageProgress: progressionUsers.length ? round(progressionUsers.reduce((sum, user) => sum + user.progressPercent, 0) / progressionUsers.length, 1) : 0 },
      { id: "study", label: "Изучение", value: studyUsers.length, averageProgress: studyUsers.length ? round(studyUsers.reduce((sum, user) => sum + user.progressPercent, 0) / studyUsers.length, 1) : 0 }
    ],
    status,
    attention,
    recency,
    cohorts: buildCohorts(users, scopedEvents, now),
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
      { label: "Есть события за период", value: percent(new Set(events.map((event) => event.accountId)).size, users.length) },
      { label: "Есть старты заданий", value: percent(new Set(events.filter((event) => event.eventType === "mission_started").map((event) => event.accountId)).size, users.length) },
      { label: "Есть проверки ответов", value: percent(new Set(events.filter((event) => event.eventType === "answer_checked").map((event) => event.accountId)).size, users.length) }
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
  const store = getAccountStore();
  const [records, events] = await Promise.all([
    store.getAnalyticsRecords(),
    store.getAnalyticsEvents(new Date(Date.now() - 90 * 86_400_000).toISOString())
  ]);
  json(response, 200, buildAnalyticsSnapshot(records, events, { periodDays, mode, chapterId }));
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
  const termsAccepted = body.termsAccepted === true;
  const privacyAccepted = body.privacyAccepted === true;
  if (!email || !displayName || !validatePassword(password) || !mode || !termsAccepted || !privacyAccepted) {
    recordAuthFailure(request);
    json(response, 400, { error: "Invalid registration data" });
    return;
  }

  try {
    const verificationRequired = process.env.REQUIRE_EMAIL_VERIFICATION === "true";
    const acceptedAt = new Date().toISOString();
    const account = await getAccountStore().createAccount({
      id: randomUUID(),
      email,
      displayName,
      passwordHash: await hashPassword(password),
      mode,
      emailVerifiedAt: verificationRequired ? null : acceptedAt,
      termsAcceptedAt: acceptedAt,
      privacyAcceptedAt: acceptedAt,
      policyVersion: process.env.POLICY_VERSION || "draft-2026-07-23"
    });
    if (verificationRequired) {
      try {
        await createLifecycleToken(account, "verify_email");
      } catch (error) {
        await getAccountStore().deleteAccount(account.id);
        throw error;
      }
    } else {
      await issueSession(request, response, account.id);
    }
    clearAuthFailures(request);
    json(response, 201, { account: publicAccount(account), verificationRequired });
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

  if (process.env.REQUIRE_EMAIL_VERIFICATION === "true" && !account.emailVerifiedAt) {
    recordAuthFailure(request);
    json(response, 403, { error: "Email verification is required", code: "email_verification_required" });
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

async function handleEmailVerification(request, response) {
  const body = await readJsonBody(request);
  const rawToken = typeof body.token === "string" ? body.token.slice(0, 128) : "";
  if (!rawToken) {
    json(response, 400, { error: "Verification token is required" });
    return;
  }
  const token = await getAccountStore().consumeAccountToken(
    lifecycleTokenHash(rawToken),
    ["verify_email", "change_email"]
  );
  if (!token) {
    json(response, 400, { error: "Verification token is invalid or expired" });
    return;
  }
  const nextEmail = token.purpose === "change_email" ? normalizeEmail(token.payload?.email) : null;
  if (token.purpose === "change_email" && !nextEmail) {
    json(response, 400, { error: "Verification token is invalid" });
    return;
  }
  try {
    const account = await getAccountStore().markEmailVerified(token.accountId, nextEmail);
    if (!account) {
      json(response, 404, { error: "Account not found" });
      return;
    }
    await getAccountStore().deleteSessionsForAccount(account.id);
    json(response, 200, { ok: true, email: account.email });
  } catch (error) {
    if (error.code === "23505") {
      json(response, 409, { error: "Email is already registered" });
      return;
    }
    throw error;
  }
}

async function handlePasswordResetRequest(request, response) {
  if (rejectRateLimitedAuth(request, response)) return;
  const body = await readJsonBody(request);
  const email = normalizeEmail(body.email);
  const account = email ? await getAccountStore().findAccountByEmail(email) : null;
  if (account) {
    try {
      await createLifecycleToken(account, "reset_password");
    } catch (error) {
      console.error("Password reset delivery failed", error);
    }
  }
  json(response, 202, { ok: true });
}

async function handlePasswordResetConfirm(request, response) {
  if (rejectRateLimitedAuth(request, response)) return;
  const body = await readJsonBody(request);
  const rawToken = typeof body.token === "string" ? body.token.slice(0, 128) : "";
  const password = body.password;
  if (!rawToken || !validatePassword(password)) {
    json(response, 400, { error: "Invalid password reset data" });
    return;
  }
  const token = await getAccountStore().consumeAccountToken(
    lifecycleTokenHash(rawToken),
    ["reset_password"]
  );
  if (!token) {
    json(response, 400, { error: "Password reset token is invalid or expired" });
    return;
  }
  await getAccountStore().updatePassword(token.accountId, await hashPassword(password));
  await getAccountStore().deleteSessionsForAccount(token.accountId);
  clearAuthFailures(request);
  json(response, 200, { ok: true });
}

async function handlePasswordChange(request, response) {
  const account = await requireAuthenticatedAccount(request, response);
  if (!account) return;
  const body = await readJsonBody(request);
  const currentPassword = body.currentPassword;
  const nextPassword = body.nextPassword;
  if (
    !validatePassword(currentPassword)
    || !validatePassword(nextPassword)
    || !(await verifyPassword(currentPassword, account.passwordHash))
  ) {
    json(response, 400, { error: "Current password is invalid" });
    return;
  }
  await getAccountStore().updatePassword(account.id, await hashPassword(nextPassword));
  await getAccountStore().deleteSessionsForAccount(account.id);
  clearSessionCookies(response);
  json(response, 200, { ok: true });
}

async function handleEmailChange(request, response) {
  const account = await requireAuthenticatedAccount(request, response);
  if (!account) return;
  const body = await readJsonBody(request);
  const nextEmail = normalizeEmail(body.email);
  if (!nextEmail || nextEmail === account.email) {
    json(response, 400, { error: "A different valid email is required" });
    return;
  }
  if (await getAccountStore().findAccountByEmail(nextEmail)) {
    json(response, 409, { error: "Email is already registered" });
    return;
  }
  try {
    const delivered = await createLifecycleToken(account, "change_email", { email: nextEmail });
    if (!delivered) {
      json(response, 503, { error: "Email delivery is not configured" });
      return;
    }
    json(response, 202, { ok: true });
  } catch (error) {
    console.error("Email change delivery failed", error);
    json(response, 503, { error: "Email delivery is unavailable" });
  }
}

async function handleAccountExport(request, response) {
  const account = await requireAuthenticatedAccount(request, response);
  if (!account) return;
  const exported = await getAccountStore().getAccountExport(account.id);
  if (!exported) {
    json(response, 404, { error: "Account not found" });
    return;
  }
  const safeAccount = publicAccount(exported.account);
  const body = JSON.stringify({
    exportedAt: new Date().toISOString(),
    account: safeAccount,
    progress: exported.progress,
    events: exported.events
  }, null, 2);
  response.writeHead(200, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Disposition": `attachment; filename="bpmsoft-quest-export-${account.id}.json"`,
    "Cache-Control": "no-store",
    "Content-Length": Buffer.byteLength(body)
  });
  response.end(body);
}

async function handleAccountDeletion(request, response) {
  const account = await requireAuthenticatedAccount(request, response);
  if (!account) return;
  const body = await readJsonBody(request);
  const password = body.password;
  if (!validatePassword(password) || !(await verifyPassword(password, account.passwordHash))) {
    json(response, 400, { error: "Password confirmation is invalid" });
    return;
  }
  await getAccountStore().deleteAccount(account.id);
  clearSessionCookies(response);
  json(response, 200, { ok: true });
}

async function handleAccountEvents(request, response) {
  const account = await requireAuthenticatedAccount(request, response);
  if (!account) return;
  const body = await readJsonBody(request);
  const rawEvents = Array.isArray(body.events) ? body.events.slice(0, 50) : [];
  if (!rawEvents.length) {
    json(response, 400, { error: "At least one learning event is required" });
    return;
  }
  const now = Date.now();
  const events = rawEvents.map((event) => sanitizeLearningEvent(event, now));
  if (events.some((event) => event === null)) {
    json(response, 400, { error: "Invalid learning event" });
    return;
  }
  const inserted = await getAccountStore().recordLearningEvents(account.id, events);
  json(response, 202, { accepted: events.length, inserted });
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
    const revision = Number(body.revision);
    if (!Number.isSafeInteger(revision) || revision < 0) {
      json(response, 400, { error: "A non-negative progress revision is required" });
      return;
    }
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
    const result = await store.saveProgress(account.id, chapter, state, score, revision);
    if (result.conflict) {
      json(response, 409, { error: "Progress revision conflict", progress: result.progress });
      return;
    }
    json(response, 200, { ok: true, progress: result.progress });
    return;
  }

  if (request.method === "DELETE") {
    const progress = await store.resetProgress(account.id, chapter);
    json(response, 200, { ok: true, progress });
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

  const requestedPath = decodedPath.replace(/^\/+/, "");
  const isUpdateVariant = requestedPath === "update";
  if (decodedPath === "/update/") {
    response.writeHead(308, { Location: "/update" });
    response.end();
    return;
  }
  const relativePath = decodedPath === "/"
    ? "landing.html"
    : requestedPath === "academy.html" || requestedPath === "update"
      ? "index.html"
      : requestedPath;
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
    if (relativePath === "index.html" && isUpdateVariant) {
      const template = await readFile(filePath, "utf8");
      const body = template
        .replace("<html lang=\"ru\">", "<html lang=\"ru\" class=\"visual-update\">")
        .replace(
          "</head>",
          "  <link rel=\"stylesheet\" href=\"/update.css?v=20260723-polish-2\">\n</head>"
        );
      response.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
        "Content-Length": Buffer.byteLength(body)
      });
      if (request.method === "HEAD") response.end();
      else response.end(body);
      return;
    }
    if (relativePath === "privacy.html" || relativePath === "terms.html") {
      const template = await readFile(path.resolve(ROOT_DIR, relativePath), "utf8");
      const legalValues = {
        LEGAL_ENTITY_NAME: process.env.LEGAL_ENTITY_NAME || "Оператор не указан — публичный запуск запрещён",
        PRIVACY_CONTACT_EMAIL: process.env.PRIVACY_CONTACT_EMAIL || "privacy@example.invalid",
        LEGAL_JURISDICTION: process.env.LEGAL_JURISDICTION || "не указана",
        POLICY_VERSION: process.env.POLICY_VERSION || "draft-2026-07-23"
      };
      const escapeHtml = (value) => String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;");
      const body = template.replace(/\{\{([A-Z_]+)\}\}/g, (_, key) => escapeHtml(legalValues[key] || ""));
      response.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
        "Content-Length": Buffer.byteLength(body)
      });
      if (request.method === "HEAD") response.end();
      else response.end(body);
      return;
    }
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
    const requestId = randomUUID();
    const startedAt = process.hrtime.bigint();
    let pathnameForLog = "/";
    operationalMetrics.activeRequests += 1;
    response.setHeader("X-Request-ID", requestId);
    response.once("finish", () => {
      operationalMetrics.activeRequests = Math.max(0, operationalMetrics.activeRequests - 1);
      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
      recordRequestMetric(request.method || "UNKNOWN", pathnameForLog, response.statusCode, durationMs);
      if (process.env.LOG_FORMAT === "json" || process.env.NODE_ENV === "production") {
        console.log(JSON.stringify({
          level: response.statusCode >= 500 ? "error" : response.statusCode >= 400 ? "warn" : "info",
          type: "http_request",
          requestId,
          method: request.method,
          path: metricRoute(pathnameForLog),
          status: response.statusCode,
          durationMs: Math.round(durationMs * 100) / 100,
          clientAddress: getClientAddress(request)
        }));
      }
    });

    try {
      const url = new URL(request.url || "/", "http://localhost");
      pathnameForLog = url.pathname;
      if (
        url.pathname.startsWith("/api/")
        && ["POST", "PUT", "PATCH", "DELETE"].includes(request.method || "")
        && !hasTrustedMutationOrigin(request)
      ) {
        json(response, 403, { error: "Untrusted request origin" });
        return;
      }

      if (url.pathname === "/health" && request.method === "GET") {
        await handleHealth(response);
        return;
      }

      if (url.pathname === "/ready" && request.method === "GET") {
        await handleHealth(response);
        return;
      }

      if (url.pathname === "/metrics" && request.method === "GET") {
        handleMetrics(request, response);
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

      if (url.pathname === "/api/auth/verify-email" && request.method === "POST") {
        await handleEmailVerification(request, response);
        return;
      }

      if (url.pathname === "/api/auth/password-reset/request" && request.method === "POST") {
        await handlePasswordResetRequest(request, response);
        return;
      }

      if (url.pathname === "/api/auth/password-reset/confirm" && request.method === "POST") {
        await handlePasswordResetConfirm(request, response);
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

      if (url.pathname === "/api/auth/password" && request.method === "PUT") {
        await handlePasswordChange(request, response);
        return;
      }

      if (url.pathname === "/api/auth/email-change" && request.method === "POST") {
        await handleEmailChange(request, response);
        return;
      }

      if (url.pathname === "/api/account/export" && request.method === "GET") {
        await handleAccountExport(request, response);
        return;
      }

      if (url.pathname === "/api/account" && request.method === "DELETE") {
        await handleAccountDeletion(request, response);
        return;
      }

      if (url.pathname === "/api/account/events" && request.method === "POST") {
        await handleAccountEvents(request, response);
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
  validateProductionConfiguration();
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
