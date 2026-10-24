"use strict";

const assert = require("node:assert/strict");
const systems = require("./systems.js");
const narrativeTools = require("./narrative.js");
const stateTools = require("./state.js");
global.window = global;
require("./content.js");
const content = global.AFTER_SCHOOL_CONTENT;

const activity = { id: "wed_library_research", isCognitivelyDemanding: true };
const modes = {
  independent: { duration: 60, energyCost: 20 },
  collaborate: { duration: 35, energyCost: 10 },
  delegate: { duration: 15, energyCost: 5 }
};
const focused = { currentTime: 980, dayEndTime: 1300, energy: 70 };

assert.deepEqual(systems.calculateActivityPreview(activity, "independent", focused, modes), {
  modeId: "independent", duration: 60, fatiguePenalty: 0, endTime: 1040,
  energyCost: 20, timeSaved: 0, remainingTime: 260
});
assert.equal(systems.formatGameTime(1040), "5:20 PM");
assert.equal(systems.formatGameTime(1015), "4:55 PM");
assert.equal(systems.formatGameTime(995), "4:35 PM");

const collaborate = systems.calculateActivityPreview(activity, "collaborate", focused, modes);
assert.equal(collaborate.duration, 35);
assert.equal(collaborate.timeSaved, 25);
assert.equal(collaborate.endTime, 1015);
assert.equal(systems.canStartActivity(collaborate.endTime, 1300, 45, 1020), true);

const delegate = systems.calculateActivityPreview(activity, "delegate", focused, modes);
assert.equal(delegate.duration, 15);
assert.equal(delegate.timeSaved, 45);
assert.equal(delegate.endTime, 995);

const tired = systems.calculateActivityPreview(activity, "collaborate", { ...focused, energy: 50 }, modes);
assert.equal(tired.duration, 45);
assert.equal(tired.fatiguePenalty, 10);
assert.equal(tired.timeSaved, 25);

const exhausted = systems.calculateActivityPreview(activity, "independent", { ...focused, energy: 25 }, modes);
assert.equal(exhausted.duration, 80);
assert.equal(exhausted.fatiguePenalty, 20);
assert.equal(systems.getEnergyState(59), "tired");
assert.equal(systems.getEnergyState(29), "exhausted");
assert.equal(systems.applyEnergyChange(95, 15), 100);

const aiState = stateTools.createAiSystemState();
assert.equal(aiState.aiLiteracy, 40);
stateTools.markEventCompleted(aiState, "wed_library_research");
stateTools.markEventCompleted(aiState, "wed_library_research");
assert.deepEqual(aiState.completedEventIds, ["wed_library_research"]);

const research = content.activities.library.find((item) => item.id === "research");
assert.equal(research.aiPolicy, "optional");
assert.equal(research.aiTaskId, "research_sources");
for (const location of ["court", "canteen", "transit", "home"]) {
  for (const item of content.activities[location]) assert.notEqual(item.aiPolicy, "optional");
}

const narrative = narrativeTools.createNarrativeState();
assert.equal(narrative.npc.maya.relationship, 50);
assert.equal(narrative.npc.jay.relationship, 50);
assert.equal(content.storySystem.relationships.missedCommitmentPenalty, 20);
assert.equal(narrativeTools.relationshipStage(50), "STEADY");
assert.equal(narrativeTools.relationshipStage(40), "UPSET");
assert.equal(narrativeTools.relationshipStage(30), "ANGRY");
assert.equal(narrativeTools.relationshipStage(15), "ANGRY");
assert.equal(narrativeTools.relationshipStage(14), "ESTRANGED");
narrativeTools.addMemory(narrative, "jay", { id: "broken-promise", text: "A promise was broken.", moodDelta: -20, relationshipDelta: -8, major: true });
assert.equal(narrative.npc.jay.needsRepair, true);
assert.equal(narrativeTools.moodLabel(narrative.npc.jay.mood), "UNEASY");
narrativeTools.recoverMoods(narrative, 5);
assert.equal(narrative.npc.jay.mood, 45);
assert.equal(narrative.npc.jay.needsRepair, true, "mood recovery must not clear major memories");

const riskyConflict = narrativeTools.deriveConflict(["uncheckedResearchOutput"], narrative);
assert.equal(riskyConflict.severity, "high");
assert.equal(riskyConflict.sourceRisk, true);
const riskyQuestions = narrativeTools.buildQna(["uncheckedResearchOutput", "usedAiDraft"], narrative);
assert.equal(riskyQuestions.length, 3);
assert.equal(riskyQuestions[0].options.some((option) => option.id === "cite"), false, "unearned evidence answer must stay hidden");
assert.equal(riskyQuestions[0].options.some((option) => option.remedy), true);

const strongQuestions = narrativeTools.buildQna(["verifiedSources", "checkedClaim", "usedAiFeedback", "understandsOpening"], narrativeTools.createNarrativeState());
assert.equal(strongQuestions[0].options.some((option) => option.id === "cite"), true);
const endingScore = narrativeTools.calculateEndingScore({ project: 90, aiLiteracy: 80, qnaPercent: 100, mayaRelationship: 80, jayRelationship: 80, conflictSeverity: "low" });
assert.equal(narrativeTools.gradeFromScore(endingScore, content.storySystem.gradeThresholds), "A");
assert.equal(narrativeTools.gradeFromScore(20, content.storySystem.gradeThresholds), "F");

console.log("Game systems passed: Time, Energy, AI policy, memory, conflict, evidence-gated Q&A, endings, save state, and replay safeguards.");
