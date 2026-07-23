const CHAPTER4_STORAGE_KEY = "bpmsoft-quest-chapter4-v1";
const CHAPTER4_STORAGE_UPDATED_AT_KEY = "bpmsoft-quest-chapter4-updated-at";
const CHAPTER4_ID = "golden-shelf";
const CHAPTER4_MISSION_KEYS = ["migration", "consent", "campaign", "franchise", "order", "stock", "returns", "insight", "transformation"];
const CHAPTER4_COMPLETION_FLAGS = CHAPTER4_MISSION_KEYS.map((key) => `${key}Complete`);
const CHAPTER4_CANONICAL_XP = [70, 140, 210, 280, 350, 420, 490, 560, 700];
const CHAPTER4_MISSION_IMAGES = {
  migration: "assets/optimized/mission-legacy-ledgers.jpg",
  consent: "assets/optimized/mission-consent-pavilion.jpg",
  campaign: "assets/optimized/mission-campaign-house.jpg",
  franchise: "assets/optimized/mission-franchise-arcade.jpg",
  order: "assets/optimized/mission-order-courtyard.jpg",
  stock: "assets/optimized/mission-stock-exchange.jpg",
  returns: "assets/optimized/mission-returns-center.jpg",
  insight: "assets/optimized/mission-insight-ledger.jpg",
  transformation: "assets/optimized/mission-transformation-room.jpg"
};
const CHAPTER4_SLOT_LABELS = {
  cause: ["Шаг 2 · Причина", "Что объясняет найденные факты"],
  mechanism: ["Шаг 3 · Решение", "Что изменить в BPMSoft или интеграции"],
  test: ["Шаг 4 · Проверка", "Как доказать результат"]
};
const CHAPTER4_ROLE_NAMES = {
  cause: "Причина",
  mechanism: "Решение",
  test: "Проверка"
};
const CHAPTER4_ROLE_ORDER = ["cause", "mechanism", "test"];
const CHAPTER4_TUTORIAL_COPY = {
  cause: "Рута подсказывает: причина должна объяснять сразу несколько найденных фактов, а не только звучать правдоподобно.",
  mechanism: "Рута подсказывает: решение должно устранять выбранную причину системно, без ручного обхода.",
  test: "Рута подсказывает: проверка должна воспроизвести риск и дать наблюдаемый результат."
};
const CHAPTER4_TUTORIAL_FACTS = {
  sources: { cause: "import", mechanism: "legacy", test: "import" },
  merge: { cause: "profile", mechanism: "relations", test: "relations" }
};

const chapter4InitialState = {
  chapterId: CHAPTER4_ID,
  chapterXp: 0,
  level: 7,
  energy: 4,
  activeMission: "migration",
  introSeen: [],
  prologueSeen: false,
  attempts: 1,
  missionProgress: {},
  migrationComplete: false,
  consentComplete: false,
  campaignComplete: false,
  franchiseComplete: false,
  orderComplete: false,
  stockComplete: false,
  returnsComplete: false,
  insightComplete: false,
  transformationComplete: false,
  chapterComplete: false,
  achievementGranted: false
};

function getChapter4ProgressRank(sourceState) {
  return window.BPMQuestProgressCore?.completionRank(sourceState, CHAPTER4_COMPLETION_FLAGS)
    ?? CHAPTER4_COMPLETION_FLAGS.reduce((rank, flag) => rank + Number(sourceState?.[flag] === true), 0);
}

function normalizeChapter4State(saved) {
  try {
    const merged = saved && typeof saved === "object"
      ? { ...chapter4InitialState, ...saved }
      : { ...chapter4InitialState };
    const rank = Math.min(getChapter4ProgressRank(merged), CHAPTER4_MISSION_KEYS.length);
    CHAPTER4_COMPLETION_FLAGS.forEach((flag, index) => {
      merged[flag] = index < rank;
    });
    merged.chapterId = CHAPTER4_ID;
    merged.chapterXp = rank === 0 ? 0 : CHAPTER4_CANONICAL_XP[rank - 1];
    merged.level = rank >= 5 ? 8 : 7;
    merged.energy = Math.max(0, Math.min(4, Number(merged.energy) || 0));
    merged.activeMission = CHAPTER4_MISSION_KEYS[Math.min(rank, CHAPTER4_MISSION_KEYS.length - 1)];
    merged.introSeen = Array.isArray(merged.introSeen)
      ? [...new Set(merged.introSeen.filter((key) => CHAPTER4_MISSION_KEYS.includes(key)))]
      : [];
    merged.prologueSeen = merged.prologueSeen === true;
    merged.attempts = Math.max(1, Math.min(Number(merged.attempts) || 1, 100));
    merged.missionProgress = merged.missionProgress && typeof merged.missionProgress === "object" && !Array.isArray(merged.missionProgress)
      ? { ...merged.missionProgress }
      : {};
    merged.chapterComplete = merged.transformationComplete === true;
    merged.achievementGranted = merged.chapterComplete && merged.achievementGranted === true;
    return merged;
  } catch {
    return { ...chapter4InitialState };
  }
}

function loadChapter4State() {
  try {
    return normalizeChapter4State(JSON.parse(localStorage.getItem(CHAPTER4_STORAGE_KEY)));
  } catch {
    return { ...chapter4InitialState };
  }
}

function getPersistedChapter4State(sourceState = chapter4State) {
  return {
    chapterId: CHAPTER4_ID,
    energy: Math.max(0, Math.min(4, Number(sourceState.energy) || 0)),
    introSeen: Array.isArray(sourceState.introSeen)
      ? sourceState.introSeen.filter((key) => CHAPTER4_MISSION_KEYS.includes(key))
      : [],
    prologueSeen: sourceState.prologueSeen === true,
    attempts: Math.max(1, Math.min(Number(sourceState.attempts) || 1, 100)),
    missionProgress: sourceState.missionProgress && typeof sourceState.missionProgress === "object" ? sourceState.missionProgress : {},
    achievementGranted: sourceState.achievementGranted === true,
    ...Object.fromEntries(CHAPTER4_COMPLETION_FLAGS.map((flag) => [flag, sourceState[flag] === true]))
  };
}

