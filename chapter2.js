const CHAPTER2_STORAGE_KEY = "bpmsoft-quest-chapter2-v1";
const CHAPTER2_STORAGE_UPDATED_AT_KEY = "bpmsoft-quest-chapter2-updated-at";
const CHAPTER2_ID = "copper-frontier";
const CHAPTER2_MISSION_KEYS = [
  "sorting",
  "portal",
  "signal",
  "cycle",
  "package",
  "trace",
  "change",
  "oracle",
  "contour"
];
const CHAPTER2_COMPLETION_FLAGS = [
  "sortingComplete",
  "portalComplete",
  "signalComplete",
  "cycleComplete",
  "packageComplete",
  "traceComplete",
  "changeComplete",
  "oracleComplete",
  "contourComplete"
];
const CHAPTER2_CANONICAL_XP = [50, 100, 150, 200, 250, 300, 350, 400, 500];
const CHAPTER2_MISSION_IMAGES = {
  sorting: "assets/mission-sorting-furnace.png",
  portal: "assets/mission-portal-gate.png",
  signal: "assets/mission-signal-yard.png",
  cycle: "assets/mission-cycle-foundry.png",
  package: "assets/mission-package-depot.png",
  trace: "assets/mission-trace-furnace.png",
  change: "assets/mission-change-assembly.png",
  oracle: "assets/mission-oracle-forge.png",
  contour: "assets/mission-contour-heart.png"
};

const chapter2InitialState = {
  chapterId: CHAPTER2_ID,
  chapterXp: 0,
  level: 3,
  energy: 3,
  activeMission: "sorting",
  introSeen: [],
  prologueSeen: false,
  attempts: 1,
  activePhase: 0,
  answers: {},
  locked: {},
  missionProgress: {},
  sortingComplete: false,
  portalComplete: false,
  signalComplete: false,
  cycleComplete: false,
  packageComplete: false,
  traceComplete: false,
  changeComplete: false,
  oracleComplete: false,
  contourComplete: false,
  chapterComplete: false,
  achievementGranted: false
};

function getChapter2ProgressRank(sourceState) {
  return CHAPTER2_COMPLETION_FLAGS.reduce(
    (rank, flag) => rank + Number(sourceState?.[flag] === true),
    0
  );
}

function normalizeChapter2State(saved) {
  try {
    const merged = saved && typeof saved === "object"
      ? { ...chapter2InitialState, ...saved }
      : { ...chapter2InitialState };
    const rank = getChapter2ProgressRank(merged);

    CHAPTER2_COMPLETION_FLAGS.forEach((flag, index) => {
      merged[flag] = index < rank;
    });

    merged.chapterId = CHAPTER2_ID;
    merged.chapterXp = rank === 0 ? 0 : CHAPTER2_CANONICAL_XP[rank - 1];
    merged.level = rank >= 5 ? 4 : 3;
    merged.energy = Math.max(0, Math.min(3, Number(merged.energy) || 0));
    merged.activeMission = CHAPTER2_MISSION_KEYS[Math.min(rank, CHAPTER2_MISSION_KEYS.length - 1)];
    merged.introSeen = Array.isArray(merged.introSeen)
      ? [...new Set(merged.introSeen.filter((key) => CHAPTER2_MISSION_KEYS.includes(key)))]
      : [];
    merged.prologueSeen = merged.prologueSeen === true;
    merged.attempts = Math.max(1, Number(merged.attempts) || 1);
    merged.activePhase = Math.max(0, Number(merged.activePhase) || 0);
    merged.answers = merged.answers && typeof merged.answers === "object" && !Array.isArray(merged.answers)
      ? { ...merged.answers }
      : {};
    merged.locked = merged.locked && typeof merged.locked === "object" && !Array.isArray(merged.locked)
      ? { ...merged.locked }
      : {};
    merged.missionProgress = merged.missionProgress
      && typeof merged.missionProgress === "object"
      && !Array.isArray(merged.missionProgress)
      ? { ...merged.missionProgress }
      : {};
    merged.chapterComplete = merged.contourComplete === true;
    merged.achievementGranted = merged.chapterComplete && merged.achievementGranted === true;

    return merged;
  } catch {
    return { ...chapter2InitialState };
  }
}

function loadChapter2State() {
  try {
    return normalizeChapter2State(JSON.parse(localStorage.getItem(CHAPTER2_STORAGE_KEY)));
  } catch {
    return { ...chapter2InitialState };
  }
}

function getPersistedChapter2State(sourceState = chapter2State) {
  return {
    chapterId: CHAPTER2_ID,
    energy: Math.max(0, Math.min(3, Number(sourceState.energy) || 0)),
    introSeen: Array.isArray(sourceState.introSeen)
      ? sourceState.introSeen.filter((key) => CHAPTER2_MISSION_KEYS.includes(key))
      : [],
    prologueSeen: sourceState.prologueSeen === true,
    attempts: Math.max(1, Number(sourceState.attempts) || 1),
    activePhase: Math.max(0, Number(sourceState.activePhase) || 0),
    answers: sourceState.answers && typeof sourceState.answers === "object"
      ? sourceState.answers
      : {},
    locked: sourceState.locked && typeof sourceState.locked === "object"
      ? sourceState.locked
      : {},
    missionProgress: sourceState.missionProgress && typeof sourceState.missionProgress === "object"
      ? sourceState.missionProgress
      : {},
    achievementGranted: sourceState.achievementGranted === true,
    ...Object.fromEntries(
      CHAPTER2_COMPLETION_FLAGS.map((flag) => [flag, sourceState[flag] === true])
    )
  };
}

