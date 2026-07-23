const ADMIN_SESSION_KEY = "bpmsoft-quest-admin";
const CHAPTERS = [
  { id: "chapter1", title: "Академия", subtitle: "Базовый курс" },
  { id: "chapter2", title: "Медные машины", subtitle: "Первый проект" },
  { id: "chapter3", title: "Семь дорог", subtitle: "Развитие CRM" },
  { id: "chapter4", title: "Золотая полка", subtitle: "Трансформация" },
  { id: "chapter5", title: "Гуд Авиа", subtitle: "Операционная устойчивость" }
];
const QUEST_TITLES = [
  "Навигация менеджера", "Основы модели данных", "Права отдела продаж", "Обработка входящего письма", "Жизненный цикл заявки", "Приём заявок с портала", "Панель руководителя", "Оценка требований", "Служба обработки обращений",
  "Импорт производственных заказов", "Дилерский портал", "Интеграция с перевозчиком", "Согласование заказов", "Пакеты и зависимости", "Аудит изменений", "Изменения и релизы", "ML и LLM в аналитике", "Приёмка релиза",
  "Дубли в клиентской базе", "Квалификация лидов", "История коммуникаций", "Исполняемый BPMN", "Контроль SLA", "Сотрудники и портал", "Обмен с ERP", "AI и качество", "CRM-центр компетенций",
  "Мастер-данные покупателя", "Согласия по каналам", "Аудитория кампании", "Портал франчайзи", "Омниканальный заказ", "Остатки и резервы", "Возвраты и компенсации", "Метрики и качество", "Сквозная приёмка",
  "Версия и идентичность рейса", "Время, зоны и SLA", "Идемпотентность багажа", "Один кейс ситуации", "Автоматизация и ответственность", "Права партнёров", "Корреляция и неизвестный исход", "AI под контролем качества", "Кризисная приёмка"
];
const TAB_TITLES = {
  overview: "Сводка Академии",
  users: "Пользователи",
  quests: "Прохождение квестов",
  quality: "Качество обучения",
  engagement: "Вовлечённость"
};

const elements = {
  auth: document.getElementById("admin-auth"),
  authForm: document.getElementById("admin-auth-form"),
  password: document.getElementById("admin-password"),
  authError: document.getElementById("auth-error"),
  authSubmit: document.getElementById("auth-submit"),
  sidebar: document.getElementById("admin-sidebar"),
  menuToggle: document.getElementById("menu-toggle"),
  pageTitle: document.getElementById("page-title"),
  dataSource: document.getElementById("data-source"),
  lastUpdated: document.getElementById("last-updated"),
  refresh: document.getElementById("refresh-data"),
  logout: document.getElementById("admin-logout"),
  period: document.getElementById("period-filter"),
  chapter: document.getElementById("chapter-filter"),
  mode: document.getElementById("mode-filter"),
  search: document.getElementById("user-search"),
  demoBanner: document.getElementById("demo-banner"),
  showEmpty: document.getElementById("show-empty-data"),
  loading: document.getElementById("dashboard-loading"),
  error: document.getElementById("dashboard-error"),
  retry: document.getElementById("retry-data")
};

let currentSnapshot = null;
let liveSnapshot = null;
let allowDemo = false;

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatNumber(value) {
  return new Intl.NumberFormat("ru-RU").format(Number(value) || 0);
}

function formatPercent(value) {
  return `${Math.round(Number(value) || 0)}%`;
}

function formatOptionalPercent(value) {
  return value == null ? "—" : formatPercent(value);
}

function formatDate(value, withTime = false) {
  if (!value) return "—";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "—";
  return new Intl.DateTimeFormat("ru-RU", withTime
    ? { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }
    : { day: "2-digit", month: "short", year: "numeric" }).format(date);
}