function writeChapter4LocalState(savedState, updatedAt = new Date().toISOString()) {
  try {
    localStorage.setItem(CHAPTER4_STORAGE_KEY, JSON.stringify(savedState));
    localStorage.setItem(CHAPTER4_STORAGE_UPDATED_AT_KEY, updatedAt);
  } catch {
    // The fourth chapter remains playable when local storage is unavailable.
  }
}

function isChapter4StudyMode() {
  return window.BPMQuestFirstChapter?.isStudyMode?.() === true;
}

function saveChapter4State() {
  if (isChapter4StudyMode()) return;
  const savedState = getPersistedChapter4State();
  writeChapter4LocalState(savedState);
  window.BPMQuestFirstChapter?.scheduleChapter4ProgressSync?.(savedState);
}

function hydrateChapter4State(nextState, updatedAt) {
  chapter4State = normalizeChapter4State(nextState);
  writeChapter4LocalState(getPersistedChapter4State(), updatedAt);
  renderChapter4Stats();
  renderChapter4MapState();
  return chapter4State;
}

let chapter4State = loadChapter4State();
let chapter4RunComplete = false;
let chapter4ActiveHotspotId = "";

if (typeof window !== "undefined") {
  window.BPMQuestChapter4 = {
    storageKey: CHAPTER4_STORAGE_KEY,
    missionKeys: [...CHAPTER4_MISSION_KEYS],
    completionFlags: [...CHAPTER4_COMPLETION_FLAGS],
    initialState: { ...chapter4InitialState },
    getState: () => chapter4State,
    setState: (nextState) => {
      chapter4State = normalizeChapter4State(nextState);
      return chapter4State;
    },
    normalizeState: normalizeChapter4State,
    loadState: loadChapter4State,
    saveState: saveChapter4State,
    hydrateState: hydrateChapter4State,
    getPersistedState: getPersistedChapter4State,
    getProgressRank: getChapter4ProgressRank,
    isUnlocked: isChapter4Unlocked
  };
}

const chapter4Briefs = {
  migration: ["28", "Мастер-данные покупателя", "Остановить дубли после миграции", "Команда трансформации просит сопоставить три клиентские базы и сохранить связанные заказы и возвраты.", "Задание 29 · Согласия и предпочтения"],
  consent: ["29", "Согласия и предпочтения", "Разделить каналы и цели коммуникации", "Директор по клиентскому опыту просит остановить рекламу после отказа, не блокируя допустимые сервисные сообщения.", "Задание 30 · Маркетинговые кампании"],
  campaign: ["30", "Маркетинговые кампании", "Собрать единую аудиторию кампании", "Руководитель маркетинга просит убрать пересечение региональных списков и считать фактическую конверсию.", "Задание 31 · Франчайзинговый портал"],
  franchise: ["31", "Франчайзинговый портал", "Изолировать партнёров и магазины", "Координатор франчайзинговой сети просит закрыть чужие заказы, чувствительные поля и лишние операции.", "Задание 32 · Управление заказами"],
  order: ["32", "Управление заказами", "Собрать единый жизненный цикл заказа", "Руководитель продаж просит связать сайт, магазин и контактный центр одной записью заказа и фактическим исполнением.", "Задание 33 · Остатки и резервы"],
  stock: ["33", "Остатки и резервы", "Синхронизировать доступность товара", "Координатор складских систем просит разделить физический остаток, резерв и доступность, защитив обмен от старых событий.", "Задание 34 · Возвраты и обращения"],
  returns: ["34", "Возвраты и обращения", "Связать возврат с заказом и компенсацией", "Руководитель сервиса просит объединить обращения из трёх каналов и исключить повторную выплату.", "Задание 35 · Операционная аналитика"],
  insight: ["35", "Операционная аналитика", "Согласовать метрики сети", "Финансовый директор просит дать конверсии единое определение и вывести разрывы качества данных.", "Задание 36 · Сквозная трансформация"],
  transformation: ["36", "Сквозная трансформация", "Принять омниканальную сеть", "Совет директоров просит провести покупателя от кампании до заказа, выдачи, возврата и корректного финансового результата.", "Итог четвёртой карты"]
};

function isChapter4Unlocked() {
  if (isChapter4StudyMode()) return true;
  try {
    const thirdState = window.BPMQuestChapter3?.getState?.()
      || JSON.parse(localStorage.getItem("bpmsoft-quest-chapter3-v1"));
    return thirdState?.orbitComplete === true;
  } catch {
    return false;
  }
}

function getCurrentChapter4MissionKey() {
  const rank = getChapter4ProgressRank(chapter4State);
  return CHAPTER4_MISSION_KEYS[Math.min(rank, CHAPTER4_MISSION_KEYS.length - 1)];
}

function renderChapter4Stats() {
  if (typeof document === "undefined") return;
  const xpValue = document.getElementById("xp-value");
  const xpGoal = document.getElementById("xp-goal");
  const xpBar = document.getElementById("xp-bar");
  const levelValue = document.getElementById("level-value");
  const energyRunes = document.getElementById("energy-runes");
  if (!xpValue || !xpGoal || !xpBar || !levelValue || !energyRunes) return;
  const levelStart = chapter4State.level === 7 ? 0 : 350;
  const levelXp = Math.max(0, chapter4State.chapterXp - levelStart);
  xpValue.textContent = String(levelXp);
  xpGoal.textContent = "350";
  xpBar.style.width = `${Math.min((levelXp / 350) * 100, 100)}%`;
  levelValue.textContent = String(chapter4State.level);
  energyRunes.innerHTML = "";
  for (let index = 0; index < 4; index += 1) {
    const cell = document.createElement("span");
    cell.className = `energy-rune${index >= chapter4State.energy ? " is-empty" : ""}`;
    cell.setAttribute("aria-hidden", "true");
    energyRunes.append(cell);
  }
  window.BPMQuestFirstChapter?.refreshLevelHints?.();
}

