import { mission37RoundA as round } from "./chapter5-prototype-data.js";
import {
  createRuntime,
  getCurrentSnapshot,
  reduceRuntime
} from "./chapter5-simulation.js";

const elements = {
  briefing: document.querySelector("#mission-briefing"),
  attempts: document.querySelector("#attempts-value"),
  phaseChip: document.querySelector("#phase-chip"),
  phases: [...document.querySelectorAll(".learning-loop li")],
  scene: document.querySelector("#twin-scene"),
  sceneTime: document.querySelector("#scene-time"),
  sceneTitle: document.querySelector("#scene-title"),
  departure: document.querySelector("#departure-value"),
  version: document.querySelector("#version-value"),
  stateBadge: document.querySelector("#state-badge"),
  sourceState: document.querySelector("#source-state"),
  partnerState: document.querySelector("#partner-state"),
  eventVersion: document.querySelector("#event-version"),
  notificationCard: document.querySelector("#notification-card"),
  notification: document.querySelector("#notification-value"),
  start: document.querySelector("#start-button"),
  pause: document.querySelector("#pause-button"),
  back: document.querySelector("#back-button"),
  next: document.querySelector("#next-button"),
  replay: document.querySelector("#replay-button"),
  timeline: document.querySelector("#timeline"),
  checkpoint: document.querySelector("#checkpoint-button"),
  checkpointOutput: document.querySelector("#checkpoint-output"),
  journal: document.querySelector("#journal-list"),
  journalEmpty: document.querySelector("#journal-empty"),
  runKind: document.querySelector("#run-kind"),
  controls: document.querySelector("#controls-grid"),
  verify: document.querySelector("#verify-button"),
  feedback: document.querySelector("#feedback-panel"),
  feedbackKicker: document.querySelector("#feedback-kicker"),
  feedbackTitle: document.querySelector("#feedback-title"),
  feedbackCopy: document.querySelector("#feedback-copy"),
  retry: document.querySelector("#retry-button"),
  uxPanel: document.querySelector("#ux-panel"),
  uxBaselineTime: document.querySelector("#ux-baseline-time"),
  uxTotalTime: document.querySelector("#ux-total-time"),
  uxNavigationCount: document.querySelector("#ux-navigation-count"),
  uxVerificationCount: document.querySelector("#ux-verification-count"),
  uxClarity: document.querySelector("#ux-clarity"),
  uxLoopUnderstanding: document.querySelector("#ux-loop-understanding"),
  uxComment: document.querySelector("#ux-comment"),
  uxReport: document.querySelector("#ux-report"),
  uxCopy: document.querySelector("#ux-copy-button"),
  uxCopyStatus: document.querySelector("#ux-copy-status"),
  announcer: document.querySelector("#announcer")
};

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const forcedReducedMotion = new URLSearchParams(window.location.search).has("reducedMotion");
if (forcedReducedMotion) document.documentElement.dataset.motion = "reduced";
const phaseOrder = ["observe", "diagnose", "configure", "verify"];
const forbiddenLabels = {
  "ambiguous-segment-key": "ключ сопоставления не различает операционные сегменты",
  "stale-version-applied": "старая версия снова изменила актуальную запись",
  "stale-notification-prepared": "уведомление подготовлено по старому времени",
  "rejected-event-lost": "отклонённое событие исчезло из наблюдаемого журнала"
};

let runtime = createRuntime(round);
let attempts = 4;
let autoTimer = null;
const uxSession = {
  startedAt: null,
  baselineDurationMs: null,
  totalDurationMs: null,
  pauses: 0,
  rewinds: 0,
  forwardSeeks: 0,
  restarts: 0,
  selectedCheckpoints: [],
  controlChanges: [],
  verificationRuns: 0,
  failures: 0
};

function elapsedSinceStart() {
  return uxSession.startedAt === null ? null : performance.now() - uxSession.startedAt;
}