function writeChapter2LocalState(savedState, updatedAt = new Date().toISOString()) {
  try {
    localStorage.setItem(CHAPTER2_STORAGE_KEY, JSON.stringify(savedState));
    localStorage.setItem(CHAPTER2_STORAGE_UPDATED_AT_KEY, updatedAt);
  } catch {
    // The second chapter remains playable during the session when storage is unavailable.
  }
}

function saveChapter2State() {
  if (isChapter2StudyMode()) return;
  const savedState = getPersistedChapter2State();
  writeChapter2LocalState(savedState);
  window.BPMQuestFirstChapter?.scheduleChapter2ProgressSync?.(savedState);
}

function hydrateChapter2State(nextState, updatedAt) {
  chapter2State = normalizeChapter2State(nextState);
  writeChapter2LocalState(getPersistedChapter2State(), updatedAt);
  renderChapter2Stats();
  renderChapter2MapState();
  return chapter2State;
}

let chapter2State = loadChapter2State();

if (typeof window !== "undefined") {
  window.BPMQuestChapter2 = {
    storageKey: CHAPTER2_STORAGE_KEY,
    missionKeys: [...CHAPTER2_MISSION_KEYS],
    completionFlags: [...CHAPTER2_COMPLETION_FLAGS],
    initialState: { ...chapter2InitialState },
    getState: () => chapter2State,
    setState: (nextState) => {
      chapter2State = normalizeChapter2State(nextState);
      return chapter2State;
    },
    normalizeState: normalizeChapter2State,
    loadState: loadChapter2State,
    saveState: saveChapter2State,
    hydrateState: hydrateChapter2State,
    getPersistedState: getPersistedChapter2State,
    getProgressRank: getChapter2ProgressRank
  };
}

const chapter2MissionBriefs = {
  sorting: {
    number: "10",
    zone: "Планирование производства",
    title: "Импорт производственных заказов",
    copy: "Настройте повторный Excel-импорт без дублей заказов и загрязнения справочников.",
    unlock: "Дилерский портал"
  },
  portal: {
    number: "11",
    zone: "Дилерский портал",
    title: "Доступ дилеров к заказам",
    copy: "Разделите данные организаций и скройте внутреннюю себестоимость от внешних пользователей.",
    unlock: "Интеграция с перевозчиком"
  },
  signal: {
    number: "12",
    zone: "Интеграция с перевозчиком",
    title: "Передача заказа перевозчику",
    copy: "Настройте исходящий REST-вызов и восстановите секрет, не перенесённый на новую среду.",
    unlock: "Согласование заказов"
  },
  cycle: {
    number: "13",
    zone: "Согласование заказов",
    title: "Зацикленное согласование",
    copy: "Найдите исполняемую версию процесса, остановите бесконечный повтор и верните трассу выполнения.",
    unlock: "Управление конфигурацией"
  },
  package: {
    number: "14",
    zone: "Управление конфигурацией",
    title: "Состав решения и зависимости",
    copy: "Разберите циклические зависимости и подготовьте управляемый перенос на тестовую среду.",
    unlock: "Аудит изменений"
  },
  trace: {
    number: "15",
    zone: "Аудит изменений",
    title: "История изменения заказа",
    copy: "Разделите бизнес-изменения и события безопасности, затем восстановите доказуемую хронологию инцидента.",
    unlock: "Управление релизами"
  },
  change: {
    number: "16",
    zone: "Управление релизами",
    title: "Подготовка рабочего релиза",
    copy: "Свяжите проблему, изменение, затронутые компоненты и релиз в один управляемый выпуск.",
    unlock: "Аналитика продаж"
  },
  oracle: {
    number: "17",
    zone: "Аналитика продаж",
    title: "Помощник отдела продаж",
    copy: "Подготовьте данные, разделите задачи ML и LLM и встроите результат в контролируемый процесс.",
    unlock: "Приёмочный стенд"
  },
  contour: {
    number: "18",
    zone: "Приёмочный стенд",
    title: "Приёмка рабочего релиза",
    copy: "Докажите причины общего инцидента, проведите согласованное исправление и выполните четыре приёмочных сценария.",
    unlock: "Завершение клиентского проекта"
  }
};

function isChapter2StudyMode() {
  return window.BPMQuestFirstChapter?.isStudyMode?.() === true;
}

function isChapter2Unlocked() {
  if (isChapter2StudyMode()) return true;
  try {
    const firstState = typeof window !== "undefined" && window.BPMQuestFirstChapter
      ? window.BPMQuestFirstChapter.getState()
      : JSON.parse(localStorage.getItem("bpmsoft-quest-v1"));
    return firstState?.solutionMissionComplete === true;
  } catch {
    return false;
  }
}

