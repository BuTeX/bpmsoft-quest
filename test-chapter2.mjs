import fs from "node:fs";
import vm from "node:vm";

const storage = new Map();
const localStorage = {
  getItem(key) {
    return storage.get(key) ?? null;
  },
  setItem(key, value) {
    storage.set(key, value);
  }
};

const context = vm.createContext({
  console,
  localStorage,
  window: {}
});

const source = fs.readFileSync(new URL("./chapter2.js", import.meta.url), "utf8");
vm.runInContext(source, context);

const api = context.window.BPMQuestChapter2;
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

assert(source.includes("beginChapter2Mission(button.dataset.c2Zone);"), "Chapter 2 map clicks do not open missions directly");
assert(api.storageKey === "bpmsoft-quest-chapter2-v1", "Chapter 2 uses an unexpected storage key");
assert(api.missionKeys.length === 9, "Chapter 2 does not define nine missions");
assert(api.completionFlags.length === 9, "Chapter 2 does not define nine completion flags");

const firstChapterSave = JSON.stringify({
  solutionMissionComplete: true,
  xp: 500,
  energy: 2
});
storage.set("bpmsoft-quest-v1", firstChapterSave);

api.setState({
  ...api.initialState,
  sortingComplete: true,
  portalComplete: true,
  energy: 1,
  introSeen: ["sorting", "portal", "unknown"],
  prologueSeen: true
});
api.saveState();

assert(storage.get("bpmsoft-quest-v1") === firstChapterSave, "Saving Chapter 2 changed Chapter 1 progress");
assert(storage.has("bpmsoft-quest-chapter2-v1"), "Chapter 2 progress was not saved separately");

const loaded = api.loadState();
assert(loaded.chapterXp === 100, `Expected canonical 100 XP, got ${loaded.chapterXp}`);
assert(loaded.level === 3, `Expected level III, got ${loaded.level}`);
assert(loaded.activeMission === "signal", `Expected Signal Yard to be active, got ${loaded.activeMission}`);
assert(loaded.energy === 1, "Chapter 2 energy was not preserved");
assert(loaded.introSeen.length === 2, "Unknown Chapter 2 intro key was not removed");

storage.set("bpmsoft-quest-chapter2-v1", JSON.stringify({
  sortingComplete: false,
  portalComplete: true,
  signalComplete: true,
  cycleComplete: false,
  energy: 99
}));
const repaired = api.loadState();
assert(repaired.sortingComplete, "A non-contiguous Chapter 2 save was not canonicalized from the beginning");
assert(repaired.portalComplete, "Second canonical completion flag was lost");
assert(!repaired.signalComplete, "Non-contiguous completion was not removed");
assert(repaired.chapterXp === 100, "Canonical XP does not match the repaired rank");
assert(repaired.energy === 3, "Energy was not clamped to three cells");

const finished = api.normalizeState({
  ...api.initialState,
  ...Object.fromEntries(api.completionFlags.map((flag) => [flag, true])),
  achievementGranted: true
});
assert(finished.chapterXp === 500, "Completed Chapter 2 does not have 500 XP");
assert(finished.level === 4, "Completed Chapter 2 does not remain on level IV");
assert(finished.activeMission === "contour", "Completed Chapter 2 does not point to the replayable finale");
assert(finished.chapterComplete, "Completed Chapter 2 did not set chapterComplete");
assert(finished.achievementGranted, "Completed Chapter 2 lost its achievement");

console.log("Chapter 2 isolated state, canonical progression and persistence: OK");