function recordUxAction(action, previousRuntime) {
  if (action.type === "START_BASELINE" && uxSession.startedAt === null) {
    uxSession.startedAt = performance.now();
  }
  if (action.type === "PAUSE") uxSession.pauses += 1;
  if (action.type === "SEEK") {
    if (action.tickIndex < previousRuntime.tickIndex) uxSession.rewinds += 1;
    else if (action.tickIndex > previousRuntime.tickIndex) uxSession.forwardSeeks += 1;
  }
  if (action.type === "REPLAY_BASELINE") uxSession.restarts += 1;
  if (action.type === "SELECT_CHECKPOINT") {
    uxSession.selectedCheckpoints.push(action.checkpointId);
  }
  if (
    action.type === "SET_CONTROL" &&
    previousRuntime.controlValues[action.controlId] !== action.value
  ) {
    uxSession.controlChanges.push(`${action.controlId}=${action.value}`);
  }
  if (action.type === "START_VERIFICATION") uxSession.verificationRuns += 1;

  if (!previousRuntime.baselineCompleted && runtime.baselineCompleted) {
    uxSession.baselineDurationMs = elapsedSinceStart();
  }
  if (previousRuntime.status !== "failed" && runtime.status === "failed") {
    uxSession.failures += 1;
  }
  if (previousRuntime.status !== "passed" && runtime.status === "passed") {
    uxSession.totalDurationMs = elapsedSinceStart();
  }
}

function buildTimeline() {
  elements.timeline.replaceChildren(
    ...round.ticks.map((tick, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "tick-button";
      button.dataset.tickIndex = String(index);
      button.setAttribute("aria-label", `${tick.id}, ${tick.timeLabel}: ${tick.title}`);
      button.innerHTML = `<span>${tick.id}</span><small>${tick.timeLabel}</small>`;
      button.addEventListener("click", () => seekTo(index));
      return button;
    })
  );
}

function buildControls() {
  elements.controls.replaceChildren(
    ...round.controls.map((control) => {
      const card = document.createElement("div");
      card.className = "control-card";
      card.dataset.controlId = control.id;

      const label = document.createElement("label");
      label.htmlFor = `control-${control.id}`;
      label.textContent = control.label;

      const select = document.createElement("select");
      select.id = `control-${control.id}`;
      select.dataset.controlId = control.id;
      for (const option of control.options) {
        const item = document.createElement("option");
        item.value = option.value;
        item.textContent = option.label;
        select.append(item);
      }
      select.value = control.defaultValue;
      select.disabled = true;

      const help = document.createElement("p");
      help.className = "control-help";
      help.textContent = control.options.find((option) => option.value === select.value).help;

      select.addEventListener("change", () => {
        const selected = control.options.find((option) => option.value === select.value);
        help.textContent = selected.help;
        dispatch({ type: "SET_CONTROL", controlId: control.id, value: select.value });
      });

      card.append(label, select, help);
      return card;
    })
  );
}

function clearAutoTimer() {
  if (autoTimer !== null) window.clearTimeout(autoTimer);
  autoTimer = null;
}

function scheduleAutoAdvance() {
  clearAutoTimer();
  if (!["running", "verifying"].includes(runtime.status)) return;

  autoTimer = window.setTimeout(() => {
    autoTimer = null;
    dispatch({ type: "ADVANCE" });
  }, reducedMotion.matches || forcedReducedMotion ? 520 : 1100);
}

function dispatch(action) {
  clearAutoTimer();
  const previousStatus = runtime.status;
  const previousRuntime = runtime;

  try {
    runtime = reduceRuntime(round, runtime, action);
    recordUxAction(action, previousRuntime);
  } catch (error) {
    console.error(error);
    elements.announcer.textContent = "Действие сейчас недоступно.";
    render();
    return;
  }

  if (runtime.status === "failed" && previousStatus !== "failed") {
    attempts = Math.max(0, attempts - 1);
  }

  render();
  scheduleAutoAdvance();
}

function seekTo(index) {
  const canSeek =
    runtime.runKind === "baseline" &&
    ["paused", "diagnosing", "configured"].includes(runtime.status);
  if (!canSeek) return;

  const max = runtime.baselineCompleted
    ? round.ticks.length - 1
    : runtime.maxBaselineTickIndex;
  if (index > max) return;
  dispatch({ type: "SEEK", tickIndex: index });
}

function currentPhase() {
  if (["verifying", "passed", "failed"].includes(runtime.status)) return "verify";
  if (runtime.status === "configured") return "configure";
  if (runtime.status === "diagnosing") return "diagnose";
  return "observe";
}

