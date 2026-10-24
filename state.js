(function (root) {
  "use strict";

  const SAVE_VERSION = 4;

  function createAiSystemState() {
    return {
      saveVersion: SAVE_VERSION,
      aiLiteracy: 40,
      outputStatus: "NONE",
      completedEventIds: [],
      tipsDiscovered: [],
      skillEvidence: { ask: 0, understand: 0, verify: 0, judge: 0, own: 0 },
      timeSavingsLog: [],
      energyLog: [],
      aiOpportunities: [],
      aiSession: { taskId: null, mode: null, role: null, status: "idle", progress: 0, stepIndex: 0 },
      narrative: root.AFTER_SCHOOL_NARRATIVE ? root.AFTER_SCHOOL_NARRATIVE.createNarrativeState() : null
    };
  }

  function ensureAiSystemState(saved) {
    const defaults = createAiSystemState();
    if (!saved) return defaults;
    return {
      ...defaults,
      ...saved,
      skillEvidence: { ...defaults.skillEvidence, ...(saved.skillEvidence || {}) },
      saveVersion: SAVE_VERSION,
      aiSession: { ...defaults.aiSession, ...(saved.aiSession || {}) },
      narrative: root.AFTER_SCHOOL_NARRATIVE ? root.AFTER_SCHOOL_NARRATIVE.ensureNarrativeState(saved.narrative) : saved.narrative,
      completedEventIds: Array.isArray(saved.completedEventIds) ? saved.completedEventIds : [],
      tipsDiscovered: Array.isArray(saved.tipsDiscovered) ? saved.tipsDiscovered : [],
      timeSavingsLog: Array.isArray(saved.timeSavingsLog) ? saved.timeSavingsLog : [],
      energyLog: Array.isArray(saved.energyLog) ? saved.energyLog : []
    };
  }

  function hasCompletedEvent(aiState, eventId) {
    return aiState.completedEventIds.includes(eventId);
  }

  function markEventCompleted(aiState, eventId) {
    if (!hasCompletedEvent(aiState, eventId)) aiState.completedEventIds.push(eventId);
  }

  const api = { SAVE_VERSION, createAiSystemState, ensureAiSystemState, hasCompletedEvent, markEventCompleted };
  root.AFTER_SCHOOL_STATE = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
