const RUNTIME_STATUSES = new Set([
  "idle",
  "running",
  "paused",
  "diagnosing",
  "configured",
  "verifying",
  "passed",
  "failed"
]);

function clonePlain(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function unique(values) {
  return [...new Set(values)];
}

function mergePlain(target, patch) {
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) return clonePlain(patch);
  const output = target && typeof target === "object" && !Array.isArray(target)
    ? clonePlain(target)
    : {};
  for (const [key, value] of Object.entries(patch)) {
    output[key] = value && typeof value === "object" && !Array.isArray(value)
      ? mergePlain(output[key], value)
      : clonePlain(value);
  }
  return output;
}

function addOutcome(context, id, tickId) {
  context.outcomeEntries.push({ id, tickId, order: context.outcomeEntries.length });
  if (!context.outcomes.includes(id)) context.outcomes.push(id);
}

function activeSegment(state) {
  return state.segments.find((segment) => segment.id === state.activeSegmentId);
}

function matchingSegments(state, payload, keyPolicy) {
  return state.segments.filter((segment) => {
    if (segment.flightNumber !== payload.flightNumber) return false;
    if (keyPolicy === "flight-only") return true;
    if (segment.serviceDate !== payload.serviceDate) return false;
    if (keyPolicy === "flight-date") return true;
    return segment.route === payload.route;
  });
}

function applyEvent(context, event, tickId, configuration) {
  const { state } = context;

  switch (event.type) {
    case "scenario-state": {
      const branch = context.acceptedConfiguration
        ? event.payload?.success
        : event.payload?.baseline;
      if (!branch) throw new Error(`Scenario event ${event.id} misses a runtime branch`);
      context.state = mergePlain(context.state, branch.patch || {});
      for (const outcome of branch.outcomes || []) addOutcome(context, outcome, tickId);
      for (const entry of branch.journal || []) {
        context.dynamicJournalEntries.push({ ...clonePlain(entry), tickId });
      }
      return;
    }

    case "observe-initial-state":
      return;

    case "receive-schedule-version":
      state.inboundEvent = clonePlain(event.payload);
      state.visualStatus = "warning";
      return;

    case "apply-received-schedule-version": {
      const segment = activeSegment(state);
      if (!segment || !state.inboundEvent) {
        addOutcome(context, "schedule-event-not-applied", tickId);
        state.visualStatus = "failure";
        return;
      }

      segment.version = state.inboundEvent.version;
      segment.departure = state.inboundEvent.departure;
      state.inboundEvent = null;
      state.visualStatus = "normal";
      addOutcome(context, "current-version-4", tickId);
      return;
    }

    case "process-partner-schedule-version": {
      const keyPolicy = configuration["segment-key"];
      const candidates = matchingSegments(state, event.payload, keyPolicy);

      if (candidates.length !== 1) {
        state.visualStatus = "failure";
        addOutcome(context, "ambiguous-segment-key", tickId);
        return;
      }

      const segment = candidates[0];
      const shouldReject =
        configuration["version-policy"] === "higher-only" &&
        event.payload.version <= segment.version;

      if (shouldReject) {
        addOutcome(context, "stale-event-rejected", tickId);
        state.visualStatus = "recovered";

        if (configuration["rejection-policy"] === "keep-with-reason") {
          state.rejectedEvents.push({
            eventId: event.id,
            version: event.payload.version,
            currentVersion: segment.version,
            reason: "version-not-newer"
          });
          addOutcome(context, "rejection-auditable", tickId);
        } else {
          addOutcome(context, "rejected-event-lost", tickId);
        }
        return;
      }

      const previousVersion = segment.version;
      segment.version = event.payload.version;
      segment.departure = event.payload.departure;
      state.visualStatus = "failure";

      if (event.payload.version <= previousVersion) {
        addOutcome(context, "stale-version-applied", tickId);
      }
      return;
    }

    case "prepare-passenger-notification": {
      const segment = activeSegment(state);
      state.notification = {
        departure: segment?.departure ?? null,
        version: segment?.version ?? null
      };

      if (segment?.version === 4 && segment.departure === "10:40") {
        addOutcome(context, "notification-uses-version-4", tickId);
        if (state.visualStatus !== "failure") state.visualStatus = "recovered";
      } else {
        addOutcome(context, "stale-notification-prepared", tickId);
        state.visualStatus = "failure";
      }
      return;
    }

    default:
      throw new Error(`Unknown simulation event type: ${event.type}`);
  }
}