function renderPhases() {
  const active = currentPhase();
  const activeIndex = phaseOrder.indexOf(active);
  elements.phases.forEach((item) => {
    const index = phaseOrder.indexOf(item.dataset.phase);
    item.classList.toggle("is-active", index === activeIndex);
    item.classList.toggle("is-complete", index < activeIndex || runtime.status === "passed");
  });

  const labels = {
    idle: "Готово к запуску",
    running: "Исходный прогон",
    paused: runtime.runKind === "verification" ? "Проверка на паузе" : "Сценарий на паузе",
    diagnosing: "Найдите первый сбой",
    configured: "Настройте правила",
    verifying: "Контрольный прогон",
    passed: "Устойчивость подтверждена",
    failed: "Есть нарушение"
  };
  elements.phaseChip.textContent = labels[runtime.status];
}

function renderScene(snapshot) {
  if (!snapshot) {
    elements.scene.dataset.tick = "idle";
    elements.scene.dataset.status = "normal";
    elements.sceneTime.textContent = "—";
    elements.sceneTitle.textContent = "Запустите исходный сценарий";
    elements.departure.textContent = "09:55";
    elements.version.textContent = "3";
    elements.stateBadge.textContent = "Актуальная запись";
    elements.sourceState.textContent = "Версия 3";
    elements.partnerState.textContent = "Ожидает";
    elements.notificationCard.hidden = true;
    return;
  }

  const segment = snapshot.state.segments.find(
    (item) => item.id === snapshot.state.activeSegmentId
  );
  elements.scene.dataset.tick = snapshot.tickId;
  elements.scene.dataset.status = snapshot.state.visualStatus;
  elements.sceneTime.textContent = snapshot.timeLabel;
  elements.sceneTitle.textContent = snapshot.title;
  elements.departure.textContent = segment.departure;
  elements.version.textContent = String(segment.version);
  elements.sourceState.textContent = snapshot.tickIndex >= 1 ? "Версия 4 · 10:40" : "Версия 3";
  elements.eventVersion.textContent = snapshot.tickIndex >= 3 ? "v3" : "v4";

  if (snapshot.tickIndex < 3) {
    elements.partnerState.textContent = "Ожидает";
  } else if (snapshot.outcomes.includes("ambiguous-segment-key")) {
    elements.partnerState.textContent = "Неоднозначный ключ";
  } else if (snapshot.outcomes.includes("stale-event-rejected")) {
    elements.partnerState.textContent = "Версия 3 отклонена";
  } else {
    elements.partnerState.textContent = "Версия 3 принята";
  }

  const stateLabels = {
    normal: "Актуальная запись",
    warning: "Событие в обработке",
    failure: "Обнаружено расхождение",
    recovered: "Правило удержало состояние"
  };
  elements.stateBadge.textContent = stateLabels[snapshot.state.visualStatus];

  elements.notificationCard.hidden = !snapshot.state.notification;
  if (snapshot.state.notification) {
    elements.notification.textContent = `Вылет в ${snapshot.state.notification.departure}`;
  }
}

function renderTimeline() {
  const buttons = [...elements.timeline.querySelectorAll(".tick-button")];
  const visitedMax = runtime.baselineCompleted
    ? round.ticks.length - 1
    : Math.max(runtime.maxBaselineTickIndex, runtime.tickIndex);

  buttons.forEach((button, index) => {
    const tick = round.ticks[index];
    button.classList.toggle("is-current", index === runtime.tickIndex);
    button.classList.toggle("is-visited", index <= visitedMax);
    button.classList.toggle("is-selected", tick.id === runtime.selectedCheckpointId);
    button.setAttribute("aria-current", index === runtime.tickIndex ? "step" : "false");
    button.disabled =
      runtime.runKind !== "baseline" ||
      !["paused", "diagnosing", "configured"].includes(runtime.status) ||
      index > visitedMax;
  });

  elements.checkpointOutput.textContent = runtime.selectedCheckpointId
    ? `Отмечено: ${runtime.selectedCheckpointId}`
    : "Первый сбой ещё не отмечен";
}

function renderJournal(snapshot) {
  const entries = snapshot?.journalEntries || [];
  elements.journalEmpty.hidden = entries.length > 0;
  elements.journal.replaceChildren(
    ...entries.map((entry) => {
      const item = document.createElement("li");
      item.className = `journal-entry${entry.level === "warning" ? " is-warning" : ""}`;
      const time = document.createElement("time");
      time.textContent = entry.tickId;
      const copy = document.createElement("span");
      copy.textContent = entry.text;
      item.append(time, copy);
      return item;
    })
  );
  elements.runKind.textContent =
    runtime.runKind === "verification" ? "Контрольный прогон" : "Исходный прогон";
}

