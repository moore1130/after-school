(function (root) {
  "use strict";

  function clamp(value, minimum = 0, maximum = 100) {
    return Math.max(minimum, Math.min(maximum, value));
  }

  function createNpc(name) {
    return { name, mood: 60, relationship: 50, memory: [], needsRepair: false, estranged: false };
  }

  function createNarrativeState() {
    return {
      version: 1,
      announcementSeen: false,
      checkpointId: null,
      checkpoint: null,
      conflict: { severity: "low", secondaryIds: [], sourceRisk: false, understandingRisk: false },
      npc: { maya: createNpc("Maya"), jay: createNpc("Jay") },
      repair: { completed: [], availableActions: [] },
      qna: { questionIds: [], answerEvidence: [], answers: [], score: 0, remedyUsed: false, complete: false },
      ending: { grade: null, score: 0, behaviorReview: [], mayaEpilogue: "", jayEpilogue: "" },
      feedback: { lastScene: -10 },
      scenesCompleted: 0
    };
  }

  function ensureNarrativeState(saved) {
    const defaults = createNarrativeState();
    if (!saved || saved.version !== defaults.version) return defaults;
    return {
      ...defaults,
      ...saved,
      conflict: { ...defaults.conflict, ...(saved.conflict || {}) },
      repair: { ...defaults.repair, ...(saved.repair || {}) },
      qna: { ...defaults.qna, ...(saved.qna || {}) },
      ending: { ...defaults.ending, ...(saved.ending || {}) },
      feedback: { ...defaults.feedback, ...(saved.feedback || {}) },
      npc: {
        maya: { ...defaults.npc.maya, ...(saved.npc?.maya || {}), memory: saved.npc?.maya?.memory || [] },
        jay: { ...defaults.npc.jay, ...(saved.npc?.jay || {}), memory: saved.npc?.jay?.memory || [] }
      }
    };
  }

  function moodLabel(value) {
    if (value >= 72) return "OPEN";
    if (value >= 55) return "STEADY";
    if (value >= 38) return "UNEASY";
    return "UPSET";
  }

  function relationshipStage(value) {
    if (value >= 70) return "CLOSE";
    if (value >= 50) return "STEADY";
    if (value >= 40) return "UPSET";
    if (value >= 15) return "ANGRY";
    return "ESTRANGED";
  }

  function addMemory(narrative, npcId, event) {
    const npc = narrative.npc[npcId];
    if (!npc || npc.memory.some((item) => item.id === event.id)) return false;
    npc.memory.unshift({ ...event });
    npc.memory = npc.memory.slice(0, 8);
    npc.mood = clamp(npc.mood + (event.moodDelta || 0));
    npc.relationship = clamp(npc.relationship + (event.relationshipDelta || 0));
    npc.estranged = npc.relationship < 15;
    if (event.major && (event.moodDelta || 0) < 0) npc.needsRepair = true;
    return true;
  }

  function recoverMoods(narrative, amount = 5) {
    for (const npc of Object.values(narrative.npc)) {
      if (npc.mood < 60) npc.mood = Math.min(60, npc.mood + amount);
      else if (npc.mood > 60) npc.mood = Math.max(60, npc.mood - amount);
    }
  }

  function deriveConflict(flags, narrative) {
    const sourceRisk = flags.includes("uncheckedClaim") || flags.includes("uncheckedResearchOutput");
    const understandingRisk = sourceRisk || !flags.includes("understandsOpening");
    const secondaryIds = [];
    if (narrative.npc.maya.needsRepair) secondaryIds.push("maya_trust");
    if (narrative.npc.jay.needsRepair) secondaryIds.push("jay_promise");
    const pressure = Number(sourceRisk) + Number(understandingRisk) + secondaryIds.length;
    return { severity: pressure >= 3 ? "high" : pressure >= 1 ? "medium" : "low", secondaryIds: secondaryIds.slice(0, 2), sourceRisk, understandingRisk };
  }

  function buildQna(flags, narrative) {
    const verified = flags.includes("verifiedSources") || flags.includes("checkedClaim") || narrative.repair.completed.includes("verify_sources");
    const understands = flags.includes("understandsOpening") || narrative.repair.completed.includes("rehearse_qna");
    const usedAi = flags.some((flag) => ["usedAiDraft", "usedAiFeedback", "uncheckedResearchOutput"].includes(flag));
    return [
      {
        id: "sources",
        evidence: verified ? ["source_checked"] : [],
        options: verified
          ? [
              { id: "cite", label: "Name the checked source and explain why it fits", score: 3, feedback: "You connect the claim to evidence the group actually checked." },
              { id: "uncertain", label: "Admit the limit and narrow the claim", score: 2, feedback: "You protect accuracy by saying only what the evidence supports." },
              { id: "bluff", label: "Say the slide was already approved", score: 0, feedback: "Approval does not replace a source." }
            ]
          : [
              { id: "uncertain", label: "Admit that the source was not checked", score: 2, remedy: true, feedback: "You cannot create missing research on stage, but you can be honest about the limit." },
              { id: "handoff", label: "Ask Maya to answer only if she checked it", score: 1, remedy: true, feedback: "The handoff is valid only because you do not claim work that was never done." },
              { id: "bluff", label: "Say A.I.D.E. found it, so it should be reliable", score: 0, feedback: "AI is not its own source. Ms Tan asks again." }
            ]
      },
      {
        id: "process",
        evidence: usedAi ? ["ai_used"] : ["independent_work"],
        options: usedAi
          ? [
              { id: "disclose", label: "Describe what AI did and what you checked", score: understands ? 3 : 2, feedback: "The process is transparent, including its limits." },
              { id: "hide", label: "Say the group wrote everything without tools", score: 0, feedback: "The answer conflicts with your actual process." },
              { id: "credit", label: "Credit AI for the whole argument", score: 1, feedback: "That is transparent, but it also reveals how little ownership remained." }
            ]
          : [
              { id: "independent", label: "Explain how you compared and wrote the material", score: understands ? 3 : 2, feedback: "You describe a process you can defend." },
              { id: "invent", label: "Claim AI verified the sources for you", score: 0, feedback: "The answer invents evidence that is not in this timeline." }
            ]
      },
      {
        id: "responsibility",
        evidence: understands ? ["understanding"] : [],
        options: [
          { id: "own", label: "Own your section and name one specific improvement", score: 3, feedback: "Responsibility sounds credible when it includes a concrete next step." },
          { id: "share", label: "Explain the group decision and your part in it", score: 2, feedback: "You recognise the team without disappearing inside it." },
          { id: "blame", label: "Say Maya made the final decision", score: 0, feedback: "The answer pushes responsibility onto a teammate." }
        ]
      }
    ];
  }

  function calculateEndingScore(input) {
    const conflictPenalty = { low: 0, medium: 8, high: 18 }[input.conflictSeverity] || 0;
    const relationshipAverage = (input.mayaRelationship + input.jayRelationship) / 2;
    return Math.round(clamp(
      input.project * 0.35 + input.aiLiteracy * 0.2 + input.qnaPercent * 0.25 + relationshipAverage * 0.2 - conflictPenalty
    ));
  }

  function gradeFromScore(score, thresholds) {
    return Object.entries(thresholds).find(([, minimum]) => score >= minimum)?.[0] || "F";
  }

  const api = { createNarrativeState, ensureNarrativeState, moodLabel, relationshipStage, addMemory, recoverMoods, deriveConflict, buildQna, calculateEndingScore, gradeFromScore };
  root.AFTER_SCHOOL_NARRATIVE = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
