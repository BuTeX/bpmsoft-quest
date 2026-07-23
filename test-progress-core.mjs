import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const source = await readFile(new URL("./progress-core.js", import.meta.url), "utf8");
const context = {};
vm.createContext(context);
vm.runInContext(source, context);

const core = context.BPMQuestProgressCore;
const flags = ["one", "two", "three"];

assert.equal(core.completionRank(null, flags), 0);
assert.equal(core.completionRank({ one: true, two: false, three: true }, flags), 2);
assert.deepEqual(
  { ...core.canonicalCompletionState({ one: true, three: true }, flags) },
  { one: true, two: true, three: false }
);
assert.equal(Object.isFrozen(core), true);

console.log("Progress core contract passed");