function getCurrentChapter2MissionKey() {
  const rank = getChapter2ProgressRank(chapter2State);
  return CHAPTER2_MISSION_KEYS[Math.min(rank, CHAPTER2_MISSION_KEYS.length - 1)];
}

function renderChapter2Stats() {
  const xpValue = document.getElementById("xp-value");
  const xpGoal = document.getElementById("xp-goal");
  const xpBar = document.getElementById("xp-bar");
  const levelValue = document.getElementById("level-value");
  const energyRunes = document.getElementById("energy-runes");
  if (!xpValue || !xpGoal || !xpBar || !levelValue || !energyRunes) return;

  const levelStart = chapter2State.level === 3 ? 0 : 250;
  const levelXp = Math.max(0, chapter2State.chapterXp - levelStart);
  xpValue.textContent = String(levelXp);
  xpGoal.textContent = "250";
  xpBar.style.width = `${Math.min((levelXp / 250) * 100, 100)}%`;
  levelValue.textContent = String(chapter2State.level);
  energyRunes.innerHTML = "";

  for (let index = 0; index < 3; index += 1) {
    const cell = document.createElement("span");
    cell.className = `energy-rune${index >= chapter2State.energy ? " is-empty" : ""}`;
    cell.setAttribute("aria-hidden", "true");
    energyRunes.append(cell);
  }
}

function setChapterSwitcherState(activeChapter) {
  const switcher = document.getElementById("chapter-switcher");
  const firstButton = document.getElementById("show-first-chapter");
  const secondButton = document.getElementById("show-second-chapter");
  const thirdButton = document.getElementById("show-third-chapter");
  const fourthButton = document.getElementById("show-fourth-chapter");
  if (!switcher || !firstButton || !secondButton) return;
  switcher.hidden = !isChapter2Unlocked();
  const firstActive = activeChapter === "chapter1";
  const secondActive = activeChapter === "chapter2";
  const thirdActive = activeChapter === "chapter3";
  const fourthActive = activeChapter === "chapter4";
  firstButton.classList.toggle("is-active", firstActive);
  secondButton.classList.toggle("is-active", secondActive);
  firstButton.setAttribute("aria-pressed", String(firstActive));
  secondButton.setAttribute("aria-pressed", String(secondActive));
  if (thirdButton) {
    const thirdUnlocked = isChapter2StudyMode() || chapter2State.contourComplete === true;
    thirdButton.disabled = !thirdUnlocked;
    thirdButton.classList.toggle("is-active", thirdActive);
    thirdButton.setAttribute("aria-pressed", String(thirdActive));
  }
  if (fourthButton) {
    const fourthUnlocked = isChapter2StudyMode() || window.BPMQuestChapter3?.getState?.().orbitComplete === true;
    fourthButton.disabled = !fourthUnlocked;
    fourthButton.classList.toggle("is-active", fourthActive);
    fourthButton.setAttribute("aria-pressed", String(fourthActive));
  }
}

function renderChapter2Brief(key) {
  const mission = chapter2MissionBriefs[key];
  if (!mission) return;
  const studyMode = isChapter2StudyMode();
  const completed = chapter2State[CHAPTER2_COMPLETION_FLAGS[CHAPTER2_MISSION_KEYS.indexOf(key)]];
  document.getElementById("chapter2-brief-number").textContent = completed
    ? `Задание ${mission.number} завершено`
    : `Задание ${mission.number}`;
  document.getElementById("chapter2-brief-title").textContent = completed
    ? `${mission.zone}: проверка пройдена`
    : mission.title;
  document.getElementById("chapter2-brief-copy").textContent = completed
    ? "Задание уже выполнено. Его можно повторить без повторного начисления баллов."
    : mission.copy;
  document.getElementById("chapter2-brief-reward").textContent = studyMode ? "учебный запуск" : completed ? "получена" : key === "contour" ? "100 XP карты" : "50 XP карты";
  document.getElementById("chapter2-brief-time").textContent = key === "contour" ? "15–20 минут" : "8–12 минут";
  document.getElementById("chapter2-brief-unlock").textContent = studyMode ? "все задания открыты" : completed ? "повторное прохождение" : mission.unlock;
  const start = document.getElementById("chapter2-start-mission");
  start.dataset.c2Mission = key;
  start.textContent = completed ? `Повторить задание ${mission.number}` : "Открыть задание";
}