function renderControls() {
  const editable = ["diagnosing", "configured"].includes(runtime.status);
  const verificationControls = runtime.verification?.controls || null;

  for (const card of elements.controls.querySelectorAll(".control-card")) {
    const id = card.dataset.controlId;
    const select = card.querySelector("select");
    if (select.value !== runtime.controlValues[id]) select.value = runtime.controlValues[id];
    select.disabled = !editable;
    card.classList.toggle("is-correct", verificationControls?.[id] === "correct");
    card.classList.toggle("is-incorrect", verificationControls?.[id] === "incorrect");
  }
}

function renderFeedback() {
  const result = runtime.verification;
  elements.feedback.hidden = !result;
  elements.feedback.classList.toggle("is-success", result?.status === "passed");
  elements.feedback.classList.toggle("is-error", Boolean(result && result.status !== "passed"));

  if (!result) return;

  const titles = {
    passed: "Контрольный прогон устойчив",
    "checkpoint-error": "Выбран поздний симптом",
    "rule-error": "Осталось нарушенное правило",
    "mixed-error": "Нужна новая диагностика"
  };
  const details = [];
  if (!result.checkpointCorrect) details.push("Первый подтверждённый момент отмечен неточно.");
  if (result.firstForbiddenOutcome) {
    details.push(`Первое оставшееся нарушение: ${forbiddenLabels[result.firstForbiddenOutcome]}.`);
  }
  if (result.status !== "passed" && !result.firstForbiddenOutcome) {
    details.push("Проверьте, в какой момент решение системы впервые расходится с фактами.");
  }

  elements.feedbackKicker.textContent = result.status === "passed" ? "Приёмка завершена" : "Результат проверки";
  elements.feedbackTitle.textContent = titles[result.status];
  elements.feedbackCopy.textContent = `${round.feedback[result.feedbackKey]} ${details.join(" ")}`.trim();
  elements.retry.hidden = result.status === "passed";
  elements.retry.textContent = attempts === 0 ? "Перезапустить раунд" : "Вернуться к настройке";
}

