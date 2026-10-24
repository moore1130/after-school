(function (root) {
  "use strict";

  function clamp(value, minimum = 0, maximum = 100) {
    return Math.max(minimum, Math.min(maximum, value));
  }

  function formatGameTime(totalMinutes) {
    const normalized = ((totalMinutes % 1440) + 1440) % 1440;
    let hour = Math.floor(normalized / 60);
    const minute = normalized % 60;
    const suffix = hour >= 12 ? "PM" : "AM";
    hour = hour % 12 || 12;
    return `${hour}:${String(minute).padStart(2, "0")} ${suffix}`;
  }

  function getEnergyState(energy) {
    if (energy < 30) return "exhausted";
    if (energy < 60) return "tired";
    return "focused";
  }

  function getFatigueTimePenalty(activity, energy) {
    if (!activity || !activity.isCognitivelyDemanding) return 0;
    if (energy < 30) return 20;
    if (energy < 60) return 10;
    return 0;
  }

  function calculateActivityPreview(activity, modeId, state, modes) {
    const mode = modes[modeId];
    if (!activity || !mode) throw new Error("Unknown activity or work mode");
    const penalty = getFatigueTimePenalty(activity, state.energy);
    const duration = mode.duration + penalty;
    const baseline = modes.independent.duration + penalty;
    return {
      modeId,
      duration,
      fatiguePenalty: penalty,
      endTime: state.currentTime + duration,
      energyCost: mode.energyCost,
      timeSaved: Math.max(0, baseline - duration),
      remainingTime: Math.max(0, state.dayEndTime - state.currentTime - duration)
    };
  }

  function canStartActivity(currentTime, dayEndTime, duration, latestStart) {
    return currentTime + duration <= dayEndTime && (latestStart == null || currentTime <= latestStart);
  }

  function findNewlyAvailableActivities(beforeTime, afterTime, activities) {
    return activities.filter((activity) => {
      const before = canStartActivity(beforeTime, activity.dayEndTime, activity.duration, activity.latestStart);
      const after = canStartActivity(afterTime, activity.dayEndTime, activity.duration, activity.latestStart);
      return !before && after;
    });
  }

  function applyEnergyChange(energy, change) {
    return clamp(energy + change);
  }

  const api = {
    clamp,
    formatGameTime,
    getEnergyState,
    getFatigueTimePenalty,
    calculateActivityPreview,
    canStartActivity,
    findNewlyAvailableActivities,
    applyEnergyChange
  };

  root.AFTER_SCHOOL_SYSTEMS = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
