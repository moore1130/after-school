(() => {
  const content = window.AFTER_SCHOOL_CONTENT;
  const systems = window.AFTER_SCHOOL_SYSTEMS;
  const stateTools = window.AFTER_SCHOOL_STATE;
  const narrativeTools = window.AFTER_SCHOOL_NARRATIVE;
  const aiConfig = content.aiSystem;
  const storyConfig = content.storySystem;
  const game = document.getElementById("game");
  const screen = document.getElementById("screen");
  const timeBlock = document.getElementById("timeBlock");
  const clock = document.getElementById("clock");
  const statusPanel = document.getElementById("statusPanel");
  const statusToggle = document.getElementById("statusToggle");
  const mapButton = document.getElementById("mapButton");
  const soundButton = document.getElementById("soundButton");
  const journalButton = document.getElementById("journalButton");
  const journalDialog = document.getElementById("journalDialog");
  const journalContent = document.getElementById("journalContent");
  const closeJournal = document.getElementById("closeJournal");
  const phoneDialog = document.getElementById("phoneDialog");
  const phoneContent = document.getElementById("phoneContent");
  const phoneClock = document.getElementById("phoneClock");
  const closePhone = document.getElementById("closePhone");
  const taskLine = document.getElementById("taskLine");
  const toast = document.getElementById("toast");
  const hudClock = document.getElementById("hudClock");
  const hudRemaining = document.getElementById("hudRemaining");
  const energyState = document.getElementById("energyState");
  const literacyBar = document.getElementById("literacyBar");
  const literacyValue = document.getElementById("literacyValue");
  const mayaValue = document.getElementById("mayaValue");
  const jayValue = document.getElementById("jayValue");
  const aiSessionStatus = document.getElementById("aiSessionStatus");
  const aiSessionStep = document.getElementById("aiSessionStep");
  const aiProgressTrack = document.getElementById("aiProgressTrack");
  const aiProgressBar = document.getElementById("aiProgressBar");
  const tipJournalCount = document.getElementById("tipJournalCount");
  const conflictLabel = document.getElementById("conflictLabel");
  const conflictHint = document.getElementById("conflictHint");
  const npcHud = document.getElementById("npcHud");
  const mayaStatus = document.getElementById("mayaStatus");
  const jayStatus = document.getElementById("jayStatus");
  const mayaMoodLabel = document.getElementById("mayaMoodLabel");
  const jayMoodLabel = document.getElementById("jayMoodLabel");
  const mayaMoodBar = document.getElementById("mayaMoodBar");
  const jayMoodBar = document.getElementById("jayMoodBar");
  const npcDialog = document.getElementById("npcDialog");
  const npcDialogTitle = document.getElementById("npcDialogTitle");
  const npcDialogContent = document.getElementById("npcDialogContent");
  const closeNpcDialog = document.getElementById("closeNpcDialog");

  const STORAGE_KEY = "after-school-game-v3-ai-system";
  const LEGACY_STORAGE_KEY = "after-school-game-v2-prd";
  const HOME_ONLY_MINUTE = 20 * 60 + 40;
  const END_MINUTE = 21 * 60 + 40;
  const START_MINUTE = 15 * 60 + 40;
  const LOCATION_CLOSE_MINUTES = { library: 20 * 60, court: 18 * 60 + 45 };
  const DAYS = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"];
  let toastTimer;
  let audioContext;
  let musicTimer;
  let musicStep = 0;
  let currentScene = "title";

  function freshState() {
    return {
      screen: "title",
      currentEvent: null,
      minute: START_MINUTE,
      dayIndex: 0,
      daysCompleted: 0,
      stats: { project: 10, connection: 50, personal: 20 },
      flags: [],
      completedLocations: [],
      visitedLocations: [],
      notes: [],
      choices: [],
      revisedTasks: [],
      pendingReflection: null,
      dayProgress: DAYS.map(() => ({ activities: {}, locations: [], minutes: 0, mainEvents: [], timeReclaimed: 0, aiUsed: false, aiTypes: [] })),
      storyEvents: [],
      phoneBriefDays: [],
      v2: freshV2State(),
      aiSystem: stateTools.createAiSystemState(),
      sound: false,
      ending: null
    };
  }

  let state = freshState();

  function freshV2State() {
    return {
      energy: aiConfig.initialEnergy,
      academic: { taskPerformance: 50, knowledgeMastery: 50, criticalThinking: 50, aiLiteracy: aiConfig.initialAiLiteracy, academicIntegrity: 50 },
      personal: { responsibility: 50, empathy: 50, agency: 50, selfManagement: 50 },
      activities: { basketballPracticeMinutes: 0, socialMinutes: 0, restMinutes: 0, independentStudyMinutes: 0 },
      relationships: { maya: { trust: 50, friendship: 50 }, jay: { trust: 50, friendship: 50 } },
      aiUsageHistory: [], timeReclaimed: 0
    };
  }

  function clamp(value) { return Math.max(0, Math.min(100, value)); }
  function advanceClock(minutes) {
    const amount = Math.max(0, Number(minutes) || 0);
    state.minute = Math.min(END_MINUTE, state.minute + amount);
    progress().minutes += amount;
    return state.minute;
  }
  function hasFlag(flag) { return state.flags.includes(flag); }
  function addFlag(flag) { if (flag && !hasFlag(flag)) state.flags.push(flag); }
  function completed(location) { return state.completedLocations.includes(location); }
  function dayLabel() { return DAYS[Math.max(0, Math.min(DAYS.length - 1, state.dayIndex || 0))]; }
  function advanceDay() {
    recoverNpcMoods();
    state.dayIndex = Math.min((state.dayIndex || 0) + 1, DAYS.length - 1);
    state.daysCompleted = Math.min((state.daysCompleted || 0) + 1, DAYS.length);
    state.minute = START_MINUTE;
    narrative().scenesCompleted += 1;
    updateConflict();
  }

  function progress() { return state.dayProgress[state.dayIndex]; }
  function narrative() {
    if (!state.aiSystem.narrative) state.aiSystem.narrative = narrativeTools.createNarrativeState();
    return state.aiSystem.narrative;
  }
  function storyDone(id) { return state.storyEvents.includes(id); }
  function recordStory(id) { if (!storyDone(id)) state.storyEvents.push(id); }

  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function bump(object, key, amount) { object[key] = clamp((object[key] ?? 50) + amount); }
  function aiUsageType(flags) {
    if (flags.includes("usedAiDraft") || flags.includes("uncheckedClaim")) return "REPLACE";
    if (flags.includes("usedAiFeedback") || flags.includes("checkedClaim")) return "ASSIST";
    if (flags.includes("understandsOpening")) return "LEARN";
    return "NONE";
  }

  function applyChoiceModel(model, event, choice) {
    const flags = choice.flags || [];
    const eventId = state.currentEvent || "unknown-event";
    if (flags.includes("repliedMaya")) recordNpcMemory("maya", `${eventId}:${choice.label}`, choice.note, { moodDelta: 4, relationshipDelta: 2 });
    if (flags.includes("repliedJay")) recordNpcMemory("jay", `${eventId}:${choice.label}`, choice.note, { moodDelta: 4, relationshipDelta: 2 });
    if (flags.includes("ignoredMessages")) {
      recordNpcMemory("maya", `${eventId}:ignored-maya`, "You left Maya's project message unanswered.", { moodDelta: -18, relationshipDelta: -storyConfig.relationships.ignoredMessagePenalty, major: true });
      recordNpcMemory("jay", `${eventId}:ignored-jay`, "You left Jay's invitation unanswered.", { moodDelta: -18, relationshipDelta: -storyConfig.relationships.ignoredMessagePenalty, major: true });
    }
    const effects = choice.effects || {};
    const baseline = Math.max(...event.choices.map(item => item.time || 0), choice.time || 0);
    const type = aiUsageType(flags);
    const timeSaved = type === "NONE" ? 0 : Math.max(0, baseline - (choice.time || 0));
    model.timeReclaimed += timeSaved;
    if (type !== "NONE") model.aiUsageHistory.push({ type, event: state.currentEvent, verified: flags.includes("checkedClaim") || flags.includes("understandsOpening") });
    bump(model.academic, "taskPerformance", Math.round((effects.project || 0) * .45));
    bump(model.academic, "knowledgeMastery", flags.includes("understandsOpening") ? 8 : flags.includes("uncheckedClaim") ? -5 : 1);
    bump(model.academic, "criticalThinking", flags.includes("checkedClaim") ? 8 : flags.includes("uncheckedClaim") ? -6 : flags.includes("usedAiFeedback") ? 4 : 0);
    bump(model.academic, "aiLiteracy", type === "ASSIST" || type === "LEARN" ? 7 : type === "REPLACE" ? -3 : 0);
    bump(model.academic, "academicIntegrity", flags.includes("uncheckedClaim") ? -8 : flags.includes("checkedClaim") ? 5 : 0);
    bump(model.personal, "responsibility", flags.some(flag => ["checkedClaim", "resolvedMayaComment", "keptBasketballPromise"].includes(flag)) ? 6 : flags.includes("missedBasketball") ? -5 : 0);
    bump(model.personal, "empathy", Math.round((effects.connection || 0) * .35));
    bump(model.personal, "agency", flags.includes("understandsOpening") || flags.includes("stoppedScrolling") ? 5 : flags.includes("lostTrackOfTime") ? -6 : 0);
    bump(model.personal, "selfManagement", flags.includes("lostTrackOfTime") ? -8 : effects.personal > 0 ? 5 : effects.personal < 0 ? -3 : 0);
    model.energy = clamp(model.energy + Math.round((effects.personal || 0) * .4) - Math.max(0, (choice.time || 0) - 45) / 10);
    if (event.scene === "court") model.activities.basketballPracticeMinutes += choice.time || 0;
    if ((effects.connection || 0) > 0) model.activities.socialMinutes += choice.time || 0;
    if ((effects.personal || 0) > 0) model.activities.restMinutes += choice.time || 0;
    if ((effects.project || 0) > 0 && type !== "REPLACE") model.activities.independentStudyMinutes += choice.time || 0;
    bump(model.relationships.maya, "trust", flags.includes("resolvedMayaComment") || flags.includes("sharedEarly") ? 8 : flags.includes("ignoredMayaComment") ? -5 : 0);
    bump(model.relationships.jay, "trust", flags.includes("keptBasketballPromise") ? 8 : flags.includes("missedBasketball") ? -8 : 0);
    return { type, timeSaved };
  }

  function save() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
  function load() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (saved && saved.stats && Array.isArray(saved.flags)) {
        state = saved;
        state.v2 ||= freshV2State();
        state.daysCompleted ||= 0;
        state.dayProgress ||= DAYS.map(() => ({ activities: {}, locations: [], minutes: 0, mainEvents: [], timeReclaimed: 0, aiUsed: false, aiTypes: [] }));
        state.dayProgress.forEach(day => { day.timeReclaimed ||= 0; day.aiUsed ||= false; day.aiTypes ||= []; });
        state.storyEvents ||= [];
        state.phoneBriefDays ||= [];
        state.aiSystem = stateTools.ensureAiSystemState(state.aiSystem);
        state.v2.energy = Number.isFinite(state.v2.energy) ? state.v2.energy : aiConfig.initialEnergy;
        state.v2.academic.aiLiteracy = state.aiSystem.aiLiteracy;
      }
    } catch (_) {}
  }

  function formatTime(total) {
    const safe = Math.min(total, END_MINUTE);
    let hour = Math.floor(safe / 60);
    const minute = safe % 60;
    const suffix = hour >= 12 ? "PM" : "AM";
    hour = hour % 12 || 12;
    return `${hour}:${String(minute).padStart(2, "0")} ${suffix}`;
  }

  function setScene(scene) {
    currentScene = scene;
    game.className = `game-shell scene-${scene}`;
    startSceneMusic(scene);
  }

  function setChrome(visible = true) {
    timeBlock.hidden = !visible;
    statusPanel.hidden = !visible;
    npcHud.hidden = !visible;
    journalButton.hidden = !visible;
    mapButton.disabled = !visible || state.screen === "event" || state.screen === "reflection" || state.screen === "ending";
    timeBlock.querySelector("span").textContent = dayLabel();
    clock.textContent = formatTime(state.minute);
    document.getElementById("projectValue").textContent = state.stats.project;
    document.getElementById("projectBar").style.width = `${state.stats.project}%`;
    document.getElementById("energyValue").textContent = Math.round(state.v2.energy);
    document.getElementById("energyBar").style.width = `${state.v2.energy}%`;
    document.getElementById("energyBar").parentElement.setAttribute("aria-valuenow", Math.round(state.v2.energy));
    hudClock.textContent = formatTime(state.minute);
    hudRemaining.textContent = `${Math.max(0, END_MINUTE - state.minute)} min remaining`;
    energyState.textContent = systems.getEnergyState(state.v2.energy).toUpperCase();
    const literacy = state.aiSystem?.aiLiteracy ?? aiConfig.initialAiLiteracy;
    literacyValue.textContent = literacy;
    literacyBar.style.width = `${literacy}%`;
    literacyBar.parentElement.setAttribute("aria-valuenow", literacy);
    const story = narrative();
    mayaValue.textContent = Math.round(story.npc.maya.relationship);
    jayValue.textContent = Math.round(story.npc.jay.relationship);
    mayaMoodLabel.textContent = narrativeTools.moodLabel(story.npc.maya.mood);
    jayMoodLabel.textContent = narrativeTools.moodLabel(story.npc.jay.mood);
    mayaMoodBar.style.width = `${story.npc.maya.mood}%`;
    jayMoodBar.style.width = `${story.npc.jay.mood}%`;
    const conflict = updateConflict();
    conflictLabel.textContent = conflict.severity.toUpperCase();
    conflictHint.textContent = conflict.sourceRisk
      ? "Evidence needs checking."
      : conflict.secondaryIds.includes("maya_trust")
        ? "Maya expects follow-through."
        : conflict.secondaryIds.includes("jay_promise")
          ? "Jay expects a real repair."
          : conflict.understandingRisk ? "Be ready to explain the work." : "No urgent conflict.";
    conflictLabel.parentElement.dataset.level = conflict.severity;
    mayaStatus.classList.toggle("needs-repair", story.npc.maya.needsRepair);
    jayStatus.classList.toggle("needs-repair", story.npc.jay.needsRepair);
    tipJournalCount.textContent = `${state.aiSystem.tipsDiscovered.length} TIP${state.aiSystem.tipsDiscovered.length === 1 ? "" : "S"}`;
    renderAiSessionHud();
  }

  function renderAiSessionHud() {
    const session = state.aiSystem.aiSession;
    if (!session || session.status === "idle") {
      aiSessionStatus.textContent = "A.I.D.E. · STANDBY";
      aiSessionStep.textContent = "Choose a learning task to begin.";
      aiProgressTrack.hidden = true;
      return;
    }
    aiSessionStatus.textContent = session.status === "ready" ? "OUTPUT READY · NOT VERIFIED" : session.status.toUpperCase();
    aiSessionStep.textContent = session.step || "Working on the research task";
    aiProgressTrack.hidden = false;
    aiProgressBar.style.width = `${session.progress || 0}%`;
    aiProgressTrack.setAttribute("aria-valuenow", session.progress || 0);
  }

  function getAudioContext() {
    if (!audioContext) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      audioContext = new AudioContext();
    }
    if (audioContext.state === "suspended") audioContext.resume();
    return audioContext;
  }

  function playTone(tone, duration, type = "square", volume = 0.025) {
    if (!state.sound) return;
    try {
      const ctx = getAudioContext();
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.frequency.value = tone;
      oscillator.type = type;
      gain.gain.setValueAtTime(volume, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
      oscillator.connect(gain).connect(ctx.destination);
      oscillator.start();
      oscillator.stop(ctx.currentTime + duration);
    } catch (_) {}
  }

  function beep(tone = 440, duration = 0.06) { playTone(tone, duration, "square", 0.025); }

  const SCENE_MUSIC = {
    title: { notes: [523, 659, 784, 659, 587, 698, 880, 698], chords: [[262,330,392],[220,277,330]], pace: 560, type: "triangle", beat: false },
    map: { notes: [587, 740, 880, 740, 659, 831, 988, 831], chords: [[294,370,440],[262,330,392]], pace: 460, type: "triangle", beat: true },
    transit: { notes: [494, 587, 740, 659, 554, 659, 831, 740], chords: [[247,311,370],[277,349,415]], pace: 400, type: "triangle", beat: true },
    canteen: { notes: [523, 659, 698, 784, 698, 659, 587, 523], chords: [[262,330,392],[294,370,440]], pace: 510, type: "sine", beat: true },
    library: { notes: [440, 523, 659, 523, 494, 587, 698, 587], chords: [[220,262,330],[196,247,294]], pace: 680, type: "sine", beat: false },
    court: { notes: [392, 392, 587, 494, 392, 659, 587, 494], chords: [[196,247,294],[220,277,330]], pace: 300, type: "triangle", beat: true },
    classroom: { notes: [523, 587,659,784,659,587,523,440], chords: [[262,330,392],[247,294,370]], pace: 520, type: "triangle", beat: true },
    home: { notes: [392,494,587,494,440,523,659,523], chords: [[196,247,294],[220,262,330]], pace: 720, type: "sine", beat: false },
    ending: { notes: [440,554,659,831,740,659,554,494], chords: [[220,277,330],[185,233,277]], pace: 760, type: "triangle", beat: false }
  };

  function stopSceneMusic() {
    clearInterval(musicTimer);
    musicTimer = null;
  }

  function startSceneMusic(scene = currentScene) {
    stopSceneMusic();
    if (!state.sound) return;
    const track = SCENE_MUSIC[scene] || SCENE_MUSIC.map;
    musicStep = 0;
    const nextNote = () => {
      const note = track.notes[musicStep % track.notes.length];
      playTone(note, Math.min(.38, track.pace / 1450), track.type, 0.006);
      if (musicStep % 4 === 0) {
        const chord = track.chords[Math.floor(musicStep / 4) % track.chords.length];
        chord.forEach((frequency, index) => playTone(frequency, track.pace * 3.4 / 1000, index === 0 ? "sine" : "triangle", index === 0 ? 0.0045 : 0.0025));
      }
      if (track.beat && musicStep % 2 === 0) playTone(musicStep % 4 === 0 ? 82 : 110, .07, "sine", .006);
      musicStep += 1;
    };
    nextNote();
    musicTimer = setInterval(nextNote, track.pace);
  }

  function showToast(message) {
    toast.textContent = message;
    toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("show"), 2200);
  }

  function recordNpcMemory(npcId, id, text, options = {}) {
    const added = narrativeTools.addMemory(narrative(), npcId, {
      id,
      text,
      day: dayLabel(),
      moodDelta: options.moodDelta || 0,
      relationshipDelta: options.relationshipDelta || 0,
      major: Boolean(options.major)
    });
    if (added) {
      const npc = narrative().npc[npcId];
      showToast(`${npc.name} remembers · ${narrativeTools.moodLabel(npc.mood)}`);
    }
  }

  function openNpcMemory(npcId) {
    const npc = narrative().npc[npcId];
    npcDialogTitle.textContent = npc.name;
    const memories = npc.memory.length
      ? npc.memory.map((memory) => `<article class="journal-note"><span>${memory.day}${memory.major ? " · IMPORTANT" : ""}</span><p>${memory.text}</p></article>`).join("")
      : '<p class="empty">No important interaction has been recorded yet.</p>';
    npcDialogContent.innerHTML = `<section class="npc-detail"><div><span>MOOD</span><strong>${narrativeTools.moodLabel(npc.mood)}</strong></div><div><span>RELATIONSHIP</span><strong>${Math.round(npc.relationship)} · ${narrativeTools.relationshipStage(npc.relationship)}</strong></div><div><span>REPAIR</span><strong>${npc.needsRepair ? "NEEDED" : "CLEAR"}</strong></div></section><h3>Recent interactions</h3>${memories}`;
    npcDialog.showModal();
  }

  function updateConflict() {
    narrative().conflict = narrativeTools.deriveConflict(state.flags, narrative());
    return narrative().conflict;
  }

  function recoverNpcMoods() {
    narrativeTools.recoverMoods(narrative(), storyConfig.mood.recoveryRate);
  }

  function captureWednesdayCheckpoint() {
    const story = narrative();
    if (story.checkpointId) return;
    story.checkpointId = "wed_full_01";
    story.checkpoint = {
      dayIndex: state.dayIndex,
      minute: state.minute,
      stats: clone(state.stats),
      flags: clone(state.flags),
      completedLocations: clone(state.completedLocations),
      dayProgress: clone(state.dayProgress),
      v2: clone(state.v2),
      conflict: clone(updateConflict()),
      npc: clone(story.npc)
    };
    save();
  }

  function renderTitle() {
    setScene("title");
    setChrome(false);
    taskLine.textContent = "A scripted interactive prototype. No live AI is used.";
    const hasSave = Boolean(localStorage.getItem(STORAGE_KEY)) && state.screen !== "title";
    const hasLegacySave = Boolean(localStorage.getItem(LEGACY_STORAGE_KEY)) && !hasSave;
    screen.innerHTML = `
      <section class="title-screen">
        <span class="micro">ONE STUDENT · ONE WEEK · MANY POSSIBLE EVENINGS</span>
        <h1>AFTER<br><span>SCHOOL</span></h1>
        <p class="title-copy">The last bell has rung. A group project, a basketball game, an unfinished track and a glowing phone are all waiting.</p>
        <div class="button-row centered">
          <button class="primary-button" id="newGame" type="button">START THE WEEK</button>
          ${hasSave ? '<button class="secondary-button" id="continueGame" type="button">CONTINUE</button>' : ''}
        </div>
        ${hasLegacySave ? '<p class="save-notice">This prototype has been updated. Start a new game to use the new Time, Energy, and A.I.D.E. systems.</p>' : ''}
        <p class="smallprint">A fictional interactive story. No choice is scored as morally right or wrong.</p>
      </section>`;
    document.getElementById("newGame").onclick = () => {
      const sound = state.sound;
      state = freshState();
      state.sound = sound;
      renderDayIntro();
    };
    const continueButton = document.getElementById("continueGame");
    if (continueButton) continueButton.onclick = () => {
      load();
      if (state.screen === "event" && state.currentEvent) renderEvent();
      else if (state.screen === "ending") renderEnding();
      else if (state.screen === "reflection") renderDailyReflection();
      else if (state.screen === "wednesdayAnnouncement") renderWednesdayAnnouncement();
      else if (state.screen === "fridayPresentation") renderFridayPresentation();
      else if (state.screen === "fridayQna" && narrative().qna.runtimeQuestions) renderQnaQuestion(narrative().qna.answers.length);
      else if (state.screen === "dayIntro") renderDayIntro();
      else renderMap();
    };
  }

  function renderDayIntro() {
    if (state.dayIndex === 2 && !narrative().announcementSeen) return renderWednesdayAnnouncement();
    const brief = content.dailyBriefs[state.dayIndex];
    state.screen = "dayIntro";
    setScene("classroom");
    setChrome(true);
    taskLine.textContent = state.dayIndex === 4 ? "DEADLINE · The presentation must be addressed today." : "Choose where to go and how to spend the afternoon.";
    screen.innerHTML = `<section class="dialogue-panel"><div class="portrait day-portrait" aria-label="${dayLabel()}">${dayLabel()}</div><div class="dialogue-copy"><span class="location-label">${dayLabel()} · 3:40 PM</span><span class="speaker">AFTER THE LAST BELL</span><h2>${brief.title}</h2><p>${brief.body}</p><p>You can visit several places, do more than one activity, and return to the map while time remains.</p><button class="primary-button" id="startDay" type="button">CHOOSE A LOCATION</button></div></section>`;
    document.getElementById("startDay").onclick = () => {
      if (state.dayIndex === 0 && !storyDone("last_bell")) return openEvent("last_bell");
      state.minute = 16 * 60;
      renderMap();
    };
    save();
  }

  function renderWednesdayAnnouncement() {
    state.screen = "wednesdayAnnouncement";
    setScene("classroom");
    setChrome(true);
    taskLine.textContent = "NEW REQUIREMENT · Friday now includes live questions.";
    screen.innerHTML = `<section class="dialogue-panel"><div class="portrait character-art portrait-teacher" aria-hidden="true"></div><div class="dialogue-copy"><span class="location-label">WEDNESDAY · CLASSROOM</span><span class="speaker">MS TAN</span><h2>Friday will include Q&amp;A</h2><p>“After each presentation, I will ask two or three questions. Every group member must be able to explain the part they handled and where the evidence came from.”</p><p>Maya glances at the source notes. Your phone buzzes with Jay's practice plan. Work that looked finished now has to be understood.</p><div class="message-stack"><article><span>WHAT CHANGED</span><p>Polished slides are not enough. Sources, AI use, and responsibility may be questioned.</p></article><article><span>WHAT THE GAME REMEMBERS</span><p>Your choices from Monday and Tuesday will shape Thursday's repair options and Friday's answers.</p></article></div><button class="primary-button" id="acceptQnaAnnouncement" type="button">I UNDERSTAND</button></div></section>`;
    document.getElementById("acceptQnaAnnouncement").onclick = () => {
      narrative().announcementSeen = true;
      updateConflict();
      captureWednesdayCheckpoint();
      showToast("Wednesday checkpoint saved");
      renderDayIntro();
      showDailyPhoneBrief();
    };
    save();
  }

  function eventMessages(event) {
    if (!event.messages) return "";
    return `<div class="message-stack">${event.messages.map(message => `<article><span>${message.from}</span><p>${message.text}</p></article>`).join("")}</div>`;
  }

  function portraitClass(event) {
    if (event.portrait === "M") return "portrait-maya";
    if (event.portrait === "J") return "portrait-jay";
    if (event.portrait === "T") return "portrait-teacher";
    if (event.portrait === "YOU") return "portrait-player";
    return "";
  }

  function locationLogoClass(id) {
    return { library: "scene-library", court: "scene-court-action", canteen: "scene-hawker", transit: "scene-mrt", home: "scene-family" }[id] || "scene-mrt";
  }

  function sceneLogo(id, label) {
    return `<div class="portrait scene-logo ${locationLogoClass(id)}" role="img" aria-label="${label} scene emblem"></div>`;
  }

  function renderEvent() {
    const event = content.events[state.currentEvent];
    setScene(event.scene);
    setChrome(true);
    taskLine.textContent = currentTask();
    screen.innerHTML = `
      <section class="dialogue-panel">
        <div class="portrait ${portraitClass(event) ? `character-art ${portraitClass(event)}` : ""}" aria-hidden="true">${portraitClass(event) ? "" : event.portrait}</div>
        <div class="dialogue-copy">
          <span class="location-label">${event.location}</span>
          <span class="speaker">${event.speaker}</span>
          <h2>${event.title}</h2>
          ${event.body.map(paragraph => `<p>${paragraph}</p>`).join("")}
          ${eventMessages(event)}
          <div class="choices">
            ${event.choices.map((choice, index) => {
              return `
              <button class="choice-button" type="button" data-choice="${index}">
                <span>${choice.label}</span><small>${choice.hint || ""}</small>
              </button>`;
            }).join("")}
          </div>
        </div>
      </section>`;
    document.querySelectorAll("[data-choice]").forEach(button => {
      button.onclick = () => choose(event, event.choices[Number(button.dataset.choice)]);
    });
  }

  function choose(event, choice) {
    document.querySelectorAll("[data-choice]").forEach(button => button.disabled = true);
    const before = { ...state.stats };
    const modelBefore = clone(state.v2);
    const learning = applyChoiceModel(state.v2, event, choice);
    const terminalChoice = choice.next === "map" && state.currentEvent !== "last_bell";
    if (terminalChoice) {
      advanceClock(Math.max(5, choice.time || 0));
    } else if (state.currentEvent === "last_bell") {
      state.minute = 16 * 60;
    }
    progress().timeReclaimed += learning.timeSaved || 0;
    if (learning.type !== "NONE") { progress().aiUsed = true; progress().aiTypes.push(learning.type); }
    for (const [key, value] of Object.entries(choice.effects || {})) {
      state.stats[key] = clamp(state.stats[key] + value);
    }
    (choice.flags || []).forEach(addFlag);
    recordChoiceMemories(state.currentEvent, choice);
    if (choice.complete && !completed(choice.complete)) state.completedLocations.push(choice.complete);
    state.notes.push({ time: `${dayLabel()} · ${formatTime(state.minute)}`, text: choice.note, location: event.location });
    state.choices.push({ event: state.currentEvent, label: choice.label, aiType: learning.type, timeSaved: learning.timeSaved, modelBefore });
    save();
    beep(520, 0.08);

    const deltas = Object.keys(state.stats)
      .filter(key => state.stats[key] !== before[key])
      .map(key => `${key[0].toUpperCase() + key.slice(1)} ${state.stats[key] > before[key] ? "+" : ""}${state.stats[key] - before[key]}`);
    const timeText = terminalChoice ? `${Math.max(5, choice.time || 0)} min passed` : state.currentEvent === "last_bell" ? "Exploration starts at 4 PM" : "Decision in progress";
    const reclaimedText = learning.timeSaved ? `<span>${learning.timeSaved} min reclaimed</span>` : "";

    const response = document.createElement("div");
    response.className = "response-card";
    const canRevise = choice.complete && (choice.effects?.project || 0) > 0 && !state.revisedTasks.includes(choice.complete);
    response.innerHTML = `<div class="choice-illustration ${eventResultArtClass(event)}" aria-hidden="true"></div><p>${choice.response}</p><div class="effect-line"><span>${timeText}</span>${reclaimedText}${learning.type !== "NONE" ? `<span>AI · ${learning.type}</span>` : ""}${deltas.map(delta => `<span>${delta}</span>`).join("")}</div>${canRevise ? `<div class="button-row"><button class="secondary-button" data-revision="ai" type="button">REVIEW WITH AI · 10 MIN</button><button class="secondary-button" data-revision="independent" type="button">EDIT INDEPENDENTLY · 10 MIN</button></div>` : ""}<button class="primary-button" id="continueChoice" type="button">CONTINUE</button>`;
    document.querySelector(".dialogue-copy").append(response);
    response.scrollIntoView({ behavior: "smooth", block: "nearest" });
    setChrome(true);
    document.querySelectorAll("[data-revision]").forEach(button => button.onclick = () => {
      const method = button.dataset.revision;
      advanceClock(10);
      state.stats.project = clamp(state.stats.project + 5);
      bump(state.v2.academic, "taskPerformance", 4);
      bump(state.v2.academic, method === "ai" ? "aiLiteracy" : "criticalThinking", 3);
      state.revisedTasks.push(choice.complete);
      state.notes.push({ time: `${dayLabel()} · ${formatTime(state.minute)}`, text: method === "ai" ? "You reviewed the draft with AI and decided which feedback to use." : "You independently revised the draft before submitting.", location: event.location });
      document.querySelectorAll("[data-revision]").forEach(item => item.disabled = true);
      showToast("Draft reviewed · 10 min passed · Project +5");
      setChrome(true);
      save();
    });
    document.getElementById("continueChoice").onclick = () => {
      if (state.currentEvent) recordStory(state.currentEvent);
      if (state.currentEvent === "last_bell" && hasFlag("repliedMaya")) return openEvent("library_start");
      if (state.currentEvent === "last_bell" && hasFlag("repliedJay")) return openEvent("court");
      if (choice.next === "map") returnAfterAction(choice.note, choice.response, learning);
      else openEvent(choice.next);
    };
  }

  function recordChoiceMemories(eventId, choice) {
    const flags = choice.flags || [];
    if (flags.some((flag) => ["sharedEarly", "resolvedMayaComment", "askedCollaboration", "checkedClaim"].includes(flag))) {
      recordNpcMemory("maya", `${eventId}:${choice.label}`, choice.note, { moodDelta: 6, relationshipDelta: 4 });
    }
    if (flags.some((flag) => ["uncheckedClaim", "ignoredMayaComment"].includes(flag))) {
      recordNpcMemory("maya", `${eventId}:${choice.label}`, choice.note, { moodDelta: -12, relationshipDelta: -5, major: flags.includes("uncheckedClaim") });
    }
    if (flags.includes("keptBasketballPromise") || flags.includes("playedFullGame") || flags.includes("playedShortGame")) {
      recordNpcMemory("jay", `${eventId}:${choice.label}`, choice.note, { moodDelta: 8, relationshipDelta: 5 });
    }
    if (flags.includes("missedBasketball")) {
      recordNpcMemory("jay", `${eventId}:${choice.label}`, choice.note, { moodDelta: -18, relationshipDelta: -8, major: true });
    }
    updateConflict();
  }

  function eventResultScene(event) {
    if (event.scene === "court") return "scene-court-action";
    if (state.currentEvent === "personal") return "scene-music";
    if (state.currentEvent === "library_together") return "scene-maya-discuss";
    if (event.portrait === "M" || state.currentEvent === "maya_comment") return "scene-maya-slides";
    if (event.scene === "library") return "scene-library";
    if (event.scene === "home") return "scene-sleep";
    return "scene-mrt";
  }

  function eventResultArtClass(event) {
    if (event.scene === "court") return "scene-concepts scene-concept-court";
    if (state.currentEvent === "library_together") return "scene-concepts scene-concept-hawker";
    if (event.scene === "library") return "scene-concepts scene-concept-library";
    return `atlas ${eventResultScene(event)}`;
  }

  function returnAfterAction(note, response, learning = { timeSaved: 0, type: "NONE" }) {
    state.pendingReflection = { day: dayLabel(), note, response, timeSaved: progress().timeReclaimed, aiType: dailyAiType() };
    if (state.minute >= END_MINUTE) endCurrentDay("It is 9:40 PM. You put everything down and go to sleep. The day ends automatically.");
    else renderMap();
  }

  function openEvent(id) {
    state.screen = "event";
    state.currentEvent = id;
    save();
    renderEvent();
  }

  function takeaway(reflection) {
    if (reflection.aiType === "REPLACE") return "Finishing the work is not the same as understanding it.";
    if (reflection.aiType === "ASSIST" || reflection.aiType === "LEARN") return "AI can support your thinking without replacing it.";
    if (reflection.timeSaved > 0) return "AI can save time. It cannot decide what matters to you.";
    return "A slower choice can still be worthwhile when you understand its cost.";
  }

  function renderDailyReflection() {
    const reflection = state.pendingReflection;
    if (!reflection) return renderMap();
    state.screen = "reflection";
    setChrome(true);
    const conflict = updateConflict();
    const reflectionOptions = conflict.sourceRisk
      ? ["I saved time, but skipped an evidence check.", "I need to trace the claim before presenting it.", "The group can probably handle the risk without me."]
      : narrative().npc.maya.needsRepair || narrative().npc.jay.needsRepair
        ? ["A missed promise cost someone else time.", "A quick apology is enough on its own.", "I should make one specific repair tomorrow."]
        : ["I balanced what mattered most today.", "I gained something and accepted a trade-off.", "Tomorrow I want to protect more energy."];
    taskLine.textContent = "TODAY'S TAKEAWAY · Choices create trade-offs, not moral scores.";
    screen.innerHTML = `<section class="dialogue-panel"><div class="portrait day-portrait" aria-label="${reflection.day}">${reflection.day}</div><div class="dialogue-copy"><span class="location-label">${reflection.day} · DAILY REFLECTION</span><span class="speaker">YOUR ROUTE</span><h2>The Compromise</h2><p>${reflection.note}</p><div class="message-stack"><article><span>WHAT YOU GAINED</span><p>${reflection.response}</p></article><article><span>AI SAVED TIME TODAY</span><p>${reflection.timeSaved > 0 ? `About ${reflection.timeSaved} minutes compared with doing the same task without AI.` : reflection.aiType === "NONE" ? "0 minutes · You did not use AI for a measured time-saving task today." : "0 minutes · AI supported the work, but did not shorten it."}</p></article></div><p class="metric-explainer">This is an estimate of time saved by AI—not the time remaining in your evening.</p><blockquote>${takeaway(reflection)}</blockquote><section class="reflection-question"><span>PAUSE &amp; NOTICE</span><h3>What best explains the consequence of today's choices?</h3><div class="choices">${reflectionOptions.map((option, index) => `<button class="choice-button ${reflection.insight === option ? "selected" : ""}" data-reflection-choice="${index}" type="button"><span>${option}</span></button>`).join("")}</div></section><button class="primary-button" id="nextDay" type="button" ${reflection.insight ? "" : "disabled"}>${state.daysCompleted >= 5 ? "SEE 16-WEEK PROJECTION" : "CONTINUE TO NEXT DAY"}</button></div></section>`;
    document.querySelectorAll("[data-reflection-choice]").forEach((button) => button.onclick = () => {
      reflection.insight = reflectionOptions[Number(button.dataset.reflectionChoice)];
      document.querySelectorAll("[data-reflection-choice]").forEach((item) => item.classList.toggle("selected", item === button));
      document.getElementById("nextDay").disabled = false;
      save();
    });
    document.getElementById("nextDay").onclick = () => {
      state.pendingReflection = null;
      applyMissedDailyTasks();
      if (state.daysCompleted >= 5) finishDay();
      else {
        advanceDay();
        renderDayIntro();
        if (!(state.dayIndex === 2 && !narrative().announcementSeen)) showDailyPhoneBrief();
      }
    };
    save();
  }

  function showDailyPhoneBrief() {
    if (state.phoneBriefDays.includes(state.dayIndex)) return;
    state.phoneBriefDays.push(state.dayIndex);
    save();
    openPhone(true);
  }

  function applyMissedDailyTasks() {
    const mayaTask = content.dailyTasks.maya[state.dayIndex];
    const jayTask = content.dailyTasks.jay[state.dayIndex];
    if (!progress().activities[mayaTask.id]) {
      bump(state.v2.relationships.maya, "trust", -storyConfig.relationships.missedCommitmentPenalty);
      state.stats.project = clamp(state.stats.project - 3);
      addFlag(`missed_${mayaTask.id}`);
      state.notes.push({ time: `${dayLabel()} · END OF DAY`, text: `Maya's task remained unanswered: ${mayaTask.label}.`, location: "Phone" });
      recordNpcMemory("maya", `missed:${mayaTask.id}`, `You left “${mayaTask.label}” unanswered. Maya had to carry that part alone.`, { moodDelta: -20, relationshipDelta: -storyConfig.relationships.missedCommitmentPenalty, major: true });
    }
    if (!progress().activities[jayTask.id]) {
      bump(state.v2.relationships.jay, "trust", -storyConfig.relationships.missedCommitmentPenalty);
      state.stats.connection = clamp(state.stats.connection - 2);
      addFlag(`missed_${jayTask.id}`);
      state.notes.push({ time: `${dayLabel()} · END OF DAY`, text: `Jay's basketball task remained unanswered: ${jayTask.label}.`, location: "Phone" });
      recordNpcMemory("jay", `missed:${jayTask.id}`, `You left “${jayTask.label}” unanswered. Jay waited without knowing whether you were coming.`, { moodDelta: -20, relationshipDelta: -storyConfig.relationships.missedCommitmentPenalty, major: true });
    }
    updateConflict();
  }

  function currentTask() {
    const remaining = Math.max(0, END_MINUTE - state.minute);
    const timeLeft = `${remaining} min left today`;
    if (!completed("library")) return `WEEK TASK · Presentation opening due Friday · ${timeLeft}`;
    if (!hasFlag("resolvedMayaComment") && state.dayIndex > 0) return `OPEN THREAD · Maya's comment · ${timeLeft}`;
    return `YOUR ROUTE · ${progress().locations.length} places visited · ${timeLeft}`;
  }

  function phoneEventId() {
    if (completed("library") && !hasFlag("handledMayaComment")) return "maya_comment";
    if (!hasFlag("scrolledOnce")) return "scroll_1";
    if (!hasFlag("scrolledTwice")) return "scroll_2";
    if (!hasFlag("lostTrackOfTime") && !hasFlag("stoppedScrolling")) return "scroll_3";
    return null;
  }

  function locationState(id) {
    if (state.minute >= END_MINUTE) return "closed";
    if (state.minute >= HOME_ONLY_MINUTE && id !== "home") return "closed";
    if (LOCATION_CLOSE_MINUTES[id] && state.minute >= LOCATION_CLOSE_MINUTES[id]) return "closed";
    return progress().locations.includes(id) ? "visited" : "open";
  }

  function locationTaskAvailability(id, duration = 0) {
    const closeMinute = LOCATION_CLOSE_MINUTES[id] || (id === "home" ? END_MINUTE : HOME_ONLY_MINUTE);
    const closed = state.minute >= closeMinute || state.minute >= END_MINUTE;
    const fits = !closed && state.minute + Math.max(0, duration) <= closeMinute;
    return { closeMinute, closed, fits };
  }

  function mapHotspot(id, position) {
    const location = content.locations[id];
    const status = locationState(id);
    const labels = { open: "AVAILABLE", visited: "VISIT AGAIN", closed: "CLOSED" };
    return `
      <button class="map-hotspot ${position} ${status}" type="button" data-location="${id}" ${status === "closed" ? "disabled" : ""}>
        <span class="map-icon">${location.icon}</span>
        <strong>${location.name}</strong>
        <small>${labels[status]}</small>
      </button>`;
  }

  function renderMap() {
    state.screen = "map";
    state.currentEvent = null;
    setScene("map");
    setChrome(true);
    taskLine.textContent = currentTask();
    const repairBoard = state.dayIndex === 3 ? renderRepairBoardMarkup() : "";
    screen.innerHTML = `
      <section class="map-screen" aria-label="Campus map">
        <div class="map-heading"><span class="micro">${dayLabel()} ROUTE · ${Math.max(0, END_MINUTE - state.minute)} MIN LEFT</span><h2>${state.minute >= HOME_ONLY_MINUTE ? "It's late. Time to go home." : "Where will you go next?"}</h2><p>${state.minute >= HOME_ONLY_MINUTE ? "After 8:40 PM, only home activities are available. One final home activity ends at 9:40 PM, then sleep is automatic." : "Every activity shows its real duration. More AI assistance may reduce the time, but never makes an activity free."}</p></div>
        <div class="singapore-landmarks" aria-hidden="true"><span>HDB</span><span>HAWKER</span><span>MRT</span><span>PCN</span></div>
        ${mapHotspot("library", "library-spot")}
        ${mapHotspot("court", "court-spot")}
        ${mapHotspot("canteen", "canteen-spot")}
        ${mapHotspot("transit", "transit-spot")}
        ${mapHotspot("home", "home-spot")}
        ${repairBoard}
        <div class="map-actions">
          <button class="secondary-button" id="openPhoneMap" type="button">OPEN PHONE</button>
          <button class="primary-button" id="finishDay" type="button" ${progress().minutes < 10 || state.minute >= HOME_ONLY_MINUTE ? "disabled" : ""}>${state.minute >= HOME_ONLY_MINUTE ? "GO HOME BEFORE SLEEP" : `END ${dayLabel()}`}</button>
        </div>
      </section>`;

    document.querySelectorAll("[data-location]").forEach(button => {
      button.onclick = () => visitLocation(button.dataset.location);
    });
    document.getElementById("openPhoneMap").onclick = () => openPhone(false);
    document.getElementById("finishDay").onclick = () => endCurrentDay("You decided this was enough for today.");
    document.querySelectorAll("[data-repair-action]").forEach((button) => button.onclick = () => performRepairAction(button.dataset.repairAction));
    save();
  }

  function availableRepairActions() {
    const story = narrative();
    const conflict = updateConflict();
    const actions = [];
    if (conflict.sourceRisk && !story.repair.completed.includes("verify_sources")) actions.push("verify_sources");
    if (conflict.understandingRisk && !story.repair.completed.includes("rehearse_qna")) actions.push("rehearse_qna");
    if (story.npc.maya.needsRepair && !story.repair.completed.includes("own_mistake")) actions.push("own_mistake");
    if (story.npc.jay.needsRepair && !story.repair.completed.includes("repair_jay")) actions.push("repair_jay");
    if (!actions.length && !story.repair.completed.includes("rehearse_qna")) actions.push("rehearse_qna");
    story.repair.availableActions = actions;
    return actions;
  }

  function renderRepairBoardMarkup() {
    const conflict = updateConflict();
    const actions = availableRepairActions();
    if (!actions.length) return `<aside class="repair-board complete"><span>THURSDAY CHECK</span><strong>No urgent repairs</strong><small>Explore freely or prepare for Friday.</small></aside>`;
    return `<aside class="repair-board"><span>THURSDAY · ${conflict.severity.toUpperCase()} RISK</span><strong>What needs attention?</strong><div>${actions.slice(0, 3).map((id) => { const action = storyConfig.repairActions[id]; return `<button type="button" data-repair-action="${id}"><b>${action.title}</b><small>${action.hint}</small></button>`; }).join("")}</div></aside>`;
  }

  function performRepairAction(actionId) {
    const action = storyConfig.repairActions[actionId];
    const story = narrative();
    if (!action || story.repair.completed.includes(actionId)) return;
    if (state.minute + action.time > END_MINUTE) {
      showToast(`Needs ${action.time} min · not enough time remains`);
      return;
    }
    advanceClock(action.time);
    state.v2.energy = systems.applyEnergyChange(state.v2.energy, action.energy);
    state.stats.project = clamp(state.stats.project + (action.project || 0));
    story.repair.completed.push(actionId);
    if (actionId === "verify_sources") {
      addFlag("verifiedSources");
      state.flags = state.flags.filter((flag) => flag !== "uncheckedClaim" && flag !== "uncheckedResearchOutput");
      recordNpcMemory("maya", `repair:${actionId}`, "You traced the weak claims back to real sources and corrected the slide.", { moodDelta: 8, relationshipDelta: 4 });
    } else if (actionId === "rehearse_qna") {
      addFlag("understandsOpening");
      state.v2.academic.knowledgeMastery = clamp(state.v2.academic.knowledgeMastery + 6);
    } else if (actionId === "own_mistake") {
      story.npc.maya.needsRepair = false;
      recordNpcMemory("maya", `repair:${actionId}`, "You named the mistake without making Maya carry the repair.", { moodDelta: 12, relationshipDelta: action.relationship });
    } else if (actionId === "repair_jay") {
      story.npc.jay.needsRepair = false;
      recordNpcMemory("jay", `repair:${actionId}`, "You made a specific plan after breaking the earlier promise.", { moodDelta: 12, relationshipDelta: action.relationship });
    }
    updateConflict();
    state.notes.push({ time: `${dayLabel()} · ${formatTime(state.minute)}`, text: action.title, location: "Thursday Repair Board" });
    showToast(`${action.title} · ${action.time} min`);
    save();
    renderRepairResult(actionId);
  }

  function renderRepairResult(actionId) {
    const action = storyConfig.repairActions[actionId];
    const conflict = narrative().conflict;
    state.screen = "repairResult";
    setChrome(true);
    screen.innerHTML = `<section class="research-panel result-panel"><span class="location-label">THURSDAY REPAIR</span><h2>${action.title}</h2><p>${actionId === "own_mistake" ? "An apology changes the relationship. The evidence risk still needs evidence work." : "The action leaves a trace in the project, not just a promise."}</p><div class="result-grid"><span>TIME USED</span><strong>${action.time} MIN</strong><span>ENERGY</span><strong>${action.energy}</strong><span>CONFLICT</span><strong>${conflict.severity.toUpperCase()}</strong><span>HISTORY</span><strong>REMEMBERED</strong></div><button class="primary-button" id="continueRepair" type="button">CONTINUE EXPLORING</button></section>`;
    document.getElementById("continueRepair").onclick = renderMap;
  }

  function visitLocation(id) {
    if (!state.visitedLocations.includes(id)) state.visitedLocations.push(id);
    if (!progress().locations.includes(id)) progress().locations.push(id);
    const eventId = locationStoryEvent(id);
    if (eventId) return openEvent(eventId);
    renderLocation(id);
  }

  function locationStoryEvent(id) {
    if (id === "library" && !completed("library")) return "library_start";
    if (id === "court" && state.dayIndex === 0 && !storyDone("court")) return "court";
    if (id === "home" && state.dayIndex >= 2 && !completed("home")) return "personal";
    if (id === "canteen" && hasFlag("askedCollaboration") && !storyDone("library_together")) return "library_together";
    if (id === "home" && state.dayIndex > 0 && completed("library") && !hasFlag("handledMayaComment")) { addFlag("handledMayaComment"); return "maya_comment"; }
    return null;
  }

  function renderLocation(id) {
    const location = content.locations[id];
    const isBedtime = id === "home" && state.minute >= HOME_ONLY_MINUTE;
    const remainingHomeActivities = isBedtime ? content.activities.home.filter(activity => !progress().activities[activity.id]) : [];
    const activities = isBedtime
      ? (remainingHomeActivities.length ? remainingHomeActivities : [{ id: "bedtime", label: "Wind down and prepare for bed", hint: "wash up, pack tomorrow's bag, put the phone away, then sleep", time: 60, energy: 15, effects: { personal: 8 }, activity: "restMinutes", note: "You packed for tomorrow, put the phone away, and let the day end at 9:40 PM." }])
      : [...content.activities[id]];
    state.screen = "location";
    state.currentEvent = null;
    setScene(id === "transit" ? "transit" : id === "canteen" ? "canteen" : location.scene);
    setChrome(true);
    taskLine.textContent = currentTask();
    const cards = activities.map(activity => {
      const count = progress().activities[activity.id] || 0;
      const duration = Math.max(5, activity.time || 60);
      const shortestDuration = activity.availableModes?.length
        ? Math.min(...activity.availableModes.map((modeId) => aiConfig.researchModes[modeId].duration))
        : duration;
      const locationWindow = locationTaskAvailability(id, shortestDuration);
      const tooLate = !isBedtime && (!locationWindow.fits || state.minute + duration > END_MINUTE);
      const depleted = count >= 1;
      const detail = activity.hint.replace(/^\d+ min · /, "");
      const aiLabel = activity.aiPolicy === "optional" ? '<em class="ai-available">A.I.D.E. AVAILABLE</em>' : "";
      return `<button class="choice-button" data-activity="${activity.id}" type="button" ${tooLate || depleted ? "disabled" : ""}>${aiLabel}<span>${activity.label}</span><small>${depleted ? "Already done here today" : tooLate ? `${location.name} closes at ${formatTime(locationWindow.closeMinute)} · not enough time` : `${formatTime(state.minute)}–${formatTime(state.minute + duration)} · ${duration} min · ${detail}`}</small></button>`;
    }).join("");
    screen.innerHTML = `<section class="dialogue-panel has-scene-logo">${sceneLogo(id, location.name)}<div class="dialogue-copy"><span class="location-label">${location.name.toUpperCase()} · ${formatTime(state.minute)}</span><span class="speaker">${isBedtime ? "CHOOSE ONE FINAL HOME ACTIVITY" : "CHOOSE AN ACTIVITY"}</span><h2>${isBedtime ? "One last thing before sleep" : location.subtitle}</h2><p>${isBedtime ? "Choose one remaining HDB activity. When it finishes, the clock moves to 9:40 PM and sleep begins automatically." : "The clock advances by the minutes shown on your choice. Activities here can be completed once per day."}</p><div class="choices">${cards}</div>${isBedtime ? "" : '<button class="secondary-button" id="backMap" type="button">BACK TO MAP</button>'}</div></section>`;
    document.querySelectorAll("[data-activity]").forEach(button => button.onclick = () => {
      const activity = activities.find(item => item.id === button.dataset.activity);
      if (activity.id === "bedtime") return doActivity(id, activity, { id: "manual", label: "Prepare for bed", saved: 0, aiType: "NONE", note: activity.note });
      if ((activity.aiPolicy || "hidden") === "hidden") {
        doActivity(id, activity, { id: "manual", label: "Direct activity", saved: 0, aiType: "NONE", note: activity.note });
        return;
      }
      if (activity.aiTaskId === "research_sources") {
        renderResearchModeSelect(id, activity);
        return;
      }
      renderActivityDecision(id, activity);
    });
    const backMap = document.getElementById("backMap");
    if (backMap) backMap.onclick = renderMap;
    save();
  }

  function researchPreview(activity, modeId) {
    return systems.calculateActivityPreview(activity, modeId, {
      currentTime: state.minute,
      dayEndTime: LOCATION_CLOSE_MINUTES.library,
      energy: state.v2.energy
    }, aiConfig.researchModes);
  }

  function renderResearchModeSelect(id, activity) {
    state.screen = "researchMode";
    state.aiSystem.aiSession = { taskId: activity.aiTaskId, mode: null, role: null, status: "idle", progress: 0, stepIndex: 0 };
    setScene("library");
    setChrome(true);
    const cards = activity.availableModes.map((modeId) => {
      const mode = aiConfig.researchModes[modeId];
      const preview = researchPreview(activity, modeId);
      const unavailable = preview.endTime > LOCATION_CLOSE_MINUTES.library;
      const saving = preview.timeSaved ? `<span class="saving">SAVE ${preview.timeSaved} MIN</span>` : "";
      const energySaving = modeId === "independent" ? "" : `<span class="energy-saving">USE ${aiConfig.researchModes.independent.energyCost - mode.energyCost} LESS ENERGY</span>`;
      const penalty = preview.fatiguePenalty ? `<small class="fatigue-note">Includes +${preview.fatiguePenalty} min because you are ${systems.getEnergyState(state.v2.energy)}.</small>` : "";
      return `<button class="mode-card ${modeId}" type="button" data-research-mode="${modeId}" ${unavailable ? "disabled" : ""}>
        <span class="mode-name">${mode.label}</span>
        <strong>${preview.duration} MIN</strong>
        <span>Finish at ${formatTime(preview.endTime)}</span>
        <span>ENERGY −${mode.energyCost}</span>
        ${saving}${energySaving}${penalty}
        <small>${unavailable ? `Library closes at ${formatTime(LOCATION_CLOSE_MINUTES.library)}` : mode.description}</small>
      </button>`;
    }).join("");
    screen.innerHTML = `<section class="research-panel">
      <header><span class="location-label">SCHOOL LIBRARY · ${formatTime(state.minute)}</span><span class="speaker">WEDNESDAY RESEARCH</span><h2>How will you finish Maya's research?</h2><p>Choose the kind of help you want. Faster output can create more time, but you still own what reaches the group.</p></header>
      <div class="mode-grid">${cards}</div>
      <button class="secondary-button" id="backLocation" type="button">BACK TO ACTIVITIES</button>
    </section>`;
    document.querySelectorAll("[data-research-mode]").forEach((button) => {
      button.onclick = () => startResearchMode(id, activity, button.dataset.researchMode);
    });
    document.getElementById("backLocation").onclick = () => renderLocation(id);
    save();
  }

  function startResearchMode(id, activity, modeId) {
    state.aiSystem.aiSession.mode = modeId;
    if (modeId === "independent") return renderIndependentResearch(id, activity);
    if (modeId === "collaborate") return renderResearchRoleSelect(id, activity);
    renderDelegateResearch(id, activity);
  }

  function renderIndependentResearch(id, activity) {
    state.screen = "researchIndependent";
    state.aiSystem.aiSession.status = "independent mode";
    state.aiSystem.aiSession.progress = 70;
    state.aiSystem.aiSession.step = "Comparing sources and writing notes";
    setChrome(true);
    screen.innerHTML = `<section class="research-panel guided-flow">
      <span class="location-label">INDEPENDENT MODE</span><h2>You work through the evidence yourself.</h2>
      <p>It takes longer, but every search term, source check, and final decision is yours.</p>
      <ol class="task-steps"><li class="done">Read Maya's research question</li><li class="done">Compare possible sources</li><li class="active">Write a supported summary</li></ol>
      <button class="primary-button" id="finishIndependent" type="button">COMPLETE THE RESEARCH</button>
    </section>`;
    document.getElementById("finishIndependent").onclick = () => completeResearch(id, activity, "independent");
  }

  function renderResearchRoleSelect(id, activity) {
    state.screen = "researchRole";
    state.aiSystem.aiSession.status = "define the goal";
    state.aiSystem.aiSession.progress = 15;
    state.aiSystem.aiSession.step = "Waiting for you to choose a role";
    setChrome(true);
    screen.innerHTML = `<section class="research-panel guided-flow">
      <span class="location-label">A.I.D.E. CHAT · STEP 1 OF 3</span><h2>What would help you most right now?</h2>
      <p>A.I.D.E. will support one part of the task. You will still judge the evidence.</p>
      <div class="choices">
        <button class="choice-button" data-role="organise" type="button"><span>Find better search terms</span><small>ORGANISE · narrow the search</small></button>
        <button class="choice-button" data-role="review" type="button"><span>Review the evidence we have</span><small>REVIEW · look for gaps</small></button>
        <button class="choice-button" data-role="explain" type="button"><span>Explain what the sources mean</span><small>EXPLAIN · clarify difficult ideas</small></button>
      </div>
    </section>`;
    document.querySelectorAll("[data-role]").forEach((button) => button.onclick = () => renderResearchJudgement(id, activity, button.dataset.role));
  }

  function renderResearchJudgement(id, activity, role) {
    state.screen = "researchJudgement";
    state.aiSystem.aiSession.role = role;
    state.aiSystem.aiSession.status = "player judgement";
    state.aiSystem.aiSession.progress = 55;
    state.aiSystem.aiSession.step = "Comparing possible search phrases";
    setChrome(true);
    screen.innerHTML = `<section class="research-panel guided-flow">
      <span class="location-label">A.I.D.E. CHAT · STEP 2 OF 3</span><div class="chat-bubble aide"><b>A.I.D.E.</b><p>Which search phrase is most likely to lead to a reliable source?</p></div>
      <div class="choices">
        <button class="choice-button" data-judgement="weak" type="button"><span>plastic is bad</span><small>Broad and opinion-based</small></button>
        <button class="choice-button" data-judgement="strong" type="button"><span>Singapore school plastic waste statistics</span><small>Specific place, topic, and evidence type</small></button>
        <button class="choice-button" data-judgement="weak" type="button"><span>why everyone should ban bottles</span><small>Starts with a conclusion</small></button>
      </div>
    </section>`;
    document.querySelectorAll("[data-judgement]").forEach((button) => button.onclick = () => renderResearchReturnControl(id, activity, button.dataset.judgement));
  }

  function renderResearchReturnControl(id, activity, judgement) {
    state.screen = "researchReturn";
    state.aiSystem.aiSession.status = "reviewing sources";
    state.aiSystem.aiSession.progress = 85;
    state.aiSystem.aiSession.step = "Grouping evidence for your review";
    state.aiSystem.pendingJudgement = judgement;
    setChrome(true);
    const feedback = judgement === "strong"
      ? "That phrase is specific enough to find evidence you can trace."
      : "That phrase may return opinions before evidence. A more specific query would be easier to verify.";
    screen.innerHTML = `<section class="research-panel guided-flow">
      <span class="location-label">A.I.D.E. CHAT · STEP 3 OF 3</span><div class="chat-bubble aide"><b>A.I.D.E.</b><p>${feedback}</p><p>I grouped the evidence into three themes. You still need to check who published each source and decide what belongs in the presentation.</p></div>
      <button class="primary-button" id="useResearchHelp" type="button">REVIEW THE SOURCES</button>
    </section>`;
    document.getElementById("useResearchHelp").onclick = () => completeResearch(id, activity, "collaborate");
  }

  function renderDelegateResearch(id, activity) {
    state.screen = "researchDelegate";
    const steps = aiConfig.aiTasks.research_sources.progressSteps;
    state.aiSystem.aiSession.status = "researching sources";
    state.aiSystem.aiSession.progress = 0;
    state.aiSystem.aiSession.step = steps[0];
    setChrome(true);
    screen.innerHTML = `<section class="research-panel guided-flow">
      <span class="location-label">LET AI DO IT</span><h2>A.I.D.E. is creating a research draft.</h2>
      <p>Generation is visible, but the result is not treated as correct until someone checks it.</p>
      <div class="large-progress" role="progressbar" aria-label="Research draft progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><i id="largeProgressBar"></i></div>
      <ol class="task-steps" id="delegateSteps">${steps.map((step, index) => `<li class="${index === 0 ? "active" : ""}">${step}</li>`).join("")}</ol>
      <button class="secondary-button" id="skipAiProgress" type="button" disabled>SKIP</button>
    </section>`;
    const progressBar = document.getElementById("largeProgressBar");
    const progressTrack = progressBar.parentElement;
    const skip = document.getElementById("skipAiProgress");
    let value = 0;
    const finish = () => {
      clearInterval(timer);
      state.aiSystem.aiSession.progress = 100;
      state.aiSystem.aiSession.status = "ready";
      state.aiSystem.aiSession.step = "Draft complete · verification required";
      renderDelegateOutput(id, activity);
    };
    const timer = setInterval(() => {
      value = Math.min(100, value + 10);
      const stepIndex = Math.min(steps.length - 1, Math.floor(value / 26));
      state.aiSystem.aiSession.progress = value;
      state.aiSystem.aiSession.step = steps[stepIndex];
      progressBar.style.width = `${value}%`;
      progressTrack.setAttribute("aria-valuenow", value);
      document.querySelectorAll("#delegateSteps li").forEach((item, index) => item.className = index < stepIndex ? "done" : index === stepIndex ? "active" : "");
      setChrome(true);
      if (value >= 100) finish();
    }, 450);
    setTimeout(() => { if (document.body.contains(skip)) skip.disabled = false; }, 1000);
    skip.onclick = finish;
  }

  function renderDelegateOutput(id, activity) {
    state.screen = "researchUnchecked";
    setChrome(true);
    screen.innerHTML = `<section class="research-panel guided-flow output-ready">
      <span class="warning-label">OUTPUT READY · NOT VERIFIED</span><h2>The draft is finished. The responsibility is not.</h2>
      <p>A.I.D.E. produced a polished summary and three possible sources. None has been opened or checked against Maya's question.</p>
      <div class="button-row"><button class="primary-button" id="submitUnchecked" type="button">SUBMIT AS IS</button><button class="secondary-button" id="checkDelegate" type="button">CHECK THE OUTPUT</button></div>
    </section>`;
    document.getElementById("submitUnchecked").onclick = () => completeResearch(id, activity, "delegate", false);
    document.getElementById("checkDelegate").onclick = () => completeResearch(id, activity, "delegate", true);
  }

  function completeResearch(id, activity, modeId, checkedDelegate = false) {
    const eventId = `library_research_day_${state.dayIndex}`;
    if (stateTools.hasCompletedEvent(state.aiSystem, eventId)) return renderMap();
    const mode = aiConfig.researchModes[modeId];
    const preview = researchPreview(activity, modeId);
    const before = { time: state.minute, energy: state.v2.energy, literacy: state.aiSystem.aiLiteracy };
    let extraTime = checkedDelegate ? 20 : 0;
    let extraEnergy = checkedDelegate ? 5 : 0;
    const elapsed = preview.duration + extraTime;
    advanceClock(elapsed);
    progress().activities[activity.id] = (progress().activities[activity.id] || 0) + 1;
    state.v2.energy = systems.applyEnergyChange(state.v2.energy, -(mode.energyCost + extraEnergy));
    if (modeId === "collaborate") {
      addFlag("verifiedSources");
      addFlag("understandsOpening");
      state.aiSystem.aiLiteracy = systems.clamp(state.aiSystem.aiLiteracy + mode.aiLiteracy);
      state.aiSystem.skillEvidence.verify += 1;
      if (!state.aiSystem.tipsDiscovered.includes("research_original_sources")) state.aiSystem.tipsDiscovered.push("research_original_sources");
      progress().aiUsed = true;
      progress().aiTypes.push("ASSIST");
    } else if (modeId === "delegate") {
      progress().aiUsed = true;
      progress().aiTypes.push("REPLACE");
      if (checkedDelegate) {
        addFlag("verifiedSources");
        state.aiSystem.aiLiteracy = systems.clamp(state.aiSystem.aiLiteracy + 2);
        state.aiSystem.skillEvidence.verify += 1;
      } else {
        state.aiSystem.aiLiteracy = systems.clamp(state.aiSystem.aiLiteracy - 4);
        addFlag("uncheckedResearchOutput");
      }
    } else {
      addFlag("verifiedSources");
      addFlag("understandsOpening");
    }
    state.v2.academic.aiLiteracy = state.aiSystem.aiLiteracy;
    const actualSaved = Math.max(0, aiConfig.researchModes.independent.duration - preview.duration - extraTime);
    progress().timeReclaimed += actualSaved;
    state.v2.timeReclaimed += actualSaved;
    state.aiSystem.outputStatus = checkedDelegate ? "REVIEWED" : mode.outputStatus;
    updateConflict();
    state.aiSystem.energyLog.push({ eventId, reason: modeId, before: before.energy, change: -(mode.energyCost + extraEnergy), after: state.v2.energy, day: "wednesday" });
    state.aiSystem.timeSavingsLog.push({ sourceEventId: eventId, minutesSaved: actualSaved, createdAt: state.minute, nextActivityId: null, useCategory: "unused" });
    stateTools.markEventCompleted(state.aiSystem, eventId);
    state.aiSystem.aiSession = { taskId: activity.aiTaskId, mode: modeId, role: state.aiSystem.aiSession.role, status: "idle", progress: 100, stepIndex: 3 };
    state.notes.push({ time: `${dayLabel()} · ${formatTime(state.minute)}`, text: `${mode.label}: Maya's research was completed.`, location: content.locations[id].name });
    state.choices.push({ event: `activity:${activity.id}`, label: `${activity.label} — ${mode.label}`, aiType: modeId === "collaborate" ? "ASSIST" : modeId === "delegate" ? "REPLACE" : "NONE", timeSaved: actualSaved });
    const result = { id, activity, modeId, mode, preview: { ...preview, duration: elapsed, endTime: state.minute, timeSaved: actualSaved }, before, checkedDelegate };
    save();
    renderResearchResult(result);
  }

  function renderResearchResult(result) {
    state.screen = "researchResult";
    setChrome(true);
    const literacyChange = state.aiSystem.aiLiteracy - result.before.literacy;
    const status = result.checkedDelegate ? "REVIEWED" : result.mode.outputStatus;
    screen.innerHTML = `<section class="research-panel result-panel">
      <span class="location-label">TASK RESULT</span><span class="speaker">${result.mode.label.toUpperCase()}</span><h2>Research completed</h2>
      <div class="result-grid">
        <span>CLOCK</span><strong>${formatTime(result.before.time)} → ${formatTime(result.preview.endTime)}</strong>
        <span>TIME USED</span><strong>${result.preview.duration} MIN</strong>
        ${result.preview.timeSaved ? `<span>TIME SAVED</span><strong class="mint">+${result.preview.timeSaved} MIN</strong>` : ""}
        <span>ENERGY</span><strong>${Math.round(result.before.energy)} → ${Math.round(state.v2.energy)}</strong>
        <span>AI LITERACY</span><strong>${literacyChange ? `${result.before.literacy} → ${state.aiSystem.aiLiteracy}` : "NO CHANGE"}</strong>
        <span>OUTPUT STATUS</span><strong class="${status === "NOT VERIFIED" ? "warning" : "mint"}">${status}</strong>
      </div>
      <p>You still have ${Math.max(0, END_MINUTE - state.minute)} minutes today.</p>
      <button class="primary-button" id="afterResearchResult" type="button">${result.modeId === "collaborate" ? "SEE AI LITERACY TIP" : "SEE WHAT YOU CAN DO"}</button>
    </section>`;
    document.getElementById("afterResearchResult").onclick = () => result.modeId === "collaborate" ? renderResearchTip(result) : renderNewTimeWindow(result);
  }

  function renderResearchTip(result) {
    const tip = aiConfig.tips.research_original_sources;
    state.screen = "researchTip";
    setChrome(true);
    screen.innerHTML = `<section class="research-panel tip-card">
      <span class="location-label">AI LITERACY TIP · ${tip.category}</span><h2>Keep the source in view.</h2>
      <p><b>AI helped:</b> ${tip.aiHelped}</p><p><b>You still did:</b> ${tip.playerDid}</p><p><b>Try next time:</b> ${tip.nextTime}</p>
      <button class="primary-button" id="saveResearchTip" type="button">SAVE TIP + CONTINUE</button>
    </section>`;
    document.getElementById("saveResearchTip").onclick = () => renderNewTimeWindow(result);
  }

  function renderNewTimeWindow(result) {
    state.screen = "newTimeWindow";
    setChrome(true);
    const canMeetJay = state.minute <= aiConfig.jayLatestStart;
    const options = [
      { label: "Check the AI sources", duration: 20, available: END_MINUTE - state.minute >= 20 },
      { label: "Reply to Maya and help her", duration: 20, available: END_MINUTE - state.minute >= 20 },
      { label: "Meet Jay at the court", duration: 45, available: canMeetJay },
      { label: "Rest before dinner", duration: 30, available: END_MINUTE - state.minute >= 30 }
    ];
    screen.innerHTML = `<section class="research-panel time-window">
      <span class="location-label">NEW TIME WINDOW</span><h2>${result.preview.timeSaved ? `You finished ${result.preview.timeSaved} minutes earlier.` : "The research used the full hour."}</h2>
      <p>${canMeetJay ? "You can still make Jay's 5:00 PM deadline." : "Jay's 5:00 PM meeting window has closed, but you can still communicate honestly."}</p>
      <div class="window-list">${options.map((option) => `<div class="${option.available ? "available" : "unavailable"}"><b>${option.available ? "✓" : "×"}</b><span>${option.label}</span><strong>${option.duration} MIN</strong>${option.label.includes("Jay") && option.available && result.preview.timeSaved ? "<em>NOW FITS YOUR SCHEDULE</em>" : ""}</div>`).join("")}</div>
      <button class="primary-button" id="returnAfterResearch" type="button">RETURN TO LOCATIONS</button>
    </section>`;
    document.getElementById("returnAfterResearch").onclick = renderMap;
  }

  function activityApproaches(id, activity) {
    const manual = { id: "manual", label: "Do it without AI", hint: "Keep the full process in your hands", saved: 0, aiType: "NONE", note: activity.note };
    if (id === "library") return [
      manual,
      { id: "outline", label: "Ask AI for a plan or outline", hint: "AI structures the task; you make the decisions · saves about 20 min", saved: 20, aiType: "ASSIST", academic: { aiLiteracy: 4, criticalThinking: 2 }, note: `AI helped you structure “${activity.label.toLowerCase()},” but you chose what to keep.` },
      { id: "tutor", label: "Use AI as a tutor", hint: "Ask questions and request explanations · saves about 25 min", saved: 25, aiType: "LEARN", academic: { aiLiteracy: 5, knowledgeMastery: 5 }, note: `You asked AI to explain difficult parts of “${activity.label.toLowerCase()}” and checked your understanding.` },
      { id: "feedback", label: "Create first, then ask AI for feedback", hint: "Preserves your starting point · saves about 30 min", saved: 30, aiType: "ASSIST", academic: { aiLiteracy: 5, criticalThinking: 4 }, note: `You did the first pass yourself, then judged which AI feedback improved “${activity.label.toLowerCase()}.”` },
      { id: "delegate", label: "Ask AI to complete most of it", hint: "Fastest · little practice or ownership · saves about 45 min", saved: 45, aiType: "REPLACE", academic: { knowledgeMastery: -5, criticalThinking: -5, academicIntegrity: -4 }, effects: { project: 2 }, note: `AI completed most of “${activity.label.toLowerCase()}.” The result was quick, but you practised very little.` }
    ];
    if (id === "court") return [
      manual,
      { id: "video", label: "Ask AI to analyse a short practice video", hint: "Use the feedback as one observation · saves about 15 min", saved: 15, aiType: "ASSIST", academic: { aiLiteracy: 4 }, effects: { personal: 3 }, note: `AI noticed a movement pattern during “${activity.label.toLowerCase()}.” You compared it with how your body actually felt.` },
      { id: "adaptive", label: "Ask AI for an adaptive training plan", hint: "Provide goals and limits, then edit the plan · saves about 25 min", saved: 25, aiType: "ASSIST", academic: { aiLiteracy: 5, criticalThinking: 3 }, effects: { personal: 4 }, note: `You revised an AI training plan around your energy, experience, and coach's advice.` },
      { id: "copy", label: "Follow the first AI routine exactly", hint: "Fast setup · ignores context · saves about 35 min", saved: 35, aiType: "REPLACE", academic: { criticalThinking: -4 }, effects: { personal: -3 }, note: `You followed a generic AI routine without checking whether it fit today's conditions.` }
    ];
    const labels = {
      meal: ["Ask AI to compare balanced meal options", "Follow an AI meal choice without checking your needs"],
      friends: ["Ask AI for conversation starters, then speak naturally", "Let AI script your side of the conversation"],
      maya_checkin: ["Ask AI to organise a short check-in agenda", "Let AI write the entire project conversation"],
      mall: ["Ask AI to compare routes, budgets, and food options", "Let AI order online and send scripted replies instead of meeting up"],
      movie: ["Ask AI for spoiler-free recommendations based on the group", "Ask AI to summarise the entire film instead of watching it"],
      tuition: ["Use AI to identify weak areas and prepare questions", "Ask AI to complete the tuition worksheet for you"],
      rest: ["Ask AI for a simple wind-down routine", "Let AI schedule and judge every part of your rest"],
      family: ["Ask AI for thoughtful conversation prompts", "Use AI-generated replies instead of responding yourself"],
      study: ["Use AI as a tutor and quiz yourself", "Ask AI for answers without practising the material"]
    }[activity.id];
    const replaceOffsets = {
      mall: { connection: -10, personal: -5 },
      movie: { connection: -4, personal: -12 },
      tuition: { project: -7 }
    }[activity.id] || { connection: id === "canteen" ? -2 : 0 };
    return [
      manual,
      { id: "assist", label: labels[0], hint: "You review and adapt the suggestion · saves about 20 min", saved: 20, aiType: "ASSIST", academic: { aiLiteracy: 4, criticalThinking: 2 }, note: `AI supported “${activity.label.toLowerCase()},” and you adapted its suggestion to the real situation.` },
      { id: "replace", label: labels[1], hint: "Fast, but less personal and less practice · saves about 40 min", saved: 40, aiType: "REPLACE", academic: { criticalThinking: -4, knowledgeMastery: activity.id === "tuition" ? -7 : 0 }, effects: replaceOffsets, note: `AI handled most of “${activity.label.toLowerCase()}.” It saved time, but some of the experience and your own judgment disappeared.` }
    ];
  }

  function renderActivityDecision(id, activity) {
    const location = content.locations[id];
    const approaches = activityApproaches(id, activity);
    state.screen = "activityDecision";
    setScene(id === "transit" ? "transit" : id === "canteen" ? "canteen" : location.scene);
    setChrome(true);
    const friendImpact = activity.relationship ? `${activity.relationship[0].toUpperCase()} +${activity.relationship[1]}` : (activity.effects?.connection || 0) > 0 ? `FRIENDS +${activity.effects.connection}` : "FRIENDS —";
    const projectImpact = (activity.effects?.project || 0) !== 0 ? `ASSIGNMENT ${activity.effects.project > 0 ? "+" : ""}${activity.effects.project}` : "ASSIGNMENT —";
    const energyImpact = `ENERGY ${activity.energy >= 0 ? "+" : ""}${activity.energy}`;
    screen.innerHTML = `<section class="dialogue-panel has-scene-logo">${sceneLogo(id, location.name)}<div class="dialogue-copy"><span class="location-label">${location.name.toUpperCase()} · START ${formatTime(state.minute)}</span><span class="speaker">${state.minute >= HOME_ONLY_MINUTE ? "FINAL ACTIVITY BEFORE SLEEP" : "HOW WILL YOU DO IT?"}</span><h2>${activity.label}</h2><p>${state.minute >= HOME_ONLY_MINUTE ? "This is the final activity tonight. At 9:40 PM, the day ends and you go to sleep." : "Choose how much of the process to keep. More AI assistance reduces the actual duration, while checking and ownership still affect the outcome."}</p><div class="tradeoff-strip" aria-label="Likely trade-offs"><span>BASE TIME ${activity.time || 60} MIN</span><span>${energyImpact}</span><span>${projectImpact}</span><span>${friendImpact}</span></div><p class="decision-guide">Choose based on what you want to protect: speed, understanding, energy, or trust. Faster is not automatically better.</p><div class="choices">${approaches.map((approach, index) => {
      const blocked = state.minute >= HOME_ONLY_MINUTE && approach.aiType === "REPLACE";
      const blockedHint = "Too late to delegate—stay involved in the final home activity";
      const duration = Math.max(5, (activity.time || 60) - (approach.saved || 0));
      return `<button class="choice-button" type="button" data-approach="${index}" ${blocked ? "disabled" : ""}><span>${approach.label}</span><small>${blocked ? blockedHint : `${duration} min · finish ${formatTime(state.minute + duration)} · ${approach.hint}`}</small></button>`;
    }).join("")}</div><button class="secondary-button" id="backLocation" type="button">BACK TO ACTIVITIES</button></div></section>`;
    document.querySelectorAll("[data-approach]").forEach(button => button.onclick = () => doActivity(id, activity, approaches[Number(button.dataset.approach)]));
    document.getElementById("backLocation").onclick = () => renderLocation(id);
  }

  function doActivity(id, activity, approach) {
    const finalHomeActivity = id === "home" && state.minute >= HOME_ONLY_MINUTE;
    let elapsed = 0;
    progress().activities[activity.id] = (progress().activities[activity.id] || 0) + 1;
    if (finalHomeActivity) {
      elapsed = Math.max(0, END_MINUTE - state.minute);
      progress().minutes += elapsed;
      state.minute = END_MINUTE;
    } else {
      elapsed = Math.max(5, (activity.time || 60) - (approach.saved || 0));
      advanceClock(elapsed);
    }
    state.v2.energy = clamp(state.v2.energy + activity.energy);
    Object.entries(activity.effects || {}).forEach(([key, value]) => state.stats[key] = clamp(state.stats[key] + value));
    Object.entries(activity.academic || {}).forEach(([key, value]) => bump(state.v2.academic, key, value));
    Object.entries(approach.academic || {}).forEach(([key, value]) => bump(state.v2.academic, key, value));
    Object.entries(approach.effects || {}).forEach(([key, value]) => state.stats[key] = clamp(state.stats[key] + value));
    (activity.flags || []).forEach(addFlag);
    if (activity.activity) state.v2.activities[activity.activity] += activity.time;
    if (activity.relationship) bump(state.v2.relationships[activity.relationship[0]], "trust", activity.relationship[1]);
    if (activity.relationship) {
      const npcId = activity.relationship[0];
      recordNpcMemory(npcId, `activity:${activity.id}:${state.dayIndex}`, approach.note, { moodDelta: Math.sign(activity.relationship[1]) * 5, relationshipDelta: activity.relationship[1] });
    }
    if (approach.aiType !== "NONE") state.v2.aiUsageHistory.push({ type: approach.aiType, event: activity.id, verified: approach.aiType !== "REPLACE" });
    if (approach.aiType !== "NONE") {
      progress().aiUsed = true;
      progress().aiTypes.push(approach.aiType);
      progress().timeReclaimed += approach.saved;
      state.v2.timeReclaimed += approach.saved;
    }
    state.notes.push({ time: `${dayLabel()} · ${formatTime(state.minute)}`, text: approach.note, location: content.locations[id].name });
    state.choices.push({ event: `activity:${activity.id}`, label: `${activity.label} — ${approach.label}`, aiType: approach.aiType, timeSaved: approach.saved, modelBefore: clone(state.v2) });
    save();
    showToast(`${elapsed} min passed${approach.saved ? ` · ${approach.saved} min saved` : ""} · Energy ${activity.energy >= 0 ? "+" : ""}${activity.energy}`);
    renderActivityResult(id, activity, { ...approach, elapsed });
  }

  function activitySceneClass(id, activity) {
    const scenes = {
      meal: "scene-hawker", friends: "scene-hawker", maya_checkin: "scene-maya-discuss",
      mall: "scene-mall", movie: "scene-cinema", tuition: "scene-tuition",
      family: "scene-family", rest: "scene-sleep", bedtime: "scene-sleep", study: "scene-library",
      homework: "scene-library", ai_plan: "scene-library", research: "scene-library",
      drills: "scene-court-action", jay_chat: "scene-court-action", ai_training: "scene-court-action",
      maya_mon: "scene-maya-discuss", maya_tue: "scene-maya-slides", maya_wed: "scene-maya-discuss", maya_thu: "scene-maya-slides", maya_fri: "scene-maya-slides",
      jay_mon: "scene-court-action", jay_tue: "scene-court-action", jay_wed: "scene-court-action", jay_thu: "scene-court-action", jay_fri: "scene-court-action"
    };
    return scenes[activity.id] || (id === "court" ? "scene-court-action" : id === "library" ? "scene-library" : "scene-mrt");
  }

  function activityArtClass(id, activity) {
    if (id === "library") return "scene-concepts scene-concept-library";
    if (id === "court") return "scene-concepts scene-concept-court";
    if (id === "canteen") return "scene-concepts scene-concept-hawker";
    if (activity.id === "movie") return "scene-concepts scene-concept-cinema";
    return `atlas ${activitySceneClass(id, activity)}`;
  }

  function renderActivityResult(id, activity, approach) {
    const location = content.locations[id];
    state.screen = "activityResult";
    setScene(id === "transit" ? "transit" : id === "canteen" ? "canteen" : location.scene);
    setChrome(true);
    screen.innerHTML = `<section class="activity-result"><div class="activity-illustration ${activityArtClass(id, activity)}" role="img" aria-label="${activity.label}"></div><div class="activity-caption"><span class="location-label">${location.name.toUpperCase()} · ${formatTime(state.minute)}</span><h2>${activity.label}</h2><p>${approach.note}</p><div class="effect-line"><span>${approach.elapsed || activity.time || 60} min passed</span><span>${approach.aiType === "NONE" ? "NO AI" : `AI · ${approach.aiType}`}</span>${approach.saved ? `<span>${approach.saved} min reclaimed</span>` : ""}</div><button class="primary-button" id="continueActivity" type="button">CONTINUE</button></div></section>`;
    document.getElementById("continueActivity").onclick = () => returnAfterAction(approach.note, `${activity.label} — ${approach.label}`, { type: approach.aiType, timeSaved: approach.saved });
  }

  function endCurrentDay(reason) {
    if (state.dayIndex === 4 && !completed("library") && !storyDone("friday_deadline")) {
      addFlag("fridayDeadline");
      return openEvent("friday_deadline");
    }
    state.daysCompleted = Math.max(state.daysCompleted, state.dayIndex + 1);
    const activeMinutes = Math.round(progress().minutes);
    const activityCount = Object.values(progress().activities).reduce((sum, count) => sum + count, 0);
    const places = progress().locations.length;
    state.pendingReflection = { day: dayLabel(), note: reason, response: `${activityCount} activit${activityCount === 1 ? "y" : "ies"}, ${activeMinutes} active minutes, across ${places} location${places === 1 ? "" : "s"}.`, timeSaved: progress().timeReclaimed, aiType: dailyAiType() };
    renderDailyReflection();
  }

  function dailyAiType() {
    if (progress().aiTypes.includes("REPLACE")) return "REPLACE";
    if (progress().aiTypes.includes("LEARN")) return "LEARN";
    if (progress().aiTypes.includes("ASSIST")) return "ASSIST";
    return "NONE";
  }

  function npcReaction(kind) {
    const npc = narrative().npc[kind];
    const stage = narrativeTools.relationshipStage(npc.relationship);
    const last = npc.memory[0];
    if (stage === "ESTRANGED") return kind === "jay"
      ? "You keep disappearing when you say you'll be there. I'm done waiting, bro. Don't count me in anymore."
      : "We still have to finish the project, but from now on let's keep this strictly about the work.";
    if (stage === "ANGRY") return kind === "jay"
      ? "Yesterday was not funny. If you can't come, just say so. Don't leave me waiting again."
      : "I covered your part yesterday. I need an honest answer today, not another silent chat.";
    if (stage === "UPSET" || npc.needsRepair) return kind === "jay"
      ? "You went quiet yesterday. Are you actually showing up today, or should I stop planning around you?"
      : "You missed your part yesterday. Can you tell me what happened and what you will handle today?";
    if (last && last.day !== dayLabel()) return kind === "jay"
      ? "New day. If plans change, tell me early and we're good."
      : "Morning. Let's settle today's part before the deadline gets messy.";
    return "";
  }

  function openPhone(isDailyBrief = false) {
    document.querySelector(".phone-head span").textContent = isDailyBrief ? `TODAY'S TASKS · ${dayLabel()}` : "MESSAGES";
    phoneClock.textContent = formatTime(state.minute).replace(" PM", "").replace(" AM", "");
    const mayaTask = content.dailyTasks.maya[state.dayIndex];
    const jayTask = content.dailyTasks.jay[state.dayIndex];
    const mayaDone = Boolean(progress().activities[mayaTask.id]);
    const jayDone = Boolean(progress().activities[jayTask.id]);
    const mayaReaction = npcReaction("maya");
    const jayReaction = npcReaction("jay");
    const jayEstranged = narrative().npc.jay.estranged;
    const mayaWindow = locationTaskAvailability("library", mayaTask.time);
    const jayWindow = locationTaskAvailability("court", jayTask.time);
    const mayaUnavailable = !mayaDone && !mayaWindow.fits;
    const jayUnavailable = !jayDone && !jayEstranged && !jayWindow.fits;
    const mayaButtonCopy = mayaDone
      ? "COMPLETED TODAY"
      : mayaUnavailable
        ? `CLOSED · LIBRARY CLOSED AT ${formatTime(mayaWindow.closeMinute)}`
        : `OPEN · ${mayaTask.label}`;
    const jayButtonCopy = jayEstranged
      ? "FRIENDSHIP ENDED · REPAIR REQUIRED"
      : jayDone
        ? "COMPLETED TODAY"
        : jayUnavailable
          ? `CLOSED · COURT CLOSED AT ${formatTime(jayWindow.closeMinute)}`
          : `OPEN · ${jayTask.label}`;
    phoneContent.innerHTML = `
      <article class="phone-message has-avatar ${mayaReaction ? "reaction" : ""}"><div class="phone-avatar character-art portrait-maya" aria-hidden="true"></div><div><span>${mayaTask.sender} · ${mayaReaction ? narrativeTools.relationshipStage(narrative().npc.maya.relationship) : mayaDone ? "DONE" : mayaUnavailable ? "LIBRARY CLOSED" : "NEW TASK"}</span>${mayaReaction ? `<p class="reaction-copy">${mayaReaction}</p>` : ""}<p>${mayaTask.message}</p><button class="phone-task" id="mayaDailyTask" type="button" ${mayaDone || mayaUnavailable ? "disabled" : ""}>${mayaButtonCopy}</button></div></article>
      <article class="phone-message has-avatar ${jayReaction ? "reaction" : ""}"><div class="phone-avatar character-art portrait-jay" aria-hidden="true"></div><div><span>${jayTask.sender} · ${jayReaction ? narrativeTools.relationshipStage(narrative().npc.jay.relationship) : jayDone ? "DONE" : jayUnavailable ? "COURT CLOSED" : "NEW TASK"}</span>${jayReaction ? `<p class="reaction-copy">${jayReaction}</p>` : ""}<p>${jayEstranged ? "No new court plan was shared with you today." : jayTask.message}</p><button class="phone-task" id="jayDailyTask" type="button" ${jayDone || jayEstranged || jayUnavailable ? "disabled" : ""}>${jayButtonCopy}</button></div></article>
      ${isDailyBrief ? '<p class="phone-brief">New day, new messages. Check both tasks before planning your route.</p>' : ''}
      <article class="phone-message feed"><span>SHORT VIDEOS · SG FEED</span><p>${hasFlag("scrolledOnce") ? "The feed remembers where you stopped. Still scrolling, ah?" : "12 new videos: rain memes, canteen rankings, and one extremely dramatic MRT delay edit."}</p></article>
      <button class="phone-action" id="phoneAction" type="button">${phoneEventId() === "maya_comment" ? "OPEN MAYA’S COMMENT" : phoneEventId() ? "OPEN THE FEED" : "NOTHING NEW"}</button>`;
    document.getElementById("mayaDailyTask").onclick = () => { if (mayaWindow.fits) openDailyPhoneTask("maya", mayaTask); };
    document.getElementById("jayDailyTask").onclick = () => { if (!jayEstranged && jayWindow.fits) openDailyPhoneTask("jay", jayTask); };
    document.getElementById("phoneAction").disabled = !phoneEventId();
    document.getElementById("phoneAction").onclick = () => {
      phoneDialog.close();
      const id = phoneEventId();
      if (id === "maya_comment") addFlag("handledMayaComment");
      if (id) openEvent(id);
    };
    phoneDialog.showModal();
    beep(700, 0.04);
  }

  function openDailyPhoneTask(kind, task) {
    const locationId = kind === "maya" ? "library" : "court";
    const availability = locationTaskAvailability(locationId, task.time);
    if (!availability.fits) {
      showToast(`${content.locations[locationId].name} is closed · task unavailable tonight`);
      return;
    }
    phoneDialog.close();
    if (!progress().locations.includes(locationId)) progress().locations.push(locationId);
    if (!state.visitedLocations.includes(locationId)) state.visitedLocations.push(locationId);
    doActivity(locationId, task, { id: "manual", label: "Handle it yourself", saved: 0, aiType: "NONE", note: task.note });
  }

  function openJournal() {
    const route = state.notes.length
      ? state.notes.map(note => `<article class="journal-note"><span>${note.time} · ${note.location}</span><p>${note.text}</p></article>`).join("")
      : '<p class="empty">Your route will appear here as you make choices.</p>';
    journalContent.innerHTML = `
      <section class="journal-stats">
        <div><span>PROJECT</span><strong>${state.stats.project}</strong></div>
        <div><span>CONNECTION</span><strong>${state.stats.connection}</strong></div>
        <div><span>PERSONAL</span><strong>${state.stats.personal}</strong></div>
      </section>
      <h3>Your route</h3>${route}`;
    journalDialog.showModal();
  }

  function chooseEnding() {
    const s = state.stats;
    if (hasFlag("lostTrackOfTime") && s.project < 40 && s.personal < 30) return "scroll";
    if (s.project >= 55 && hasFlag("understandsOpening")) return "reliable";
    if (s.project >= 45 && hasFlag("usedAiDraft") && !hasFlag("understandsOpening")) return "polished";
    if (s.connection >= 70 && hasFlag("playedFullGame")) return "social";
    if (s.personal >= 40 && s.project >= 30) return "creator";
    return "compromise";
  }

  function finishDay() {
    if (!narrative().qna.complete) return renderFridayPresentation();
    state.screen = "ending";
    save();
    renderEnding();
  }

  function renderFridayPresentation() {
    state.screen = "fridayPresentation";
    setScene("classroom");
    setChrome(true);
    const conflict = updateConflict();
    taskLine.textContent = "FRIDAY PRESENTATION · Your past choices shape the questions.";
    screen.innerHTML = `<section class="dialogue-panel"><div class="portrait character-art portrait-teacher" aria-hidden="true"></div><div class="dialogue-copy"><span class="location-label">FRIDAY · PRESENTATION DAY</span><span class="speaker">MS TAN</span><h2>The slides end. The questions begin.</h2><p>Your group reaches the final slide. The room is quiet for half a second before Ms Tan looks down at her notes.</p><div class="message-stack"><article><span>PROJECT READINESS</span><p>${state.stats.project} / 100</p></article><article><span>OPEN RISK</span><p>${conflict.severity.toUpperCase()} · ${conflict.sourceRisk ? "Sources still need explanation." : "Source trail available."}</p></article></div><p>Friday's answers can clarify, acknowledge uncertainty, cite checked evidence, or make a valid handoff. They cannot create research that was never done.</p><button class="primary-button" id="beginQna" type="button">BEGIN Q&amp;A</button></div></section>`;
    document.getElementById("beginQna").onclick = startFridayQna;
    save();
  }

  function startFridayQna() {
    const story = narrative();
    const questions = narrativeTools.buildQna(state.flags, story);
    story.qna.questionIds = questions.map((question) => question.id);
    story.qna.answerEvidence = questions.flatMap((question) => question.evidence);
    story.qna.answers = [];
    story.qna.score = 0;
    story.qna.remedyUsed = false;
    story.qna.complete = false;
    story.qna.runtimeQuestions = questions;
    renderQnaQuestion(0);
  }

  function renderQnaQuestion(index) {
    const story = narrative();
    const question = story.qna.runtimeQuestions[index];
    if (!question) return completeFridayQna();
    const copy = storyConfig.qnaQuestions[question.id];
    state.screen = "fridayQna";
    setScene("classroom");
    setChrome(true);
    taskLine.textContent = `FRIDAY Q&A · Question ${index + 1} of ${story.qna.runtimeQuestions.length}`;
    screen.innerHTML = `<section class="qna-panel"><header><span class="location-label">${copy.category} · ${index + 1}/${story.qna.runtimeQuestions.length}</span><h2>${copy.prompt}</h2>${question.evidence.length ? `<p class="evidence-tag">AVAILABLE EVIDENCE · ${question.evidence.join(" · ").replaceAll("_", " ")}</p>` : '<p class="warning-label">NO VERIFIED EVIDENCE RECORDED</p>'}</header><div class="qna-options">${question.options.map((option, optionIndex) => `<button class="choice-button" type="button" data-qna-option="${optionIndex}" ${option.remedy && story.qna.remedyUsed ? "disabled" : ""}><span>${option.label}</span><small>${option.remedy ? "LIMITED ON-STAGE REMEDY" : "Answer from your recorded process"}</small></button>`).join("")}</div><div id="qnaFeedback"></div></section>`;
    document.querySelectorAll("[data-qna-option]").forEach((button) => button.onclick = () => answerQna(index, question.options[Number(button.dataset.qnaOption)]));
  }

  function answerQna(index, option) {
    document.querySelectorAll("[data-qna-option]").forEach((button) => button.disabled = true);
    const story = narrative();
    if (option.remedy) story.qna.remedyUsed = true;
    story.qna.score += option.score;
    story.qna.answers.push({ questionId: story.qna.questionIds[index], optionId: option.id, score: option.score, remedy: Boolean(option.remedy) });
    if (option.score >= 2) {
      const skill = story.qna.questionIds[index] === "sources" ? "verify" : story.qna.questionIds[index] === "process" ? "judge" : "own";
      state.aiSystem.skillEvidence[skill] += 1;
    }
    const feedback = document.getElementById("qnaFeedback");
    feedback.innerHTML = `<article class="qna-feedback ${option.score >= 2 ? "strong" : "weak"}"><span>${option.score >= 2 ? "ANSWER HOLDS" : "ANSWER UNDER PRESSURE"}</span><p>${option.feedback}</p><button class="primary-button" id="nextQna" type="button">${index + 1 >= story.qna.runtimeQuestions.length ? "SEE THE RESULT" : "NEXT QUESTION"}</button></article>`;
    document.getElementById("nextQna").onclick = () => renderQnaQuestion(index + 1);
    save();
  }

  function completeFridayQna() {
    const story = narrative();
    story.qna.complete = true;
    delete story.qna.runtimeQuestions;
    const qnaPercent = Math.round(story.qna.score / 9 * 100);
    const score = narrativeTools.calculateEndingScore({
      project: state.stats.project,
      aiLiteracy: state.aiSystem.aiLiteracy,
      qnaPercent,
      mayaRelationship: story.npc.maya.relationship,
      jayRelationship: story.npc.jay.relationship,
      conflictSeverity: updateConflict().severity
    });
    const grade = narrativeTools.gradeFromScore(score, storyConfig.gradeThresholds);
    const gradeToEnding = { A: "reliable", B: "compromise", C: "social", D: "creator", E: "polished", F: "scroll" };
    story.ending.grade = grade;
    story.ending.score = score;
    story.ending.behaviorReview = buildBehaviorReview();
    story.ending.mayaEpilogue = buildNpcEpilogue("maya");
    story.ending.jayEpilogue = buildNpcEpilogue("jay");
    state.ending = gradeToEnding[grade];
    state.screen = "ending";
    save();
    renderEnding();
  }

  function buildBehaviorReview() {
    const review = [];
    if (hasFlag("verifiedSources") || hasFlag("checkedClaim")) review.push("You traced at least one important claim back to evidence before Friday.");
    else review.push("The presentation reached Friday without a complete source check.");
    if (state.aiSystem.tipsDiscovered.length) review.push(`You discovered ${state.aiSystem.tipsDiscovered.length} AI literacy tip and practised verification.`);
    if (hasFlag("uncheckedResearchOutput") || hasFlag("uncheckedClaim")) review.push("An unchecked AI-assisted claim increased the pressure during Q&A.");
    if (narrative().repair.completed.length) review.push(`You completed ${narrative().repair.completed.length} concrete Thursday repair action${narrative().repair.completed.length === 1 ? "" : "s"}.`);
    if (narrative().npc.maya.needsRepair || narrative().npc.jay.needsRepair) review.push("At least one important relationship still needs a real follow-up.");
    if (hasFlag("keptBasketballPromise")) review.push("You kept your basketball commitment while managing the project.");
    return review.slice(0, 5);
  }

  function buildNpcEpilogue(npcId) {
    const npc = narrative().npc[npcId];
    if (npc.needsRepair) return `${npc.name} is willing to talk, but the important memory has not disappeared. A specific repair still matters.`;
    if (npc.relationship >= 72) return `${npc.name} stays after the presentation. The week was not perfect, but your follow-through made the partnership feel real.`;
    if (npc.relationship >= 55) return `${npc.name} sends a short message after school. Things feel steady, with room to become stronger next week.`;
    return `${npc.name} keeps the conversation brief. The relationship is not over, but next week will need more than a quick apology.`;
  }

  function bar(label, value, className) {
    return `<div class="ending-bar"><span>${label}</span><div><i class="${className}" style="width:${value}%"></i></div><b>${value}</b></div>`;
  }

  function average(values) { return values.reduce((sum, value) => sum + value, 0) / values.length; }
  function normaliseMinutes(value, target) { return value === 0 ? 65 : clamp(Math.round(value / target * 100)); }
  function semesterScores(model = state.v2) {
    const a = model.academic;
    const p = model.personal;
    const activities = model.activities;
    const relationshipTrust = average([model.relationships.maya.trust, model.relationships.jay.trust]);
    const assignmentCompletion = clamp(40 + state.completedLocations.length * 20);
    const projectQuality = clamp((a.taskPerformance + state.stats.project) / 2);
    const collaboration = clamp((state.stats.connection + p.empathy) / 2);
    const basketballPractice = normaliseMinutes(activities.basketballPracticeMinutes, 90);
    const independentStudy = normaliseMinutes(activities.independentStudyMinutes, 120);
    const restQuality = normaliseMinutes(activities.restMinutes, 90);
    const promisesKept = clamp(50 + (hasFlag("keptBasketballPromise") ? 25 : 0) - (hasFlag("missedBasketball") ? 20 : 0));
    return {
      homework: Math.round(.45 * assignmentCompletion + .35 * a.taskPerformance + .20 * a.academicIntegrity),
      independentExams: Math.round(.60 * a.knowledgeMastery + .25 * a.criticalThinking + .15 * independentStudy),
      groupProjects: Math.round(.40 * projectQuality + .30 * collaboration + .30 * p.responsibility),
      aiLiteracy: Math.round(a.aiLiteracy),
      criticalThinking: Math.round(a.criticalThinking),
      basketball: Math.round(.60 * basketballPractice + .25 * clamp(50 + (hasFlag("playedFullGame") ? 30 : hasFlag("playedShortGame") ? 15 : 0)) + .15 * 60),
      socialLife: Math.round(.40 * relationshipTrust + .30 * promisesKept + .30 * p.empathy),
      wellbeing: Math.round(.40 * restQuality + .30 * model.energy + .30 * p.selfManagement)
    };
  }

  function getGrade(score) {
    if (score >= 90) return "A";
    if (score >= 80) return "B";
    if (score >= 70) return "C";
    if (score >= 60) return "D";
    return "F";
  }

  function scoreCards(scores) {
    const labels = { homework: "Homework", independentExams: "Independent Exams", groupProjects: "Group Projects", aiLiteracy: "AI Literacy", criticalThinking: "Critical Thinking", basketball: "Basketball", socialLife: "Social Life", wellbeing: "Wellbeing" };
    return Object.entries(scores).map(([key, score]) => `<article class="journal-note"><span>${labels[key]}</span><p><strong>${getGrade(score)} · ${score}</strong></p></article>`).join("");
  }

  function renderReportCard() {
    const scores = semesterScores();
    setScene("ending");
    setChrome(false);
    taskLine.textContent = "A fictional 16-week projection based on this playthrough—not a real prediction.";
    screen.innerHTML = `<section class="dialogue-panel"><div class="portrait" aria-hidden="true">16W</div><div class="dialogue-copy"><span class="location-label">16 WEEKS LATER · SIMULATION</span><span class="speaker">SEMESTER REPORT</span><h2>Your projected pattern</h2><p>These deterministic scores apply the same rules to every route. They describe this playthrough, not your real ability.</p><div class="message-stack">${scoreCards(scores)}</div><p><strong>Time reclaimed:</strong> ${state.v2.timeReclaimed} minutes. <strong>AI uses recorded:</strong> ${state.v2.aiUsageHistory.length}.</p><div class="button-row"><button class="primary-button" id="whatIf" type="button">WHAT IF?</button><button class="secondary-button" id="backEnding" type="button">BACK TO ENDING</button></div></div></section>`;
    document.getElementById("whatIf").onclick = renderWhatIf;
    document.getElementById("backEnding").onclick = renderEnding;
  }

  function renderWhatIf() {
    const record = state.choices.at(-1);
    if (record && String(record.event).startsWith("activity:")) return renderReportCard();
    const event = record && content.events[record.event];
    if (!record || !event) return renderReportCard();
    const original = semesterScores();
    const alternatives = event.choices.filter(choice => choice.label !== record.label);
    screen.innerHTML = `<section class="dialogue-panel"><div class="portrait" aria-hidden="true">?</div><div class="dialogue-copy"><span class="location-label">WHAT IF? · SAME SCORING RULES</span><span class="speaker">ORIGINAL CHOICE</span><h2>${record.label}</h2><p>Select another option from the most recent event to compare its projected effect.</p><div class="choices">${alternatives.map((choice, index) => `<button class="choice-button" type="button" data-alt="${index}"><span>${choice.label}</span><small>${choice.hint || "Alternative route"}</small></button>`).join("")}</div><div id="whatIfResult"></div><button class="secondary-button" id="backReport" type="button">BACK TO REPORT</button></div></section>`;
    document.querySelectorAll("[data-alt]").forEach(button => button.onclick = () => {
      const choice = alternatives[Number(button.dataset.alt)];
      const model = clone(record.modelBefore);
      applyChoiceModel(model, event, choice);
      const alternative = semesterScores(model);
      document.getElementById("whatIfResult").innerHTML = `<div class="message-stack">${Object.keys(original).map(key => `<article><span>${key.replace(/([A-Z])/g, " $1").toUpperCase()}</span><p>${getGrade(original[key])} ${original[key]} → ${getGrade(alternative[key])} ${alternative[key]}</p></article>`).join("")}</div>`;
    });
    document.getElementById("backReport").onclick = renderReportCard;
  }

  function renderEnding() {
    const ending = content.endings.find(item => item.id === state.ending) || content.endings.at(-1);
    const otherEndings = content.endings.filter(item => item.id !== ending.id);
    const story = narrative();
    const grade = story.ending.grade || "—";
    const qnaScore = story.qna.answers.reduce((sum, answer) => sum + answer.score, 0);
    setScene("ending");
    setChrome(false);
    taskLine.textContent = "This ending describes a fictional route, not a score of the player.";
    screen.innerHTML = `
      <section class="ending-screen">
        <div class="ending-copy">
          <span class="micro">FRIDAY · FINAL OUTCOME</span>
          <div class="ending-grade" aria-label="Ending grade ${grade}">${grade}</div>
          <h1>${ending.title}</h1>
          ${ending.text.map(paragraph => `<p>${paragraph}</p>`).join("")}
          <blockquote>${ending.reflection}</blockquote>
          <section class="epilogue-grid"><article><span>MAYA · AFTER</span><p>${story.ending.mayaEpilogue}</p></article><article><span>JAY · AFTER</span><p>${story.ending.jayEpilogue}</p></article></section>
          <section class="behavior-review"><h3>What this timeline remembers</h3>${story.ending.behaviorReview.map((item) => `<p>• ${item}</p>`).join("")}</section>
          <div class="button-row">
            <button class="primary-button" id="seeRoute" type="button">SEE MY ROUTE</button>
            <button class="secondary-button" id="reportCard" type="button">16-WEEK REPORT</button>
            <button class="secondary-button" id="playAgain" type="button">PLAY ANOTHER WEEK</button>
          </div>
        </div>
        <aside class="ending-summary">
          <span class="micro">HOW THE EVENING MOVED</span>
          <div class="route-count"><strong>${story.ending.score}</strong><span>ending score · grade ${grade}</span></div>
          <div class="route-count"><strong>${qnaScore}/9</strong><span>Friday Q&amp;A evidence score</span></div>
          <div class="route-count"><strong>${state.aiSystem.tipsDiscovered.length}</strong><span>AI tips discovered</span></div>
          <div class="route-count"><strong>${Object.values(state.aiSystem.skillEvidence).filter((value) => value > 0).length}/5</strong><span>AI skills practised</span></div>
          <div class="route-count"><strong>${Object.values(state.aiSystem.skillEvidence).filter((value) => value === 0).length}</strong><span>opportunities not explored</span></div>
          ${bar("Project", state.stats.project, "project-fill")}
          ${bar("Connection", state.stats.connection, "connection-fill")}
          ${bar("Personal", state.stats.personal, "personal-fill")}
          <div class="route-count"><strong>${state.visitedLocations.length}</strong><span>places visited</span></div>
          <div class="route-count"><strong>${state.notes.length}</strong><span>moments recorded</span></div>
          <h3>Other Possible Timelines</h3>
          ${otherEndings.map(item => `<article class="journal-note"><span>${item.title}</span><p>${item.reflection}</p></article>`).join("")}
        </aside>
      </section>`;
    document.getElementById("seeRoute").onclick = openJournal;
    document.getElementById("reportCard").onclick = renderReportCard;
    document.getElementById("playAgain").onclick = () => {
      const sound = state.sound;
      state = freshState();
      state.sound = sound;
      save();
      renderTitle();
    };
  }

  mapButton.onclick = () => { if (!["event", "reflection", "ending"].includes(state.screen)) renderMap(); };
  soundButton.onclick = () => {
    state.sound = !state.sound;
    soundButton.textContent = state.sound ? "SOUND ON" : "SOUND OFF";
    soundButton.setAttribute("aria-pressed", String(state.sound));
    save();
    if (state.sound) {
      beep(620, 0.08);
      startSceneMusic(currentScene);
    } else stopSceneMusic();
  };
  journalButton.onclick = openJournal;
  closeJournal.onclick = () => journalDialog.close();
  closePhone.onclick = () => phoneDialog.close();
  mayaStatus.onclick = () => openNpcMemory("maya");
  jayStatus.onclick = () => openNpcMemory("jay");
  closeNpcDialog.onclick = () => npcDialog.close();
  statusToggle.onclick = () => {
    const collapsed = statusPanel.classList.toggle("collapsed");
    statusToggle.setAttribute("aria-expanded", String(!collapsed));
    statusToggle.querySelector("b").textContent = collapsed ? "+" : "−";
    localStorage.setItem(`${STORAGE_KEY}-status-collapsed`, String(collapsed));
    beep(collapsed ? 360 : 480, .04);
  };
  journalDialog.addEventListener("click", event => { if (event.target === journalDialog) journalDialog.close(); });
  phoneDialog.addEventListener("click", event => { if (event.target === phoneDialog) phoneDialog.close(); });
  npcDialog.addEventListener("click", event => { if (event.target === npcDialog) npcDialog.close(); });
  document.addEventListener("click", event => {
    const button = event.target.closest("button");
    if (!button || button.disabled || button === soundButton || !state.sound) return;
    if (button.classList.contains("choice-button")) beep(520, .055);
    else if (button.classList.contains("primary-button")) beep(660, .07);
    else if (button.classList.contains("phone-task") || button.classList.contains("phone-action")) beep(760, .05);
    else beep(390, .045);
  });

  function openDebugScenario(debugId) {
    const activity = content.activities.library.find((item) => item.id === "research");
    state = freshState();
    state.dayIndex = 2;
    state.daysCompleted = 2;
    state.minute = 16 * 60 + 20;
    state.v2.energy = debugId === "energy-tired" ? 50 : debugId === "energy-exhausted" ? 25 : 70;
    state.completedLocations.push("library");
    state.storyEvents.push("library_start");
    if (debugId === "late-phone") {
      state.dayIndex = 1;
      state.minute = 21 * 60;
      renderMap();
      return openPhone(false);
    }
    if (debugId === "relationship-angry" || debugId === "relationship-estranged") {
      state.dayIndex = 1;
      const relationship = debugId === "relationship-angry" ? 30 : 10;
      narrative().npc.maya.relationship = relationship;
      narrative().npc.jay.relationship = relationship;
      narrative().npc.maya.needsRepair = true;
      narrative().npc.jay.needsRepair = true;
      narrative().npc.maya.estranged = relationship < 15;
      narrative().npc.jay.estranged = relationship < 15;
      renderMap();
      return openPhone(true);
    }
    if (debugId === "wednesday-announcement") return renderWednesdayAnnouncement();
    if (debugId === "thursday-repair") {
      state.dayIndex = 3;
      addFlag("uncheckedResearchOutput");
      narrative().npc.maya.needsRepair = true;
      updateConflict();
      return renderMap();
    }
    if (debugId === "friday-qna-risk") {
      state.dayIndex = 4;
      addFlag("uncheckedResearchOutput");
      narrative().announcementSeen = true;
      updateConflict();
      return renderFridayPresentation();
    }
    if (debugId === "friday-qna-verified") {
      state.dayIndex = 4;
      ["verifiedSources", "checkedClaim", "understandsOpening", "usedAiFeedback"].forEach(addFlag);
      narrative().announcementSeen = true;
      updateConflict();
      return renderFridayPresentation();
    }
    if (debugId === "research-independent") return startResearchMode("library", activity, "independent");
    if (debugId === "research-collaborate") return startResearchMode("library", activity, "collaborate");
    if (debugId === "research-delegate") return startResearchMode("library", activity, "delegate");
    if (debugId === "non-ai-dinner") return renderLocation("canteen");
    renderResearchModeSelect("library", activity);
  }

  load();
  if (localStorage.getItem(`${STORAGE_KEY}-status-collapsed`) === "true") {
    statusPanel.classList.add("collapsed");
    statusToggle.setAttribute("aria-expanded", "false");
    statusToggle.querySelector("b").textContent = "+";
  }
  soundButton.textContent = state.sound ? "SOUND ON" : "SOUND OFF";
  soundButton.setAttribute("aria-pressed", String(state.sound));
  const debugScenario = new URLSearchParams(window.location.search).get("debug");
  if (debugScenario) openDebugScenario(debugScenario);
  else renderTitle();
})();