function setChapter4SwitcherState(activeChapter) {
  const switcher = document.getElementById("chapter-switcher");
  const buttons = [
    document.getElementById("show-first-chapter"),
    document.getElementById("show-second-chapter"),
    document.getElementById("show-third-chapter"),
    document.getElementById("show-fourth-chapter"),
    document.getElementById("show-fifth-chapter")
  ];
  if (!switcher || buttons.some((button) => !button)) return;
  const firstUnlocked = isChapter4StudyMode() || window.BPMQuestFirstChapter?.getState?.().solutionMissionComplete === true;
  switcher.hidden = !firstUnlocked;
  buttons[2].disabled = !(isChapter4StudyMode() || window.BPMQuestChapter3?.getState?.().orbitComplete === true || isChapter4Unlocked());
  buttons[3].disabled = !isChapter4Unlocked();
  buttons[4].disabled = !(isChapter4StudyMode() || chapter4State.transformationComplete === true);
  buttons.forEach((button, index) => {
    const active = activeChapter === ["chapter1", "chapter2", "chapter3", "chapter4", "chapter5"][index];
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });
}

function renderChapter4Brief(key) {
  const brief = chapter4Briefs[key];
  if (!brief) return;
  const index = CHAPTER4_MISSION_KEYS.indexOf(key);
  const complete = chapter4State[CHAPTER4_COMPLETION_FLAGS[index]] === true;
  const study = isChapter4StudyMode();
  document.getElementById("chapter4-brief-number").textContent = complete ? `Задание ${brief[0]} выполнено` : `Задание ${brief[0]}`;
  document.getElementById("chapter4-brief-title").textContent = complete ? brief[1] : brief[2];
  document.getElementById("chapter4-brief-copy").textContent = complete
    ? "Решение уже принято. Аудит можно повторить без повторного начисления баллов."
    : brief[3];
  document.getElementById("chapter4-brief-reward").textContent = study ? "учебный запуск" : complete ? "получена" : key === "transformation" ? "140 XP карты" : "70 XP карты";
  document.getElementById("chapter4-brief-time").textContent = key === "transformation" ? "9 наблюдений · 3 цепочки" : "6 наблюдений · 2 цепочки";
  document.getElementById("chapter4-brief-unlock").textContent = study ? "все задания открыты" : complete ? "повторное прохождение" : brief[4];
  const start = document.getElementById("chapter4-start-mission");
  start.dataset.c4Mission = key;
  start.textContent = complete ? `Повторить задание ${brief[0]}` : "Открыть аудит";
}

function renderChapter4MapState() {
  if (typeof document === "undefined") return;
  const study = isChapter4StudyMode();
  const rank = getChapter4ProgressRank(chapter4State);
  const currentKey = getCurrentChapter4MissionKey();
  const label = document.getElementById("chapter4-level-label");
  const title = document.getElementById("chapter4-map-title");
  if (label) label.textContent = study ? "Свободное прохождение" : chapter4State.chapterComplete ? "Трансформация завершена" : "Омниканальный проект";
  if (title) title.textContent = study ? "Все задания сети «Золотая полка»" : chapter4State.chapterComplete ? "Единый клиентский маршрут принят" : "Объединение торговой сети";
  CHAPTER4_MISSION_KEYS.forEach((key, index) => {
    const complete = chapter4State[CHAPTER4_COMPLETION_FLAGS[index]] === true;
    const available = study || index <= rank;
    document.querySelectorAll(`[data-c4-zone="${key}"]`).forEach((button) => {
      button.disabled = !available;
      button.classList.toggle("is-current", key === currentKey && !complete);
      button.classList.toggle("is-complete", complete);
    });
    const row = document.querySelector(`[data-c4-zone-row="${key}"]`);
    if (row) {
      row.classList.toggle("is-current", key === currentKey && !complete);
      row.classList.toggle("is-complete", complete);
    }
  });
  renderChapter4Brief(currentKey);
}

function hideChapter4Overlays() {
  document.getElementById("chapter4-prologue")?.setAttribute("hidden", "");
  document.getElementById("chapter4-mission-intro")?.setAttribute("hidden", "");
  document.body?.classList.remove("has-mission-intro");
}

function openChapter4Prologue() {
  const prologue = document.getElementById("chapter4-prologue");
  if (!prologue) return;
  prologue.hidden = false;
  document.body?.classList.add("has-mission-intro");
}

function showChapter4View(id) {
  document.querySelectorAll(".view").forEach((view) => {
    view.classList.remove("is-active");
    view.hidden = true;
  });
  const view = document.getElementById(id);
  if (!view) return;
  view.hidden = false;
  view.classList.add("is-active");
  document.body?.classList.remove("theme-copper", "theme-orbit", "theme-sky");
  document.body?.classList.add("theme-market");
  setChapter4SwitcherState("chapter4");
  renderChapter4Stats();
}

function activateChapter4Map({ reviewPrologue = false } = {}) {
  if (!isChapter4Unlocked()) return false;
  window.BPMQuestChapter3?.closeOverlays?.();
  showChapter4View("chapter4-map-view");
  renderChapter4MapState();
  if (!chapter4State.prologueSeen || reviewPrologue) openChapter4Prologue();
  else hideChapter4Overlays();
  window.scrollTo?.({ top: 0, behavior: "smooth" });
  return true;
}

function activateChapter3FromChapter4() {
  hideChapter4Overlays();
  document.body?.classList.remove("theme-market", "theme-sky");
  window.BPMQuestChapter3?.activateMap?.();
}

function activateChapter2FromChapter4() {
  hideChapter4Overlays();
  document.body?.classList.remove("theme-market", "theme-orbit", "theme-sky");
  window.BPMQuestChapter2?.activateMap?.();
}

function activateFirstFromChapter4() {
  hideChapter4Overlays();
  document.body?.classList.remove("theme-market", "theme-orbit", "theme-copper", "theme-sky");
  window.BPMQuestChapter2?.activateFirstChapter?.();
}

