import fs from "node:fs";
import vm from "node:vm";

const storage = new Map();
const localStorage = {
  getItem(key) { return storage.get(key) ?? null; },
  setItem(key, value) { storage.set(key, value); }
};

const context = vm.createContext({ console, localStorage, window: {} });
const source = fs.readFileSync(new URL("./chapter3.js", import.meta.url), "utf8");
vm.runInContext(source, context);

const api = context.window.BPMQuestChapter3;
const assert = (condition, message) => { if (!condition) throw new Error(message); };

assert(source.includes("beginChapter3Mission(button.dataset.c3Zone);"), "Chapter 3 map clicks do not open missions directly");
assert(source.includes('button.addEventListener("focus", previewMission);'), "Chapter 3 map cards do not refresh the mission preview on keyboard focus");
assert(source.includes("setChapterNavigation?.(activeChapter)"), "Chapter 3 does not use the shared city navigation");
assert(api.storageKey === "bpmsoft-quest-chapter3-v1", "Chapter 3 uses an unexpected storage key");
assert(api.missionKeys.length === 9, "Chapter 3 does not define nine missions");
assert(api.completionFlags.length === 9, "Chapter 3 does not define nine completion flags");

const chapter2Save = JSON.stringify({ contourComplete: true, chapterXp: 500 });
storage.set("bpmsoft-quest-chapter2-v1", chapter2Save);
api.setState({ ...api.initialState, contactComplete: true, leadComplete: true, energy: 2, introSeen: ["contact", "lead", "unknown"], prologueSeen: true });
api.saveState();

assert(storage.get("bpmsoft-quest-chapter2-v1") === chapter2Save, "Saving Chapter 3 changed Chapter 2 progress");
assert(storage.has("bpmsoft-quest-chapter3-v1"), "Chapter 3 progress was not saved separately");

const loaded = api.loadState();
assert(loaded.chapterXp === 120, `Expected canonical 120 XP, got ${loaded.chapterXp}`);
assert(loaded.level === 5, `Expected level V, got ${loaded.level}`);
assert(loaded.activeMission === "channel", `Expected Channel Array to be active, got ${loaded.activeMission}`);
assert(loaded.energy === 2, "Chapter 3 energy was not preserved");
assert(loaded.introSeen.length === 2, "Unknown Chapter 3 intro key was not removed");

storage.set("bpmsoft-quest-chapter3-v1", JSON.stringify({ contactComplete: false, leadComplete: true, channelComplete: true, bpmnComplete: false, energy: 99 }));
const repaired = api.loadState();
assert(repaired.contactComplete, "A non-contiguous Chapter 3 save was not canonicalized from the beginning");
assert(repaired.leadComplete, "Second canonical completion flag was lost");
assert(!repaired.channelComplete, "Non-contiguous Chapter 3 completion was not removed");
assert(repaired.chapterXp === 120, "Canonical Chapter 3 XP does not match the repaired rank");
assert(repaired.energy === 4, "Chapter 3 energy was not clamped to four cells");

const finished = api.normalizeState({
  ...api.initialState,
  ...Object.fromEntries(api.completionFlags.map((flag) => [flag, true])),
  achievementGranted: true
});
assert(finished.chapterXp === 600, "Completed Chapter 3 does not have 600 XP");
assert(finished.level === 6, "Completed Chapter 3 does not remain on level VI");
assert(finished.activeMission === "orbit", "Completed Chapter 3 does not point to the replayable finale");
assert(finished.chapterComplete, "Completed Chapter 3 did not set chapterComplete");
assert(finished.achievementGranted, "Completed Chapter 3 lost its achievement");

console.log("Chapter 3 isolated state, canonical progression and persistence: OK");
