import fs from "node:fs";
import vm from "node:vm";

const storage = new Map();
const localStorage = {
  getItem(key) { return storage.get(key) ?? null; },
  setItem(key, value) { storage.set(key, value); }
};

const context = vm.createContext({ console, localStorage, window: {} });
const source = fs.readFileSync(new URL("./chapter4.js", import.meta.url), "utf8");
vm.runInContext(source, context);

const api = context.window.BPMQuestChapter4;
const assert = (condition, message) => { if (!condition) throw new Error(message); };

assert(source.includes("beginChapter4Mission(button.dataset.c4Zone);"), "Chapter 4 map clicks do not open missions directly");
assert(api.storageKey === "bpmsoft-quest-chapter4-v1", "Chapter 4 uses an unexpected storage key");
assert(api.missionKeys.length === 9, "Chapter 4 does not define nine missions");
assert(api.completionFlags.length === 9, "Chapter 4 does not define nine completion flags");

const chapter3Save = JSON.stringify({ orbitComplete: true, chapterXp: 600 });
storage.set("bpmsoft-quest-chapter3-v1", chapter3Save);
api.setState({ ...api.initialState, migrationComplete: true, consentComplete: true, energy: 2, introSeen: ["migration", "consent", "unknown"], prologueSeen: true });
api.saveState();

assert(storage.get("bpmsoft-quest-chapter3-v1") === chapter3Save, "Saving Chapter 4 changed Chapter 3 progress");
assert(storage.has("bpmsoft-quest-chapter4-v1"), "Chapter 4 progress was not saved separately");

const loaded = api.loadState();
assert(loaded.chapterXp === 140, `Expected canonical 140 XP, got ${loaded.chapterXp}`);
assert(loaded.level === 7, `Expected level VII, got ${loaded.level}`);
assert(loaded.activeMission === "campaign", `Expected Campaign House to be active, got ${loaded.activeMission}`);
assert(loaded.energy === 2, "Chapter 4 energy was not preserved");
assert(loaded.introSeen.length === 2, "Unknown Chapter 4 intro key was not removed");

storage.set("bpmsoft-quest-chapter4-v1", JSON.stringify({ migrationComplete: false, consentComplete: true, campaignComplete: true, energy: 99 }));
const repaired = api.loadState();
assert(repaired.migrationComplete, "A non-contiguous Chapter 4 save was not canonicalized from the beginning");
assert(repaired.consentComplete, "Second canonical completion flag was lost");
assert(!repaired.campaignComplete, "Non-contiguous Chapter 4 completion was not removed");
assert(repaired.chapterXp === 140, "Canonical Chapter 4 XP does not match the repaired rank");
assert(repaired.energy === 4, "Chapter 4 energy was not clamped to four cells");

const finished = api.normalizeState({
  ...api.initialState,
  ...Object.fromEntries(api.completionFlags.map((flag) => [flag, true])),
  achievementGranted: true
});
assert(finished.chapterXp === 700, "Completed Chapter 4 does not have 700 XP");
assert(finished.level === 8, "Completed Chapter 4 does not reach level VIII");
assert(finished.activeMission === "transformation", "Completed Chapter 4 does not point to the replayable finale");
assert(finished.chapterComplete, "Completed Chapter 4 did not set chapterComplete");
assert(finished.achievementGranted, "Completed Chapter 4 lost its achievement");

console.log("Chapter 4 isolated state, canonical progression and persistence: OK");