function initials(name) {
  return String(name || "?").split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

function emptyState(title = "Данных пока нет", copy = "Показатель появится после первых действий пользователей.") {
  return `<div class="empty-state"><strong>${escapeHtml(title)}</strong><span>${escapeHtml(copy)}</span></div>`;
}

function setHtml(id, html) {
  const target = document.getElementById(id);
  if (target) target.innerHTML = html;
}

function seeded(index, min, max) {
  const noise = (Math.sin(index * 12.9898) + 1) / 2;
  return Math.round(min + noise * (max - min));
}

function makeDemoSnapshot() {
  const periodDays = Number(elements.period.value) || 30;
  const mode = elements.mode.value;
  const chapterId = elements.chapter.value;
  const totalUsers = mode === "progression" ? 315 : mode === "study" ? 69 : 384;
  const modeFactor = totalUsers / 384;
  const pointCount = Math.min(30, periodDays);
  const now = Date.now();
  const timeline = Array.from({ length: pointCount }, (_, index) => {
    const date = new Date(now - (pointCount - index - 1) * Math.ceil(periodDays / pointCount) * 86_400_000);
    return {
      label: new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "short" }).format(date),
      registrations: Math.round(seeded(index, 2, 15) * modeFactor),
      activity: Math.round(seeded(index + 41, 24, 88) * modeFactor)
    };
  });
  const quests = QUEST_TITLES.map((title, index) => {
    const chapterIndex = Math.floor(index / 9);
    const withinChapter = index % 9;
    const reach = [0.96, 0.79, 0.61, 0.47, 0.34][chapterIndex] - withinChapter * 0.025;
    const started = Math.max(4, Math.round(totalUsers * reach));
    const conversionRate = Math.max(44, Math.min(96, 91 - withinChapter * 2.2 - chapterIndex * 3 + seeded(index, -5, 5)));
    const completed = Math.round(started * conversionRate / 100);
    return {
      number: index + 1,
      chapterId: `chapter${chapterIndex + 1}`,
      chapterTitle: CHAPTERS[chapterIndex].title,
      title,
      started,
      completed,
      errors: Math.round(seeded(index + 90, 5, 61) * modeFactor),
      completionRate: Math.round(completed / totalUsers * 1000) / 10,
      conversionRate: Math.round(conversionRate * 10) / 10,
      dropoffRate: Math.round((100 - conversionRate) * 10) / 10
    };
  }).filter((quest) => chapterId === "all" || quest.chapterId === chapterId);
  const allQuestValues = QUEST_TITLES.map((_, index) => {
    const chapterIndex = Math.floor(index / 9);
    const withinChapter = index % 9;
    return Math.max(0, Math.round(totalUsers * ([0.96, 0.79, 0.61, 0.47, 0.34][chapterIndex] - withinChapter * 0.025) * 0.82));
  });
  const chapters = CHAPTERS.map((chapter, index) => {
    const started = Math.round(totalUsers * [0.96, 0.79, 0.61, 0.47, 0.34][index]);
    const completed = Math.round(totalUsers * [0.67, 0.51, 0.36, 0.24, 0.14][index]);
    return {
      ...chapter,
      started,
      completed,
      completionRate: Math.round(completed / totalUsers * 1000) / 10,
      conversionRate: Math.round(completed / started * 1000) / 10,
      averageScore: [7.5, 6.1, 4.8, 3.6, 2.8][index],
      attempts: Math.round([512, 427, 338, 241, 186][index] * modeFactor),
      averageAttempts: [1.5, 1.7, 1.9, 2.1, 2.4][index],
      errors: Math.round([118, 169, 207, 244, 286][index] * modeFactor),
      answerVolume: Math.round([2240, 3180, 2890, 1760, 2210][index] * modeFactor),
      averageEnergy: [2.5, 2.1, 2.7, 2.3, 2.0][index],
      maxEnergy: index < 2 ? 3 : 4
    };
  });
  const demoPeople = [
    ["Анна Романова", "a.romanova@example.ru"], ["Илья Соколов", "i.sokolov@example.ru"],
    ["Мария Волкова", "m.volkova@example.ru"], ["Алексей Орлов", "a.orlov@example.ru"],
    ["Дарья Белова", "d.belova@example.ru"], ["Павел Морозов", "p.morozov@example.ru"],
    ["Елена Котова", "e.kotova@example.ru"], ["Никита Лебедев", "n.lebedev@example.ru"],
    ["Софья Фролова", "s.frolova@example.ru"], ["Максим Егоров", "m.egorov@example.ru"],
    ["Полина Крылова", "p.krylova@example.ru"], ["Роман Власов", "r.vlasov@example.ru"],
    ["Вера Попова", "v.popova@example.ru"], ["Степан Жуков", "s.zhukov@example.ru"]
  ];
  const directory = demoPeople.map(([name, email], index) => {
    const personMode = index % 6 === 5 ? "study" : "progression";
    const score = Math.max(0, 45 - index * 2 - seeded(index, 0, 5));
    const daysAgo = seeded(index + 13, 0, 38);
    return {
      id: `demo-${index}`,
      name,
      email,
      mode: personMode,
      createdAt: new Date(now - (index + 2) * 5 * 86_400_000).toISOString(),
      lastActivityAt: new Date(now - daysAgo * 86_400_000).toISOString(),
      progress: Math.round(score / 45 * 1000) / 10,
      score,
      status: score === 45 ? "Выпускник" : daysAgo >= 30 ? "Неактивен" : daysAgo >= 14 ? "Риск" : "Учится"
    };
  }).filter((person) => mode === "all" || person.mode === mode);
  const leaderboard = [...directory].sort((a, b) => b.score - a.score).slice(0, 10);
  const attention = [...directory].sort((a, b) => a.score - b.score).slice(0, 6).map((person, index) => ({
    id: person.id,
    name: person.name,
    email: person.email,
    progress: person.progress,
    daysInactive: 9 + index * 5,
    wrongCount: seeded(index, 1, 8),
    reason: index > 3 ? "Давно не заходил" : index > 1 ? "Теряет темп" : "Есть затруднения"
  }));
  const progression = mode === "progression" ? totalUsers : mode === "study" ? 0 : 315;
  const study = mode === "study" ? totalUsers : mode === "progression" ? 0 : 69;
  const completedUsers = Math.round(totalUsers * 0.24);
  return {
    meta: { generatedAt: new Date().toISOString(), periodDays, mode, chapterId, widgets: 30, source: "demo" },
    summary: {
      totalUsers,
      newUsers: Math.round((periodDays === 7 ? 28 : periodDays === 30 ? 96 : 214) * modeFactor),
      newUsersGrowth: 18.4,
      activeUsers: Math.round(totalUsers * (periodDays === 7 ? 0.42 : periodDays === 30 ? 0.71 : 0.88)),
      activeRate: periodDays === 7 ? 42 : periodDays === 30 ? 71 : 88,
      completedUsers,
      completionRate: 24,
      averageProgress: mode === "study" ? 17.6 : 46.8,
      averageErrors: 2.7
    },
    timeline,
    modes: [
      { id: "progression", label: "Прохождение", value: progression, averageProgress: 46.8 },
      { id: "study", label: "Изучение", value: study, averageProgress: 17.6 }
    ],
    status: {
      new: Math.round(totalUsers * 0.09), active: Math.round(totalUsers * 0.52), champions: completedUsers,
      atRisk: Math.round(totalUsers * 0.12), inactive: Math.round(totalUsers * 0.15)
    },
    attention,
    recency: [
      { label: "Сегодня", value: Math.round(totalUsers * 0.18) },
      { label: "1–7 дней", value: Math.round(totalUsers * 0.34) },
      { label: "8–30 дней", value: Math.round(totalUsers * 0.33) },
      { label: "> 30 дней", value: Math.round(totalUsers * 0.15) }
    ],
    cohorts: Array.from({ length: 8 }, (_, index) => ({
      label: `−${7 - index} нед.`, size: Math.round((28 + seeded(index, 0, 25)) * modeFactor),
      day7: 76 - index * 2 + seeded(index, -3, 3), day14: 61 - index * 1.5 + seeded(index + 20, -3, 3), day30: 43 - index + seeded(index + 40, -3, 3)
    })),
    leaderboard,
    directory,
    chapters,
    quests,
    scoreDistribution: [
      { label: "0", value: Math.round(totalUsers * 0.08) }, { label: "1–9", value: Math.round(totalUsers * 0.18) },
      { label: "10–18", value: Math.round(totalUsers * 0.2) }, { label: "19–27", value: Math.round(totalUsers * 0.18) },
      { label: "28–36", value: Math.round(totalUsers * 0.12) }, { label: "37–44", value: Math.round(totalUsers * 0.08) }, { label: "45", value: completedUsers }
    ],
    journey: [
      { label: "Зарегистрировались", value: totalUsers }, { label: "Академия", value: Math.round(totalUsers * 0.96) },
      { label: "Медные машины", value: Math.round(totalUsers * 0.79) }, { label: "Семь дорог", value: Math.round(totalUsers * 0.61) },
      { label: "Золотая полка", value: Math.round(totalUsers * 0.47) }, { label: "Гуд Авиа", value: Math.round(totalUsers * 0.34) }, { label: "Завершили путь", value: completedUsers }
    ],
    completionSegments: [
      { label: "Не приступили", value: Math.round(totalUsers * 0.08) },
      { label: "В процессе", value: totalUsers - completedUsers - Math.round(totalUsers * 0.08) },
      { label: "Завершили", value: completedUsers }
    ],
    recentActivity: directory.slice(0, 9).map((person, index) => ({
      id: person.id, name: person.name, at: new Date(now - index * 38 * 60_000).toISOString(),
      progress: person.progress, action: person.score === 45 ? "Завершил обучение" : `Прогресс: ${person.score} из 45`
    })),
    telemetry: [
      { label: "Профиль заполнен", value: 100 }, { label: "Есть вход", value: 94 },
      { label: "Есть прогресс", value: 92 }, { label: "Есть ответы", value: 81 }
    ],
    _demoAllQuestValues: allQuestValues
  };
}