function defaultConfiguration(round) {
  return Object.fromEntries(
    round.controls.map((control) => [control.id, control.defaultValue])
  );
}

function normalizeConfiguration(round, configuration = {}) {
  return { ...defaultConfiguration(round), ...clonePlain(configuration) };
}

function validateConfiguration(round, configuration) {
  const errors = [];
  for (const control of round.controls) {
    const values = new Set(control.options.map((option) => option.value));
    if (!values.has(configuration[control.id])) {
      errors.push(`Control ${control.id} has unknown value ${configuration[control.id]}`);
    }
  }

  const unknown = Object.keys(configuration).filter(
    (id) => !round.controls.some((control) => control.id === id)
  );
  for (const id of unknown) errors.push(`Unknown control ${id}`);
  return errors;
}

export function validateRound(round) {
  const errors = [];

  if (!round || typeof round !== "object") {
    return { valid: false, errors: ["Round must be an object"] };
  }

  if (!round.id) errors.push("Round id is required");
  if (!Array.isArray(round.ticks) || round.ticks.length < 5 || round.ticks.length > 7) {
    errors.push("Round must contain 5 to 7 ticks");
  }
  if (!Array.isArray(round.controls) || round.controls.length < 2 || round.controls.length > 3) {
    errors.push("Round must contain 2 to 3 controls");
  }

  const tickIds = new Set();
  for (const [index, tick] of (round.ticks || []).entries()) {
    const expected = `T${index}`;
    if (tick.id !== expected) errors.push(`Tick ${index} must be ${expected}`);
    if (tickIds.has(tick.id)) errors.push(`Duplicate tick id ${tick.id}`);
    tickIds.add(tick.id);
    if (!Array.isArray(tick.events)) errors.push(`Tick ${tick.id} events must be an array`);
    if (!Array.isArray(tick.journal)) errors.push(`Tick ${tick.id} journal must be an array`);
  }

  const actorIds = new Set();
  for (const actor of round.actors || []) {
    if (actorIds.has(actor.id)) errors.push(`Duplicate actor id ${actor.id}`);
    actorIds.add(actor.id);
  }

  const controlIds = new Set();
  for (const control of round.controls || []) {
    if (controlIds.has(control.id)) errors.push(`Duplicate control id ${control.id}`);
    controlIds.add(control.id);
    const optionValues = new Set();
    for (const option of control.options || []) {
      if (optionValues.has(option.value)) {
        errors.push(`Duplicate option ${option.value} in control ${control.id}`);
      }
      optionValues.add(option.value);
    }
    if (!optionValues.has(control.defaultValue)) {
      errors.push(`Default value of ${control.id} is not listed in options`);
    }
  }

  if (!round.solution || !tickIds.has(round.solution.firstDivergenceTickId)) {
    errors.push("Solution must reference an existing first divergence tick");
  }

  for (const accepted of round.solution?.acceptedConfigurations || []) {
    errors.push(...validateConfiguration(round, accepted));
    for (const id of controlIds) {
      if (!(id in accepted)) errors.push(`Accepted configuration misses ${id}`);
    }
  }

  if (!(round.solution?.acceptedConfigurations || []).length) {
    errors.push("At least one accepted configuration is required");
  }

  return { valid: errors.length === 0, errors };
}

function assertValidRound(round) {
  const validation = validateRound(round);
  if (!validation.valid) throw new Error(validation.errors.join("; "));
}

export function replayToTick(round, configuration, tickIndex) {
  assertValidRound(round);
  if (!Number.isInteger(tickIndex) || tickIndex < 0 || tickIndex >= round.ticks.length) {
    throw new Error(`Tick index ${tickIndex} is outside round ${round.id}`);
  }

  const normalized = normalizeConfiguration(round, configuration);
  const configErrors = validateConfiguration(round, normalized);
  if (configErrors.length) throw new Error(configErrors.join("; "));

  const context = {
    state: clonePlain(round.initialState),
    outcomes: [],
    outcomeEntries: [],
    snapshots: [],
    dynamicJournalEntries: [],
    acceptedConfiguration: configurationMatches(round, normalized)
  };

  for (let index = 0; index <= tickIndex; index += 1) {
    const tick = round.ticks[index];
    for (const event of tick.events) {
      applyEvent(context, event, tick.id, normalized);
    }

    context.snapshots.push({
      tickId: tick.id,
      tickIndex: index,
      timeLabel: tick.timeLabel,
      title: tick.title,
      state: clonePlain(context.state),
      outcomes: [...context.outcomes],
      outcomeEntries: clonePlain(context.outcomeEntries),
      journalEntries: context.dynamicJournalEntries.length
        ? clonePlain(context.dynamicJournalEntries)
        : round.ticks
          .slice(0, index + 1)
          .flatMap((item) => item.journal.map((entry) => ({ ...entry, tickId: item.id })))
    });
  }

  return {
    state: clonePlain(context.state),
    outcomes: [...context.outcomes],
    outcomeEntries: clonePlain(context.outcomeEntries),
    snapshots: clonePlain(context.snapshots)
  };
}