function formatDuration(durationMs) {
  if (!Number.isFinite(durationMs)) return "—";
  const totalSeconds = Math.max(0, Math.round(durationMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function uxAnswerLabel(select) {
  if (!select.value) return "не заполнено";
  return select.options[select.selectedIndex]?.textContent || select.value;
}

function buildUxReport() {
  const viewport = `${window.innerWidth}×${window.innerHeight}`;
  const motion = reducedMotion.matches || forcedReducedMotion ? "reduced" : "standard";
  const selected = uxSession.selectedCheckpoints.length
    ? uxSession.selectedCheckpoints.join(" → ")
    : "не выбран";
  const changes = uxSession.controlChanges.length
    ? uxSession.controlChanges.join(", ")
    : "без изменений";
  const finalControls = round.controls
    .map((control) => `${control.id}=${runtime.controlValues[control.id]}`)
    .join(", ");

  return [
    "UX-протокол · Гуд Авиа · 37A",
    `Экран: ${viewport}; движение: ${motion}`,
    `Результат: ${runtime.verification?.status || runtime.status}`,
    `Исходный прогон: ${formatDuration(uxSession.baselineDurationMs)}`,
    `Общее время: ${formatDuration(uxSession.totalDurationMs || elapsedSinceStart())}`,
    `Паузы: ${uxSession.pauses}; перемотки назад: ${uxSession.rewinds}; переходы вперёд: ${uxSession.forwardSeeks}`,
    `Перезапуски baseline: ${uxSession.restarts}`,
    `Выбранные checkpoints: ${selected}`,
    `Контрольные прогоны: ${uxSession.verificationRuns}; ошибки: ${uxSession.failures}`,
    `Изменения правил: ${changes}`,
    `Финальная конфигурация: ${finalControls}`,
    `Понятность управления: ${uxAnswerLabel(elements.uxClarity)}`,
    `Связь «момент + правило + повтор»: ${uxAnswerLabel(elements.uxLoopUnderstanding)}`,
    `Комментарий: ${elements.uxComment.value.trim() || "нет"}`
  ].join("\n");
}

function renderUxPanel() {
  const visible = runtime.status === "passed" || attempts === 0;
  elements.uxPanel.hidden = !visible;
  if (!visible) return;

  elements.uxBaselineTime.textContent = formatDuration(uxSession.baselineDurationMs);
  elements.uxTotalTime.textContent = formatDuration(
    uxSession.totalDurationMs || elapsedSinceStart()
  );
  elements.uxNavigationCount.textContent = `${uxSession.pauses} / ${uxSession.rewinds}`;
  elements.uxVerificationCount.textContent = `${uxSession.verificationRuns} / ${uxSession.failures}`;
  elements.uxReport.textContent = buildUxReport();
}

function renderButtons() {
  const snapshot = getCurrentSnapshot(runtime);
  const baselineNavigation =
    runtime.runKind === "baseline" &&
    ["paused", "diagnosing", "configured"].includes(runtime.status);
  const visitedMax = runtime.baselineCompleted
    ? round.ticks.length - 1
    : runtime.maxBaselineTickIndex;

  elements.start.disabled = runtime.status !== "idle";
  elements.pause.disabled = !["running", "verifying", "paused"].includes(runtime.status);
  elements.pause.textContent = runtime.status === "paused" ? "Продолжить" : "Пауза";
  elements.back.disabled = !baselineNavigation || runtime.tickIndex <= 0;
  elements.next.disabled = !(
    (["running", "verifying"].includes(runtime.status) && runtime.tickIndex < round.ticks.length - 1) ||
    (baselineNavigation && runtime.tickIndex < visitedMax)
  );
  elements.replay.disabled = runtime.status === "idle";
  elements.checkpoint.disabled =
    !runtime.baselineCompleted ||
    !["diagnosing", "configured"].includes(runtime.status) ||
    !snapshot;
  elements.verify.disabled = runtime.status !== "configured" || !runtime.selectedCheckpointId;
}

function render() {
  const snapshot = getCurrentSnapshot(runtime);
  elements.attempts.textContent = String(attempts);
  renderPhases();
  renderScene(snapshot);
  renderTimeline();
  renderJournal(snapshot);
  renderControls();
  renderFeedback();
  renderUxPanel();
  renderButtons();

  if (snapshot) {
    elements.announcer.textContent = `${snapshot.tickId}, ${snapshot.timeLabel}. ${snapshot.title}`;
  }
}

elements.start.addEventListener("click", () => dispatch({ type: "START_BASELINE" }));
elements.pause.addEventListener("click", () => {
  dispatch({ type: runtime.status === "paused" ? "RESUME" : "PAUSE" });
});
elements.back.addEventListener("click", () => seekTo(runtime.tickIndex - 1));
elements.next.addEventListener("click", () => {
  if (["running", "verifying"].includes(runtime.status)) {
    dispatch({ type: "ADVANCE" });
  } else {
    seekTo(runtime.tickIndex + 1);
  }
});
elements.replay.addEventListener("click", () => {
  attempts = 4;
  dispatch({ type: "REPLAY_BASELINE" });
});
elements.checkpoint.addEventListener("click", () => {
  const snapshot = getCurrentSnapshot(runtime);
  if (!snapshot) return;
  dispatch({ type: "SELECT_CHECKPOINT", checkpointId: snapshot.tickId });
});
elements.verify.addEventListener("click", () => dispatch({ type: "START_VERIFICATION" }));
elements.retry.addEventListener("click", () => {
  if (attempts === 0) {
    runtime = createRuntime(round);
    attempts = 4;
    render();
    return;
  }
  dispatch({ type: "RETURN_TO_DIAGNOSIS" });
});
for (const input of [elements.uxClarity, elements.uxLoopUnderstanding, elements.uxComment]) {
  input.addEventListener("input", renderUxPanel);
  input.addEventListener("change", renderUxPanel);
}
elements.uxCopy.addEventListener("click", async () => {
  const report = buildUxReport();
  try {
    await navigator.clipboard.writeText(report);
    elements.uxCopyStatus.textContent = "Скопировано — вставьте протокол в чат.";
  } catch {
    elements.uxCopyStatus.textContent = "Не удалось скопировать автоматически — выделите текст протокола.";
    elements.uxReport.focus();
  }
});
elements.timeline.addEventListener("keydown", (event) => {
  if (event.key === "ArrowLeft") {
    event.preventDefault();
    seekTo(Math.max(0, runtime.tickIndex - 1));
  }
  if (event.key === "ArrowRight") {
    event.preventDefault();
    seekTo(Math.min(round.ticks.length - 1, runtime.tickIndex + 1));
  }
});

elements.briefing.textContent = round.briefing;
buildTimeline();
buildControls();
render();