function renderChapter2MapState() {
  const studyMode = isChapter2StudyMode();
  const rank = getChapter2ProgressRank(chapter2State);
  const currentKey = getCurrentChapter2MissionKey();
  const levelLabel = document.getElementById("chapter2-level-label");
  const mapTitle = document.getElementById("chapter2-map-title");
  if (levelLabel) levelLabel.textContent = studyMode ? "Свободное прохождение" : chapter2State.chapterComplete ? "Проект завершён" : "Производственный проект";
  if (mapTitle) mapTitle.textContent = studyMode ? "Все задания АО «Медные машины»" : chapter2State.chapterComplete ? "Проект АО «Медные машины» завершён" : chapter2State.level === 3 ? "Производственные операции" : "Управление изменениями";

  CHAPTER2_MISSION_KEYS.forEach((key, index) => {
    const complete = chapter2State[CHAPTER2_COMPLETION_FLAGS[index]] === true;
    const available = studyMode || index <= rank;
    document.querySelectorAll(`[data-c2-zone="${key}"]`).forEach((button) => {
      button.disabled = !available;
      button.classList.toggle("is-current", key === currentKey && !complete);
      button.classList.toggle("is-complete", complete);
    });
    const row = document.querySelector(`[data-c2-zone-row="${key}"]`);
    if (row) {
      row.classList.toggle("is-current", key === currentKey && !complete);
      row.classList.toggle("is-complete", complete);
    }
  });

  renderChapter2Brief(currentKey);
}

function hideChapter2Prologue() {
  const prologue = document.getElementById("chapter2-prologue");
  if (prologue) prologue.hidden = true;
  document.body?.classList.remove("has-mission-intro");
}

function openChapter2Prologue() {
  const prologue = document.getElementById("chapter2-prologue");
  if (!prologue) return;
  prologue.hidden = false;
  document.body?.classList.add("has-mission-intro");
}

function activateChapter2Map({ reviewPrologue = false } = {}) {
  if (!isChapter2Unlocked()) return false;
  window.BPMQuestChapter3?.closeOverlays?.();
  document.querySelectorAll(".view").forEach((view) => {
    view.classList.remove("is-active");
    view.hidden = true;
  });
  document.body?.classList.remove("theme-orbit", "theme-market");
  document.body?.classList.add("theme-copper");
  const mapView = document.getElementById("chapter2-map-view");
  mapView.hidden = false;
  mapView.classList.add("is-active");
  setChapterSwitcherState("chapter2");
  renderChapter2Stats();
  renderChapter2MapState();
  if (!chapter2State.prologueSeen || reviewPrologue) openChapter2Prologue();
  else hideChapter2Prologue();
  window.scrollTo({ top: 0, behavior: "smooth" });
  return true;
}

function activateFirstChapter() {
  hideChapter2Prologue();
  window.BPMQuestChapter3?.closeOverlays?.();
  document.body?.classList.remove("theme-copper", "theme-orbit", "theme-market");
  const mapView = document.getElementById("chapter2-map-view");
  if (mapView) {
    mapView.classList.remove("is-active");
    mapView.hidden = true;
  }
  setChapterSwitcherState("chapter1");
  window.BPMQuestFirstChapter?.showMap();
}

function acceptChapter2Prologue() {
  chapter2State.prologueSeen = true;
  saveChapter2State();
  hideChapter2Prologue();
  renderChapter2MapState();
}

function resetChapter2Progress() {
  const confirmed = window.confirm("Сбросить баллы и открытые задания проекта АО «Медные машины»?");
  if (!confirmed) return;
  chapter2State = { ...chapter2InitialState };
  writeChapter2LocalState(getPersistedChapter2State());
  window.BPMQuestFirstChapter?.resetAccountProgress?.("chapter2");
  renderChapter2Stats();
  renderChapter2MapState();
  window.BPMQuestChapter3?.applyAccessMode?.();
  openChapter2Prologue();
}

function applyChapter2AccessMode(previousMode = null) {
  if (previousMode === "study" && !isChapter2StudyMode()) chapter2State = loadChapter2State();
  const reset = document.getElementById("chapter2-reset-progress");
  if (reset) reset.hidden = isChapter2StudyMode();
  const missionView = document.getElementById("chapter2-mission-view");
  const mapView = document.getElementById("chapter2-map-view");
  const chapter2Visible = missionView?.hidden === false || mapView?.hidden === false;
  if (!isChapter2Unlocked()) {
    setChapterSwitcherState("chapter1");
    if (chapter2Visible) activateFirstChapter();
    return;
  }

  const missionIndex = CHAPTER2_MISSION_KEYS.indexOf(chapter2State.activeMission);
  const missionLocked = !isChapter2StudyMode() && missionIndex > getChapter2ProgressRank(chapter2State);
  renderChapter2MapState();
  setChapterSwitcherState(chapter2Visible ? "chapter2" : "chapter1");
  if (missionLocked && missionView?.hidden === false) activateChapter2Map();
}

