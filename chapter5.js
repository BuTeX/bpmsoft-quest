import { goodAviaMissionKeys, goodAviaMissions } from "./chapter5-missions.js?v=20260721-good-avia-2";
import { createRuntime, getCurrentSnapshot, reduceRuntime } from "./chapter5-simulation.js";

const STORAGE_KEY = "bpmsoft-quest-chapter5-v1";
const STORAGE_UPDATED_AT_KEY = "bpmsoft-quest-chapter5-updated-at";
const CHAPTER_ID = "good-avia";
const COMPLETION_FLAGS = goodAviaMissionKeys.map((key) => `${key}Complete`);
const CANONICAL_XP = [80, 160, 240, 320, 400, 480, 560, 640, 800];
const MAP_POSITIONS = [
  [16, 28], [34, 16], [55, 13], [76, 25], [85, 49],
  [75, 73], [54, 82], [31, 74], [50, 48]
];

const initialState = {
  chapterId: CHAPTER_ID,
  chapterXp: 0,
  level: 9,
  energy: 4,
  attempts: 1,
  activeMission: "schedule",
  introSeen: [],
  prologueSeen: false,
  missionProgress: {},
  chapterComplete: false,
  achievementGranted: false,
  ...Object.fromEntries(COMPLETION_FLAGS.map((flag) => [flag, false]))
};

function progressRank(source = state) {
  return COMPLETION_FLAGS.reduce((rank, flag) => rank + Number(source?.[flag] === true), 0);
}

function sanitizeMissionProgress(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  return Object.fromEntries(goodAviaMissionKeys.flatMap((key) => {
    const value = input[key];
    if (!value || typeof value !== "object" || Array.isArray(value)) return [];
    const mission = goodAviaMissions[key];
    return [[key, {
      round: Math.max(0, Math.min(Number(value.round) || 0, mission.rounds.length - 1)),
      completedRounds: Array.isArray(value.completedRounds)
        ? [...new Set(value.completedRounds.filter((id) => mission.rounds.some((round) => round.id === id)))]
        : [],
      lastWrong: Array.isArray(value.lastWrong)
        ? [...new Set(value.lastWrong.filter((item) => typeof item === "string" && item.length <= 100))].slice(0, 6)
        : []
    }]];
  }));
}

function normalizeState(saved) {
  try {
    const merged = saved && typeof saved === "object" ? { ...initialState, ...saved } : { ...initialState };
    let previousComplete = true;
    COMPLETION_FLAGS.forEach((flag) => {
      merged[flag] = previousComplete && merged[flag] === true;
      previousComplete = merged[flag];
    });
    const rank = progressRank(merged);
    merged.chapterId = CHAPTER_ID;
    merged.chapterXp = rank ? CANONICAL_XP[rank - 1] : 0;
    merged.level = rank >= 5 ? 10 : 9;
    merged.energy = Math.max(0, Math.min(Number(merged.energy) || 0, 4));
    merged.attempts = Math.max(1, Math.min(Number(merged.attempts) || 1, 100));
    merged.activeMission = goodAviaMissionKeys[Math.min(rank, goodAviaMissionKeys.length - 1)];
    merged.introSeen = Array.isArray(merged.introSeen)
      ? [...new Set(merged.introSeen.filter((key) => goodAviaMissionKeys.includes(key)))]
      : [];
    merged.prologueSeen = merged.prologueSeen === true;
    merged.missionProgress = sanitizeMissionProgress(merged.missionProgress);
    merged.chapterComplete = merged.crisisComplete === true;
    merged.achievementGranted = merged.chapterComplete && merged.achievementGranted === true;
    return merged;
  } catch {
    return { ...initialState };
  }
}

function loadState() {
  try {
    return normalizeState(JSON.parse(localStorage.getItem(STORAGE_KEY)));
  } catch {
    return { ...initialState };
  }
}

function persistedState(source = state) {
  return {
    chapterId: CHAPTER_ID,
    energy: Math.max(0, Math.min(Number(source.energy) || 0, 4)),
    attempts: Math.max(1, Math.min(Number(source.attempts) || 1, 100)),
    introSeen: source.introSeen.filter((key) => goodAviaMissionKeys.includes(key)),
    prologueSeen: source.prologueSeen === true,
    missionProgress: sanitizeMissionProgress(source.missionProgress),
    achievementGranted: source.achievementGranted === true,
    ...Object.fromEntries(COMPLETION_FLAGS.map((flag) => [flag, source[flag] === true]))
  };
}

function writeLocalState(saved, updatedAt = new Date().toISOString()) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
    localStorage.setItem(STORAGE_UPDATED_AT_KEY, updatedAt);
  } catch {
    // The chapter remains playable without localStorage.
  }
}