function acceptChapter4Prologue() {
  chapter4State.prologueSeen = true;
  saveChapter4State();
  hideChapter4Overlays();
  renderChapter4MapState();
}

function resetChapter4Progress() {
  if (!window.confirm("Сбросить баллы, попытки и открытые задания проекта «Золотая полка»?")) return;
  chapter4State = { ...chapter4InitialState };
  writeChapter4LocalState(getPersistedChapter4State());
  window.BPMQuestFirstChapter?.trackLearningEvent?.("chapter_reset", {
    chapterId: "chapter4",
    details: { source: "player" }
  });
  window.BPMQuestFirstChapter?.resetAccountProgress?.("chapter4");
  renderChapter4Stats();
  renderChapter4MapState();
  openChapter4Prologue();
}

function applyChapter4AccessMode(previousMode = null) {
  if (previousMode === "study" && !isChapter4StudyMode()) chapter4State = loadChapter4State();
  const reset = document.getElementById("chapter4-reset-progress");
  if (reset) reset.hidden = isChapter4StudyMode();
  const missionView = document.getElementById("chapter4-mission-view");
  const mapView = document.getElementById("chapter4-map-view");
  const visible = missionView?.hidden === false || mapView?.hidden === false;
  if (!isChapter4Unlocked()) {
    setChapter4SwitcherState(visible ? "chapter3" : "chapter1");
    if (visible) activateChapter3FromChapter4();
    return;
  }
  const index = CHAPTER4_MISSION_KEYS.indexOf(chapter4State.activeMission);
  const locked = !isChapter4StudyMode() && index > getChapter4ProgressRank(chapter4State);
  renderChapter4MapState();
  setChapter4SwitcherState(visible ? "chapter4" : "chapter1");
  if (locked && missionView?.hidden === false) activateChapter4Map();
}

const chapter4Missions = typeof goldenShelfMissions !== "undefined" ? goldenShelfMissions : {};

function getChapter4MissionProgress(key, { reset = false } = {}) {
  const mission = chapter4Missions[key];
  if (!mission) return null;
  const existing = chapter4State.missionProgress[key];
  if (reset || !existing || typeof existing !== "object") {
    chapter4State.missionProgress[key] = { stage: 0, seen: {}, placements: {}, cardOrders: {}, lastWrong: [], tutorialGraceUsed: false };
  }
  const progress = chapter4State.missionProgress[key];
  progress.stage = Math.max(0, Math.min(Number(progress.stage) || 0, mission.stages.length - 1));
  progress.seen = progress.seen && typeof progress.seen === "object" && !Array.isArray(progress.seen) ? progress.seen : {};
  progress.placements = progress.placements && typeof progress.placements === "object" && !Array.isArray(progress.placements) ? progress.placements : {};
  progress.cardOrders = progress.cardOrders && typeof progress.cardOrders === "object" && !Array.isArray(progress.cardOrders) ? progress.cardOrders : {};
  progress.lastWrong = Array.isArray(progress.lastWrong) ? progress.lastWrong : [];
  progress.tutorialGraceUsed = progress.tutorialGraceUsed === true;
  return progress;
}

function shuffleChapter4Cards(cards) {
  const copy = [...cards];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const target = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[target]] = [copy[target], copy[index]];
  }
  return copy;
}

function getChapter4CardOrder(stage, progress) {
  const existing = progress.cardOrders[stage.id];
  const valid = Array.isArray(existing)
    && existing.length === stage.cards.length
    && existing.every((id) => stage.cards.some((card) => card.id === id));
  if (!valid) progress.cardOrders[stage.id] = shuffleChapter4Cards(stage.cards).map((card) => card.id);
  return progress.cardOrders[stage.id].map((id) => stage.cards.find((card) => card.id === id));
}

function getChapter4Seen(stage, progress) {
  const seen = progress.seen[stage.id];
  return Array.isArray(seen) ? seen.filter((id) => stage.hotspots.some((spot) => spot.id === id)) : [];
}

function chapter4PlacementKey(stage, role) {
  return `${stage.id}:${role}`;
}

function getChapter4Placement(stage, progress, role) {
  return progress.placements[chapter4PlacementKey(stage, role)] || "";
}

function getChapter4ActiveRole(stage, progress) {
  return CHAPTER4_ROLE_ORDER.find((role) => !getChapter4Placement(stage, progress, role)) || "test";
}

function setChapter4Placement(stage, progress, role, cardId) {
  if (chapter4RunComplete) return false;
  const key = chapter4PlacementKey(stage, role);
  if (!cardId || progress.placements[key] === cardId) delete progress.placements[key];
  else progress.placements[key] = cardId;
  progress.lastWrong = progress.lastWrong.filter((item) => item !== role);
  saveChapter4State();
  renderChapter4Decision(stage, progress);
  return true;
}

function renderChapter4MissionIntro(mission, mode = "first-visit") {
  const intro = document.getElementById("chapter4-mission-intro");
  if (!intro) return;
  intro.dataset.mission = mission.key;
  intro.dataset.mode = mode;
  document.getElementById("chapter4-mission-intro-number").textContent = mission.number;
  document.getElementById("chapter4-mission-intro-kicker").textContent = `Аудит заказчика · ${mission.zone}`;
  document.getElementById("chapter4-mission-intro-title").textContent = mission.introTitle;
  document.getElementById("chapter4-mission-intro-copy").innerHTML = mission.intro.map((paragraph) => `<p>${paragraph}</p>`).join("");
  document.getElementById("chapter4-mission-intro-image").src = CHAPTER4_MISSION_IMAGES[mission.key];
  document.getElementById("chapter4-mission-intro-start").textContent = mode === "review" ? "Вернуться к аудиту" : "Начать аудит";
  intro.hidden = false;
  document.body?.classList.add("has-mission-intro");
}

function hideChapter4MissionIntro() {
  document.getElementById("chapter4-mission-intro")?.setAttribute("hidden", "");
  document.body?.classList.remove("has-mission-intro");
}