function initializeChapter2Map() {
  const mapView = document.getElementById("chapter2-map-view");
  if (!mapView) return;
  const unlocked = isChapter2Unlocked();
  const switcher = document.getElementById("chapter-switcher");
  if (switcher) switcher.hidden = !unlocked;
  setChapterSwitcherState("chapter1");

  document.getElementById("finale-chapter2-action")?.addEventListener("click", () => activateChapter2Map());
  document.getElementById("show-second-chapter")?.addEventListener("click", () => activateChapter2Map());
  document.getElementById("show-first-chapter")?.addEventListener("click", activateFirstChapter);
  document.getElementById("chapter2-prologue-start")?.addEventListener("click", acceptChapter2Prologue);
  document.getElementById("chapter2-prologue-back")?.addEventListener("click", activateFirstChapter);
  document.getElementById("chapter2-reset-progress")?.addEventListener("click", resetChapter2Progress);
  document.querySelectorAll("[data-c2-zone]").forEach((button) => {
    button.addEventListener("click", () => {
      if (button.disabled) return;
      renderChapter2Brief(button.dataset.c2Zone);
    });
  });
  document.getElementById("chapter2-start-mission")?.addEventListener("click", (event) => {
    const missionKey = event.currentTarget.dataset.c2Mission;
    if (typeof window.BPMQuestChapter2?.beginMission === "function") {
      window.BPMQuestChapter2.beginMission(missionKey);
    }
  });

  window.BPMQuestChapter2.activateMap = activateChapter2Map;
  window.BPMQuestChapter2.activateFirstChapter = activateFirstChapter;
  window.BPMQuestChapter2.renderMap = renderChapter2MapState;
  window.BPMQuestChapter2.applyAccessMode = applyChapter2AccessMode;
  window.BPMQuestChapter2.closeOverlays = () => {
    hideChapter2Prologue();
    hideChapter2MissionIntro();
  };
  applyChapter2AccessMode();
}

if (typeof document !== "undefined") initializeChapter2Map();

const chapter2Missions = typeof copperFrontierMissions !== "undefined" ? copperFrontierMissions : {};

function getChapter2MissionProgress(key, { reset = false } = {}) {
  const mission = chapter2Missions[key];
  if (!mission) return null;
  const existing = chapter2State.missionProgress[key];
  if (reset || !existing || typeof existing !== "object") {
    chapter2State.missionProgress[key] = {
      phase: 0,
      answers: {},
      locked: {},
      optionOrders: {},
      lastWrong: []
    };
  }
  const progress = chapter2State.missionProgress[key];
  progress.phase = Math.max(0, Math.min(mission.phases.length - 1, Number(progress.phase) || 0));
  progress.answers = progress.answers && typeof progress.answers === "object" ? progress.answers : {};
  progress.locked = progress.locked && typeof progress.locked === "object" ? progress.locked : {};
  progress.optionOrders = progress.optionOrders && typeof progress.optionOrders === "object" ? progress.optionOrders : {};
  progress.lastWrong = Array.isArray(progress.lastWrong) ? progress.lastWrong : [];
  return progress;
}

function shuffleChapter2Options(options, correctId) {
  const shuffled = [...options];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const target = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[target]] = [shuffled[target], shuffled[index]];
  }
  if (shuffled.length > 1 && shuffled[0].id === correctId) {
    [shuffled[0], shuffled[1]] = [shuffled[1], shuffled[0]];
  }
  return shuffled;
}

function getChapter2OrderedOptions(mission, phase, slot, progress) {
  const orderKey = `${phase.id}:${slot.id}`;
  const byId = new Map(slot.options.map((option) => [option.id, option]));
  const saved = progress.optionOrders[orderKey];
  const valid = Array.isArray(saved)
    && saved.length === slot.options.length
    && saved.every((id) => byId.has(id));
  if (!valid) {
    progress.optionOrders[orderKey] = shuffleChapter2Options(slot.options, slot.correct).map((option) => option.id);
  }
  return progress.optionOrders[orderKey].map((id) => byId.get(id));
}

function isChapter2AdminActive() {
  return window.BPMQuestFirstChapter?.isAdminActive?.() === true;
}

function renderChapter2MissionIntro(mission, mode = "first-visit") {
  const intro = document.getElementById("chapter2-mission-intro");
  if (!intro) return;
  intro.dataset.mission = mission.key;
  intro.dataset.mode = mode;
  document.getElementById("chapter2-mission-intro-number").textContent = mission.number;
  document.getElementById("chapter2-mission-intro-kicker").textContent = `Запрос заказчика · ${mission.zone}`;
  document.getElementById("chapter2-mission-intro-title").textContent = mission.introTitle;
  document.getElementById("chapter2-mission-intro-copy").innerHTML = mission.intro.map((paragraph) => `<p>${paragraph}</p>`).join("");
  const visual = document.getElementById("chapter2-mission-intro-visual");
  visual.className = `c2-prologue-visual c2-mission-intro-visual mode-${mission.mode}`;
  const introImage = document.getElementById("chapter2-mission-intro-image");
  introImage.src = CHAPTER2_MISSION_IMAGES[mission.key];
  introImage.alt = "";
  const mapAction = document.getElementById("chapter2-mission-intro-map");
  const startAction = document.getElementById("chapter2-mission-intro-start");
  mapAction.hidden = mode === "review";
  startAction.textContent = mode === "review" ? "Вернуться к заданию" : "Принять задание";
  intro.hidden = false;
  document.body?.classList.add("has-mission-intro");
}

function hideChapter2MissionIntro() {
  const intro = document.getElementById("chapter2-mission-intro");
  if (intro) intro.hidden = true;
  document.body?.classList.remove("has-mission-intro");
}