function isStudyMode() {
  return window.BPMQuestFirstChapter?.isStudyMode?.() === true;
}

function isUnlocked() {
  if (isStudyMode()) return true;
  try {
    const fourth = window.BPMQuestChapter4?.getState?.() || JSON.parse(localStorage.getItem("bpmsoft-quest-chapter4-v1"));
    return fourth?.transformationComplete === true;
  } catch {
    return false;
  }
}

function saveState() {
  if (isStudyMode()) return;
  const saved = persistedState();
  writeLocalState(saved);
  window.BPMQuestFirstChapter?.scheduleChapter5ProgressSync?.(saved);
}

function hydrateState(nextState, updatedAt) {
  state = normalizeState(nextState);
  writeLocalState(persistedState(), updatedAt);
  renderStats();
  renderMap();
  return state;
}

let state = loadState();
let activeMission = null;
let activeProgress = null;
let activeRound = null;
let runtime = null;
let autoTimer = null;

const elements = {
  mapView: document.getElementById("chapter5-map-view"),
  missionView: document.getElementById("chapter5-mission-view"),
  finaleView: document.getElementById("chapter5-finale-view"),
  prologue: document.getElementById("chapter5-prologue"),
  missionIntro: document.getElementById("chapter5-mission-intro"),
  zoneList: document.getElementById("chapter5-zone-list"),
  mapNodes: document.getElementById("chapter5-map-nodes"),
  roundList: document.getElementById("chapter5-round-list"),
  scene: document.getElementById("chapter5-twin-scene"),
  entityGrid: document.getElementById("chapter5-entity-grid"),
  timeline: document.getElementById("chapter5-timeline"),
  controls: document.getElementById("chapter5-controls-grid"),
  journal: document.getElementById("chapter5-journal-list"),
  feedback: document.getElementById("chapter5-feedback"),
  announcer: document.getElementById("app-announcer") || document.body
};

function getMissionProgress(key, { reset = false } = {}) {
  const mission = goodAviaMissions[key];
  const existing = state.missionProgress[key];
  if (reset || !existing) {
    state.missionProgress[key] = { round: 0, completedRounds: [], lastWrong: [] };
  }
  const progress = state.missionProgress[key];
  progress.round = Math.max(0, Math.min(Number(progress.round) || 0, mission.rounds.length - 1));
  progress.completedRounds = Array.isArray(progress.completedRounds) ? progress.completedRounds : [];
  progress.lastWrong = Array.isArray(progress.lastWrong) ? progress.lastWrong : [];
  return progress;
}

function clearAutoTimer() {
  if (autoTimer !== null) window.clearTimeout(autoTimer);
  autoTimer = null;
}

function autoDelay() {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? 380 : 920;
}

function scheduleAdvance() {
  clearAutoTimer();
  if (!runtime || !["running", "verifying"].includes(runtime.status)) return;
  autoTimer = window.setTimeout(() => dispatch({ type: "ADVANCE" }), autoDelay());
}

function showView(id) {
  document.querySelectorAll(".view").forEach((view) => {
    view.hidden = true;
    view.classList.remove("is-active");
  });
  const view = document.getElementById(id);
  if (!view) return;
  view.hidden = false;
  view.classList.add("is-active");
  document.body.classList.remove("theme-copper", "theme-orbit", "theme-market");
  document.body.classList.add("theme-sky");
  setSwitcher("chapter5");
  renderStats();
}

function setSwitcher(activeChapter) {
  const switcher = document.getElementById("chapter-switcher");
  const buttons = [1, 2, 3, 4, 5].map((number) => document.getElementById([
    "show-first-chapter", "show-second-chapter", "show-third-chapter", "show-fourth-chapter", "show-fifth-chapter"
  ][number - 1]));
  if (!switcher || buttons.some((button) => !button)) return;
  switcher.hidden = !(isStudyMode() || window.BPMQuestFirstChapter?.getState?.().solutionMissionComplete === true);
  buttons[4].disabled = !isUnlocked();
  buttons.forEach((button, index) => {
    const active = activeChapter === `chapter${index + 1}`;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });
}

