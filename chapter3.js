const CHAPTER3_STORAGE_KEY = "bpmsoft-quest-chapter3-v1";
const CHAPTER3_STORAGE_UPDATED_AT_KEY = "bpmsoft-quest-chapter3-updated-at";
const CHAPTER3_ID = "orbit-360";
const CHAPTER3_MISSION_KEYS = ["contact", "lead", "channel", "bpmn", "sla", "access", "integration", "ai", "orbit"];
const CHAPTER3_COMPLETION_FLAGS = CHAPTER3_MISSION_KEYS.map((key) => `${key}Complete`);
const CHAPTER3_CANONICAL_XP = [60, 120, 180, 240, 300, 360, 420, 480, 600];
const CHAPTER3_MISSION_IMAGES = {
  contact: "assets/optimized/mission-contact-genome.jpg",
  lead: "assets/optimized/mission-lead-spectrum.jpg",
  channel: "assets/optimized/mission-channel-array.jpg",
  bpmn: "assets/optimized/mission-bpmn-navigator.jpg",
  sla: "assets/optimized/mission-sla-rings.jpg",
  access: "assets/optimized/mission-access-prism.jpg",
  integration: "assets/optimized/mission-integration-dock.jpg",
  ai: "assets/optimized/mission-ai-core.jpg",
  orbit: "assets/optimized/mission-orbit-360.jpg"
};

const chapter3InitialState = {
  chapterId: CHAPTER3_ID,
  chapterXp: 0,
  level: 5,
  energy: 4,
  activeMission: "contact",
  introSeen: [],
  prologueSeen: false,
  attempts: 1,
  activePhase: 0,
  answers: {},
  locked: {},
  missionProgress: {},
  contactComplete: false,
  leadComplete: false,
  channelComplete: false,
  bpmnComplete: false,
  slaComplete: false,
  accessComplete: false,
  integrationComplete: false,
  aiComplete: false,
  orbitComplete: false,
  chapterComplete: false,
  achievementGranted: false
};

function getChapter3ProgressRank(sourceState) {
  return window.BPMQuestProgressCore?.completionRank(sourceState, CHAPTER3_COMPLETION_FLAGS)
    ?? CHAPTER3_COMPLETION_FLAGS.reduce((rank, flag) => rank + Number(sourceState?.[flag] === true), 0);
}

function normalizeChapter3State(saved) {
  try {
    const merged = saved && typeof saved === "object"
      ? { ...chapter3InitialState, ...saved }
      : { ...chapter3InitialState };
    const rank = Math.min(getChapter3ProgressRank(merged), CHAPTER3_MISSION_KEYS.length);
    CHAPTER3_COMPLETION_FLAGS.forEach((flag, index) => {
      merged[flag] = index < rank;
    });
    merged.chapterId = CHAPTER3_ID;
    merged.chapterXp = rank === 0 ? 0 : CHAPTER3_CANONICAL_XP[rank - 1];
    merged.level = rank >= 5 ? 6 : 5;
    merged.energy = Math.max(0, Math.min(4, Number(merged.energy) || 0));
    merged.activeMission = CHAPTER3_MISSION_KEYS[Math.min(rank, CHAPTER3_MISSION_KEYS.length - 1)];
    merged.introSeen = Array.isArray(merged.introSeen)
      ? [...new Set(merged.introSeen.filter((key) => CHAPTER3_MISSION_KEYS.includes(key)))]
      : [];
    merged.prologueSeen = merged.prologueSeen === true;
    merged.attempts = Math.max(1, Math.min(Number(merged.attempts) || 1, 100));
    merged.activePhase = Math.max(0, Math.min(Number(merged.activePhase) || 0, 20));
    merged.answers = merged.answers && typeof merged.answers === "object" && !Array.isArray(merged.answers) ? { ...merged.answers } : {};
    merged.locked = merged.locked && typeof merged.locked === "object" && !Array.isArray(merged.locked) ? { ...merged.locked } : {};
    merged.missionProgress = merged.missionProgress && typeof merged.missionProgress === "object" && !Array.isArray(merged.missionProgress)
      ? { ...merged.missionProgress }
      : {};
    merged.chapterComplete = merged.orbitComplete === true;
    merged.achievementGranted = merged.chapterComplete && merged.achievementGranted === true;
    return merged;
  } catch {
    return { ...chapter3InitialState };
  }
}

function loadChapter3State() {
  try {
    return normalizeChapter3State(JSON.parse(localStorage.getItem(CHAPTER3_STORAGE_KEY)));
  } catch {
    return { ...chapter3InitialState };
  }
}

function getPersistedChapter3State(sourceState = chapter3State) {
  return {
    chapterId: CHAPTER3_ID,
    energy: Math.max(0, Math.min(4, Number(sourceState.energy) || 0)),
    introSeen: Array.isArray(sourceState.introSeen)
      ? sourceState.introSeen.filter((key) => CHAPTER3_MISSION_KEYS.includes(key))
      : [],
    prologueSeen: sourceState.prologueSeen === true,
    attempts: Math.max(1, Math.min(Number(sourceState.attempts) || 1, 100)),
    activePhase: Math.max(0, Math.min(Number(sourceState.activePhase) || 0, 20)),
    answers: sourceState.answers && typeof sourceState.answers === "object" ? sourceState.answers : {},
    locked: sourceState.locked && typeof sourceState.locked === "object" ? sourceState.locked : {},
    missionProgress: sourceState.missionProgress && typeof sourceState.missionProgress === "object" ? sourceState.missionProgress : {},
    achievementGranted: sourceState.achievementGranted === true,
    ...Object.fromEntries(CHAPTER3_COMPLETION_FLAGS.map((flag) => [flag, sourceState[flag] === true]))
  };
}

