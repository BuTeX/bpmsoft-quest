import fs from "node:fs";
import vm from "node:vm";

class FakeClassList {
  constructor() { this.values = new Set(); }
  add(...names) { names.forEach((name) => this.values.add(name)); }
  remove(...names) { names.forEach((name) => this.values.delete(name)); }
  toggle(name, force) {
    if (force === undefined) {
      if (this.values.has(name)) this.values.delete(name); else this.values.add(name);
      return this.values.has(name);
    }
    if (force) this.values.add(name); else this.values.delete(name);
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
  append(...children) { this.children.push(...children); }
  appendChild(child) { this.children.push(child); return child; }
  setAttribute(name) { if (name === "hidden") this.hidden = true; }
  addEventListener(type, listener) { (this.listeners[type] ||= []).push(listener); }
  scrollIntoView() {}
}

const elements = new Map();
const document = {
  body: new FakeElement(),
  getElementById(id) {
    if (!elements.has(id)) elements.set(id, new FakeElement());
    return elements.get(id);
  },
  querySelectorAll() { return []; },
  querySelector() { return null; },
  createElement() { return new FakeElement(); }
};

const storage = new Map([
  ["bpmsoft-quest-v1", JSON.stringify({ solutionMissionComplete: true })],
  ["bpmsoft-quest-chapter2-v1", JSON.stringify({ contourComplete: true })]
]);
const localStorage = {
  getItem(key) { return storage.get(key) ?? null; },
  setItem(key, value) { storage.set(key, value); }
};

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
      getState() { return { solutionMissionComplete: true }; },
      isStudyMode() { return studyMode; },
      isAdminActive() { return adminActive; },
      showMap() {}
    },
    BPMQuestChapter2: {
      getState() { return { contourComplete: true }; },
      activateMap() {},
      activateFirstChapter() {},
      closeOverlays() {}
    }
  }
});

const source = `${fs.readFileSync(new URL("./chapter3-missions.js", import.meta.url), "utf8")}\n${fs.readFileSync(new URL("./chapter3.js", import.meta.url), "utf8")}`;
vm.runInContext(source, context);

const api = context.window.BPMQuestChapter3;
const assert = (condition, message) => { if (!condition) throw new Error(message); };

assert(Object.keys(api.missions).length === 9, "Missions 19–27 are not all implemented");
Object.values(api.missions).forEach((mission) => {
  assert(/^https:\/\/edu\.bpmsoft\.ru\/baza-znaniy\//.test(mission.sourceUrl), `${mission.key}: official BPMSoft source URL is missing`);
  assert(mission.phases.length >= 4, `${mission.key}: fewer than four simulation orbits`);
  assert(mission.phases.reduce((sum, phase) => sum + phase.slots.length, 0) >= 12, `${mission.key}: fewer than twelve decisions`);
  mission.phases.forEach((phase) => {
    assert(phase.conditions.length >= 3, `${mission.key}/${phase.id}: dossier conditions are missing`);
    phase.slots.forEach((slot) => {
      assert(slot.options.length === 3, `${mission.key}/${phase.id}/${slot.id}: expected three options`);
      assert(slot.options.some((option) => option.id === slot.correct), `${mission.key}/${phase.id}/${slot.id}: correct option is missing`);
    });
  });
});
assert(api.missions.orbit.phases.length === 5, "Orbit 360 does not contain five final orbits");
assert(!api.beginMission("lead"), "Lead Spectrum opened before Contact Genome");

const completeMission = (key) => {
  assert(api.beginMission(key), `${key}: mission did not start`);
  const mission = api.missions[key];
  assert(
    elements.get("chapter3-source-copy").children.at(-1).href === mission.sourceUrl,
    `${key}: knowledge source link was not rendered`
  );
  mission.phases.forEach((phase, phaseIndex) => {
    const progress = api.getMissionProgress(key);
    assert(progress.phase === phaseIndex, `${key}: unexpected active phase ${progress.phase}`);
    phase.slots.forEach((slot) => {
      api.assignAnswer(slot.id, slot.correct);
      const order = progress.optionOrders[`${phase.id}:${slot.id}`];
      assert(order[0] !== slot.correct, `${key}/${phase.id}/${slot.id}: correct option is first`);
    });
    assert(api.checkPhase(), `${key}: correct phase ${phase.id} was rejected`);
  });
};

studyMode = true;
completeMission("orbit");
assert(!api.getState().orbitComplete, "Study mode changed canonical Chapter 3 completion");
assert(api.getState().chapterXp === 0, "Study mode awarded canonical Chapter 3 XP");
assert(!storage.has("bpmsoft-quest-chapter3-v1"), "Study mode persisted Chapter 3 sandbox progress");
api.setState({ ...api.initialState });
studyMode = false;

completeMission("contact");
assert(api.getState().chapterXp === 60, "Contact Genome did not award 60 XP");
assert(api.beginMission("lead"), "Lead Spectrum did not unlock");
const leadPhase = api.missions.lead.phases[0];
adminActive = true;
api.refreshAdminHighlights();
const adminSlots = elements.get("chapter3-slot-grid").children.slice(-leadPhase.slots.length);
leadPhase.slots.forEach((slot, index) => {
  const buttons = adminSlots[index].children[0].children;
  assert(buttons.find((button) => button.dataset.option === slot.correct).className.includes("is-admin-correct"), `${slot.id}: correct admin option is not highlighted`);
});
adminActive = false;

leadPhase.slots.forEach((slot, index) => {
  const answer = index === 0 ? slot.options.find((option) => option.id !== slot.correct).id : slot.correct;
  api.assignAnswer(slot.id, answer);
});
assert(!api.checkPhase(), "Lead Spectrum accepted an invalid signal model");
assert(api.getState().energy === 3, "Chapter 3 error did not consume one of four energy cells");
const leadProgress = api.getMissionProgress("lead");
assert(leadProgress.locked.source, "Correct Lead Spectrum node was not locked");
assert(!leadProgress.answers.need, "Incorrect Lead Spectrum node was not cleared");
api.setState({ ...api.initialState, contactComplete: true });

for (const key of ["lead", "channel", "bpmn", "sla", "access", "integration", "ai", "orbit"]) completeMission(key);
assert(api.getState().chapterXp === 600, `Expected final 600 XP, got ${api.getState().chapterXp}`);
assert(api.getState().level === 6, "Chapter 3 did not reach level VI");
assert(api.getState().chapterComplete, "Chapter 3 finale flag was not set");
const beforeReplay = api.getState().chapterXp;
completeMission("orbit");
assert(api.getState().chapterXp === beforeReplay, "Orbit 360 replay awarded XP twice");

console.log("Chapter 3 missions 19–27, complexity, penalties, progression, finale and replay: OK");