function configurationMatches(round, configuration) {
  return round.solution.acceptedConfigurations.some((accepted) =>
    round.controls.every((control) => accepted[control.id] === configuration[control.id])
  );
}

export function evaluateRound(round, checkpointId, configuration, computedRun = null) {
  assertValidRound(round);
  const normalized = normalizeConfiguration(round, configuration);
  const configErrors = validateConfiguration(round, normalized);
  if (configErrors.length) throw new Error(configErrors.join("; "));
  if (!round.ticks.some((tick) => tick.id === checkpointId)) {
    throw new Error(`Unknown checkpoint ${checkpointId}`);
  }

  const run =
    computedRun || replayToTick(round, normalized, round.ticks.length - 1);
  const checkpointCorrect = checkpointId === round.solution.firstDivergenceTickId;
  const exactConfiguration = configurationMatches(round, normalized);
  const missingRequiredOutcomes = round.solution.requiredOutcomes.filter(
    (outcome) => !run.outcomes.includes(outcome)
  );
  const firstForbiddenEntry = run.outcomeEntries.find((entry) =>
    round.solution.forbiddenOutcomes.includes(entry.id)
  );
  const effectsCorrect = !missingRequiredOutcomes.length && !firstForbiddenEntry;

  const controls = Object.fromEntries(
    round.controls.map((control) => {
      const correct = round.solution.acceptedConfigurations.some(
        (accepted) => accepted[control.id] === normalized[control.id]
      );
      return [control.id, correct ? "correct" : "incorrect"];
    })
  );

  let status;
  if (checkpointCorrect && exactConfiguration && effectsCorrect) status = "passed";
  else if (!checkpointCorrect && exactConfiguration && effectsCorrect) status = "checkpoint-error";
  else if (checkpointCorrect) status = "rule-error";
  else status = "mixed-error";

  return {
    status,
    checkpointCorrect,
    controls,
    missingRequiredOutcomes,
    firstForbiddenOutcome: firstForbiddenEntry?.id || null,
    feedbackKey: status
  };
}

export function createRuntime(round) {
  assertValidRound(round);
  return {
    missionId: round.missionId,
    roundId: round.id,
    status: "idle",
    runKind: "baseline",
    tickIndex: -1,
    maxBaselineTickIndex: -1,
    baselineCompleted: false,
    selectedCheckpointId: null,
    controlValues: defaultConfiguration(round),
    computedRun: null,
    verification: null
  };
}

function assertRuntime(runtime) {
  if (!runtime || !RUNTIME_STATUSES.has(runtime.status)) {
    throw new Error(`Invalid runtime status ${runtime?.status}`);
  }
}

function runAt(round, runtime, tickIndex, configuration = runtime.controlValues) {
  return {
    ...runtime,
    tickIndex,
    computedRun: replayToTick(round, configuration, tickIndex)
  };
}