function writeChapter3LocalState(savedState, updatedAt = new Date().toISOString()) {
  try {
    localStorage.setItem(CHAPTER3_STORAGE_KEY, JSON.stringify(savedState));
    localStorage.setItem(CHAPTER3_STORAGE_UPDATED_AT_KEY, updatedAt);
  } catch {
    // The third chapter remains playable when local storage is unavailable.
  }
}

function isChapter3StudyMode() {
  return window.BPMQuestFirstChapter?.isStudyMode?.() === true;
}

function saveChapter3State() {
  if (isChapter3StudyMode()) return;
  const savedState = getPersistedChapter3State();
  writeChapter3LocalState(savedState);
  window.BPMQuestFirstChapter?.scheduleChapter3ProgressSync?.(savedState);
}

function hydrateChapter3State(nextState, updatedAt) {
  chapter3State = normalizeChapter3State(nextState);
  writeChapter3LocalState(getPersistedChapter3State(), updatedAt);
  renderChapter3Stats();
  renderChapter3MapState();
  return chapter3State;
}

let chapter3State = loadChapter3State();
let chapter3RunComplete = false;

if (typeof window !== "undefined") {
  window.BPMQuestChapter3 = {
    storageKey: CHAPTER3_STORAGE_KEY,
    missionKeys: [...CHAPTER3_MISSION_KEYS],
    completionFlags: [...CHAPTER3_COMPLETION_FLAGS],
    initialState: { ...chapter3InitialState },
    getState: () => chapter3State,
    setState: (nextState) => {
      chapter3State = normalizeChapter3State(nextState);
      return chapter3State;
    },
    normalizeState: normalizeChapter3State,
    loadState: loadChapter3State,
    saveState: saveChapter3State,
    hydrateState: hydrateChapter3State,
    getPersistedState: getPersistedChapter3State,
    getProgressRank: getChapter3ProgressRank
  };
}

const chapter3Briefs = {
  contact: ["19", "Связать данные клиента", "Разобраться с дублями клиента", "CRM-координатор просит связать записи одного клиента, не смешивая контакт, организацию и историю взаимодействия.", "Задание 20 · Квалификация нового интереса"],
  lead: ["20", "Квалификация нового интереса", "Отделить интерес от готовой продажи", "Руководитель продаж просит исправить маршрут, который создаёт контакты и продажи до подтверждения потребности.", "Задание 21 · История обращений по каналам"],
  channel: ["21", "История обращений по каналам", "Собрать общую историю коммуникаций", "Менеджер клиентских коммуникаций просит связать веб-форму, чат, email и звонок без потери источника и согласий.", "Задание 22 · Процесс квалификации"],
  bpmn: ["22", "Процесс квалификации", "Исправить исполняемый процесс", "Процессный аналитик просит исправить события, задачи, шлюзы, ожидания и внешний вызов в рабочей BPMN-схеме.", "Задание 23 · Сроки сервисного обращения"],
  sla: ["23", "Сроки сервисного обращения", "Настроить расчёт SLA", "Руководитель сервиса просит связать обращение, сервис, договор, приоритет и эскалацию в измеримый SLA.", "Задание 24 · Доступ клиентов и сотрудников"],
  access: ["24", "Доступ клиентов и сотрудников", "Разделить права внутренних и портальных ролей", "Координатор информационной безопасности просит настроить операции, объекты, записи и колонки для разных ролей.", "Задание 25 · Обмен с учётной системой"],
  integration: ["25", "Обмен с учётной системой", "Восстановить обмен с ERP", "Менеджер по продажам не видит обновления из учётной системы: проверьте webhook, REST-контракт, секреты, тайм-аут и обработку отказа.", "Задание 26 · AI в продажах и сервисе"],
  ai: ["26", "AI в продажах и сервисе", "Разделить прогнозы и генерацию текста", "Руководитель CRM-центра просит подобрать ML или LLM для четырёх инициатив и встроить результат в проверяемый BPMN-процесс.", "Задание 27 · Приёмка CRM-решения"],
  orbit: ["27", "Приёмка CRM-решения", "Провести итоговую приёмку CRM", "Проектный комитет просит проверить сквозной маршрут от квалификации и данных клиента до SLA, интеграции, прав и AI-подсказки.", "Итог третьей карты"]
};

function isChapter3Unlocked() {
  if (isChapter3StudyMode()) return true;
  try {
    const secondState = window.BPMQuestChapter2?.getState?.()
      || JSON.parse(localStorage.getItem("bpmsoft-quest-chapter2-v1"));
    return secondState?.contourComplete === true;
  } catch {
    return false;
  }
}

