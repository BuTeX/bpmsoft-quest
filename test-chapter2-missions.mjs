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
const context = vm.createContext({
  console,
  document,
  localStorage,
  window: {
    scrollTo() {},
    confirm() { return true; },
    BPMQuestFirstChapter: {
      getState() { return firstChapterState; },
      isAdminActive() { return false; },
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
assert(!api.beginMission("portal"), "Portal Gate opened before Sorting Furnace");

const completeMission = (key) => {
  assert(api.beginMission(key), `${key}: mission did not start`);
  const mission = api.missions[key];

  mission.phases.forEach((phase, phaseIndex) => {
    const progress = api.getMissionProgress(key);
    assert(progress.phase === phaseIndex, `${key}: unexpected active phase ${progress.phase}`);
    phase.slots.forEach((slot) => {
      api.assignAnswer(slot.id, slot.correct);
      const order = progress.optionOrders[`${phase.id}:${slot.id}`];
      assert(order[0] !== slot.correct, `${key}/${slot.id}: correct option is first`);
    });
    assert(api.checkPhase(), `${key}: correct phase ${phase.id} was rejected`);
  });
};

completeMission("sorting");
assert(api.getState().sortingComplete, "Sorting Furnace did not complete");
assert(api.getState().chapterXp === 50, `Expected 50 XP, got ${api.getState().chapterXp}`);

assert(api.beginMission("portal"), "Portal Gate did not unlock");
const portal = api.missions.portal;
const portalPhase = portal.phases[0];
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