function renderStats() {
  const xpValue = document.getElementById("xp-value");
  const xpGoal = document.getElementById("xp-goal");
  const xpBar = document.getElementById("xp-bar");
  const levelValue = document.getElementById("level-value");
  const energyRunes = document.getElementById("energy-runes");
  if (!xpValue || !xpGoal || !xpBar || !levelValue || !energyRunes) return;
  const start = state.level === 9 ? 0 : 400;
  const levelXp = Math.max(0, state.chapterXp - start);
  xpValue.textContent = String(levelXp);
  xpGoal.textContent = "400";
  xpBar.style.width = `${Math.min(100, levelXp / 4)}%`;
  levelValue.textContent = String(state.level);
  energyRunes.replaceChildren(...Array.from({ length: 4 }, (_, index) => {
    const cell = document.createElement("span");
    cell.className = `energy-rune${index >= state.energy ? " is-empty" : ""}`;
    cell.setAttribute("aria-hidden", "true");
    return cell;
  }));
}

function buildMap() {
  elements.zoneList.replaceChildren(...goodAviaMissionKeys.map((key) => {
    const mission = goodAviaMissions[key];
    const item = document.createElement("li");
    item.dataset.c5ZoneRow = key;
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.c5Zone = key;
    button.innerHTML = `<span>${mission.number}</span><strong>${mission.zone}<small>${mission.title}</small></strong>`;
    button.addEventListener("click", () => renderBrief(key));
    item.append(button);
    return item;
  }));

  elements.mapNodes.replaceChildren(...goodAviaMissionKeys.map((key, index) => {
    const mission = goodAviaMissions[key];
    const button = document.createElement("button");
    button.type = "button";
    button.className = "c5-map-node";
    button.dataset.c5Zone = key;
    button.style.setProperty("--x", `${MAP_POSITIONS[index][0]}%`);
    button.style.setProperty("--y", `${MAP_POSITIONS[index][1]}%`);
    button.innerHTML = `<span>${mission.number}</span><strong>${index === 8 ? "Приёмка" : mission.zone.replace("Центр ", "")}</strong>`;
    button.addEventListener("click", () => renderBrief(key));
    return button;
  }));
}

function currentMissionKey() {
  return goodAviaMissionKeys[Math.min(progressRank(), goodAviaMissionKeys.length - 1)];
}

function renderMap() {
  if (!elements.mapView) return;
  const rank = progressRank();
  const current = currentMissionKey();
  document.getElementById("chapter5-level-label").textContent = isStudyMode()
    ? "Свободное прохождение"
    : state.chapterComplete ? "Мегахаб принят" : "Операционная устойчивость";
  document.getElementById("chapter5-map-title").textContent = state.chapterComplete
    ? "Контур «Гуд Авиа» подтверждён"
    : "Воздушный мегахаб";
  goodAviaMissionKeys.forEach((key, index) => {
    const complete = state[COMPLETION_FLAGS[index]] === true;
    const available = isStudyMode() || index <= rank;
    document.querySelectorAll(`[data-c5-zone="${key}"]`).forEach((button) => {
      button.disabled = !available;
      button.classList.toggle("is-current", key === current && !complete);
      button.classList.toggle("is-complete", complete);
    });
    const row = document.querySelector(`[data-c5-zone-row="${key}"]`);
    row?.classList.toggle("is-current", key === current && !complete);
    row?.classList.toggle("is-complete", complete);
  });
  renderBrief(current);
}

function renderBrief(key) {
  const mission = goodAviaMissions[key];
  if (!mission) return;
  const index = goodAviaMissionKeys.indexOf(key);
  const complete = state[COMPLETION_FLAGS[index]] === true;
  const next = goodAviaMissions[goodAviaMissionKeys[index + 1]];
  document.getElementById("chapter5-brief-number").textContent = complete ? `Задание ${mission.number} выполнено` : `Задание ${mission.number}`;
  document.getElementById("chapter5-brief-title").textContent = mission.title;
  document.getElementById("chapter5-brief-copy").textContent = complete
    ? "Устойчивость уже доказана. Операционный двойник можно повторить без повторного начисления XP."
    : mission.copy;
  document.getElementById("chapter5-brief-reward").textContent = isStudyMode() ? "учебный запуск" : complete ? "получена" : `${mission.score} XP карты`;
  document.getElementById("chapter5-brief-time").textContent = `${mission.rounds.length} ${mission.rounds.length === 3 ? "контрольных прогона" : "контрольных прогона"}`;
  document.getElementById("chapter5-brief-unlock").textContent = complete
    ? "повторное прохождение"
    : next ? `Задание ${next.number} · ${next.zone}` : "финал пятой карты";
  const start = document.getElementById("chapter5-start-mission");
  start.dataset.c5Mission = key;
  start.textContent = complete ? "Повторить двойник" : "Открыть двойник";
}

function closeOverlays() {
  elements.prologue.hidden = true;
  elements.missionIntro.hidden = true;
  document.body.classList.remove("has-mission-intro");
}