function getCurrentChapter3MissionKey() {
  const rank = getChapter3ProgressRank(chapter3State);
  return CHAPTER3_MISSION_KEYS[Math.min(rank, CHAPTER3_MISSION_KEYS.length - 1)];
}

function renderChapter3Stats() {
  const xpValue = document.getElementById("xp-value");
  const xpGoal = document.getElementById("xp-goal");
  const xpBar = document.getElementById("xp-bar");
  const levelValue = document.getElementById("level-value");
  const energyRunes = document.getElementById("energy-runes");
  if (!xpValue || !xpGoal || !xpBar || !levelValue || !energyRunes) return;
  const levelStart = chapter3State.level === 5 ? 0 : 300;
  const levelXp = Math.max(0, chapter3State.chapterXp - levelStart);
  xpValue.textContent = String(levelXp);
  xpGoal.textContent = "300";
  xpBar.style.width = `${Math.min((levelXp / 300) * 100, 100)}%`;
  levelValue.textContent = String(chapter3State.level);
  energyRunes.innerHTML = "";
  for (let index = 0; index < 4; index += 1) {
    const cell = document.createElement("span");
    cell.className = `energy-rune${index >= chapter3State.energy ? " is-empty" : ""}`;
    cell.setAttribute("aria-hidden", "true");
    energyRunes.append(cell);
  }
  window.BPMQuestFirstChapter?.refreshLevelHints?.();
}

function setChapter3SwitcherState(activeChapter) {
  const switcher = document.getElementById("chapter-switcher");
  const first = document.getElementById("show-first-chapter");
  const second = document.getElementById("show-second-chapter");
  const third = document.getElementById("show-third-chapter");
  const fourth = document.getElementById("show-fourth-chapter");
  const fifth = document.getElementById("show-fifth-chapter");
  if (!switcher || !first || !second || !third || !fourth || !fifth) return;
  const firstUnlocked = isChapter3StudyMode() || window.BPMQuestFirstChapter?.getState?.().solutionMissionComplete === true;
  switcher.hidden = !firstUnlocked;
  third.disabled = !isChapter3Unlocked();
  fourth.disabled = !(isChapter3StudyMode() || chapter3State.orbitComplete === true);
  fifth.disabled = !(isChapter3StudyMode() || window.BPMQuestChapter4?.getState?.().transformationComplete === true);
  [first, second, third, fourth, fifth].forEach((button, index) => {
    const key = ["chapter1", "chapter2", "chapter3", "chapter4", "chapter5"][index];
    const active = activeChapter === key;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });
}

function renderChapter3Brief(key) {
  const brief = chapter3Briefs[key];
  if (!brief) return;
  const index = CHAPTER3_MISSION_KEYS.indexOf(key);
  const complete = chapter3State[CHAPTER3_COMPLETION_FLAGS[index]] === true;
  const study = isChapter3StudyMode();
  document.getElementById("chapter3-brief-number").textContent = complete ? `Задание ${brief[0]} выполнено` : `Задание ${brief[0]}`;
  document.getElementById("chapter3-brief-title").textContent = complete ? brief[1] : brief[2];
  document.getElementById("chapter3-brief-copy").textContent = complete
    ? "Решение уже принято. Задание можно повторить без повторного начисления баллов."
    : brief[3];
  document.getElementById("chapter3-brief-reward").textContent = study ? "учебный запуск" : complete ? "получена" : key === "orbit" ? "120 XP карты" : "60 XP карты";
  document.getElementById("chapter3-brief-time").textContent = key === "orbit" ? "15 решений · 5 этапов" : "12 решений · 4 этапа";
  document.getElementById("chapter3-brief-unlock").textContent = study ? "все задания открыты" : complete ? "повторное прохождение" : brief[4];
  const start = document.getElementById("chapter3-start-mission");
  start.dataset.c3Mission = key;
  start.textContent = complete ? `Повторить задание ${brief[0]}` : "Открыть задание";
}

function renderChapter3MapState() {
  if (typeof document === "undefined") return;
  const study = isChapter3StudyMode();
  const rank = getChapter3ProgressRank(chapter3State);
  const currentKey = getCurrentChapter3MissionKey();
  const label = document.getElementById("chapter3-level-label");
  const title = document.getElementById("chapter3-map-title");
  if (label) label.textContent = study ? "Свободное прохождение" : chapter3State.chapterComplete ? "Проект завершён" : "CRM-проект";
  if (title) title.textContent = study ? "Все задания группы «Семь дорог»" : chapter3State.chapterComplete ? "CRM-решение принято в эксплуатацию" : "Центр CRM-компетенций";
  CHAPTER3_MISSION_KEYS.forEach((key, index) => {
    const complete = chapter3State[CHAPTER3_COMPLETION_FLAGS[index]] === true;
    const available = study || index <= rank;
    document.querySelectorAll(`[data-c3-zone="${key}"]`).forEach((button) => {
      button.disabled = !available;
      button.classList.toggle("is-current", key === currentKey && !complete);
      button.classList.toggle("is-complete", complete);
    });
    const row = document.querySelector(`[data-c3-zone-row="${key}"]`);
    if (row) {
      row.classList.toggle("is-current", key === currentKey && !complete);
      row.classList.toggle("is-complete", complete);
    }
  });
  renderChapter3Brief(currentKey);
}

