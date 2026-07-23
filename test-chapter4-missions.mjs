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

class FakeStyle {
  constructor() { this.values = {}; }
  setProperty(name, value) { this.values[name] = value; }
}

class FakeElement {
  constructor() {
    this.classList = new FakeClassList();
    this.dataset = {};
    this.style = new FakeStyle();
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
  replaceChildren(...children) { this.children = [...children]; }
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

const storage = new Map([["bpmsoft-quest-chapter3-v1", JSON.stringify({ orbitComplete: true })]]);
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
      scheduleChapter4ProgressSync() {}
    },
    BPMQuestChapter2: { activateFirstChapter() {} },
    BPMQuestChapter3: {
      getState() { return { orbitComplete: true }; },
      activateMap() {},
      closeOverlays() {}
    }
  }
});

const source = `${fs.readFileSync(new URL("./chapter4-missions.js", import.meta.url), "utf8")}\n${fs.readFileSync(new URL("./chapter4.js", import.meta.url), "utf8")}`;
vm.runInContext(source, context);

const api = context.window.BPMQuestChapter4;
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const roles = ["cause", "mechanism", "test"];

assert(Object.keys(api.missions).length === 9, "Missions 28–36 are not all implemented");
Object.values(api.missions).forEach((mission) => {
  assert(/^https:\/\/edu\.bpmsoft\.ru\/baza-znaniy\//.test(mission.sourceUrl), `${mission.key}: official BPMSoft source URL is missing`);
  assert(mission.stages.length >= 2, `${mission.key}: fewer than two audit rounds`);
  mission.stages.forEach((stage) => {
    assert(stage.hotspots.length === 3, `${mission.key}/${stage.id}: expected three image hotspots`);
    assert(stage.cards.length === 6, `${mission.key}/${stage.id}: expected six decision cards`);
    assert(new Set(stage.hotspots.map((spot) => spot.id)).size === 3, `${mission.key}/${stage.id}: hotspot ids are not unique`);
    roles.forEach((role) => {
      const roleCards = stage.cards.filter((card) => card.role === role);
      assert(roleCards.length === 2, `${mission.key}/${stage.id}/${role}: expected a correct card and a decoy`);
      assert(roleCards.some((card) => card.id === stage.solution[role]), `${mission.key}/${stage.id}/${role}: solution card is missing`);
      assert(roleCards.filter((card) => card.correct).length === 1, `${mission.key}/${stage.id}/${role}: expected exactly one correct card`);
    });
  });
});
assert(api.missions.transformation.stages.length === 3, "Final mission does not contain three end-to-end audit rounds");
assert(!api.beginMission("consent"), "Consent mission opened before data migration");

const completeStage = (mission, stage) => {
  stage.hotspots.forEach((spot) => api.inspectHotspot(spot.id));
  roles.forEach((role) => assert(api.assignCard(role, stage.solution[role]), `${mission.key}/${stage.id}: ${role} card was rejected`));
  assert(api.checkChain(), `${mission.key}/${stage.id}: correct chain was rejected`);
};

const completeMission = (key) => {
  assert(api.beginMission(key), `${key}: mission did not start`);
  const mission = api.missions[key];
  assert(elements.get("chapter4-source-copy").children.at(-1).href === mission.sourceUrl, `${key}: knowledge source link was not rendered`);
  mission.stages.forEach((stage, index) => {
    assert(api.getMissionProgress(key).stage === index, `${key}: unexpected active stage`);
    completeStage(mission, stage);
  });
};

studyMode = true;
completeMission("transformation");
assert(!api.getState().transformationComplete, "Study mode changed canonical Chapter 4 completion");
assert(api.getState().chapterXp === 0, "Study mode awarded canonical Chapter 4 XP");
assert(!storage.has("bpmsoft-quest-chapter4-v1"), "Study mode persisted Chapter 4 sandbox progress");
api.setState({ ...api.initialState });
studyMode = false;

assert(api.beginMission("migration"), "Migration mission did not start");
const migration = api.missions.migration;
const firstStage = migration.stages[0];
assert(elements.get("chapter4-next-action").textContent.startsWith("Шаг 1 из 4"), "Chapter 4 did not explain the initial image-audit step");
assert(elements.get("chapter4-card-deck").children.length === 0, "Chapter 4 showed answer cards before the audit");
api.inspectHotspot(firstStage.hotspots[0].id);
const firstMarker = elements.get("chapter4-hotspot-layer").children[0];
assert(firstMarker.children.length === 2, "Chapter 4 did not render the found fact beside its image marker");
assert(firstMarker.children[0].innerHTML.includes("<span>1"), "Chapter 4 replaced the image marker number after inspection");
assert(firstMarker.children[1].innerHTML.includes(firstStage.hotspots[0].fact), "Chapter 4 did not show the observation text on the panorama");
firstStage.hotspots.slice(1).forEach((spot) => api.inspectHotspot(spot.id));
assert(elements.get("chapter4-next-action").textContent.startsWith("Шаг 2 из 4"), "Chapter 4 did not advance the guide to cause selection");
assert(elements.get("chapter4-card-deck").children.length === 2, "Chapter 4 did not limit the cause step to two variants");
const wrongCause = firstStage.cards.find((card) => card.role === "cause" && card.id !== firstStage.solution.cause);
assert(api.assignCard("cause", wrongCause.id), "Wrong cause card could not be selected");
assert(elements.get("chapter4-next-action").textContent.startsWith("Шаг 3 из 4"), "Chapter 4 did not advance the guide to solution selection");
assert(elements.get("chapter4-card-deck").children.every((card) => firstStage.cards.find((item) => item.id === card.dataset.c4Card)?.role === "mechanism"), "Chapter 4 mixed roles into the solution step");
assert(api.assignCard("mechanism", firstStage.solution.mechanism), "Correct mechanism card could not be selected");
assert(elements.get("chapter4-next-action").textContent.startsWith("Шаг 4 из 4"), "Chapter 4 did not advance the guide to verification selection");
assert(api.assignCard("test", firstStage.solution.test), "Correct test card could not be selected");
assert(elements.get("chapter4-next-action").textContent.includes("Цепочка готова"), "Chapter 4 did not explain that the chain was ready");
assert(!api.checkChain(), "Invalid cause-mechanism-test chain was accepted");
assert(api.getState().energy === 4, "The first tutorial error consumed an energy cell");
assert(api.getState().attempts === 1, "The first tutorial error increased the attempt counter");
const afterWrong = api.getMissionProgress("migration");
assert(afterWrong.lastWrong.length === 1 && afterWrong.lastWrong[0] === "cause", "Weak-link feedback did not isolate the wrong role");
assert(afterWrong.tutorialGraceUsed, "Chapter 4 did not persist use of the tutorial grace error");
assert(!afterWrong.placements[`${firstStage.id}:cause`], "Chapter 4 did not clear the weak cause");
assert(afterWrong.placements[`${firstStage.id}:mechanism`] === firstStage.solution.mechanism, "Correct mechanism was cleared after a partial error");
assert(afterWrong.placements[`${firstStage.id}:test`] === firstStage.solution.test, "Correct test was cleared after a partial error");
assert(api.assignCard("cause", firstStage.solution.cause), "Correct cause card could not replace the weak link");
assert(api.checkChain(), "Repaired first migration chain was rejected");
completeStage(migration, migration.stages[1]);
assert(api.getState().chapterXp === 70, "Migration mission did not award 70 XP");
const migrationFinalStage = migration.stages.at(-1);
const chapter4EnergyAfterCompletion = api.getState().energy;
const chapter4AttemptsAfterCompletion = api.getState().attempts;
assert(api.assignCard("cause", migrationFinalStage.solution.cause) === false, "Completed Chapter 4 mission accepted another card");
assert(api.checkChain() === false, "Completed Chapter 4 mission ran another check");
assert(api.getState().energy === chapter4EnergyAfterCompletion, "Completed Chapter 4 mission consumed energy");
assert(api.getState().attempts === chapter4AttemptsAfterCompletion, "Completed Chapter 4 mission counted another error");
assert(elements.get("chapter4-check-chain").disabled, "Completed Chapter 4 mission left its check action enabled");

for (const key of ["consent", "campaign", "franchise", "order", "stock", "returns", "insight", "transformation"]) completeMission(key);
assert(api.getState().chapterXp === 700, `Expected final 700 XP, got ${api.getState().chapterXp}`);
assert(api.getState().level === 8, "Chapter 4 did not reach level VIII");
assert(api.getState().chapterComplete, "Chapter 4 finale flag was not set");
const beforeReplay = api.getState().chapterXp;
completeMission("transformation");
assert(api.getState().chapterXp === beforeReplay, "Transformation replay awarded XP twice");

adminActive = true;
api.refreshAdminHighlights();
assert(elements.get("chapter4-card-deck").children.some((card) => card.className.includes("is-admin-correct")), "Admin mode did not highlight correct Chapter 4 cards");

console.log("Chapter 4 image audit, chain builder, weak-link feedback, progression and replay: OK");