function openPrologue() {
  elements.prologue.hidden = false;
  document.body.classList.add("has-mission-intro");
}

function activateMap({ reviewPrologue = false } = {}) {
  if (!isUnlocked()) return false;
  clearAutoTimer();
  window.BPMQuestChapter4?.closeOverlays?.();
  showView("chapter5-map-view");
  renderMap();
  if (!state.prologueSeen || reviewPrologue) openPrologue();
  else closeOverlays();
  window.scrollTo?.({ top: 0, behavior: "smooth" });
  return true;
}

function activateFourth() {
  clearAutoTimer();
  closeOverlays();
  document.body.classList.remove("theme-sky");
  window.BPMQuestChapter4?.activateMap?.();
}

function activateFirst() {
  clearAutoTimer();
  closeOverlays();
  document.body.classList.remove("theme-sky", "theme-market", "theme-orbit", "theme-copper");
  window.BPMQuestChapter2?.activateFirstChapter?.();
}

function acceptPrologue() {
  state.prologueSeen = true;
  saveState();
  closeOverlays();
  renderMap();
}

function renderMissionIntro(mission, mode = "first") {
  elements.missionIntro.dataset.mission = mission.key;
  document.getElementById("chapter5-mission-intro-number").textContent = String(mission.number);
  document.getElementById("chapter5-mission-intro-kicker").textContent = `Операционный запрос · ${mission.zone}`;
  document.getElementById("chapter5-mission-intro-title").textContent = mission.introTitle;
  document.getElementById("chapter5-mission-intro-copy").innerHTML = `<p>${mission.copy}</p><p>${mission.lore}</p>`;
  document.getElementById("chapter5-mission-intro-start").textContent = mode === "review" ? "Вернуться к двойнику" : "Запустить двойник";
  elements.missionIntro.hidden = false;
  document.body.classList.add("has-mission-intro");
}

function acceptMissionIntro() {
  const key = elements.missionIntro.dataset.mission || state.activeMission;
  if (!state.introSeen.includes(key)) {
    state.introSeen.push(key);
    saveState();
  }
  closeOverlays();
}

function renderCodex(mission) {
  document.getElementById("chapter5-codex-title").textContent = mission.zone;
  document.getElementById("chapter5-codex-list").innerHTML = mission.codex
    .map(([term, definition]) => `<div><dt>${term}</dt><dd>${definition}</dd></div>`)
    .join("");
  const source = document.getElementById("chapter5-source-copy");
  source.replaceChildren();
  const link = document.createElement("a");
  link.href = mission.sourceUrl;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.textContent = mission.source;
  source.append(link);
}

function setupRound() {
  clearAutoTimer();
  activeProgress = getMissionProgress(activeMission.key);
  activeRound = activeMission.rounds[activeProgress.round];
  runtime = createRuntime(activeRound);
  hideFeedback();
  buildTimeline();
  buildControls();
  renderMission();
}

function beginMission(key) {
  const mission = goodAviaMissions[key];
  const index = goodAviaMissionKeys.indexOf(key);
  if (!mission || !isUnlocked() || (!isStudyMode() && index > progressRank())) return false;
  state.activeMission = key;
  state.energy = 4;
  state.attempts = 1;
  activeMission = mission;
  activeProgress = getMissionProgress(key, { reset: true });
  showView("chapter5-mission-view");
  renderCodex(mission);
  setupRound();
  saveState();
  if (!state.introSeen.includes(key)) renderMissionIntro(mission);
  else closeOverlays();
  window.scrollTo?.({ top: 0, behavior: "smooth" });
  return true;
}

function buildTimeline() {
  elements.timeline.style.setProperty("--tick-count", activeRound.ticks.length);
  elements.timeline.replaceChildren(...activeRound.ticks.map((tick, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "c5-tick-button";
    button.dataset.tickIndex = String(index);
    button.setAttribute("aria-label", `${tick.id}, ${tick.timeLabel}: ${tick.title}`);
    button.innerHTML = `<span>${tick.id}</span><small>${tick.timeLabel}</small>`;
    button.addEventListener("click", () => seek(index));
    return button;
  }));
}

function buildControls() {
  elements.controls.replaceChildren(...activeRound.controls.map((control) => {
    const card = document.createElement("div");
    card.className = "c5-control-card";
    card.dataset.controlId = control.id;
    const label = document.createElement("label");
    label.htmlFor = `c5-control-${activeRound.id}-${control.id}`;
    label.textContent = control.label;
    const select = document.createElement("select");
    select.id = label.htmlFor;
    select.dataset.controlId = control.id;
    control.options.forEach((option) => {
      const item = document.createElement("option");
      item.value = option.value;
      item.textContent = option.label;
      select.append(item);
    });
    select.value = control.defaultValue;
    select.disabled = true;
    const help = document.createElement("p");
    help.textContent = control.options.find((option) => option.value === select.value)?.help || "";
    select.addEventListener("change", () => {
      help.textContent = control.options.find((option) => option.value === select.value)?.help || "";
      dispatch({ type: "SET_CONTROL", controlId: control.id, value: select.value });
    });
    card.append(label, select, help);
    return card;
  }));
}