function hideChapter3Overlays() {
  document.getElementById("chapter3-prologue")?.setAttribute("hidden", "");
  document.getElementById("chapter3-mission-intro")?.setAttribute("hidden", "");
  document.body?.classList.remove("has-mission-intro");
}

function openChapter3Prologue() {
  const prologue = document.getElementById("chapter3-prologue");
  if (!prologue) return;
  prologue.hidden = false;
  document.body?.classList.add("has-mission-intro");
}

function activateChapter3Map({ reviewPrologue = false } = {}) {
  if (!isChapter3Unlocked()) return false;
  window.BPMQuestChapter2?.closeOverlays?.();
  document.querySelectorAll(".view").forEach((view) => {
    view.classList.remove("is-active");
    view.hidden = true;
  });
  document.body?.classList.remove("theme-copper", "theme-market", "theme-sky");
  document.body?.classList.add("theme-orbit");
  const view = document.getElementById("chapter3-map-view");
  view.hidden = false;
  view.classList.add("is-active");
  setChapter3SwitcherState("chapter3");
  renderChapter3Stats();
  renderChapter3MapState();
  if (!chapter3State.prologueSeen || reviewPrologue) openChapter3Prologue();
  else hideChapter3Overlays();
  window.scrollTo({ top: 0, behavior: "smooth" });
  return true;
}

function activateChapter2FromChapter3() {
  hideChapter3Overlays();
  document.body?.classList.remove("theme-orbit", "theme-market", "theme-sky");
  window.BPMQuestChapter2?.activateMap?.();
}

function activateFirstFromChapter3() {
  hideChapter3Overlays();
  document.body?.classList.remove("theme-orbit", "theme-copper", "theme-market", "theme-sky");
  window.BPMQuestChapter2?.activateFirstChapter?.();
}

function acceptChapter3Prologue() {
  chapter3State.prologueSeen = true;
  saveChapter3State();
  hideChapter3Overlays();
  renderChapter3MapState();
}

function resetChapter3Progress() {
  if (!window.confirm("Сбросить баллы, попытки и открытые задания проекта «Семь дорог»?")) return;
  chapter3State = { ...chapter3InitialState };
  writeChapter3LocalState(getPersistedChapter3State());
  window.BPMQuestFirstChapter?.trackLearningEvent?.("chapter_reset", {
    chapterId: "chapter3",
    details: { source: "player" }
  });
  window.BPMQuestFirstChapter?.resetAccountProgress?.("chapter3");
  renderChapter3Stats();
  renderChapter3MapState();
  openChapter3Prologue();
}

function applyChapter3AccessMode(previousMode = null) {
  if (previousMode === "study" && !isChapter3StudyMode()) chapter3State = loadChapter3State();
  const reset = document.getElementById("chapter3-reset-progress");
  if (reset) reset.hidden = isChapter3StudyMode();
  const missionView = document.getElementById("chapter3-mission-view");
  const mapView = document.getElementById("chapter3-map-view");
  const visible = missionView?.hidden === false || mapView?.hidden === false;
  if (!isChapter3Unlocked()) {
    setChapter3SwitcherState(visible ? "chapter2" : "chapter1");
    if (visible) activateChapter2FromChapter3();
    return;
  }
  const missionIndex = CHAPTER3_MISSION_KEYS.indexOf(chapter3State.activeMission);
  const locked = !isChapter3StudyMode() && missionIndex > getChapter3ProgressRank(chapter3State);
  renderChapter3MapState();
  setChapter3SwitcherState(visible ? "chapter3" : "chapter1");
  if (locked && missionView?.hidden === false) activateChapter3Map();
}

function initializeChapter3Map() {
  if (!document.getElementById("chapter3-map-view")) return;
  document.getElementById("show-third-chapter")?.addEventListener("click", () => activateChapter3Map());
  document.getElementById("chapter2-finale-chapter3")?.addEventListener("click", () => activateChapter3Map());
  document.getElementById("chapter3-prologue-start")?.addEventListener("click", acceptChapter3Prologue);
  document.getElementById("chapter3-prologue-back")?.addEventListener("click", activateChapter2FromChapter3);
  document.getElementById("chapter3-reset-progress")?.addEventListener("click", resetChapter3Progress);
  document.querySelectorAll("[data-c3-zone]").forEach((button) => {
    const previewMission = () => {
      if (!button.disabled) renderChapter3Brief(button.dataset.c3Zone);
    };
    button.addEventListener("pointerenter", previewMission);
    button.addEventListener("focus", previewMission);
    button.addEventListener("click", () => {
      if (!button.disabled) beginChapter3Mission(button.dataset.c3Zone);
    });
  });
  document.getElementById("chapter3-start-mission")?.addEventListener("click", (event) => {
    window.BPMQuestChapter3?.beginMission?.(event.currentTarget.dataset.c3Mission);
  });
  window.BPMQuestChapter3.activateMap = activateChapter3Map;
  window.BPMQuestChapter3.activateSecondChapter = activateChapter2FromChapter3;
  window.BPMQuestChapter3.activateFirstChapter = activateFirstFromChapter3;
  window.BPMQuestChapter3.renderMap = renderChapter3MapState;
  window.BPMQuestChapter3.applyAccessMode = applyChapter3AccessMode;
  window.BPMQuestChapter3.closeOverlays = hideChapter3Overlays;
  applyChapter3AccessMode();
}