function acceptChapter4MissionIntro() {
  const intro = document.getElementById("chapter4-mission-intro");
  const key = intro?.dataset.mission || chapter4State.activeMission;
  if (!chapter4State.introSeen.includes(key)) {
    chapter4State.introSeen = [...chapter4State.introSeen, key];
    saveChapter4State();
  }
  hideChapter4MissionIntro();
}

function dismissChapter4MissionIntro() {
  hideChapter4MissionIntro();
  activateChapter4Map();
}

function renderChapter4KnowledgeSource(mission) {
  const element = document.getElementById("chapter4-source-copy");
  if (!element) return;
  element.replaceChildren();
  const link = document.createElement("a");
  link.href = mission.sourceUrl;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.textContent = mission.source;
  element.append(link);
}

function renderChapter4Codex(mission) {
  document.getElementById("chapter4-codex-title").textContent = mission.zone;
  document.getElementById("chapter4-codex-list").innerHTML = mission.codex
    .map(([term, definition]) => `<div><dt>${term}</dt><dd>${definition}</dd></div>`)
    .join("");
  renderChapter4KnowledgeSource(mission);
}

function renderChapter4StageList(mission, progress) {
  document.getElementById("chapter4-stage-list").innerHTML = mission.stages.map((stage, index) => {
    const stateClass = index < progress.stage ? "is-complete" : index === progress.stage ? "is-active" : "";
    return `<li class="${stateClass}"><span>${index + 1}</span>${stage.title}</li>`;
  }).join("");
}

function renderChapter4Audit(stage, progress) {
  const image = document.getElementById("chapter4-scene-image");
  image.src = CHAPTER4_MISSION_IMAGES[chapter4State.activeMission];
  const layer = document.getElementById("chapter4-hotspot-layer");
  const seen = getChapter4Seen(stage, progress);
  if (!seen.includes(chapter4ActiveHotspotId)) chapter4ActiveHotspotId = seen[seen.length - 1] || "";
  layer.replaceChildren();

  stage.hotspots.forEach((spot, index) => {
    const found = seen.includes(spot.id);
    const active = chapter4ActiveHotspotId === spot.id;
    const marker = document.createElement("div");
    marker.className = `c4-hotspot-marker${found ? " is-found" : ""}${active ? " is-active" : ""}${spot.x < 25 ? " is-left" : spot.x > 75 ? " is-right" : ""}`;
    marker.style.setProperty("--x", `${spot.x}%`);
    marker.style.setProperty("--y", `${spot.y}%`);

    const button = document.createElement("button");
    button.type = "button";
    button.className = `c4-hotspot${found ? " is-found" : ""}`;
    button.dataset.c4Hotspot = spot.id;
    button.setAttribute("aria-label", `${found ? "Показать найденный факт" : "Осмотреть"} ${index + 1}: ${spot.label}`);
    button.innerHTML = `<span>${index + 1}${found ? '<i aria-hidden="true">✓</i>' : ""}</span><strong>${spot.label}</strong>`;
    button.disabled = chapter4RunComplete;
    button.addEventListener("click", () => inspectChapter4Hotspot(spot.id));
    marker.append(button);

    if (found) {
      const fact = document.createElement("div");
      fact.id = `chapter4-fact-${stage.id}-${spot.id}`;
      fact.className = `c4-hotspot-fact${active ? " is-active" : ""}`;
      fact.setAttribute("role", "note");
      fact.innerHTML = `<span>Факт ${index + 1}</span><p>${spot.fact}</p>`;
      button.setAttribute("aria-describedby", fact.id);
      marker.append(fact);
    }
    layer.append(marker);
  });

  const progressLabel = document.getElementById("chapter4-audit-progress");
  progressLabel.textContent = `${seen.length} / ${stage.hotspots.length} фактов`;
  document.getElementById("chapter4-audit-panel").classList.toggle("is-complete", seen.length === stage.hotspots.length);
}

function inspectChapter4Hotspot(spotId) {
  if (chapter4RunComplete) return false;
  const mission = chapter4Missions[chapter4State.activeMission];
  const progress = getChapter4MissionProgress(mission.key);
  const stage = mission.stages[progress.stage];
  if (!stage.hotspots.some((spot) => spot.id === spotId)) return;
  chapter4ActiveHotspotId = spotId;
  const seen = new Set(getChapter4Seen(stage, progress));
  seen.add(spotId);
  progress.seen[stage.id] = [...seen];
  saveChapter4State();
  renderChapter4Audit(stage, progress);
  renderChapter4Decision(stage, progress);
  return true;
}

