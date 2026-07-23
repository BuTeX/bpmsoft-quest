(function initializeProgressCore(globalScope) {
  function completionRank(state, completionFlags) {
    if (!state || !Array.isArray(completionFlags)) return 0;
    return completionFlags.reduce(
      (rank, flag) => rank + Number(state[flag] === true),
      0
    );
  }

  function canonicalCompletionState(state, completionFlags) {
    const rank = completionRank(state, completionFlags);
    return Object.fromEntries(
      completionFlags.map((flag, index) => [flag, index < rank])
    );
  }

  globalScope.BPMQuestProgressCore = Object.freeze({
    completionRank,
    canonicalCompletionState
  });
})(typeof window === "undefined" ? globalThis : window);