function dispatch(action) {
  clearAutoTimer();
  const previousStatus = runtime.status;
  try {
    runtime = reduceRuntime(activeRound, runtime, action);
  } catch (error) {
    console.error(error);
    renderRuntime();
    return;
  }

  if (runtime.status === "failed" && previousStatus !== "failed") {
    state.energy = Math.max(0, state.energy - 1);
    state.attempts += 1;
    activeProgress.lastWrong = [
      ...(runtime.verification?.checkpointCorrect ? [] : ["checkpoint"]),
      ...Object.entries(runtime.verification?.controls || {}).filter(([, value]) => value === "incorrect").map(([id]) => id)
    ];
    saveState();
    showVerificationFeedback(false);
  }

  if (runtime.status === "passed" && previousStatus !== "passed") {
    activeProgress.lastWrong = [];
    completeRound();
  }

  renderRuntime();
  renderStats();
  scheduleAdvance();
}

function seek(index) {
  if (!runtime || runtime.runKind !== "baseline" || !["paused", "diagnosing", "configured"].includes(runtime.status)) return;
  const max = runtime.baselineCompleted ? activeRound.ticks.length - 1 : runtime.maxBaselineTickIndex;
  if (index <= max) dispatch({ type: "SEEK", tickIndex: index });
}

function currentPhase() {
  if (["verifying", "passed", "failed"].includes(runtime.status)) return "verify";
  if (runtime.status === "configured") return "configure";
  if (runtime.status === "diagnosing") return "diagnose";
  return "observe";
}

function renderMission() {
  document.getElementById("chapter5-mission-number").textContent = String(activeMission.number);
  document.getElementById("chapter5-mission-zone").textContent = activeMission.zone;
  document.getElementById("chapter5-mission-title").textContent = activeRound.title;
  document.getElementById("chapter5-round-briefing").textContent = activeRound.briefing;
  document.getElementById("chapter5-lore-copy").textContent = activeMission.lore;
  elements.roundList.replaceChildren(...activeMission.rounds.map((round, index) => {
    const item = document.createElement("li");
    item.classList.toggle("is-active", index === activeProgress.round);
    item.classList.toggle("is-complete", activeProgress.completedRounds.includes(round.id));
    item.innerHTML = `<span>${String.fromCharCode(65 + index)}</span><strong>${round.title}</strong>`;
    return item;
  }));
  renderRuntime();
}

function sceneModel(snapshot) {
  if (!snapshot) return {
    visualStatus: "normal", focus: activeRound.presentation?.focusEntityId || activeMission.zone,
    headline: "Запустите исходный сценарий", detail: "Один набор событий будет использован в обоих прогонах.", progressLabel: "Ожидание", entities: []
  };
  const raw = snapshot.state || {};
  if (raw.segments) {
    const segment = raw.segments.find((item) => item.id === raw.activeSegmentId) || raw.segments[0];
    return {
      visualStatus: raw.visualStatus || "normal",
      focus: segment ? `${segment.flightNumber} · ${segment.route}` : activeMission.zone,
      headline: segment ? `Вылет ${segment.departure} · версия ${segment.version}` : snapshot.title,
      detail: raw.rejectedEvents?.length
        ? `Отклонено событий: ${raw.rejectedEvents.length}. Причина сохранена в журнале.`
        : raw.notification ? `Уведомление готовится на ${raw.notification.departure}.` : snapshot.title,
      progressLabel: `${snapshot.tickIndex + 1} / ${activeRound.ticks.length}`,
      entities: [
        { id: "source", label: "Расписание", value: `v${segment?.version ?? "—"}`, state: raw.visualStatus },
        { id: "bpmsoft", label: "BPMSoft", value: segment?.departure || "—", state: raw.visualStatus },
        { id: "operator", label: "Отклонено", value: String(raw.rejectedEvents?.length || 0), state: raw.rejectedEvents?.length ? "recovered" : "normal" },
        { id: "passenger", label: "Уведомление", value: raw.notification?.departure || "ожидает", state: raw.visualStatus }
      ]
    };
  }
  return raw;
}