const chapter3Missions = typeof orbit360Missions !== "undefined" ? orbit360Missions : {};

function getChapter3MissionProgress(key, { reset = false } = {}) {
  const mission = chapter3Missions[key];
  if (!mission) return null;
  const existing = chapter3State.missionProgress[key];
  if (reset || !existing || typeof existing !== "object") {
    chapter3State.missionProgress[key] = { phase: 0, answers: {}, locked: {}, optionOrders: {}, lastWrong: [] };
  }
  const progress = chapter3State.missionProgress[key];
  progress.phase = Math.max(0, Math.min(mission.phases.length - 1, Number(progress.phase) || 0));
  progress.answers = progress.answers && typeof progress.answers === "object" ? progress.answers : {};
  progress.locked = progress.locked && typeof progress.locked === "object" ? progress.locked : {};
  progress.optionOrders = progress.optionOrders && typeof progress.optionOrders === "object" ? progress.optionOrders : {};
  progress.lastWrong = Array.isArray(progress.lastWrong) ? progress.lastWrong : [];
  return progress;
}

function shuffleChapter3Options(options, correctId) {
  const shuffled = [...options];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const target = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[target]] = [shuffled[target], shuffled[index]];
  }
  if (shuffled.length > 1 && shuffled[0].id === correctId) [shuffled[0], shuffled[1]] = [shuffled[1], shuffled[0]];
  return shuffled;
}

function getChapter3OrderedOptions(phase, slot, progress) {
  const orderKey = `${phase.id}:${slot.id}`;
  const byId = new Map(slot.options.map((option) => [option.id, option]));
  const saved = progress.optionOrders[orderKey];
  const valid = Array.isArray(saved) && saved.length === slot.options.length && saved.every((id) => byId.has(id));
  if (!valid) progress.optionOrders[orderKey] = shuffleChapter3Options(slot.options, slot.correct).map((option) => option.id);
  return progress.optionOrders[orderKey].map((id) => byId.get(id));
}

function isChapter3AdminActive() {
  return window.BPMQuestFirstChapter?.isAdminActive?.() === true;
}

function getChapter3HintContext(mission, phase, slot) {
  return `c3:${mission.key}:${phase.id}:${slot.id}`;
}

function isChapter3AnswerRevealed(mission, phase, slot) {
  return window.BPMQuestFirstChapter?.isLevelHintRevealed?.(
    getChapter3HintContext(mission, phase, slot)
  ) === true;
}

function renderChapter3MissionIntro(mission, mode = "first-visit") {
  const intro = document.getElementById("chapter3-mission-intro");
  if (!intro) return;
  intro.dataset.mission = mission.key;
  intro.dataset.mode = mode;
  document.getElementById("chapter3-mission-intro-number").textContent = mission.number;
  document.getElementById("chapter3-mission-intro-kicker").textContent = `Запрос заказчика · ${mission.zone}`;
  document.getElementById("chapter3-mission-intro-title").textContent = mission.introTitle;
  document.getElementById("chapter3-mission-intro-copy").innerHTML = mission.intro.map((paragraph) => `<p>${paragraph}</p>`).join("");
  document.getElementById("chapter3-mission-intro-image").src = CHAPTER3_MISSION_IMAGES[mission.key];
  const mapAction = document.getElementById("chapter3-mission-intro-map");
  const startAction = document.getElementById("chapter3-mission-intro-start");
  mapAction.hidden = mode === "review";
  startAction.textContent = mode === "review" ? "Вернуться к заданию" : "Начать работу";
  intro.hidden = false;
  document.body?.classList.add("has-mission-intro");
}

function hideChapter3MissionIntro() {
  const intro = document.getElementById("chapter3-mission-intro");
  if (intro) intro.hidden = true;
  document.body?.classList.remove("has-mission-intro");
}

function acceptChapter3MissionIntro() {
  const intro = document.getElementById("chapter3-mission-intro");
  const key = intro?.dataset.mission || chapter3State.activeMission;
  if (!chapter3State.introSeen.includes(key)) {
    chapter3State.introSeen = [...chapter3State.introSeen, key];
    saveChapter3State();
  }
  hideChapter3MissionIntro();
}

function dismissChapter3MissionIntro() {
  hideChapter3MissionIntro();
  activateChapter3Map();
}