function renderSummary(data) {
  const metrics = [
    ["Всего игроков", formatNumber(data.summary.totalUsers), `${formatNumber(data.summary.newUsers)} новых за период`, data.summary.newUsersGrowth >= 0],
    ["Активны", formatNumber(data.summary.activeUsers), `${formatPercent(data.summary.activeRate)} аудитории`, true],
    ["Средний прогресс", formatPercent(data.summary.averageProgress), "из 45 квестов", true],
    ["Выпускники", formatNumber(data.summary.completedUsers), `${formatPercent(data.summary.completionRate)} завершили путь`, true]
  ];
  setHtml("summary-kpis", metrics.map(([label, value, copy, positive]) => `
    <div class="kpi-item"><span>${label}</span><strong>${value}</strong><small class="${positive ? "is-positive" : ""}">${copy}</small></div>`).join(""));
  document.getElementById("pulse-caption").textContent = `За ${data.meta.periodDays} дней`;
}

function renderLineChart(data) {
  const points = data.timeline || [];
  if (!points.length) {
    setHtml("activity-chart", emptyState());
    return;
  }
  const width = 1000;
  const height = 190;
  const max = Math.max(1, ...points.flatMap((point) => [point.activity, point.registrations]));
  const coordinates = (key) => points.map((point, index) => {
    const x = points.length === 1 ? width / 2 : index / (points.length - 1) * width;
    const y = height - (point[key] / max) * (height - 20);
    return [x, y];
  });
  const path = (coords) => coords.map(([x, y], index) => `${index ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = (coords) => `${path(coords)} L${width},${height} L0,${height} Z`;
  const activity = coordinates("activity");
  const registrations = coordinates("registrations");
  const labels = points.filter((_, index) => index === 0 || index === points.length - 1 || index % Math.max(1, Math.floor(points.length / 4)) === 0);
  setHtml("activity-chart", `
    <svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" role="img" aria-label="Динамика активности и регистраций">
      <defs><linearGradient id="activity-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7856ff" stop-opacity=".28"/><stop offset="1" stop-color="#7856ff" stop-opacity="0"/></linearGradient></defs>
      <g class="line-chart-grid"><line x1="0" y1="20" x2="1000" y2="20"/><line x1="0" y1="105" x2="1000" y2="105"/><line x1="0" y1="189" x2="1000" y2="189"/></g>
      <path d="${area(activity)}" fill="url(#activity-fill)"/>
      <path d="${path(activity)}" fill="none" stroke="#7856ff" stroke-width="6" vector-effect="non-scaling-stroke" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="${path(registrations)}" fill="none" stroke="#fe5500" stroke-width="4" vector-effect="non-scaling-stroke" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
    <div class="line-chart-labels">${labels.map((point) => `<span>${escapeHtml(point.label)}</span>`).join("")}</div>`);
}

function trackRows(items, { color = "", valueKey = "value", suffix = "" } = {}) {
  const max = Math.max(1, ...items.map((item) => Number(item[valueKey]) || 0));
  return items.map((item) => `
    <div class="horizontal-bar-row"><div><span>${escapeHtml(item.label)}</span><strong>${formatNumber(item[valueKey])}${suffix}</strong></div>
      <div class="track ${color}"><span style="width:${Math.max(2, Number(item[valueKey]) / max * 100)}%"></span></div></div>`).join("");
}

function renderOverview(data) {
  renderSummary(data);
  renderLineChart(data);
  const journey = data.journey || [];
  const first = Math.max(1, journey[0]?.value || 0);
  setHtml("learning-funnel", journey.map((item, index) => `
    <div class="funnel-row"><div><span>${escapeHtml(item.label)}</span><strong>${formatNumber(item.value)}</strong></div>
      <div class="track ${index === journey.length - 1 ? "is-orange" : ""}"><span style="width:${item.value / first * 100}%"></span></div></div>`).join("") || emptyState());
  renderDonut("mode-distribution", data.modes || [], "игроков");
  const statuses = [
    { label: "Новые", value: data.status.new }, { label: "Активные", value: data.status.active },
    { label: "Выпускники", value: data.status.champions }, { label: "В зоне риска", value: data.status.atRisk },
    { label: "Неактивные", value: data.status.inactive }
  ];
  setHtml("status-segments", trackRows(statuses));
  setHtml("attention-list", data.attention?.length ? data.attention.map((person) => `
    <div class="person-row"><span class="avatar">${escapeHtml(initials(person.name))}</span><div><strong>${escapeHtml(person.name)}</strong><small>${escapeHtml(person.email)} · ${formatPercent(person.progress)}</small></div><span class="status-pill is-risk">${escapeHtml(person.reason)}</span></div>`).join("") : emptyState("Очередь пуста", "Сейчас нет игроков, которым требуется внимание."));
}

function renderDonut(id, items, centerLabel) {
  const total = items.reduce((sum, item) => sum + (Number(item.value) || 0), 0);
  if (!items.length || !total) {
    setHtml(id, emptyState());
    return;
  }
  const firstShare = items[0].value / total * 100;
  const colors = ["#7856ff", "#fe5500", "#00c1d4"];
  let cursor = 0;
  const stops = items.map((item, index) => {
    const start = cursor;
    cursor += item.value / total * 100;
    return `${colors[index % colors.length]} ${start}% ${cursor}%`;
  }).join(", ");
  setHtml(id, `<div class="donut" style="--value:${firstShare}%;background:conic-gradient(${stops})"><strong>${formatNumber(total)}</strong><span>${escapeHtml(centerLabel)}</span></div>
    <div class="donut-legend">${items.map((item, index) => `<div><i style="background:${colors[index % colors.length]}"></i><span>${escapeHtml(item.label)}</span><strong>${formatNumber(item.value)}</strong></div>`).join("")}</div>`);
}

function renderUsers(data) {
  const registrations = data.timeline || [];
  const maxRegistrations = Math.max(1, ...registrations.map((point) => point.registrations));
  setHtml("registration-chart", registrations.length ? registrations.map((point, index) => `
    <div class="bar-column"><div data-value="${point.registrations}" style="height:${Math.max(2, point.registrations / maxRegistrations * 100)}%"></div><span>${index % Math.max(1, Math.ceil(registrations.length / 10)) === 0 ? escapeHtml(point.label) : ""}</span></div>`).join("") : emptyState());
  setHtml("recency-chart", trackRows(data.recency || []));
  setHtml("cohort-table", data.cohorts?.length ? `<table class="data-table"><thead><tr><th>Когорта</th><th>Размер</th><th>D7</th><th>D14</th><th>D30</th></tr></thead><tbody>${data.cohorts.map((cohort) => `
    <tr><td><strong>${escapeHtml(cohort.label)}</strong></td><td>${formatNumber(cohort.size)}</td><td class="cohort-cell" style="--heat:${cohort.day7 || 0}">${formatOptionalPercent(cohort.day7)}</td><td class="cohort-cell" style="--heat:${cohort.day14 || 0}">${formatOptionalPercent(cohort.day14)}</td><td class="cohort-cell" style="--heat:${cohort.day30 || 0}">${formatOptionalPercent(cohort.day30)}</td></tr>`).join("")}</tbody></table>` : emptyState());
  setHtml("mode-progress", data.modes?.length ? data.modes.map((mode, index) => `
    <div class="comparison-row"><div><span>${escapeHtml(mode.label)}</span><strong>${formatPercent(mode.averageProgress)}</strong></div><div class="track ${index ? "is-orange" : ""}"><span style="width:${mode.averageProgress}%"></span></div><small>${formatNumber(mode.value)} игроков</small></div>`).join("") : emptyState());
  setHtml("leaderboard", data.leaderboard?.length ? data.leaderboard.map((person, index) => `
    <div class="leader-row"><span class="rank-number">${index + 1}</span><div><strong>${escapeHtml(person.name)}</strong><small>${escapeHtml(person.email)}</small></div><strong>${person.score}/45</strong></div>`).join("") : emptyState());
  renderDirectory(data);
}

function renderDirectory(data = currentSnapshot) {
  const rawQuery = elements.search.value.trim().toLocaleLowerCase("ru");
  const directory = (data?.directory || []).filter((person) => !rawQuery || `${person.name} ${person.email}`.toLocaleLowerCase("ru").includes(rawQuery));
  document.getElementById("directory-count").textContent = `${formatNumber(directory.length)} записей`;
  const statusClass = (status) => status === "Выпускник" ? "is-success" : status === "Риск" ? "is-risk" : status === "Неактивен" ? "is-muted" : "";
  setHtml("user-directory", directory.length ? `<table class="data-table"><thead><tr><th>Пользователь</th><th>Режим</th><th>Статус</th><th>Прогресс</th><th>Регистрация</th><th>Активность</th></tr></thead><tbody>${directory.map((person) => `
    <tr><td><strong>${escapeHtml(person.name)}</strong><br><small>${escapeHtml(person.email)}</small></td><td>${person.mode === "study" ? "Изучение" : "Прохождение"}</td><td><span class="status-pill ${statusClass(person.status)}">${escapeHtml(person.status)}</span></td><td><div class="progress-cell"><div class="track"><span style="width:${person.progress}%"></span></div><strong>${formatPercent(person.progress)}</strong></div></td><td>${formatDate(person.createdAt)}</td><td>${formatDate(person.lastActivityAt, true)}</td></tr>`).join("")}</tbody></table>` : emptyState(rawQuery ? "Ничего не найдено" : "Пользователей пока нет", rawQuery ? "Попробуйте изменить поисковый запрос." : "Зарегистрированные игроки появятся в этом реестре."));
}

function renderQuests(data) {
  const quests = data.quests || [];
  setHtml("quest-matrix", quests.length ? quests.map((quest) => `<div class="quest-cell" style="--heat:${quest.completionRate}" title="${escapeHtml(quest.title)}"><span>Квест ${String(quest.number).padStart(2, "0")}</span><strong>${formatPercent(quest.completionRate)}</strong><small>${escapeHtml(quest.title)}</small></div>`).join("") : emptyState());
  setHtml("quest-conversion", quests.length ? quests.map((quest) => `
    <div class="ranked-bar-row"><span>${String(quest.number).padStart(2, "0")}</span><div><strong>${escapeHtml(quest.title)}</strong><div class="track"><span style="width:${quest.conversionRate}%"></span></div></div><strong>${formatPercent(quest.conversionRate)}</strong></div>`).join("") : emptyState());
  setHtml("chapter-completion", data.chapters?.map((chapter) => `<div class="chapter-ring" style="--value:${chapter.completionRate}"><strong>${formatPercent(chapter.completionRate)}</strong><span>${escapeHtml(chapter.title)}</span></div>`).join("") || emptyState());
  const dropoff = [...quests].filter((quest) => quest.started).sort((a, b) => b.dropoffRate - a.dropoffRate).slice(0, 6);
  setHtml("dropoff-list", renderRanked(dropoff, (quest) => `Квест ${String(quest.number).padStart(2, "0")}`, (quest) => quest.title, (quest) => formatPercent(quest.dropoffRate), "is-risk"));
  const hardest = [...quests].sort((a, b) => b.errors - a.errors).slice(0, 6);
  setHtml("hardest-quests", renderRanked(hardest, (quest) => `Квест ${String(quest.number).padStart(2, "0")}`, (quest) => quest.title, (quest) => `${formatNumber(quest.errors)} ош.`, "is-risk"));
  setHtml("quest-table", quests.length ? `<table class="data-table"><thead><tr><th>№</th><th>Карта</th><th>Квест</th><th class="numeric">Стартовали</th><th class="numeric">Завершили</th><th class="numeric">От аудитории</th><th class="numeric">Конверсия</th><th class="numeric">Ошибки</th></tr></thead><tbody>${quests.map((quest) => `
    <tr><td><strong>${String(quest.number).padStart(2, "0")}</strong></td><td>${escapeHtml(quest.chapterTitle)}</td><td>${escapeHtml(quest.title)}</td><td class="numeric">${formatNumber(quest.started)}</td><td class="numeric">${formatNumber(quest.completed)}</td><td class="numeric">${formatPercent(quest.completionRate)}</td><td class="numeric">${formatPercent(quest.conversionRate)}</td><td class="numeric">${formatNumber(quest.errors)}</td></tr>`).join("")}</tbody></table>` : emptyState());
}

function renderRanked(items, primary, secondary, value, pillClass = "") {
  return items.length ? items.map((item, index) => `<div class="ranked-row"><span class="rank-number">${index + 1}</span><div><strong>${escapeHtml(primary(item))}</strong><small>${escapeHtml(secondary(item))}</small></div><span class="status-pill ${pillClass}">${escapeHtml(value(item))}</span></div>`).join("") : emptyState();
}

function renderQuality(data) {
  const chapters = data.chapters || [];
  setHtml("attempts-chart", chapters.length ? chapters.map((chapter) => `
    <div class="metric-row"><div><span>${escapeHtml(chapter.title)}</span><strong>${chapter.averageAttempts.toFixed(1)}×</strong></div><div class="track"><span style="width:${Math.min(100, chapter.averageAttempts / 3 * 100)}%"></span></div><small>${formatNumber(chapter.attempts)} попыток</small></div>`).join("") : emptyState());
  const quests = data.quests || [];
  const maxErrors = Math.max(1, ...quests.map((quest) => quest.errors));
  setHtml("error-heatmap", quests.length ? quests.map((quest) => `<div class="error-cell" style="--heat:${quest.errors / maxErrors * 100}" title="Квест ${quest.number}: ${escapeHtml(quest.title)} — ${quest.errors} ошибок">${String(quest.number).padStart(2, "0")}</div>`).join("") : emptyState());
  setHtml("energy-chart", chapters.length ? chapters.map((chapter) => `
    <div class="metric-row"><div><span>${escapeHtml(chapter.title)}</span><strong>${chapter.averageEnergy.toFixed(1)} / ${chapter.maxEnergy}</strong></div><div class="track is-cyan"><span style="width:${chapter.averageEnergy / chapter.maxEnergy * 100}%"></span></div></div>`).join("") : emptyState());
  const friction = [...quests].map((quest) => ({ ...quest, friction: Math.round(quest.dropoffRate + quest.errors / Math.max(quest.started, 1) * 100) })).sort((a, b) => b.friction - a.friction).slice(0, 6);
  setHtml("friction-list", renderRanked(friction, (quest) => `Квест ${String(quest.number).padStart(2, "0")}`, (quest) => quest.title, (quest) => `${quest.friction} п.`, "is-risk"));
  setHtml("answer-volume", chapters.length ? chapters.map((chapter) => `<div class="big-metric-row"><div><strong>${escapeHtml(chapter.title)}</strong><span>${escapeHtml(chapter.subtitle)}</span></div><strong>${formatNumber(chapter.answerVolume)}</strong></div>`).join("") : emptyState());
  setHtml("telemetry-coverage", data.telemetry?.length ? data.telemetry.map((item, index) => `
    <div class="coverage-row"><div><span>${escapeHtml(item.label)}</span><strong>${formatPercent(item.value)}</strong></div><div class="track ${index === 3 ? "is-orange" : "is-green"}"><span style="width:${item.value}%"></span></div></div>`).join("") : emptyState());
}

function renderEngagement(data) {
  const journey = data.journey || [];
  const maxJourney = Math.max(1, ...journey.map((stage) => stage.value));
  setHtml("journey-stages", journey.length ? journey.map((stage) => `
    <div class="journey-stage"><div style="height:${Math.max(3, stage.value / maxJourney * 100)}%">${formatNumber(stage.value)}</div><span>${escapeHtml(stage.label)}</span></div>`).join("") : emptyState());
  const score = data.scoreDistribution || [];
  const maxScore = Math.max(1, ...score.map((bucket) => bucket.value));
  setHtml("score-distribution", score.length ? score.map((bucket) => `
    <div class="bar-column"><div data-value="${bucket.value}" style="height:${Math.max(2, bucket.value / maxScore * 100)}%;background:linear-gradient(180deg,#00c1d4,#7856ff)"></div><span>${escapeHtml(bucket.label)}</span></div>`).join("") : emptyState());
  renderDonut("completion-segments", data.completionSegments || [], "игроков");
  const riskTotal = (data.status.atRisk || 0) + (data.status.inactive || 0);
  setHtml("risk-summary", `
    <div class="risk-metric is-alert"><strong>${formatNumber(riskTotal)}</strong><span>Игроков в зоне риска</span></div>
    <div class="risk-metric"><strong>${formatPercent(riskTotal / Math.max(data.summary.totalUsers, 1) * 100)}</strong><span>Доля аудитории</span></div>
    <div class="risk-metric"><strong>${formatNumber(data.status.atRisk)}</strong><span>Без активности 14–30 дней</span></div>
    <div class="risk-metric"><strong>${formatNumber(data.status.inactive)}</strong><span>Неактивны более 30 дней</span></div>`);
  setHtml("recent-activity", data.recentActivity?.length ? data.recentActivity.map((event) => `
    <div class="feed-row"><span class="avatar">${escapeHtml(initials(event.name))}</span><div><strong>${escapeHtml(event.name)}</strong><small>${escapeHtml(event.action)}</small></div><small>${formatDate(event.at, true)}</small></div>`).join("") : emptyState());
  setHtml("engagement-mode-depth", data.modes?.length ? data.modes.map((mode) => `
    <div class="mode-depth-item"><strong>${formatPercent(mode.averageProgress)}</strong><span>${escapeHtml(mode.label)}</span><small>${formatNumber(mode.value)} игроков</small></div>`).join("") : emptyState());
}

function renderSnapshot(data) {
  currentSnapshot = data;
  const demo = data.meta.source === "demo";
  elements.demoBanner.hidden = !demo;
  elements.dataSource.textContent = demo ? "Демо-данные" : `Живые события · ${formatNumber(data.meta.eventCount)}`;
  elements.dataSource.classList.toggle("is-demo", demo);
  elements.lastUpdated.textContent = `Обновлено ${formatDate(data.meta.generatedAt, true)}`;
  renderOverview(data);
  renderUsers(data);
  renderQuests(data);
  renderQuality(data);
  renderEngagement(data);
}

async function loadData() {
  elements.loading.hidden = false;
  elements.error.hidden = true;
  document.querySelectorAll(".tab-panel").forEach((panel) => panel.style.opacity = "0.35");
  const params = new URLSearchParams({
    period: elements.period.value,
    chapter: elements.chapter.value,
    mode: elements.mode.value
  });
  try {
    const response = await fetch(`/api/admin/analytics?${params}`, { headers: { "Accept": "application/json" } });
    if (response.status === 401) {
      showAuth();
      return;
    }
    if (!response.ok) throw new Error("Analytics request failed");
    liveSnapshot = await response.json();
    renderSnapshot(liveSnapshot);
  } catch {
    elements.error.hidden = false;
  } finally {
    elements.loading.hidden = true;
    document.querySelectorAll(".tab-panel").forEach((panel) => panel.style.opacity = "");
  }
}

function showAuth(message = "") {
  elements.auth.hidden = false;
  elements.authError.hidden = !message;
  elements.authError.textContent = message;
  setTimeout(() => elements.password.focus(), 0);
}

function hideAuth() {
  elements.auth.hidden = true;
  elements.password.value = "";
  elements.authError.hidden = true;
}

async function submitAuth(event) {
  event.preventDefault();
  elements.authSubmit.disabled = true;
  elements.authError.hidden = true;
  try {
    const response = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify({ password: elements.password.value })
    });
    if (!response.ok) {
      const message = response.status === 429
        ? "Слишком много попыток. Попробуйте позже."
        : response.status === 503
          ? "Пароль администратора не настроен на сервере."
          : "Неверный пароль. Попробуйте ещё раз.";
      showAuth(message);
      elements.password.select();
      return;
    }
    sessionStorage.setItem(ADMIN_SESSION_KEY, "active");
    hideAuth();
    await loadData();
  } catch {
    showAuth("Сервер недоступен. Попробуйте ещё раз.");
  } finally {
    elements.authSubmit.disabled = false;
  }
}

async function initialize() {
  try {
    const response = await fetch("/api/admin/session", { headers: { "Accept": "application/json" } });
    if (!response.ok) {
      sessionStorage.removeItem(ADMIN_SESSION_KEY);
      showAuth();
      return;
    }
    sessionStorage.setItem(ADMIN_SESSION_KEY, "active");
    await loadData();
  } catch {
    showAuth("Не удалось проверить админ-сессию.");
  }
}

document.querySelectorAll(".dashboard-tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    const target = tab.dataset.tab;
    document.querySelectorAll(".dashboard-tab").forEach((button) => {
      const active = button === tab;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-selected", String(active));
    });
    document.querySelectorAll(".tab-panel").forEach((panel) => {
      const active = panel.dataset.panel === target;
      panel.hidden = !active;
      panel.classList.toggle("is-active", active);
    });
    elements.pageTitle.textContent = TAB_TITLES[target];
    elements.sidebar.classList.remove("is-open");
    elements.menuToggle.setAttribute("aria-expanded", "false");
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
});

elements.authForm.addEventListener("submit", submitAuth);
elements.refresh.addEventListener("click", loadData);
elements.retry.addEventListener("click", loadData);
elements.period.addEventListener("change", loadData);
elements.chapter.addEventListener("change", loadData);
elements.mode.addEventListener("change", loadData);
elements.search.addEventListener("input", () => renderDirectory());
elements.showEmpty.addEventListener("click", () => {
  allowDemo = false;
  if (liveSnapshot) renderSnapshot(liveSnapshot);
});
elements.menuToggle.addEventListener("click", () => {
  const open = elements.sidebar.classList.toggle("is-open");
  elements.menuToggle.setAttribute("aria-expanded", String(open));
});
elements.logout.addEventListener("click", async () => {
  try {
    await fetch("/api/admin/logout", { method: "POST", headers: { "Accept": "application/json" } });
  } finally {
    sessionStorage.removeItem(ADMIN_SESSION_KEY);
    window.location.href = "index.html";
  }
});

initialize();