function renderScene(snapshot) {
  const model = sceneModel(snapshot);
  elements.scene.dataset.status = model.visualStatus || "normal";
  elements.scene.dataset.tick = snapshot?.tickId || "idle";
  document.getElementById("chapter5-scene-focus").textContent = model.focus || activeMission.zone;
  document.getElementById("chapter5-scene-headline").textContent = model.headline || snapshot?.title || "Ожидание";
  document.getElementById("chapter5-scene-detail").textContent = model.detail || "";
  document.getElementById("chapter5-scene-state").textContent = model.progressLabel || "Ожидание";
  document.getElementById("chapter5-event-token").textContent = snapshot?.tickId || "T0";
  document.getElementById("chapter5-scene-time").textContent = snapshot?.timeLabel || "—";
  document.getElementById("chapter5-scene-title").textContent = snapshot?.title || "Операционный двойник готов";
  elements.entityGrid.replaceChildren(...(model.entities || []).map((entity) => {
    const card = document.createElement("div");
    card.className = `c5-entity-card is-${entity.state || "normal"}`;
    card.innerHTML = `<span>${entity.label}</span><strong>${entity.value}</strong>`;
    return card;
  }));
}

function renderJournal(snapshot) {
  const entries = snapshot?.journalEntries || [];
  elements.journal.replaceChildren(...entries.map((entry) => {
    const item = document.createElement("li");
    item.className = `c5-journal-entry is-${entry.level || "info"}`;
    item.innerHTML = `<time>${entry.tickId}</time><span>${entry.text}</span>`;
    return item;
  }));
  document.getElementById("chapter5-journal-empty").hidden = entries.length > 0;
}

function renderRuntime() {
  if (!runtime) return;
  const snapshot = getCurrentSnapshot(runtime);
  renderScene(snapshot);
  renderJournal(snapshot);
  const phase = currentPhase();
  const phaseOrder = ["observe", "diagnose", "configure", "verify"];
  document.querySelectorAll("[data-c5-phase]").forEach((item) => {
    const index = phaseOrder.indexOf(item.dataset.c5Phase);
    const activeIndex = phaseOrder.indexOf(phase);
    item.classList.toggle("is-active", index === activeIndex);
    item.classList.toggle("is-complete", index < activeIndex || runtime.status === "passed");
  });
  const labels = {
    idle: "Готово к запуску", running: "Исходный прогон", paused: "На паузе",
    diagnosing: "Найдите первый сбой", configured: "Настройте правила", verifying: "Контрольный прогон",
    passed: "Устойчивость подтверждена", failed: "Есть нарушение"
  };
  document.getElementById("chapter5-phase-chip").textContent = labels[runtime.status];
  document.getElementById("chapter5-attempt-badge").textContent = `Устойчивость ${state.energy} / 4`;
  document.getElementById("chapter5-run-kind").textContent = runtime.runKind === "verification" ? "Контрольный прогон" : "Исходный прогон";

  elements.timeline.querySelectorAll("button").forEach((button) => {
    const index = Number(button.dataset.tickIndex);
    button.classList.toggle("is-current", index === runtime.tickIndex);
    button.classList.toggle("is-visited", index <= (runtime.runKind === "baseline" ? runtime.maxBaselineTickIndex : runtime.tickIndex));
    button.classList.toggle("is-selected", activeRound.ticks[index]?.id === runtime.selectedCheckpointId);
    button.disabled = runtime.runKind !== "baseline" || !["paused", "diagnosing", "configured"].includes(runtime.status)
      || index > (runtime.baselineCompleted ? activeRound.ticks.length - 1 : runtime.maxBaselineTickIndex);
  });

  const start = document.getElementById("chapter5-start-run");
  const pause = document.getElementById("chapter5-pause-run");
  const replay = document.getElementById("chapter5-replay-run");
  const prev = document.getElementById("chapter5-prev-tick");
  const next = document.getElementById("chapter5-next-tick");
  start.disabled = runtime.status !== "idle";
  pause.disabled = !["running", "verifying", "paused"].includes(runtime.status);
  pause.textContent = runtime.status === "paused" ? "Продолжить" : "Пауза";
  replay.disabled = runtime.status === "idle";
  const canSeek = runtime.runKind === "baseline" && ["paused", "diagnosing", "configured"].includes(runtime.status);
  prev.disabled = !canSeek || runtime.tickIndex <= 0;
  next.disabled = !canSeek || runtime.tickIndex >= (runtime.baselineCompleted ? activeRound.ticks.length - 1 : runtime.maxBaselineTickIndex);

  const checkpoint = document.getElementById("chapter5-checkpoint");
  checkpoint.disabled = !runtime.baselineCompleted || !["diagnosing", "configured"].includes(runtime.status);
  document.getElementById("chapter5-checkpoint-output").textContent = runtime.selectedCheckpointId
    ? `Отмечен ${runtime.selectedCheckpointId}: ${activeRound.ticks.find((tick) => tick.id === runtime.selectedCheckpointId)?.title}`
    : "Первый сбой ещё не отмечен";
  elements.controls.querySelectorAll("select").forEach((select) => {
    select.disabled = !["diagnosing", "configured"].includes(runtime.status);
    select.value = runtime.controlValues[select.dataset.controlId];
  });
  document.getElementById("chapter5-verify-run").disabled = runtime.status !== "configured" || !runtime.selectedCheckpointId;
}

