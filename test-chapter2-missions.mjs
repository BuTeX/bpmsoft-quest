import fs from "node:fs";
import vm from "node:vm";

class FakeClassList {
  constructor() {
    this.values = new Set();
  }

  add(...names) {
    names.forEach((name) => this.values.add(name));
  }

  remove(...names) {
    names.forEach((name) => this.values.delete(name));
  }

  toggle(name, force) {
    if (force === undefined) {
      if (this.values.has(name)) this.values.delete(name);
      else this.values.add(name);
      return this.values.has(name);
    }
    if (force) this.values.add(name);
    else this.values.delete(name);
    return force;
  }
}

class FakeElement {
  constructor() {
    this.classList = new FakeClassList();
    this.dataset = {};
    this.style = {};
    this.hidden = false;
    this.disabled = false;
    this.textContent = "";
    this.innerHTML = "";
    this.children = [];
    this.listeners = {};
    this.className = "";
  }

  append(...children) {
    this.children.push(...children);
  }

  appendChild(child) {
    this.children.push(child);
    return child;
  }

  setAttribute() {}
  addEventListener(type, listener) {
    if (!this.listeners[type]) this.listeners[type] = [];
    this.listeners[type].push(listener);
  }
  scrollIntoView() {}
}

const elements = new Map();
const document = {
  body: new FakeElement(),
  getElementById(id) {
    if (!elements.has(id)) elements.set(id, new FakeElement());
    return elements.get(id);
  },
  querySelectorAll() {
    return [];
  },
  querySelector() {
    return null;
  },
  createElement() {
    return new FakeElement();
  }
};

const storage = new Map([
  ["bpmsoft-quest-v1", JSON.stringify({ solutionMissionComplete: true })]
]);
const localStorage = {
  getItem(key) {
    return storage.get(key) ?? null;
  },
  setItem(key, value) {
    storage.set(key, value);
  }
};

const firstChapterState = { solutionMissionComplete: true, xp: 500 };
let adminActive = false;
let studyMode = false;
const context = vm.createContext({
  console,
  document,
  localStorage,
  window: {
    scrollTo() {},
    confirm() { return true; },
    BPMQuestFirstChapter: {
      getState() { return firstChapterState; },
      isStudyMode() { return studyMode; },
      isAdminActive() { return adminActive; },
      showMap() {}
    }
  }
});

const missionSource = fs.readFileSync(new URL("./chapter2-missions.js", import.meta.url), "utf8");
const engineSource = fs.readFileSync(new URL("./chapter2.js", import.meta.url), "utf8");
vm.runInContext(`${missionSource}\n${engineSource}`, context);

const api = context.window.BPMQuestChapter2;
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