function showChapter3View(id) {
  document.querySelectorAll(".view").forEach((view) => {
    const active = view.id === id;
    view.classList.toggle("is-active", active);
    view.hidden = !active;
  });
  document.body?.classList.remove("theme-copper", "theme-market", "theme-sky");
  document.body?.classList.add("theme-orbit");
  setChapter3SwitcherState("chapter3");
  renderChapter3Stats();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function renderChapter3KnowledgeSource(element, mission) {
  element.textContent = mission.source;
  if (!mission.sourceUrl) return;

  const link = document.createElement("a");
  link.href = mission.sourceUrl;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.textContent = "Открыть статью BPMSoft ↗";
  element.append(" ", link);
}

function renderChapter3Codex(mission) {
  document.getElementById("chapter3-codex-title").textContent = mission.zone;
  document.getElementById("chapter3-codex-list").innerHTML = mission.codex
    .map(([term, definition]) => `<div><dt>${term}</dt><dd>${definition}</dd></div>`).join("");
  renderChapter3KnowledgeSource(document.getElementById("chapter3-source-copy"), mission);
}

function renderChapter3PhaseList(mission, progress) {
  document.getElementById("chapter3-phase-list").innerHTML = mission.phases.map((phase, index) => {
    const className = index < progress.phase ? "is-complete" : index === progress.phase ? "is-active" : "";
    return `<li class="${className}">${index + 1}. ${phase.title}</li>`;
  }).join("");
}

function renderChapter3Board(mission, progress) {
  const phase = mission.phases[progress.phase];
  const selectedCount = phase.slots.filter((slot) => Boolean(progress.answers[slot.id])).length;
  document.getElementById("chapter3-board-kicker").textContent = phase.kicker;
  document.getElementById("chapter3-board-title").textContent = phase.title;
  document.getElementById("chapter3-board-instruction").textContent = phase.instruction;
  document.getElementById("chapter3-conditions-list").innerHTML = phase.conditions.map((condition) => `<li>${condition}</li>`).join("");
  document.getElementById("chapter3-selection-count").textContent = `${selectedCount} / ${phase.slots.length}`;
  document.getElementById("chapter3-mission-hint").textContent = selectedCount === phase.slots.length
    ? "Все решения выбраны. Отправьте этап на проверку."
    : `Выбрано ${selectedCount} из ${phase.slots.length}. Просмотр вариантов не расходует попытку.`;
  const grid = document.getElementById("chapter3-slot-grid");
  grid.innerHTML = "";
  phase.slots.forEach((slot) => {
    const selected = progress.answers[slot.id] || null;
    const locked = progress.locked[slot.id] === true;
    const wrong = progress.lastWrong.includes(slot.id);
    const article = document.createElement("article");
    article.className = `c3-slot${selected ? " is-answered" : ""}${locked ? " is-locked" : ""}${wrong ? " is-wrong" : ""}`;
    article.innerHTML = `<span class="c3-slot-label">${slot.label}</span><p class="c3-slot-prompt">${slot.prompt}</p>`;
    const hintButton = window.BPMQuestFirstChapter?.createLevelHintButton?.(
      getChapter3HintContext(mission, phase, slot),
      () => renderChapter3Board(mission, progress)
    );
    if (hintButton) article.append(hintButton);
    const options = document.createElement("div");
    options.className = "c3-options";
    getChapter3OrderedOptions(phase, slot, progress).forEach((option) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `c3-answer${selected === option.id ? " is-selected" : ""}${(isChapter3AdminActive() || isChapter3AnswerRevealed(mission, phase, slot)) && option.id === slot.correct ? " is-admin-correct" : ""}`;
      button.disabled = locked || chapter3RunComplete;
      button.dataset.option = option.id;
      button.innerHTML = `<strong>${option.name}</strong><small>${option.note}</small>`;
      button.setAttribute("aria-pressed", String(selected === option.id));
      button.addEventListener("click", () => assignChapter3Answer(slot.id, option.id));
      options.append(button);
    });
    article.append(options);
    grid.append(article);
  });
  const checkButton = document.getElementById("chapter3-check-phase");
  if (checkButton) checkButton.disabled = chapter3RunComplete;
  saveChapter3State();
}

function renderChapter3Mission() {
  const mission = chapter3Missions[chapter3State.activeMission];
  if (!mission) {
    activateChapter3Map();
    return;
  }
  const progress = getChapter3MissionProgress(mission.key);
  const phase = mission.phases[progress.phase];
  document.getElementById("chapter3-workspace").className = `c3-workspace mode-${mission.mode}`;
  document.getElementById("chapter3-mission-number").textContent = mission.number;
  document.getElementById("chapter3-mission-zone").textContent = mission.zone;
  document.getElementById("chapter3-mission-title").textContent = mission.title;
  document.getElementById("chapter3-attempt-badge").textContent = `Попытка ${chapter3State.attempts}`;
  document.getElementById("chapter3-lore-copy").textContent = mission.lore;
  document.getElementById("chapter3-scene-kicker").textContent = `${mission.zone} · ${phase.kicker}`;
  document.getElementById("chapter3-scene-copy").textContent = mission.scenario;
  const image = document.getElementById("chapter3-scene-image");
  image.src = CHAPTER3_MISSION_IMAGES[mission.key];
  image.alt = `Панорама ${mission.zone}`;
  renderChapter3PhaseList(mission, progress);
  renderChapter3Board(mission, progress);
  renderChapter3Codex(mission);
}

function refreshChapter3AdminHighlights() {
  const mission = chapter3Missions[chapter3State.activeMission];
  if (!mission) return;
  const progress = getChapter3MissionProgress(mission.key);
  if (mission.phases[progress.phase]) renderChapter3Board(mission, progress);
}