function completeRound() {
  if (!activeProgress.completedRounds.includes(activeRound.id)) activeProgress.completedRounds.push(activeRound.id);
  const finalRound = activeProgress.round === activeMission.rounds.length - 1;
  if (!finalRound) {
    activeProgress.round += 1;
    saveState();
    showFeedback({
      success: true,
      kicker: "Контрольный прогон принят",
      title: activeRound.title,
      copy: activeRound.feedback.passed,
      action: "next-round",
      actionLabel: "Открыть следующий прогон"
    });
    return;
  }

  const awarded = completeMission(activeMission);
  const index = goodAviaMissionKeys.indexOf(activeMission.key);
  const nextKey = goodAviaMissionKeys[index + 1];
  showFeedback({
    success: true,
    kicker: isStudyMode() ? "Учебный двойник завершён" : "Задание принято",
    title: activeRound.title,
    copy: `${activeRound.feedback.passed}${awarded ? ` Начислено ${awarded} XP карты.` : ""}`,
    score: awarded,
    action: activeMission.key === "crisis" ? "finale" : nextKey ? `next:${nextKey}` : "map",
    actionLabel: activeMission.key === "crisis" ? "Завершить карту" : nextKey ? `Открыть задание ${goodAviaMissions[nextKey].number}` : "Вернуться в мегахаб"
  });
}

function completeMission(mission) {
  if (isStudyMode()) return 0;
  const index = goodAviaMissionKeys.indexOf(mission.key);
  const flag = COMPLETION_FLAGS[index];
  const alreadyComplete = state[flag] === true;
  state[flag] = true;
  if (mission.key === "crisis") state.achievementGranted = true;
  state = normalizeState(state);
  saveState();
  renderMap();
  return alreadyComplete ? 0 : mission.score;
}

function showVerificationFeedback(success) {
  const verification = runtime.verification;
  const feedbackKey = verification?.feedbackKey || "mixed-error";
  elements.controls.querySelectorAll(".c5-control-card").forEach((card) => {
    const result = verification?.controls?.[card.dataset.controlId];
    card.classList.toggle("is-correct", result === "correct");
    card.classList.toggle("is-incorrect", result === "incorrect");
  });
  showFeedback({
    success,
    kicker: state.energy === 0 ? "Контур потерял устойчивость" : "Контрольный прогон не принят",
    title: verification?.checkpointCorrect ? "Момент найден — исправьте правила" : "Отмечен симптом, а не первое расхождение",
    copy: activeRound.feedback[feedbackKey],
    action: "retry",
    actionLabel: state.energy === 0 ? "Восстановить устойчивость и исправить" : "Вернуться к диагностике"
  });
}

function showFeedback({ success, kicker, title, copy, score = 0, action, actionLabel }) {
  elements.feedback.hidden = false;
  elements.feedback.classList.toggle("is-success", success);
  elements.feedback.classList.toggle("is-error", !success);
  document.getElementById("chapter5-feedback-kicker").textContent = kicker;
  document.getElementById("chapter5-feedback-title").textContent = title;
  document.getElementById("chapter5-feedback-copy").textContent = copy;
  document.getElementById("chapter5-feedback-score").textContent = String(score);
  const button = document.getElementById("chapter5-feedback-action");
  button.dataset.action = action;
  button.textContent = actionLabel;
}

function hideFeedback() {
  elements.feedback.hidden = true;
  elements.feedback.classList.remove("is-success", "is-error");
  elements.controls?.querySelectorAll(".c5-control-card").forEach((card) => card.classList.remove("is-correct", "is-incorrect"));
}