assert(Object.keys(api.missions).length === 9, "Missions 10–18 are not all implemented");
Object.values(api.missions).forEach((mission) => {
  assert(/^https:\/\/edu\.bpmsoft\.ru\/baza-znaniy\//.test(mission.sourceUrl), `${mission.key}: official BPMSoft source URL is missing`);
  mission.phases.forEach((phase) => {
    assert(
      typeof phase.condition === "string" && phase.condition.length >= 120,
      `${mission.key}/${phase.id}: concrete phase condition is missing`
    );
    phase.slots.forEach((slot) => {
      assert(typeof slot.prompt === "string" && slot.prompt.length > 0, `${mission.key}/${phase.id}/${slot.id}: prompt is missing`);
    });
  });
});
assert(!api.beginMission("portal"), "Portal Gate opened before Sorting Furnace");

const completeMission = (key) => {
  assert(api.beginMission(key), `${key}: mission did not start`);
  const mission = api.missions[key];
  assert(
    elements.get("chapter2-source-copy").children.at(-1).href === mission.sourceUrl,
    `${key}: knowledge source link was not rendered`
  );

  mission.phases.forEach((phase, phaseIndex) => {
    const progress = api.getMissionProgress(key);
    assert(progress.phase === phaseIndex, `${key}: unexpected active phase ${progress.phase}`);
    const expectedCondition = Array.isArray(phase.conditions) && phase.conditions.length > 0
      ? phase.conditions[0]
      : phase.condition.replace(/([.;!?])\s+/g, "$1\n").split("\n").filter(Boolean)[0];
    assert(
      elements.get("chapter2-board-conditions-list").innerHTML.includes(expectedCondition),
      `${key}/${phase.id}: conditions are not rendered above the questions`
    );
    phase.slots.forEach((slot) => {
      api.assignAnswer(slot.id, slot.correct);
      const order = progress.optionOrders[`${phase.id}:${slot.id}`];
      assert(order[0] !== slot.correct, `${key}/${slot.id}: correct option is first`);
    });
    assert(api.checkPhase(), `${key}: correct phase ${phase.id} was rejected`);
  });
};

studyMode = true;
completeMission("contour");
assert(!api.getState().contourComplete, "Study mode changed canonical Chapter 2 completion");
assert(api.getState().chapterXp === 0, "Study mode awarded canonical Chapter 2 XP");
assert(!storage.has("bpmsoft-quest-chapter2-v1"), "Study mode persisted Chapter 2 sandbox progress");
api.setState({ ...api.initialState });
studyMode = false;

completeMission("sorting");
assert(api.getState().sortingComplete, "Sorting Furnace did not complete");
assert(api.getState().chapterXp === 50, `Expected 50 XP, got ${api.getState().chapterXp}`);
const sortingFinalPhase = api.missions.sorting.phases.at(-1);
const chapter2EnergyAfterCompletion = api.getState().energy;
const chapter2AttemptsAfterCompletion = api.getState().attempts;
assert(api.assignAnswer(sortingFinalPhase.slots[0].id, sortingFinalPhase.slots[0].options.find((option) => option.id !== sortingFinalPhase.slots[0].correct).id) === false, "Completed Chapter 2 mission accepted another answer");
assert(api.checkPhase() === false, "Completed Chapter 2 mission ran another check");
assert(api.getState().energy === chapter2EnergyAfterCompletion, "Completed Chapter 2 mission consumed energy");
assert(api.getState().attempts === chapter2AttemptsAfterCompletion, "Completed Chapter 2 mission counted another error");
assert(elements.get("chapter2-check-phase").disabled, "Completed Chapter 2 mission left its check action enabled");

assert(api.beginMission("portal"), "Portal Gate did not unlock");
assert(!elements.get("chapter2-check-phase").disabled, "Chapter 2 replay lock leaked into the next mission");
const portal = api.missions.portal;
const portalPhase = portal.phases[0];

adminActive = true;
api.refreshAdminHighlights();
const renderedSlots = elements.get("chapter2-slot-grid").children.slice(-portalPhase.slots.length);
portalPhase.slots.forEach((slot, slotIndex) => {
  const buttons = renderedSlots[slotIndex].children[0].children;
  const correctButton = buttons.find((button) => button.dataset.option === slot.correct);
  const wrongButton = buttons.find((button) => button.dataset.option !== slot.correct);
  assert(correctButton.className.includes("is-admin-correct"), `${slot.id}: correct admin answer is not highlighted`);
  assert(!wrongButton.className.includes("is-admin-correct"), `${slot.id}: wrong admin answer is highlighted`);
});
adminActive = false;
api.refreshAdminHighlights();
const refreshedSlots = elements.get("chapter2-slot-grid").children.slice(-portalPhase.slots.length);
refreshedSlots.forEach((slotElement) => {
  slotElement.children[0].children.forEach((button) => {
    assert(!button.className.includes("is-admin-correct"), "Admin highlight remained after logout");
  });
});

portalPhase.slots.forEach((slot, index) => {
  const answer = index === 0
    ? slot.options.find((option) => option.id !== slot.correct).id
    : slot.correct;
  api.assignAnswer(slot.id, answer);
});
assert(!api.checkPhase(), "Portal Gate accepted an invalid matrix");
assert(api.getState().energy === 2, "Portal Gate error did not consume one energy cell");
const portalProgress = api.getMissionProgress("portal");
assert(portalProgress.locked.organization, "Correct Portal Gate layer was not locked");
assert(!portalProgress.answers.space, "Incorrect Portal Gate layer was not cleared");
api.assignAnswer(portalPhase.slots[0].id, portalPhase.slots[0].correct);
assert(api.checkPhase(), "Corrected Portal Gate matrix was rejected");
portal.phases[1].slots.forEach((slot) => api.assignAnswer(slot.id, slot.correct));
assert(api.checkPhase(), "Portal Gate tests were rejected");
assert(api.getState().chapterXp === 100, "Portal Gate did not award canonical XP");

completeMission("signal");
assert(api.getState().chapterXp === 150, "Signal Yard did not award canonical XP");
completeMission("cycle");
assert(api.getState().chapterXp === 200, "Cycle Foundry did not award canonical XP");
assert(api.missions.package.phases[0].conditions.length === 8, "Package Depot does not list all package conditions");
completeMission("package");
assert(api.getState().chapterXp === 250, "Package Depot did not award canonical XP");
assert(api.getState().level === 4, "Level IV did not open after Package Depot");
assert(api.getState().activeMission === "trace", "Trace Furnace is not the canonical next mission");

completeMission("trace");
assert(api.getState().chapterXp === 300, "Trace Furnace did not award canonical XP");
completeMission("change");
assert(api.getState().chapterXp === 350, "Change Assembly did not award canonical XP");
completeMission("oracle");
assert(api.getState().chapterXp === 400, "Oracle Forge did not award canonical XP");
assert(api.getState().activeMission === "contour", "Contour Heart is not the canonical next mission");

completeMission("contour");
assert(api.getState().chapterXp === 500, "Contour Heart did not award canonical XP");
assert(api.getState().contourComplete, "Contour Heart did not complete");
assert(api.getState().chapterComplete, "Chapter 2 did not complete after Contour Heart");
assert(api.getState().achievementGranted, "Chapter 2 achievement was not granted");
assert(api.getState().level === 4, "Chapter 2 completion changed the canonical level");

const xpBeforeReplay = api.getState().chapterXp;
completeMission("contour");
assert(api.getState().chapterXp === xpBeforeReplay, "Replaying Contour Heart awarded XP twice");
assert(JSON.stringify(firstChapterState) === JSON.stringify({ solutionMissionComplete: true, xp: 500 }), "Chapter 2 changed the first chapter state object");
assert(JSON.parse(storage.get("bpmsoft-quest-v1")).solutionMissionComplete, "Chapter 2 overwrote the first chapter localStorage key");

console.log("Chapter 2 missions 10–18, penalties, locks, progression, finale and replay: OK");
