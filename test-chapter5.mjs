import assert from "node:assert/strict";
import fs from "node:fs";
import { MemoryAccountStore } from "./account-store.js";
import { sanitizeChapter5ProgressState } from "./server.js";

const source = fs.readFileSync(new URL("./chapter5.js", import.meta.url), "utf8");
assert.match(source, /bpmsoft-quest-chapter5-v1/, "Chapter 5 uses an unexpected storage key");
assert.match(source, /scheduleChapter5ProgressSync/, "Chapter 5 does not sync account progress");
assert.match(source, /theme-sky/, "Chapter 5 does not activate its sky theme");

const sanitized = sanitizeChapter5ProgressState({
  energy: 99,
  attempts: 300,
  introSeen: ["schedule", "unknown", "schedule", "connections"],
  scheduleComplete: true,
  connectionsComplete: false,
  baggageComplete: true,
  missionProgress: {
    schedule: { round: 99, completedRounds: ["37A", "37A", "BAD"], lastWrong: ["checkpoint", "version-policy"] },
    crisis: { round: 99, completedRounds: ["45A", "45B", "45C"], lastWrong: [] },
    unknown: { round: 1 }
  }
});

assert.equal(sanitized.chapterId, "good-avia");
assert.equal(sanitized.energy, 4);
assert.equal(sanitized.attempts, 100);
assert.deepEqual(sanitized.introSeen, ["schedule", "connections"]);
assert.equal(sanitized.scheduleComplete, true);
assert.equal(sanitized.connectionsComplete, false);
assert.equal(sanitized.baggageComplete, false, "Non-contiguous completion was not removed");
assert.equal(sanitized.missionProgress.schedule.round, 1, "A two-round mission accepted a third round index");
assert.deepEqual(sanitized.missionProgress.schedule.completedRounds, ["37A"]);
assert.equal(sanitized.missionProgress.crisis.round, 2, "The three-round finale lost its final round index");
assert.equal(sanitized.missionProgress.unknown, undefined);

const store = new MemoryAccountStore();
const account = await store.createAccount({ id: "c5-test", email: "c5@example.com", displayName: "Test", passwordHash: "hash", mode: "progression" });
await store.saveProgress(account.id, "chapter5", sanitized, 1);
const saved = await store.getProgress(account.id);
assert.equal(saved.chapter5.score, 1);
assert.equal(saved.chapter5.state.scheduleComplete, true);
assert.equal(saved.chapter4, null, "Saving Chapter 5 changed Chapter 4 progress");
await store.resetProgress(account.id, "chapter5");
assert.equal((await store.getProgress(account.id)).chapter5, null);

console.log("Chapter 5 canonical sanitizer, isolated persistence and runtime wiring: OK");