function handleFeedbackAction() {
  const action = document.getElementById("chapter5-feedback-action").dataset.action;
  if (action === "retry") {
    if (state.energy === 0) state.energy = 4;
    runtime = reduceRuntime(activeRound, runtime, { type: "RETURN_TO_DIAGNOSIS" });
    hideFeedback();
    renderRuntime();
    renderStats();
    saveState();
    return;
  }
  if (action === "next-round") {
    setupRound();
    return;
  }
  if (action?.startsWith("next:")) {
    beginMission(action.slice(5));
    return;
  }
  if (action === "finale") {
    showFinale();
    return;
  }
  activateMap();
}

function showFinale() {
  if (!state.crisisComplete && !isStudyMode()) return;
  clearAutoTimer();
  closeOverlays();
  showView("chapter5-finale-view");
}

function resetProgress() {
  if (!window.confirm("Сбросить баллы, попытки и открытые задания проекта «Гуд Авиа»?")) return;
  state = { ...initialState, missionProgress: {}, introSeen: [] };
  writeLocalState(persistedState());
  window.BPMQuestFirstChapter?.resetAccountProgress?.("chapter5");
  renderStats();
  renderMap();
  openPrologue();
}

function applyAccessMode(previousMode = null) {
  if (previousMode === "study" && !isStudyMode()) state = loadState();
  document.getElementById("chapter5-reset-progress").hidden = isStudyMode();
  const visible = elements.mapView?.hidden === false || elements.missionView?.hidden === false || elements.finaleView?.hidden === false;
  if (!isUnlocked() && visible) activateFourth();
  renderMap();
  setSwitcher(visible ? "chapter5" : "chapter1");
}

function initialize() {
  if (!elements.mapView) return;
  buildMap();
  document.getElementById("show-fifth-chapter")?.addEventListener("click", () => activateMap());
  document.getElementById("chapter4-finale-chapter5")?.addEventListener("click", () => activateMap());
  document.getElementById("chapter5-prologue-start")?.addEventListener("click", acceptPrologue);
  document.getElementById("chapter5-prologue-back")?.addEventListener("click", activateFourth);
  document.getElementById("chapter5-mission-intro-start")?.addEventListener("click", acceptMissionIntro);
  document.getElementById("chapter5-mission-intro-map")?.addEventListener("click", () => activateMap());
  document.getElementById("chapter5-reset-progress")?.addEventListener("click", resetProgress);
  document.getElementById("chapter5-start-mission")?.addEventListener("click", (event) => beginMission(event.currentTarget.dataset.c5Mission));
  document.getElementById("chapter5-back-to-map")?.addEventListener("click", () => activateMap());
  document.getElementById("chapter5-review-intro")?.addEventListener("click", () => renderMissionIntro(activeMission, "review"));
  document.getElementById("chapter5-start-run")?.addEventListener("click", () => dispatch({ type: "START_BASELINE" }));
  document.getElementById("chapter5-pause-run")?.addEventListener("click", () => dispatch({ type: runtime.status === "paused" ? "RESUME" : "PAUSE" }));
  document.getElementById("chapter5-prev-tick")?.addEventListener("click", () => seek(runtime.tickIndex - 1));
  document.getElementById("chapter5-next-tick")?.addEventListener("click", () => seek(runtime.tickIndex + 1));
  document.getElementById("chapter5-replay-run")?.addEventListener("click", () => dispatch({ type: "REPLAY_BASELINE" }));
  document.getElementById("chapter5-checkpoint")?.addEventListener("click", () => dispatch({ type: "SELECT_CHECKPOINT", checkpointId: activeRound.ticks[runtime.tickIndex].id }));
  document.getElementById("chapter5-verify-run")?.addEventListener("click", () => dispatch({ type: "START_VERIFICATION" }));
  document.getElementById("chapter5-feedback-action")?.addEventListener("click", handleFeedbackAction);
  document.getElementById("chapter5-finale-map")?.addEventListener("click", () => activateMap());
  document.getElementById("chapter5-finale-replay")?.addEventListener("click", () => beginMission("crisis"));
  document.getElementById("chapter5-finale-fourth")?.addEventListener("click", activateFourth);
  document.getElementById("chapter5-finale-first")?.addEventListener("click", activateFirst);

  window.BPMQuestChapter5 = {
    storageKey: STORAGE_KEY,
    missionKeys: [...goodAviaMissionKeys],
    completionFlags: [...COMPLETION_FLAGS],
    initialState: { ...initialState },
    getState: () => state,
    setState: (next) => (state = normalizeState(next)),
    normalizeState,
    loadState,
    saveState,
    hydrateState,
    getPersistedState: persistedState,
    getProgressRank: progressRank,
    isUnlocked,
    activateMap,
    beginMission,
    closeOverlays,
    applyAccessMode,
    missions: goodAviaMissions
  };
  renderMap();
  applyAccessMode();
}

initialize();