export function reduceRuntime(round, runtime, action) {
  assertValidRound(round);
  assertRuntime(runtime);

  switch (action?.type) {
    case "START_BASELINE": {
      if (!["idle", "failed", "diagnosing", "configured"].includes(runtime.status)) {
        throw new Error(`Cannot start baseline from ${runtime.status}`);
      }
      return runAt(
        round,
        {
          ...createRuntime(round),
          status: round.ticks.length === 1 ? "diagnosing" : "running",
          maxBaselineTickIndex: 0
        },
        0,
        defaultConfiguration(round)
      );
    }

    case "PAUSE":
      if (!["running", "verifying"].includes(runtime.status)) {
        throw new Error(`Cannot pause from ${runtime.status}`);
      }
      return { ...runtime, status: "paused" };

    case "RESUME":
      if (runtime.status !== "paused") throw new Error(`Cannot resume from ${runtime.status}`);
      return {
        ...runtime,
        status: runtime.runKind === "verification" ? "verifying" : "running"
      };

    case "ADVANCE": {
      if (!["running", "verifying"].includes(runtime.status)) {
        throw new Error(`Cannot advance from ${runtime.status}`);
      }
      const nextIndex = runtime.tickIndex + 1;
      if (nextIndex >= round.ticks.length) throw new Error("Round is already at its final tick");

      const next = runAt(round, runtime, nextIndex);
      if (runtime.runKind === "baseline") {
        const baselineCompleted = nextIndex === round.ticks.length - 1;
        return {
          ...next,
          maxBaselineTickIndex: Math.max(runtime.maxBaselineTickIndex, nextIndex),
          baselineCompleted,
          status: baselineCompleted ? "diagnosing" : "running"
        };
      }

      if (nextIndex !== round.ticks.length - 1) return { ...next, status: "verifying" };

      const verification = evaluateRound(
        round,
        runtime.selectedCheckpointId,
        runtime.controlValues,
        next.computedRun
      );
      return {
        ...next,
        status: verification.status === "passed" ? "passed" : "failed",
        verification
      };
    }

    case "SEEK": {
      const allowedStatus = ["paused", "diagnosing", "configured"].includes(runtime.status);
      if (!allowedStatus || runtime.runKind !== "baseline") {
        throw new Error(`Cannot seek during ${runtime.runKind}/${runtime.status}`);
      }
      if (!Number.isInteger(action.tickIndex) || action.tickIndex < 0) {
        throw new Error("Seek requires a non-negative tick index");
      }
      const max = runtime.baselineCompleted
        ? round.ticks.length - 1
        : runtime.maxBaselineTickIndex;
      if (action.tickIndex > max) throw new Error("Cannot seek to an unvisited baseline tick");
      return runAt(round, runtime, action.tickIndex, defaultConfiguration(round));
    }

    case "SELECT_CHECKPOINT": {
      if (!runtime.baselineCompleted || !["diagnosing", "configured"].includes(runtime.status)) {
        throw new Error("Checkpoint can be selected only after the baseline run");
      }
      if (!round.ticks.some((tick) => tick.id === action.checkpointId)) {
        throw new Error(`Unknown checkpoint ${action.checkpointId}`);
      }
      return {
        ...runtime,
        status: "configured",
        selectedCheckpointId: action.checkpointId
      };
    }

    case "SET_CONTROL": {
      if (!["diagnosing", "configured"].includes(runtime.status)) {
        throw new Error(`Cannot configure from ${runtime.status}`);
      }
      const control = round.controls.find((item) => item.id === action.controlId);
      if (!control || !control.options.some((option) => option.value === action.value)) {
        throw new Error(`Unknown value ${action.value} for control ${action.controlId}`);
      }
      return {
        ...runtime,
        status: runtime.selectedCheckpointId ? "configured" : "diagnosing",
        controlValues: { ...runtime.controlValues, [action.controlId]: action.value }
      };
    }

    case "START_VERIFICATION": {
      if (runtime.status !== "configured" || !runtime.selectedCheckpointId) {
        throw new Error("Verification requires a checkpoint and valid configuration");
      }
      const next = runAt(
        round,
        {
          ...runtime,
          status: "verifying",
          runKind: "verification",
          verification: null
        },
        0
      );
      return next;
    }

    case "RETURN_TO_DIAGNOSIS": {
      if (runtime.status !== "failed") throw new Error(`Cannot return from ${runtime.status}`);
      const tickIndex = Math.max(
        0,
        round.ticks.findIndex((tick) => tick.id === runtime.selectedCheckpointId)
      );
      return runAt(
        round,
        {
          ...runtime,
          status: "configured",
          runKind: "baseline",
          verification: null
        },
        tickIndex,
        defaultConfiguration(round)
      );
    }

    case "REPLAY_BASELINE":
      return reduceRuntime(round, createRuntime(round), { type: "START_BASELINE" });

    default:
      throw new Error(`Unknown runtime action ${action?.type}`);
  }
}

export function getCurrentSnapshot(runtime) {
  if (!runtime.computedRun || runtime.tickIndex < 0) return null;
  return clonePlain(runtime.computedRun.snapshots.at(-1));
}
