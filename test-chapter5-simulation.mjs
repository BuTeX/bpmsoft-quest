import test from "node:test";
import assert from "node:assert/strict";

import { mission37RoundA } from "./chapter5-prototype-data.js";
import {
  createRuntime,
  evaluateRound,
  getCurrentSnapshot,
  reduceRuntime,
  replayToTick,
  validateRound
} from "./chapter5-simulation.js";

const correctConfiguration = {
  "segment-key": "flight-date-segment",
  "version-policy": "higher-only",
  "rejection-policy": "keep-with-reason"
};

function finishBaseline(runtime = createRuntime(mission37RoundA)) {
  let next = reduceRuntime(mission37RoundA, runtime, { type: "START_BASELINE" });
  while (next.status === "running") {
    next = reduceRuntime(mission37RoundA, next, { type: "ADVANCE" });
  }
  return next;
}

function finishVerification(runtime) {
  let next = reduceRuntime(mission37RoundA, runtime, { type: "START_VERIFICATION" });
  while (next.status === "verifying") {
    next = reduceRuntime(mission37RoundA, next, { type: "ADVANCE" });
  }
  return next;
}

test("37A satisfies the simulation data contract", () => {
  assert.deepEqual(validateRound(mission37RoundA), { valid: true, errors: [] });
});

test("baseline deterministically reproduces the stale version and notification", () => {
  const first = replayToTick(mission37RoundA, {}, 4);
  const second = replayToTick(mission37RoundA, {}, 4);

  assert.deepEqual(first, second);
  assert.equal(first.state.segments[0].version, 3);
  assert.equal(first.state.notification.departure, "09:55");
  assert.ok(first.outcomes.includes("stale-version-applied"));
  assert.ok(first.outcomes.includes("stale-notification-prepared"));
});

test("correct configuration rejects the stale event and keeps it auditable", () => {
  const run = replayToTick(mission37RoundA, correctConfiguration, 4);

  assert.equal(run.state.segments[0].version, 4);
  assert.equal(run.state.notification.departure, "10:40");
  assert.equal(run.state.rejectedEvents.length, 1);
  assert.deepEqual(
    mission37RoundA.solution.requiredOutcomes.filter((id) => !run.outcomes.includes(id)),
    []
  );
  assert.deepEqual(
    mission37RoundA.solution.forbiddenOutcomes.filter((id) => run.outcomes.includes(id)),
    []
  );
});

test("replay after rewind yields the same snapshot as a direct run", () => {
  const direct = replayToTick(mission37RoundA, {}, 4).snapshots.at(-1);
  replayToTick(mission37RoundA, {}, 1);
  const replayed = replayToTick(mission37RoundA, {}, 4).snapshots.at(-1);
  assert.deepEqual(replayed, direct);
});

test("evaluation distinguishes a late checkpoint from a rule failure", () => {
  const late = evaluateRound(mission37RoundA, "T4", correctConfiguration);
  assert.equal(late.status, "checkpoint-error");
  assert.equal(late.checkpointCorrect, false);
  assert.equal(late.firstForbiddenOutcome, null);

  const wrongRule = evaluateRound(mission37RoundA, "T3", {
    ...correctConfiguration,
    "version-policy": "last-arrived"
  });
  assert.equal(wrongRule.status, "rule-error");
  assert.equal(wrongRule.firstForbiddenOutcome, "stale-version-applied");
});

test("discarding a rejected event cannot hide the intermediate violation", () => {
  const result = evaluateRound(mission37RoundA, "T3", {
    ...correctConfiguration,
    "rejection-policy": "discard"
  });

  assert.equal(result.status, "rule-error");
  assert.equal(result.firstForbiddenOutcome, "rejected-event-lost");
  assert.deepEqual(result.missingRequiredOutcomes, ["rejection-auditable"]);
});

test("a wrong checkpoint and default rules produce a mixed error", () => {
  const result = evaluateRound(mission37RoundA, "T2", {});
  assert.equal(result.status, "mixed-error");
  assert.equal(result.checkpointCorrect, false);
});

test("runtime completes baseline, supports seek, and passes verification", () => {
  let runtime = finishBaseline();
  assert.equal(runtime.status, "diagnosing");
  assert.equal(runtime.baselineCompleted, true);
  assert.equal(runtime.tickIndex, 4);

  runtime = reduceRuntime(mission37RoundA, runtime, { type: "SEEK", tickIndex: 2 });
  assert.equal(getCurrentSnapshot(runtime).tickId, "T2");

  runtime = reduceRuntime(mission37RoundA, runtime, {
    type: "SELECT_CHECKPOINT",
    checkpointId: "T3"
  });
  for (const [controlId, value] of Object.entries(correctConfiguration)) {
    runtime = reduceRuntime(mission37RoundA, runtime, {
      type: "SET_CONTROL",
      controlId,
      value
    });
  }

  runtime = finishVerification(runtime);
  assert.equal(runtime.status, "passed");
  assert.equal(runtime.verification.status, "passed");
  assert.equal(getCurrentSnapshot(runtime).state.notification.departure, "10:40");
});

test("verification cannot start before baseline and checkpoint selection", () => {
  const runtime = createRuntime(mission37RoundA);
  assert.throws(
    () => reduceRuntime(mission37RoundA, runtime, { type: "START_VERIFICATION" }),
    /requires a checkpoint/
  );
});

test("invalid control values and malformed rounds are rejected", () => {
  const runtime = finishBaseline();
  assert.throws(
    () =>
      reduceRuntime(mission37RoundA, runtime, {
        type: "SET_CONTROL",
        controlId: "version-policy",
        value: "newest-looking"
      }),
    /Unknown value/
  );

  const invalid = JSON.parse(JSON.stringify(mission37RoundA));
  invalid.ticks[2].id = "T9";
  assert.equal(validateRound(invalid).valid, false);
});

test("simulation never mutates mission data", () => {
  const before = JSON.stringify(mission37RoundA);
  replayToTick(mission37RoundA, correctConfiguration, 4);
  finishBaseline();
  assert.equal(JSON.stringify(mission37RoundA), before);
});