function acceptChapter2MissionIntro() {
  const intro = document.getElementById("chapter2-mission-intro");
  const key = intro?.dataset.mission || chapter2State.activeMission;
  if (!chapter2State.introSeen.includes(key)) {
    chapter2State.introSeen = [...chapter2State.introSeen, key];
    saveChapter2State();
  }
  hideChapter2MissionIntro();
}

function dismissChapter2MissionIntro() {
  hideChapter2MissionIntro();
  activateChapter2Map();
}

function showChapter2View(id) {
  document.querySelectorAll(".view").forEach((view) => {
    const active = view.id === id;
    view.classList.toggle("is-active", active);
    view.hidden = !active;
  });
  document.body?.classList.remove("theme-orbit", "theme-market");
  document.body?.classList.add("theme-copper");
  setChapterSwitcherState("chapter2");
  renderChapter2Stats();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function renderChapter2KnowledgeSource(element, mission) {
  element.textContent = mission.source;
  if (!mission.sourceUrl) return;

  const link = document.createElement("a");
  link.href = mission.sourceUrl;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.textContent = "Открыть статью BPMSoft ↗";
  element.append(" ", link);
}

function renderChapter2Codex(mission) {
  document.getElementById("chapter2-codex-title").textContent = mission.zone;
  document.getElementById("chapter2-codex-list").innerHTML = mission.codex
    .map(([term, definition]) => `<div><dt>${term}</dt><dd>${definition}</dd></div>`)
    .join("");
  renderChapter2KnowledgeSource(document.getElementById("chapter2-source-copy"), mission);
}

function renderChapter2PhaseList(mission, progress) {
  document.getElementById("chapter2-phase-list").innerHTML = mission.phases
    .map((phase, index) => {
      const className = index < progress.phase ? "is-complete" : index === progress.phase ? "is-active" : "";
      return `<li class="${className}">${index + 1}. ${phase.title}</li>`;
    })
    .join("");
}

function renderChapter2Board(mission, progress) {
  const phase = mission.phases[progress.phase];
  const grid = document.getElementById("chapter2-slot-grid");
  const selectedCount = phase.slots.filter((slot) => Boolean(progress.answers[slot.id])).length;
  document.getElementById("chapter2-board-kicker").textContent = phase.kicker;
  document.getElementById("chapter2-board-title").textContent = phase.title;
  document.getElementById("chapter2-board-instruction").textContent = phase.instruction;
  const conditions = Array.isArray(phase.conditions) && phase.conditions.length > 0
    ? phase.conditions
    : phase.condition.replace(/([.;!?])\s+/g, "$1\n").split("\n").filter(Boolean);
  document.getElementById("chapter2-board-conditions-list").innerHTML = conditions
    .map((condition) => `<li>${condition}</li>`)
    .join("");
  document.getElementById("chapter2-selection-count").textContent = `${selectedCount} / ${phase.slots.length}`;
  document.getElementById("chapter2-mission-hint").textContent = selectedCount === phase.slots.length
    ? "Конфигурация заполнена. Проведите пробный запуск."
    : `Выбрано ${selectedCount} из ${phase.slots.length}. Просмотр вариантов не расходует попытку.`;

  grid.innerHTML = "";
  phase.slots.forEach((slot) => {
    const selected = progress.answers[slot.id] || null;
    const locked = progress.locked[slot.id] === true;
    const wrong = progress.lastWrong.includes(slot.id);
    const slotElement = document.createElement("article");
    slotElement.className = `c2-slot${selected ? " is-answered" : ""}${locked ? " is-locked" : ""}${wrong ? " is-wrong" : ""}`;
    slotElement.innerHTML = `<span class="c2-slot-label">${slot.label}</span><p class="c2-slot-prompt">${slot.prompt}</p>`;
    const optionsElement = document.createElement("div");
    optionsElement.className = "c2-options";

    getChapter2OrderedOptions(mission, phase, slot, progress).forEach((option) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `c2-answer${selected === option.id ? " is-selected" : ""}${isChapter2AdminActive() && option.id === slot.correct ? " is-admin-correct" : ""}`;
      button.disabled = locked;
      button.dataset.option = option.id;
      button.innerHTML = `<strong>${option.name}</strong><small>${option.note}</small>`;
      button.setAttribute("aria-pressed", String(selected === option.id));
      button.addEventListener("click", () => assignChapter2Answer(slot.id, option.id));
      optionsElement.append(button);
    });

    slotElement.append(optionsElement);
    grid.append(slotElement);
  });
  saveChapter2State();
}

function renderChapter2Mission() {
  const mission = chapter2Missions[chapter2State.activeMission];
  if (!mission) {
    activateChapter2Map();
    return;
  }
  const progress = getChapter2MissionProgress(mission.key);
  const phase = mission.phases[progress.phase];
  const workspace = document.getElementById("chapter2-workspace");
  workspace.className = `c2-workspace mode-${mission.mode}`;
  document.getElementById("chapter2-mission-number").textContent = mission.number;
  document.getElementById("chapter2-mission-zone").textContent = mission.zone;
  document.getElementById("chapter2-mission-title").textContent = mission.title;
  document.getElementById("chapter2-attempt-badge").textContent = `Попытка ${chapter2State.attempts}`;
  document.getElementById("chapter2-lore-copy").textContent = mission.lore;
  document.getElementById("chapter2-scene-kicker").textContent = `${mission.zone} · ${phase.kicker}`;
  document.getElementById("chapter2-scene-copy").textContent = mission.scenario;
  const sceneImage = document.getElementById("chapter2-scene-image");
  sceneImage.src = CHAPTER2_MISSION_IMAGES[mission.key];
  sceneImage.alt = `Панорама ${mission.zone}`;
  renderChapter2PhaseList(mission, progress);
  renderChapter2Board(mission, progress);
  renderChapter2Codex(mission);
}

