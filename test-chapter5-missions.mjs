import assert from "node:assert/strict";
import { goodAviaMissionKeys, goodAviaMissions, goodAviaRounds } from "./chapter5-missions.js";
import { evaluateRound, replayToTick, validateRound } from "./chapter5-simulation.js";

assert.equal(goodAviaMissionKeys.length, 9, "Chapter 5 must contain nine missions");
assert.equal(goodAviaRounds.length, 19, "Chapter 5 must contain nineteen deterministic rounds");
assert.equal(goodAviaMissions.crisis.rounds.length, 3, "The final crisis mission must contain three rounds");
assert.deepEqual(
  goodAviaMissionKeys.map((key) => goodAviaMissions[key].mapLabel),
  ["Расписание", "Пересадки", "Багаж", "Сбои рейсов", "Перебронирование", "Партнёры", "Интеграции", "Прогнозирование", "Приёмка мегахаба"],
  "Chapter 5 map labels are not the approved concise task names"
);

let expectedNumber = 37;
for (const key of goodAviaMissionKeys) {
  const mission = goodAviaMissions[key];
  assert.equal(mission.number, expectedNumber, `${key}: unexpected mission number`);
  assert.match(mission.mapLabel, /^[А-ЯЁA-Z]/, `${key}: map label must start with an uppercase letter`);
  assert.match(mission.sourceUrl, /^https:\/\/edu\.bpmsoft\.ru\/baza-znaniy\//, `${key}: official BPMSoft source is missing`);
  assert.equal(mission.codex.length, 3, `${key}: expected three codex terms`);
  assert.equal(mission.score, key === "crisis" ? 160 : 80, `${key}: unexpected XP reward`);
  expectedNumber += 1;
}

for (const round of goodAviaRounds) {
  assert.deepEqual(validateRound(round), { valid: true, errors: [] }, `${round.id}: invalid simulation contract`);
  const accepted = round.solution.acceptedConfigurations[0];
  assert.ok(Array.isArray(round.guidance?.confirmedControls), `${round.id}: progressive disclosure guidance is missing`);
  for (const id of round.guidance.confirmedControls) {
    const control = round.controls.find((item) => item.id === id);
    assert.ok(control, `${round.id}: confirmed control ${id} does not exist`);
    assert.equal(control.defaultValue, accepted[id], `${round.id}: confirmed control ${id} is not accepted`);
  }
  const finalIndex = round.ticks.length - 1;
  const baseline = replayToTick(round, {}, finalIndex);
  const baselineAgain = replayToTick(round, {}, finalIndex);
  const recovered = replayToTick(round, accepted, finalIndex);

  assert.deepEqual(baseline, baselineAgain, `${round.id}: baseline is not deterministic`);
  assert.ok(round.solution.forbiddenOutcomes.some((id) => baseline.outcomes.includes(id)), `${round.id}: baseline does not reproduce the failure`);
  assert.ok(round.solution.requiredOutcomes.every((id) => recovered.outcomes.includes(id)), `${round.id}: accepted rules miss a required outcome`);
  assert.ok(round.solution.forbiddenOutcomes.every((id) => !recovered.outcomes.includes(id)), `${round.id}: accepted rules keep a forbidden outcome`);

  const result = evaluateRound(round, round.solution.firstDivergenceTickId, accepted, recovered);
  assert.equal(result.status, "passed", `${round.id}: accepted checkpoint and rules were rejected`);

  const divergenceIndex = round.ticks.findIndex((tick) => tick.id === round.solution.firstDivergenceTickId);
  const firstForbidden = baseline.outcomeEntries.find((entry) => round.solution.forbiddenOutcomes.includes(entry.id));
  assert.equal(firstForbidden?.tickId, `T${divergenceIndex}`, `${round.id}: failure appears after the declared first divergence`);
}

assert.equal(goodAviaMissions.schedule.rounds[0].id, "37A", "The validated vertical prototype must remain the first production round");
assert.ok(goodAviaMissions.schedule.rounds.every((round) => round.guidance.confirmedControls.length === 1), "Mission 37 must keep one rule pre-confirmed in each onboarding round");
assert.equal(goodAviaMissions.crisis.rounds.at(-1).ticks.length, 6, "The final acceptance must keep its six-tick correlation scenario");

console.log("Chapter 5 missions 37–45, nineteen deterministic rounds and acceptance outcomes: OK");