function renderChapter4Decision(stage, progress) {
  const seen = getChapter4Seen(stage, progress);
  const auditComplete = seen.length === stage.hotspots.length;
  const activeRole = getChapter4ActiveRole(stage, progress);
  const slots = document.getElementById("chapter4-chain-slots");
  const deck = document.getElementById("chapter4-card-deck");
  const choiceGuide = document.getElementById("chapter4-choice-guide");
  const hintContext = `c4:${chapter4State.activeMission}:${stage.id}:${activeRole}`;
  const answerRevealed = window.BPMQuestFirstChapter?.isLevelHintRevealed?.(hintContext) === true;
  slots.replaceChildren();
  deck.replaceChildren();

  Object.entries(CHAPTER4_SLOT_LABELS).forEach(([role, [label, hint]]) => {
    const selectedId = getChapter4Placement(stage, progress, role);
    const selected = stage.cards.find((card) => card.id === selectedId);
    const slot = document.createElement("button");
    slot.type = "button";
    slot.className = `c4-chain-slot${selected ? " is-filled" : ""}${progress.lastWrong.includes(role) ? " is-wrong" : ""}${auditComplete && activeRole === role ? " is-active" : ""}`;
    slot.dataset.c4Slot = role;
    slot.disabled = !auditComplete || chapter4RunComplete || !selected;
    slot.innerHTML = selected
      ? `<span>${label}</span><strong>${selected.name}</strong><small>${selected.note} · Нажмите, чтобы изменить</small>`
      : `<span>${label}</span><strong>${activeRole === role && auditComplete ? "Сделайте выбор ниже" : "Следующий шаг"}</strong><small>${hint}</small>`;
    slot.addEventListener("click", () => {
      if (selected) setChapter4Placement(stage, progress, role, "");
    });
    slots.append(slot);
  });

  const roleCards = auditComplete
    ? getChapter4CardOrder(stage, progress).filter((card) => card.role === activeRole)
    : [];
  roleCards.forEach((card, index) => {
    const selected = getChapter4Placement(stage, progress, card.role) === card.id;
    const button = document.createElement("button");
    button.type = "button";
    button.className = `c4-decision-card${selected ? " is-used" : ""}${(window.BPMQuestFirstChapter?.isAdminActive?.() || answerRevealed) && card.correct ? " is-admin-correct" : ""}`;
    button.disabled = chapter4RunComplete;
    button.dataset.c4Card = card.id;
    button.innerHTML = `<span>Вариант ${index + 1}</span><strong>${card.name}</strong><small>${card.note}</small>`;
    button.addEventListener("click", () => setChapter4Placement(stage, progress, card.role, card.id));
    deck.append(button);
  });

  const placements = CHAPTER4_ROLE_ORDER.filter((role) => getChapter4Placement(stage, progress, role)).length;
  const check = document.getElementById("chapter4-check-chain");
  check.disabled = chapter4RunComplete || !auditComplete || placements < 3;
  document.getElementById("chapter4-decision-lock").hidden = auditComplete;
  choiceGuide.hidden = !auditComplete;
  if (auditComplete) {
    const [label, hint] = CHAPTER4_SLOT_LABELS[activeRole];
    const tutorial = chapter4State.activeMission === "migration" ? `<small>${CHAPTER4_TUTORIAL_COPY[activeRole]}</small>` : "";
    choiceGuide.innerHTML = `<span>${label}</span><strong>${hint}. Выберите один из двух вариантов.</strong>${tutorial}`;
    const hintButton = window.BPMQuestFirstChapter?.createLevelHintButton?.(
      hintContext,
      () => renderChapter4Decision(stage, progress)
    );
    if (hintButton) choiceGuide.append(hintButton);
  }
  renderChapter4TaskGuide(stage, progress);
}

function renderChapter4TaskGuide(stage, progress) {
  const seen = getChapter4Seen(stage, progress);
  const auditComplete = seen.length === stage.hotspots.length;
  const selected = {
    cause: Boolean(getChapter4Placement(stage, progress, "cause")),
    mechanism: Boolean(getChapter4Placement(stage, progress, "mechanism")),
    test: Boolean(getChapter4Placement(stage, progress, "test"))
  };
  const currentStep = !auditComplete ? "audit" : getChapter4ActiveRole(stage, progress);
  const stepOrder = ["audit", "cause", "mechanism", "test"];
  const currentIndex = stepOrder.indexOf(currentStep);
  document.querySelectorAll("[data-c4-task-step]").forEach((item) => {
    const index = stepOrder.indexOf(item.dataset.c4TaskStep);
    const active = index === currentIndex;
    item.classList.toggle("is-active", active);
    item.classList.toggle("is-complete", index < currentIndex);
    if (active) item.setAttribute("aria-current", "step");
    else item.removeAttribute("aria-current");
  });

  const copy = currentStep === "audit"
    ? `Шаг 1 из 4. Нажмите оставшиеся метки на изображении: ${seen.length} из ${stage.hotspots.length} найдено.`
    : currentStep === "cause"
      ? "Шаг 2 из 4. Выберите одну из двух причин: она должна объяснять найденные факты."
      : currentStep === "mechanism"
        ? "Шаг 3 из 4. Выберите одно из двух решений: конкретное изменение в BPMSoft или интеграции."
        : selected.test
          ? "Шаг 4 из 4. Цепочка готова: прочитайте её слева направо и проверьте решение."
          : "Шаг 4 из 4. Выберите проверку: сценарий, который докажет, что решение устранило причину.";
  document.getElementById("chapter4-next-action").textContent = copy;
  document.getElementById("chapter4-chain-hint").textContent = copy;
}

function getChapter4TutorialCorrection(stage, wrong) {
  const factMap = CHAPTER4_TUTORIAL_FACTS[stage.id] || {};
  return wrong.map((role) => {
    const spotId = factMap[role];
    const index = stage.hotspots.findIndex((spot) => spot.id === spotId);
    const spot = stage.hotspots[index];
    return spot ? `Для звена «${CHAPTER4_ROLE_NAMES[role].toLowerCase()}» ещё раз сопоставьте факт ${index + 1}: «${spot.fact}»` : "";
  }).filter(Boolean).join(" ");
}

function renderChapter4Mission() {
  const mission = chapter4Missions[chapter4State.activeMission];
  if (!mission) {
    activateChapter4Map();
    return;
  }
  const progress = getChapter4MissionProgress(mission.key);
  const stage = mission.stages[progress.stage];
  document.getElementById("chapter4-mission-number").textContent = mission.number;
  document.getElementById("chapter4-mission-zone").textContent = mission.zone;
  document.getElementById("chapter4-mission-title").textContent = mission.title;
  document.getElementById("chapter4-attempt-badge").textContent = `Попытка ${chapter4State.attempts}`;
  document.getElementById("chapter4-lore-copy").textContent = mission.lore;
  document.getElementById("chapter4-stage-kicker").textContent = stage.kicker;
  document.getElementById("chapter4-stage-title").textContent = stage.title;
  document.getElementById("chapter4-stage-instruction").textContent = stage.instruction;
  renderChapter4StageList(mission, progress);
  renderChapter4Audit(stage, progress);
  renderChapter4Decision(stage, progress);
  renderChapter4Codex(mission);
}

function hideChapter4Feedback() {
  document.getElementById("chapter4-feedback")?.setAttribute("hidden", "");
}

function showChapter4Feedback({ kicker, title, copy, score = 0, action, actionLabel }) {
  const feedback = document.getElementById("chapter4-feedback");
  document.getElementById("chapter4-feedback-kicker").textContent = kicker;
  document.getElementById("chapter4-feedback-title").textContent = title;
  document.getElementById("chapter4-feedback-copy").textContent = copy;
  document.getElementById("chapter4-feedback-score").textContent = String(score);
  const button = document.getElementById("chapter4-feedback-action");
  button.dataset.action = action;
  button.textContent = actionLabel;
  feedback.hidden = false;
}