function assignChapter3Answer(slotId, optionId) {
  if (chapter3RunComplete) return false;
  const mission = chapter3Missions[chapter3State.activeMission];
  const progress = getChapter3MissionProgress(mission.key);
  if (progress.locked[slotId]) return;
  progress.answers[slotId] = optionId;
  progress.lastWrong = progress.lastWrong.filter((id) => id !== slotId);
  saveChapter3State();
  renderChapter3Board(mission, progress);
  return true;
}

function hideChapter3Feedback() {
  const feedback = document.getElementById("chapter3-feedback");
  if (feedback) feedback.hidden = true;
}

function showChapter3Feedback({ kicker, title, copy, score = 0, action, actionLabel }) {
  const feedback = document.getElementById("chapter3-feedback");
  document.getElementById("chapter3-feedback-kicker").textContent = kicker;
  document.getElementById("chapter3-feedback-title").textContent = title;
  document.getElementById("chapter3-feedback-copy").textContent = copy;
  document.getElementById("chapter3-feedback-score").textContent = String(score);
  const actionButton = document.getElementById("chapter3-feedback-action");
  actionButton.dataset.action = action;
  actionButton.textContent = actionLabel;
  feedback.hidden = false;
  feedback.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function completeChapter3Mission(mission) {
  if (isChapter3StudyMode()) return 0;
  const alreadyComplete = chapter3State[mission.completionFlag] === true;
  chapter3State[mission.completionFlag] = true;
  if (mission.key === "orbit") {
    chapter3State.chapterComplete = true;
    chapter3State.achievementGranted = true;
  }
  chapter3State = normalizeChapter3State(chapter3State);
  if (mission.key === "orbit") chapter3State.achievementGranted = true;
  saveChapter3State();
  renderChapter3Stats();
  renderChapter3MapState();
  return alreadyComplete ? 0 : mission.score;
}

function checkChapter3Phase() {
  if (chapter3RunComplete) return false;
  const mission = chapter3Missions[chapter3State.activeMission];
  if (!mission) return false;
  const progress = getChapter3MissionProgress(mission.key);
  const phase = mission.phases[progress.phase];
  const incomplete = phase.slots.filter((slot) => !progress.answers[slot.id]);
  if (incomplete.length) {
    document.getElementById("chapter3-mission-hint").textContent = `Осталось выбрать решений: ${incomplete.length}.`;
    return false;
  }
  const wrongSlots = phase.slots.filter((slot) => progress.answers[slot.id] !== slot.correct);
  if (wrongSlots.length) {
    window.BPMQuestFirstChapter?.trackLearningEvent?.("answer_checked", {
      chapterId: "chapter3",
      missionKey: mission.key,
      outcome: "failure",
      attempt: chapter3State.attempts,
      details: { phase: progress.phase, wrongCount: wrongSlots.length }
    });
    phase.slots.forEach((slot) => {
      if (progress.answers[slot.id] === slot.correct) progress.locked[slot.id] = true;
    });
    wrongSlots.forEach((slot) => delete progress.answers[slot.id]);
    progress.lastWrong = wrongSlots.map((slot) => slot.id);
    chapter3State.energy = Math.max(0, chapter3State.energy - 1);
    chapter3State.attempts += 1;
    const exhausted = chapter3State.energy === 0;
    const explanation = wrongSlots[0].explanation;
    saveChapter3State();
    renderChapter3Stats();
    renderChapter3Mission();
    showChapter3Feedback({
      kicker: exhausted ? "Разбор попытки" : "Нужно исправление",
      title: exhausted ? "Попытки на текущем этапе исчерпаны" : "Часть решений не соответствует условиям",
      copy: exhausted
        ? `${explanation} Текущий этап начнётся заново; уже завершённые этапы задания сохранены.`
        : explanation,
      action: exhausted ? "retry-phase" : "dismiss",
      actionLabel: exhausted ? "Повторить этап" : "Исправить решения"
    });
    return false;
  }
  window.BPMQuestFirstChapter?.trackLearningEvent?.("answer_checked", {
    chapterId: "chapter3",
    missionKey: mission.key,
    outcome: "success",
    attempt: chapter3State.attempts,
    details: { phase: progress.phase }
  });
  progress.lastWrong = [];
  const finalPhase = progress.phase === mission.phases.length - 1;
  if (!finalPhase) {
    progress.phase += 1;
    progress.answers = {};
    progress.locked = {};
    chapter3State.activePhase = progress.phase;
    saveChapter3State();
    renderChapter3Mission();
    showChapter3Feedback({ kicker: "Этап принят", title: phase.successTitle, copy: phase.successCopy, action: "continue", actionLabel: "Перейти к следующему этапу" });
    return true;
  }
  chapter3RunComplete = true;
  renderChapter3Board(mission, progress);
  const study = isChapter3StudyMode();
  const awarded = completeChapter3Mission(mission);
  window.BPMQuestFirstChapter?.trackLearningEvent?.("mission_completed", {
    chapterId: "chapter3",
    missionKey: mission.key,
    outcome: "success",
    attempt: chapter3State.attempts,
    details: { score: awarded, firstCompletion: awarded > 0 }
  });
  const index = CHAPTER3_MISSION_KEYS.indexOf(mission.key);
  const nextKey = CHAPTER3_MISSION_KEYS[index + 1];
  const nextMission = nextKey ? chapter3Missions[nextKey] : null;
  showChapter3Feedback({
    kicker: study ? "Учебное прохождение" : awarded > 0 ? "Задание выполнено" : "Повторное прохождение",
    title: phase.successTitle,
    copy: study ? `${phase.successCopy} Основной прогресс и награды не изменены.` : awarded > 0 ? phase.successCopy : `${phase.successCopy} Награда уже получена.`,
    score: awarded,
    action: study ? nextMission ? `next:${nextKey}` : "map" : mission.key === "orbit" ? "finale" : nextMission ? `next:${nextKey}` : "map",
    actionLabel: study ? nextMission ? `Открыть задание ${nextMission.number}` : "Вернуться на карту" : mission.key === "orbit" ? "Завершить проект" : nextMission ? `Открыть задание ${nextMission.number}` : "Вернуться на карту"
  });
  return true;
}

function retryChapter3Phase() {
  const mission = chapter3Missions[chapter3State.activeMission];
  const progress = getChapter3MissionProgress(mission.key);
  progress.answers = {};
  progress.locked = {};
  progress.lastWrong = [];
  chapter3State.energy = 4;
  saveChapter3State();
  renderChapter3Stats();
  renderChapter3Mission();
  hideChapter3Feedback();
}

function beginChapter3Mission(key) {
  const mission = chapter3Missions[key];
  if (!mission || !isChapter3Unlocked()) return false;
  const index = CHAPTER3_MISSION_KEYS.indexOf(key);
  const rank = getChapter3ProgressRank(chapter3State);
  if (!isChapter3StudyMode() && index > rank) return false;
  chapter3RunComplete = false;
  chapter3State.activeMission = key;
  chapter3State.energy = 4;
  chapter3State.attempts = 1;
  chapter3State.activePhase = 0;
  getChapter3MissionProgress(key, { reset: true });
  saveChapter3State();
  window.BPMQuestFirstChapter?.trackLearningEvent?.("mission_started", {
    chapterId: "chapter3",
    missionKey: key,
    attempt: 1,
    details: { replay: chapter3State[mission.completionFlag] === true }
  });
  hideChapter3Feedback();
  showChapter3View("chapter3-mission-view");
  renderChapter3Mission();
  if (chapter3State.introSeen.includes(key)) hideChapter3MissionIntro();
  else renderChapter3MissionIntro(mission);
  return true;
}

function showChapter3Finale() {
  if (!chapter3State.orbitComplete) return;
  hideChapter3MissionIntro();
  showChapter3View("chapter3-finale-view");
}

function handleChapter3FeedbackAction() {
  const action = document.getElementById("chapter3-feedback-action").dataset.action || "dismiss";
  if (action === "dismiss" || action === "continue") {
    hideChapter3Feedback();
    return;
  }
  if (action === "retry-phase") {
    retryChapter3Phase();
    return;
  }
  if (action === "map") {
    hideChapter3Feedback();
    activateChapter3Map();
    return;
  }
  if (action === "finale") {
    hideChapter3Feedback();
    showChapter3Finale();
    return;
  }
  if (action.startsWith("next:")) {
    hideChapter3Feedback();
    beginChapter3Mission(action.replace("next:", ""));
  }
}

function initializeChapter3MissionEngine() {
  if (!document.getElementById("chapter3-mission-view")) return;
  document.getElementById("chapter3-back-to-map")?.addEventListener("click", () => activateChapter3Map());
  document.getElementById("chapter3-review-intro")?.addEventListener("click", () => {
    const mission = chapter3Missions[chapter3State.activeMission];
    if (mission) renderChapter3MissionIntro(mission, "review");
  });
  document.getElementById("chapter3-mission-intro-start")?.addEventListener("click", acceptChapter3MissionIntro);
  document.getElementById("chapter3-mission-intro-map")?.addEventListener("click", dismissChapter3MissionIntro);
  document.getElementById("chapter3-check-phase")?.addEventListener("click", checkChapter3Phase);
  document.getElementById("chapter3-feedback-action")?.addEventListener("click", handleChapter3FeedbackAction);
  document.getElementById("chapter3-finale-map")?.addEventListener("click", () => activateChapter3Map());
  document.getElementById("chapter3-finale-replay")?.addEventListener("click", () => beginChapter3Mission("orbit"));
  document.getElementById("chapter3-finale-second")?.addEventListener("click", activateChapter2FromChapter3);
  document.getElementById("chapter3-finale-first")?.addEventListener("click", activateFirstFromChapter3);
}

if (typeof window !== "undefined") {
  window.BPMQuestChapter3.missions = chapter3Missions;
  window.BPMQuestChapter3.beginMission = beginChapter3Mission;
  window.BPMQuestChapter3.assignAnswer = assignChapter3Answer;
  window.BPMQuestChapter3.checkPhase = checkChapter3Phase;
  window.BPMQuestChapter3.getMissionProgress = getChapter3MissionProgress;
  window.BPMQuestChapter3.showFinale = showChapter3Finale;
  window.BPMQuestChapter3.refreshAdminHighlights = refreshChapter3AdminHighlights;
}

if (typeof document !== "undefined") {
  initializeChapter3Map();
  initializeChapter3MissionEngine();
}