function refreshChapter2AdminHighlights() {
  const mission = chapter2Missions[chapter2State.activeMission];
  if (!mission) return;
  const progress = getChapter2MissionProgress(mission.key);
  if (!mission.phases[progress.phase]) return;
  renderChapter2Board(mission, progress);
}

function assignChapter2Answer(slotId, optionId) {
  const mission = chapter2Missions[chapter2State.activeMission];
  const progress = getChapter2MissionProgress(mission.key);
  if (progress.locked[slotId]) return;
  progress.answers[slotId] = optionId;
  progress.lastWrong = progress.lastWrong.filter((id) => id !== slotId);
  saveChapter2State();
  renderChapter2Board(mission, progress);
}

function hideChapter2Feedback() {
  const feedback = document.getElementById("chapter2-feedback");
  if (feedback) feedback.hidden = true;
}

function showChapter2Feedback({ kicker, title, copy, score = 0, action, actionLabel }) {
  const feedback = document.getElementById("chapter2-feedback");
  document.getElementById("chapter2-feedback-kicker").textContent = kicker;
  document.getElementById("chapter2-feedback-title").textContent = title;
  document.getElementById("chapter2-feedback-copy").textContent = copy;
  document.getElementById("chapter2-feedback-score").textContent = String(score);
  const actionButton = document.getElementById("chapter2-feedback-action");
  actionButton.dataset.action = action;
  actionButton.textContent = actionLabel;
  feedback.hidden = false;
  feedback.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function completeChapter2Mission(mission) {
  if (isChapter2StudyMode()) return 0;
  const alreadyComplete = chapter2State[mission.completionFlag] === true;
  chapter2State[mission.completionFlag] = true;
  if (mission.key === "contour") {
    chapter2State.chapterComplete = true;
    chapter2State.achievementGranted = true;
  }
  chapter2State = normalizeChapter2State(chapter2State);
  if (mission.key === "contour") chapter2State.achievementGranted = true;
  saveChapter2State();
  renderChapter2Stats();
  renderChapter2MapState();
  window.BPMQuestChapter3?.applyAccessMode?.();
  return alreadyComplete ? 0 : mission.score;
}

function checkChapter2Phase() {
  const mission = chapter2Missions[chapter2State.activeMission];
  if (!mission) return false;
  const progress = getChapter2MissionProgress(mission.key);
  const phase = mission.phases[progress.phase];
  const incomplete = phase.slots.filter((slot) => !progress.answers[slot.id]);
  if (incomplete.length > 0) {
    document.getElementById("chapter2-mission-hint").textContent = `Заполните ещё ${incomplete.length} узл. перед пробным запуском.`;
    return false;
  }

  const wrongSlots = phase.slots.filter((slot) => progress.answers[slot.id] !== slot.correct);
  if (wrongSlots.length > 0) {
    phase.slots.forEach((slot) => {
      if (progress.answers[slot.id] === slot.correct) progress.locked[slot.id] = true;
    });
    wrongSlots.forEach((slot) => {
      delete progress.answers[slot.id];
    });
    progress.lastWrong = wrongSlots.map((slot) => slot.id);
    chapter2State.energy = Math.max(0, chapter2State.energy - 1);
    chapter2State.attempts += 1;
    const exhausted = chapter2State.energy === 0;
    const explanation = wrongSlots[0].explanation;
    saveChapter2State();
    renderChapter2Stats();
    renderChapter2Mission();
    showChapter2Feedback({
      kicker: exhausted ? "Разбор с руководителем проекта" : "Проверка не пройдена",
      title: exhausted ? "Попытки этого этапа исчерпаны" : "Часть решений требует исправления",
      copy: exhausted
        ? `${explanation} Временные ответы этого этапа сброшены; используйте разбор и пройдите его заново.`
        : explanation,
      action: exhausted ? "retry-phase" : "dismiss",
      actionLabel: exhausted ? "Повторить этап" : "Исправить решения"
    });
    return false;
  }

  progress.lastWrong = [];
  const isFinalPhase = progress.phase === mission.phases.length - 1;
  if (!isFinalPhase) {
    progress.phase += 1;
    progress.answers = {};
    progress.locked = {};
    chapter2State.activePhase = progress.phase;
    saveChapter2State();
    renderChapter2Mission();
    showChapter2Feedback({
      kicker: "Этап завершён",
      title: phase.successTitle,
      copy: phase.successCopy,
      action: "continue",
      actionLabel: "Перейти к следующему этапу"
    });
    return true;
  }

  const studyMode = isChapter2StudyMode();
  const awarded = completeChapter2Mission(mission);
  const currentIndex = CHAPTER2_MISSION_KEYS.indexOf(mission.key);
  const nextKey = CHAPTER2_MISSION_KEYS[currentIndex + 1];
  const nextMission = nextKey ? chapter2Missions[nextKey] : null;
  showChapter2Feedback({
    kicker: studyMode ? "Учебный запуск" : awarded > 0 ? "Задание выполнено" : "Повторное прохождение",
    title: phase.successTitle,
    copy: studyMode
      ? `${phase.successCopy} Основной прогресс и награды не изменены.`
      : awarded > 0 ? phase.successCopy : `${phase.successCopy} Баллы за это задание уже начислены.`,
    score: awarded,
    action: studyMode ? nextMission ? `next:${nextKey}` : "map" : mission.key === "contour" ? "finale" : nextMission ? `next:${nextKey}` : "map",
    actionLabel: studyMode
      ? nextMission ? `Открыть задание ${nextMission.number}` : "Вернуться на карту"
      : mission.key === "contour" ? "Завершить проект" : nextMission ? `Открыть задание ${nextMission.number}` : "Вернуться на карту"
  });
  return true;
}

function retryChapter2Phase() {
  const mission = chapter2Missions[chapter2State.activeMission];
  const progress = getChapter2MissionProgress(mission.key);
  progress.answers = {};
  progress.locked = {};
  progress.lastWrong = [];
  chapter2State.energy = 3;
  saveChapter2State();
  renderChapter2Stats();
  renderChapter2Mission();
  hideChapter2Feedback();
}

function beginChapter2Mission(key) {
  const mission = chapter2Missions[key];
  if (!mission || !isChapter2Unlocked()) return false;
  const index = CHAPTER2_MISSION_KEYS.indexOf(key);
  const rank = getChapter2ProgressRank(chapter2State);
  if (!isChapter2StudyMode() && index > rank) return false;
  chapter2State.activeMission = key;
  chapter2State.energy = 3;
  chapter2State.attempts = 1;
  chapter2State.activePhase = 0;
  getChapter2MissionProgress(key, { reset: true });
  saveChapter2State();
  hideChapter2Feedback();
  showChapter2View("chapter2-mission-view");
  renderChapter2Mission();
  if (chapter2State.introSeen.includes(key)) hideChapter2MissionIntro();
  else renderChapter2MissionIntro(mission);
  return true;
}

function showChapter2Finale() {
  if (!chapter2State.contourComplete) return;
  hideChapter2MissionIntro();
  showChapter2View("chapter2-finale-view");
}

function handleChapter2FeedbackAction() {
  const action = document.getElementById("chapter2-feedback-action").dataset.action || "dismiss";
  if (action === "dismiss" || action === "continue") {
    hideChapter2Feedback();
    return;
  }
  if (action === "retry-phase") {
    retryChapter2Phase();
    return;
  }
  if (action === "map") {
    hideChapter2Feedback();
    activateChapter2Map();
    return;
  }
  if (action === "finale") {
    hideChapter2Feedback();
    showChapter2Finale();
    return;
  }
  if (action.startsWith("next:")) {
    hideChapter2Feedback();
    beginChapter2Mission(action.replace("next:", ""));
  }
}

function initializeChapter2MissionEngine() {
  if (!document.getElementById("chapter2-mission-view")) return;
  document.getElementById("chapter2-back-to-map")?.addEventListener("click", () => activateChapter2Map());
  document.getElementById("chapter2-review-intro")?.addEventListener("click", () => {
    const mission = chapter2Missions[chapter2State.activeMission];
    if (mission) renderChapter2MissionIntro(mission, "review");
  });
  document.getElementById("chapter2-mission-intro-start")?.addEventListener("click", acceptChapter2MissionIntro);
  document.getElementById("chapter2-mission-intro-map")?.addEventListener("click", dismissChapter2MissionIntro);
  document.getElementById("chapter2-check-phase")?.addEventListener("click", checkChapter2Phase);
  document.getElementById("chapter2-feedback-action")?.addEventListener("click", handleChapter2FeedbackAction);
  document.getElementById("chapter2-finale-map")?.addEventListener("click", () => activateChapter2Map());
  document.getElementById("chapter2-finale-replay")?.addEventListener("click", () => beginChapter2Mission("contour"));
  document.getElementById("chapter2-finale-first")?.addEventListener("click", activateFirstChapter);
}

if (typeof window !== "undefined") {
  window.BPMQuestChapter2.missions = chapter2Missions;
  window.BPMQuestChapter2.beginMission = beginChapter2Mission;
  window.BPMQuestChapter2.assignAnswer = assignChapter2Answer;
  window.BPMQuestChapter2.checkPhase = checkChapter2Phase;
  window.BPMQuestChapter2.getMissionProgress = getChapter2MissionProgress;
  window.BPMQuestChapter2.showFinale = showChapter2Finale;
  window.BPMQuestChapter2.refreshAdminHighlights = refreshChapter2AdminHighlights;
}

if (typeof document !== "undefined") initializeChapter2MissionEngine();