function completeChapter4Mission(mission) {
  if (isChapter4StudyMode()) return 0;
  const alreadyComplete = chapter4State[mission.completionFlag] === true;
  chapter4State[mission.completionFlag] = true;
  if (mission.key === "transformation") {
    chapter4State.chapterComplete = true;
    chapter4State.achievementGranted = true;
  }
  chapter4State = normalizeChapter4State(chapter4State);
  saveChapter4State();
  renderChapter4Stats();
  renderChapter4MapState();
  return alreadyComplete ? 0 : mission.score;
}

function checkChapter4Chain() {
  if (chapter4RunComplete) return false;
  const mission = chapter4Missions[chapter4State.activeMission];
  const progress = getChapter4MissionProgress(mission.key);
  const stage = mission.stages[progress.stage];
  const seen = getChapter4Seen(stage, progress);
  if (seen.length < stage.hotspots.length) {
    document.getElementById("chapter4-chain-hint").textContent = "Сначала завершите аудит панорамы.";
    return false;
  }
  const roles = Object.keys(CHAPTER4_SLOT_LABELS);
  const missing = roles.filter((role) => !getChapter4Placement(stage, progress, role));
  if (missing.length) {
    document.getElementById("chapter4-chain-hint").textContent = `Не заполнено звеньев: ${missing.length}.`;
    return false;
  }
  const wrong = roles.filter((role) => getChapter4Placement(stage, progress, role) !== stage.solution[role]);
  if (wrong.length) {
    window.BPMQuestFirstChapter?.trackLearningEvent?.("answer_checked", {
      chapterId: "chapter4",
      missionKey: mission.key,
      outcome: "failure",
      attempt: chapter4State.attempts,
      details: { stage: progress.stage, wrongCount: wrong.length }
    });
    const tutorialGrace = mission.key === "migration" && !progress.tutorialGraceUsed;
    if (tutorialGrace) progress.tutorialGraceUsed = true;
    else {
      chapter4State.energy = Math.max(0, chapter4State.energy - 1);
      chapter4State.attempts += 1;
    }
    progress.lastWrong = wrong;
    wrong.forEach((role) => delete progress.placements[chapter4PlacementKey(stage, role)]);
    saveChapter4State();
    renderChapter4Stats();
    renderChapter4Mission();
    const exhausted = !tutorialGrace && chapter4State.energy === 0;
    const tutorialCopy = tutorialGrace ? getChapter4TutorialCorrection(stage, wrong) : "";
    showChapter4Feedback({
      kicker: tutorialGrace ? "Учебная подсказка" : exhausted ? "Аудит приостановлен" : "Цепочка не подтверждена",
      title: tutorialGrace ? "Первая ошибка не расходует попытку" : exhausted ? "Запас попыток исчерпан" : `Нужно пересмотреть: ${wrong.length}`,
      copy: tutorialGrace
        ? `${tutorialCopy} Верные звенья сохранены, а вопрос с ошибкой открыт снова.`
        : exhausted
        ? "Факты уже собраны. Перезапустите стол и заново сопоставьте причину, решение и проверку."
        : `Пересмотрите звенья «${wrong.map((role) => CHAPTER4_ROLE_NAMES[role].toLowerCase()).join("», «") }». Верные звенья можно оставить на месте.`,
      action: exhausted ? "retry" : "dismiss",
      actionLabel: exhausted ? "Перезапустить стол" : tutorialGrace ? "Продолжить с подсказкой" : "Исправить решение"
    });
    return false;
  }

  window.BPMQuestFirstChapter?.trackLearningEvent?.("answer_checked", {
    chapterId: "chapter4",
    missionKey: mission.key,
    outcome: "success",
    attempt: chapter4State.attempts,
    details: { stage: progress.stage }
  });
  progress.lastWrong = [];
  if (progress.stage < mission.stages.length - 1) {
    progress.stage += 1;
    saveChapter4State();
    renderChapter4Mission();
    showChapter4Feedback({
      kicker: "Цепочка подтверждена",
      title: stage.successTitle,
      copy: stage.successCopy,
      action: "continue",
      actionLabel: "Перейти к следующему раунду"
    });
    return true;
  }

  chapter4RunComplete = true;
  renderChapter4Audit(stage, progress);
  renderChapter4Decision(stage, progress);
  const awarded = completeChapter4Mission(mission);
  window.BPMQuestFirstChapter?.trackLearningEvent?.("mission_completed", {
    chapterId: "chapter4",
    missionKey: mission.key,
    outcome: "success",
    attempt: chapter4State.attempts,
    details: { score: awarded, firstCompletion: awarded > 0 }
  });
  const index = CHAPTER4_MISSION_KEYS.indexOf(mission.key);
  const nextKey = CHAPTER4_MISSION_KEYS[index + 1];
  const nextMission = nextKey ? chapter4Missions[nextKey] : null;
  showChapter4Feedback({
    kicker: isChapter4StudyMode() ? "Учебный аудит завершён" : "Задание принято",
    title: stage.successTitle,
    copy: `${stage.successCopy}${awarded ? ` Начислено ${awarded} XP карты.` : ""}`,
    score: awarded,
    action: mission.key === "transformation" ? "finale" : nextMission ? `next:${nextKey}` : "map",
    actionLabel: mission.key === "transformation" ? "Завершить трансформацию" : nextMission ? `Открыть задание ${nextMission.number}` : "Вернуться на карту"
  });
  return true;
}

function retryChapter4Stage() {
  const mission = chapter4Missions[chapter4State.activeMission];
  const progress = getChapter4MissionProgress(mission.key);
  const stage = mission.stages[progress.stage];
  chapter4State.energy = 4;
  chapter4State.attempts += 1;
  progress.lastWrong = [];
  Object.keys(CHAPTER4_SLOT_LABELS).forEach((role) => delete progress.placements[chapter4PlacementKey(stage, role)]);
  saveChapter4State();
  renderChapter4Stats();
  renderChapter4Mission();
  hideChapter4Feedback();
}

function beginChapter4Mission(key) {
  const mission = chapter4Missions[key];
  if (!mission || !isChapter4Unlocked()) return false;
  const index = CHAPTER4_MISSION_KEYS.indexOf(key);
  if (!isChapter4StudyMode() && index > getChapter4ProgressRank(chapter4State)) return false;
  chapter4RunComplete = false;
  chapter4State.activeMission = key;
  chapter4State.energy = 4;
  chapter4State.attempts = 1;
  getChapter4MissionProgress(key, { reset: true });
  saveChapter4State();
  window.BPMQuestFirstChapter?.trackLearningEvent?.("mission_started", {
    chapterId: "chapter4",
    missionKey: key,
    attempt: 1,
    details: { replay: chapter4State[mission.completionFlag] === true }
  });
  hideChapter4Feedback();
  showChapter4View("chapter4-mission-view");
  renderChapter4Mission();
  if (chapter4State.introSeen.includes(key)) hideChapter4MissionIntro();
  else renderChapter4MissionIntro(mission);
  window.scrollTo?.({ top: 0, behavior: "smooth" });
  return true;
}

function showChapter4Finale() {
  if (!chapter4State.transformationComplete) return;
  hideChapter4MissionIntro();
  showChapter4View("chapter4-finale-view");
}

function handleChapter4FeedbackAction() {
  const action = document.getElementById("chapter4-feedback-action").dataset.action || "dismiss";
  if (action === "dismiss" || action === "continue") {
    hideChapter4Feedback();
    return;
  }
  if (action === "retry") {
    retryChapter4Stage();
    return;
  }
  if (action === "map") {
    hideChapter4Feedback();
    activateChapter4Map();
    return;
  }
  if (action === "finale") {
    hideChapter4Feedback();
    showChapter4Finale();
    return;
  }
  if (action.startsWith("next:")) {
    hideChapter4Feedback();
    beginChapter4Mission(action.replace("next:", ""));
  }
}

function refreshChapter4AdminHighlights() {
  const mission = chapter4Missions[chapter4State.activeMission];
  if (!mission) return;
  const progress = getChapter4MissionProgress(mission.key);
  renderChapter4Decision(mission.stages[progress.stage], progress);
}

function initializeChapter4() {
  if (!document.getElementById("chapter4-map-view")) return;
  document.getElementById("show-fourth-chapter")?.addEventListener("click", () => activateChapter4Map());
  document.getElementById("chapter3-finale-chapter4")?.addEventListener("click", () => activateChapter4Map());
  document.getElementById("chapter4-prologue-start")?.addEventListener("click", acceptChapter4Prologue);
  document.getElementById("chapter4-prologue-back")?.addEventListener("click", activateChapter3FromChapter4);
  document.getElementById("chapter4-reset-progress")?.addEventListener("click", resetChapter4Progress);
  document.querySelectorAll("[data-c4-zone]").forEach((button) => {
    const previewMission = () => {
      if (!button.disabled) renderChapter4Brief(button.dataset.c4Zone);
    };
    button.addEventListener("pointerenter", previewMission);
    button.addEventListener("focus", previewMission);
    button.addEventListener("click", () => {
      if (!button.disabled) beginChapter4Mission(button.dataset.c4Zone);
    });
  });
  document.getElementById("chapter4-start-mission")?.addEventListener("click", (event) => beginChapter4Mission(event.currentTarget.dataset.c4Mission));
  document.getElementById("chapter4-back-to-map")?.addEventListener("click", () => activateChapter4Map());
  document.getElementById("chapter4-review-intro")?.addEventListener("click", () => {
    const mission = chapter4Missions[chapter4State.activeMission];
    if (mission) renderChapter4MissionIntro(mission, "review");
  });
  document.getElementById("chapter4-mission-intro-start")?.addEventListener("click", acceptChapter4MissionIntro);
  document.getElementById("chapter4-mission-intro-map")?.addEventListener("click", dismissChapter4MissionIntro);
  document.getElementById("chapter4-check-chain")?.addEventListener("click", checkChapter4Chain);
  document.getElementById("chapter4-feedback-action")?.addEventListener("click", handleChapter4FeedbackAction);
  document.getElementById("chapter4-finale-map")?.addEventListener("click", () => activateChapter4Map());
  document.getElementById("chapter4-finale-replay")?.addEventListener("click", () => beginChapter4Mission("transformation"));
  document.getElementById("chapter4-finale-third")?.addEventListener("click", activateChapter3FromChapter4);
  document.getElementById("chapter4-finale-first")?.addEventListener("click", activateFirstFromChapter4);

  window.BPMQuestChapter4.activateMap = activateChapter4Map;
  window.BPMQuestChapter4.beginMission = beginChapter4Mission;
  window.BPMQuestChapter4.inspectHotspot = inspectChapter4Hotspot;
  window.BPMQuestChapter4.assignCard = (role, cardId) => {
    const mission = chapter4Missions[chapter4State.activeMission];
    const progress = getChapter4MissionProgress(mission.key);
    const stage = mission.stages[progress.stage];
    const card = stage.cards.find((item) => item.id === cardId && item.role === role);
    if (!card) return false;
    return setChapter4Placement(stage, progress, role, card.id);
  };
  window.BPMQuestChapter4.checkChain = checkChapter4Chain;
  window.BPMQuestChapter4.getMissionProgress = getChapter4MissionProgress;
  window.BPMQuestChapter4.refreshAdminHighlights = refreshChapter4AdminHighlights;
  window.BPMQuestChapter4.applyAccessMode = applyChapter4AccessMode;
  window.BPMQuestChapter4.closeOverlays = hideChapter4Overlays;
  window.BPMQuestChapter4.missions = chapter4Missions;
  applyChapter4AccessMode();
}

if (typeof document !== "undefined") initializeChapter4();
