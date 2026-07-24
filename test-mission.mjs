import fs from "node:fs";
import vm from "node:vm";

class FakeClassList {
  constructor() {
    this.values = new Set();
  }

  add(...names) {
    names.forEach((name) => this.values.add(name));
  }

  remove(...names) {
    names.forEach((name) => this.values.delete(name));
  }

  toggle(name, force) {
    if (force === undefined) {
      if (this.values.has(name)) this.values.delete(name);
      else this.values.add(name);
      return this.values.has(name);
    }
    if (force) this.values.add(name);
    else this.values.delete(name);
    return force;
  }
}

class FakeElement {
  constructor() {
    this.classList = new FakeClassList();
    this.dataset = {};
    this.style = {
      setProperty(name, value) {
        this[name] = value;
      }
    };
    this.hidden = false;
    this.disabled = false;
    this.textContent = "";
    this.innerHTML = "";
    this.children = [];
    this.listeners = {};
  }

  append(...children) {
    this.children.push(...children);
  }

  appendChild(child) {
    this.children.push(child);
    return child;
  }

  setAttribute() {}
  addEventListener(type, listener) {
    if (!this.listeners[type]) this.listeners[type] = [];
    this.listeners[type].push(listener);
  }
  scrollIntoView() {}
}

const elements = new Map();
const document = {
  getElementById(id) {
    if (!elements.has(id)) elements.set(id, new FakeElement());
    return elements.get(id);
  },
  querySelectorAll() {
    return [];
  },
  querySelector() {
    return null;
  },
  createElement() {
    return new FakeElement();
  },
  createElementNS() {
    return new FakeElement();
  }
};

const storage = new Map();
const localStorage = {
  getItem(key) {
    return storage.get(key) ?? null;
  },
  setItem(key, value) {
    storage.set(key, value);
  }
};

const context = vm.createContext({
  console,
  document,
  localStorage,
  window: {
    scrollTo() {},
    confirm() { return true; }
  }
});

const source = fs.readFileSync(new URL("./app.js", import.meta.url), "utf8");
if (!source.includes('button.addEventListener("focus", previewMission);')) {
  throw new Error("Chapter 1 map cards do not refresh the mission preview on keyboard focus");
}
const exports = `
  globalThis.__missionTest = {
    missions,
    initialState,
    getState: () => state,
    setState: (nextState) => { state = nextState; },
    getPlayerProfile: () => playerProfile,
    setPlayerProfile: (nextProfile) => { playerProfile = normalizePlayerProfile(nextProfile); },
    setChapterNavigation,
    loadState,
    saveState,
    renderAll,
    beginMission,
    openMissionIntro,
    acceptMissionIntro,
    dismissMissionIntro,
    reviewMissionIntro,
    explicitQuestionText,
    shuffleAnswers,
    checkSolution,
    assignEngineModule,
    assignNodeTool,
    assignClassification,
    assignBlueprintModule,
    getEarnedPlayerLevel,
    getEarnedLevelHintCount,
    getFirstChapterHintContext,
    getLevelHintBalance,
    isLevelHintRevealed,
    useLevelHint,
    createLevelHintButton,
    answerQuiz,
    answerGatewayTest,
    answerBlueprintTest
  };
`;
vm.runInContext(source + exports, context);

const api = context.__missionTest;
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

api.setPlayerProfile({ id: "navigation-test", displayName: "Навигатор", mode: "progression" });
api.setState({ ...api.initialState });
api.setChapterNavigation("chapter1");
assert(elements.get("chapter-switcher").hidden === false, "City navigation is hidden for an authenticated progression account");
assert(elements.get("show-first-chapter").disabled === false, "The current city is disabled");
assert(elements.get("show-second-chapter").disabled === true, "A future progression city is available too early");

api.setPlayerProfile({ id: "navigation-test", displayName: "Навигатор", mode: "study" });
api.setChapterNavigation("chapter4");
["show-first-chapter", "show-second-chapter", "show-third-chapter", "show-fourth-chapter", "show-fifth-chapter"].forEach((id) => {
  assert(elements.get(id).disabled === false, `${id}: study-mode city transition is disabled`);
});
assert(elements.get("show-fourth-chapter").classList.values.has("is-active"), "Active city is not reflected in navigation");
api.setPlayerProfile(null);
api.setState({ ...api.initialState });

assert(api.getFirstChapterHintContext() === "c1:interface:answer:0", "The first sequence hint targets the wrong answer");
api.getState().selected.push("workspace");
assert(api.getFirstChapterHintContext() === "c1:interface:answer:1", "A sequence hint leaked into the next question");
api.getState().selected = [];

Object.values(api.missions).forEach((mission) => {
  assert(
    /^https:\/\/edu\.bpmsoft\.ru\/baza-znaniy\//.test(mission.sourceUrl),
    `${mission.key}: official BPMSoft source URL is missing`
  );
  assert(Array.isArray(mission.intro) && mission.intro.length >= 2, `${mission.key}: lore intro needs at least two paragraphs`);
  assert(
    mission.intro.every((paragraph) => typeof paragraph === "string" && paragraph.length >= 120),
    `${mission.key}: lore intro paragraphs are too short`
  );
  api.openMissionIntro(mission);
  assert(elements.get("mission-intro-title").textContent === mission.introTitle, `${mission.key}: lore title was not rendered`);
  assert(
    (elements.get("mission-intro-copy").innerHTML.match(/<p>/g) || []).length === mission.intro.length,
    `${mission.key}: not all lore paragraphs were rendered`
  );

  const explicitPrompts = [
    ...(mission.prompts || []),
    ...(mission.processPrompts || []),
    ...(mission.questions || []).map((question) => question.prompt),
    ...(mission.requirements || []).map((requirement) => requirement.prompt),
    ...(mission.nodes || []).map((node) => node.prompt),
    ...(mission.tests || []).map((test) => test.prompt)
  ];
  if (explicitPrompts.length > 0) {
    assert(
      typeof mission.questionInstruction === "string" && mission.questionInstruction.length >= 60,
      `${mission.key}: concrete question instruction is missing`
    );
    explicitPrompts.forEach((prompt, promptIndex) => {
      const explicitCopy = api.explicitQuestionText(mission, prompt);
      assert(
        explicitCopy.startsWith("Дано:") && explicitCopy.includes("Задача:"),
        `${mission.key}: question ${promptIndex + 1} is not self-contained`
      );
    });
  } else {
    assert(
      mission.scenario.startsWith("Дано:") && mission.scenario.includes("Задача:"),
      `${mission.key}: sequence mission does not state its conditions and task`
    );
  }

  for (let iteration = 0; iteration < 25; iteration += 1) {
    if (mission.mode === "classification") {
      const shuffledCategories = api.shuffleAnswers(mission.tools);
      const originalIds = mission.tools.map((tool) => tool.id);
      const shuffledIds = shuffledCategories.map((tool) => tool.id);
      assert(
        shuffledIds.some((id, index) => id !== originalIds[index]),
        "Classification categories kept their canonical order"
      );
      assert(mission.requirements.length === 12, "Classification mission does not contain 12 requirements");
      const categoryCounts = new Map(mission.tools.map((tool) => [tool.id, 0]));
      mission.correct.forEach((id) => categoryCounts.set(id, categoryCounts.get(id) + 1));
      assert(
        [...categoryCounts.values()].every((count) => count >= 2),
        "A classification category is not reusable across multiple requirements"
      );
      continue;
    }

    if (mission.mode === "blueprint") {
      assert(mission.nodes.length === 6, "Blueprint mission does not contain six solution nodes");
      assert(mission.correct.length === 6, "Blueprint mission does not contain six correct modules");
      assert(mission.tests.length === 3, "Blueprint mission does not contain three acceptance tests");
    }

    const shuffledTools = api.shuffleAnswers(mission.tools, { correctIds: mission.correct });
    const shuffledToolIds = shuffledTools.map((tool) => tool.id);
    const shuffledCorrectIds = shuffledToolIds.filter((id) => mission.correct.includes(id));
    assert(!mission.correct.includes(shuffledToolIds[0]), `${mission.key}: palette starts with a correct answer`);
    assert(
      shuffledCorrectIds.some((id, index) => id !== mission.correct[index]),
      `${mission.key}: correct tools kept their canonical order`
    );

    (mission.questions || []).forEach((question, questionIndex) => {
      const shuffledOptions = api.shuffleAnswers(question.options, { correctId: question.correct });
      assert(shuffledOptions[0] !== question.correct, `${mission.key}: question ${questionIndex + 1} correct answer is first`);
    });

    (mission.tests || []).forEach((test, testIndex) => {
      const shuffledOptions = api.shuffleAnswers(test.options, { correctId: test.correct });
      assert(shuffledOptions[0].id !== test.correct, `${mission.key}: gateway test ${testIndex + 1} correct answer is first`);
    });
  }
});

const completeBuildMission = (key) => {
  api.beginMission(key);
  api.getState().selected = [...api.missions[key].correct];
  api.checkSolution();
};

const completeBlueprintMission = () => {
  api.beginMission("solution");
  api.getState().selected = [...api.missions.solution.correct];
  api.checkSolution();
  for (const test of api.missions.solution.tests) api.answerBlueprintTest(test.correct);
};

api.setState({ ...api.initialState });
api.setPlayerProfile({ name: "Коллега", mode: "study" });
api.renderAll();
assert(
  elements.get("source-copy").children.at(-1).href === api.missions.interface.sourceUrl,
  "Knowledge source link was not rendered for the active mission"
);
api.beginMission("solution");
assert(api.getState().activeMission === "solution", "Study mode did not open the final mission directly");
api.beginMission("interface");
api.getState().selected = [...api.missions.interface.correct];
api.checkSolution();
assert(!api.getState().missionComplete, "Study mode changed canonical mission completion");
assert(api.getState().xp === 0, "Study mode awarded canonical XP");
assert(!storage.has("bpmsoft-quest-v1"), "Study mode persisted sandbox progress");

api.setPlayerProfile({ name: "Коллега", mode: "progression" });
api.setState({ ...api.initialState });
api.renderAll();

api.beginMission("data");
assert(api.getState().activeMission === "interface", "Locked Data Forge was opened");

api.beginMission("interface");
assert(!elements.get("mission-intro").hidden, "Interface lore intro did not open on first visit");
assert(
  (elements.get("mission-intro-copy").innerHTML.match(/<p>/g) || []).length >= 2,
  "Interface lore intro does not render two paragraphs"
);
api.dismissMissionIntro();
assert(!api.getState().introSeen.includes("interface"), "Dismissed Interface lore intro was marked as seen");
api.beginMission("interface");
assert(!elements.get("mission-intro").hidden, "Dismissed Interface lore intro did not reopen");
api.acceptMissionIntro();
assert(elements.get("mission-intro").hidden, "Interface lore intro did not close after acceptance");
assert(api.getState().introSeen.includes("interface"), "Accepted Interface lore intro was not remembered");
assert(
  JSON.parse(storage.get("bpmsoft-quest-v1")).introSeen.includes("interface"),
  "Accepted Interface lore intro was not persisted"
);
api.beginMission("interface");
assert(elements.get("mission-intro").hidden, "Interface lore intro reopened after acceptance");
api.reviewMissionIntro();
assert(!elements.get("mission-intro").hidden, "Interface lore intro did not reopen from the mission button");
assert(elements.get("mission-intro-map").hidden, "Map action remained visible while rereading mission lore");
assert(
  elements.get("mission-intro-start").textContent === "Вернуться к заданию",
  "Reread action does not return the player to the mission"
);
api.acceptMissionIntro();
assert(elements.get("mission-intro").hidden, "Reread lore intro did not close");
assert(api.getState().introSeen.filter((key) => key === "interface").length === 1, "Rereading duplicated the seen state");
assert(elements.get("scene-kicker").textContent === api.missions.interface.sceneKicker, "Interface assignment does not label its central question");
assert(
  elements.get("scene-copy").textContent.startsWith("Дано:") && elements.get("scene-copy").textContent.includes("Задача:"),
  "Interface mission does not show explicit conditions and task"
);
const interfaceToolOrder = api.getState().answerOrders["interface:tools"];
const interfaceCorrectOrder = interfaceToolOrder.filter((id) => api.missions.interface.correct.includes(id));
assert(!api.missions.interface.correct.includes(interfaceToolOrder[0]), "Interface palette starts with a correct answer");
assert(
  interfaceCorrectOrder.some((id, index) => id !== api.missions.interface.correct[index]),
  "Interface correct tools kept their canonical order"
);

completeBuildMission("interface");
assert(api.getState().missionComplete, "Interface Hub did not complete");
assert(api.getState().xp === 55, `Expected 55 XP after Interface Hub, got ${api.getState().xp}`);

api.beginMission("data");
const activeForgeMarker = elements.get("forge-layer").children[0];
assert(activeForgeMarker.innerHTML.includes("Сущность проекта"), "Data-model landmark is missing under the active marker");
assert(activeForgeMarker.innerHTML.includes("Выберите термин"), "Data-model instruction is missing under the active marker");
assert(activeForgeMarker.innerHTML.includes(api.missions.data.prompts[0]), "Forge definition is missing under the active marker");
api.getState().selected = ["field", "object", "directory", "detail", "relation"];
api.checkSolution();
assert(!api.getState().dataMissionComplete, "Invalid Data Forge matching was accepted");
assert(api.getState().energy === 2, "Invalid Data Forge matching did not consume energy");
assert(api.getState().selected[0] === null && api.getState().selected[1] === null, "Wrong forge labels were not ejected");
assert(api.getState().forgeLocked.slice(2).every(Boolean), "Correct forge stations were not locked");
api.getState().selected = [...api.missions.data.correct];
api.checkSolution();
assert(api.getState().dataMissionComplete, "Data Forge did not complete");
assert(api.getState().xp === 100, `Expected 100 XP after Data Forge, got ${api.getState().xp}`);
assert(api.getState().forgeComplete, "Data Forge scene did not activate after completion");

api.beginMission("access");
const firstAccessOrder = [...api.getState().answerOrders["access:question-0"]];
assert(firstAccessOrder[0] !== api.missions.access.questions[0].correct, "Access correct answer is still first");
const activeAccessMarker = elements.get("access-layer").children[0];
assert(activeAccessMarker.innerHTML.includes("Структура компании"), "Active access landmark is missing from the scene");
assert(activeAccessMarker.innerHTML.includes("Выберите механизм доступа"), "Access instruction is missing under the active marker");
assert(activeAccessMarker.innerHTML.includes(api.missions.access.questions[0].prompt), "Access question is missing under the active marker");
api.answerQuiz("funcRole");
assert(
  api.getState().answerOrders["access:question-0"].every((id, index) => id === firstAccessOrder[index]),
  "Access answers reshuffled after a wrong choice"
);
assert(api.getState().energy === 2, "Wrong access seal did not consume energy");
assert(api.getState().activeSlot === 0, "Wrong access seal advanced the citadel");
assert(api.getState().accessWrongAnswer === "funcRole", "Rejected access seal was not highlighted");
api.answerQuiz(api.missions.access.questions[0].correct);
assert(api.getState().accessWrongAnswer === null, "Rejected access seal was not cleared after a correct answer");
for (const question of api.missions.access.questions.slice(1)) api.answerQuiz(question.correct);
assert(api.getState().accessMissionComplete, "Access Citadel did not complete");
assert(api.getState().xp === 150, `Expected 150 XP after Access Citadel, got ${api.getState().xp}`);
assert(api.getState().accessComplete, "Access Citadel scene did not activate after completion");
const accessEnergyAfterCompletion = api.getState().energy;
const accessAttemptsAfterCompletion = api.getState().attempts;
api.answerQuiz("funcRole");
assert(api.getState().energy === accessEnergyAfterCompletion, "Completed Access Citadel accepted another wrong answer");
assert(api.getState().attempts === accessAttemptsAfterCompletion, "Completed Access Citadel counted another error");
assert(elements.get("tool-area").hidden, "Completed Access Citadel left answer options visible");

api.beginMission("process");
const activeEngineMarker = elements.get("engine-layer").children[1];
assert(activeEngineMarker.innerHTML.includes("Старт процесса"), "Active process step is missing from the scene");
assert(activeEngineMarker.innerHTML.includes("Выберите элемент"), "Process instruction is missing under the active marker");
assert(activeEngineMarker.innerHTML.includes(api.missions.process.processPrompts[0]), "Process prompt is missing under the active marker");
assert(api.getState().selected.length === 5, "Process Engine did not initialize five image stations");
api.assignEngineModule("signalFilter");
assert(api.getState().activeSlot === 1, "Process Engine did not advance to the next empty station");
api.getState().selected = ["signalFilter", "startSignal", "readData", "addData", "stopEvent"];
api.checkSolution();
assert(!api.getState().processMissionComplete, "Invalid Process Engine sequence was accepted");
assert(api.getState().energy === 2, "Invalid Process Engine sequence did not consume energy");
assert(api.getState().selected[0] === null && api.getState().selected[1] === null, "Wrong Process Engine modules were not ejected");
assert(api.getState().engineLocked.slice(2).every(Boolean), "Correct Process Engine stations were not locked");
api.getState().selected = [...api.missions.process.correct];
api.checkSolution();
assert(api.getState().processMissionComplete, "Process Engine did not complete");
assert(api.getState().xp === 205, `Expected 205 XP after Process Engine, got ${api.getState().xp}`);
assert(api.getState().engineComplete, "Process Engine scene did not activate after completion");

api.beginMission("case");
const activeArenaMarker = elements.get("arena-layer").children[1];
assert(activeArenaMarker.innerHTML.includes("Новая"), "Active Case Arena stage is missing from the image");
assert(activeArenaMarker.innerHTML.includes(api.missions.case.prompts[0]), "Case Arena prompt is missing from the image");
api.assignNodeTool("arena", "approval");
assert(api.getState().activeSlot === 1, "Case Arena did not advance to the next empty node");
api.getState().selected = ["approval", "task", "email", "mandatoryTransition", "successfulStage"];
api.checkSolution();
assert(!api.getState().caseMissionComplete, "Invalid Case Arena route was accepted");
assert(api.getState().selected[0] === null && api.getState().selected[1] === null, "Wrong Case Arena mechanisms were not returned");
assert(api.getState().arenaLocked.slice(2).every(Boolean), "Correct Case Arena nodes were not locked");
api.getState().selected = [...api.missions.case.correct];
api.checkSolution();
assert(api.getState().caseMissionComplete, "Case Arena did not complete");
assert(api.getState().xp === 250, `Expected 250 XP after Case Arena, got ${api.getState().xp}`);
assert(api.getState().level === 2, `Expected level 2 after Case Arena, got ${api.getState().level}`);
assert(api.getState().arenaComplete, "Case Arena scene did not activate after completion");
assert(api.getEarnedPlayerLevel() === 2, "Level II was not counted as earned");
assert(api.getLevelHintBalance() === 1, "Level II did not award one hint");
assert(api.useLevelHint("c1:integration:answer:0"), "Earned hint could not be used");
assert(api.isLevelHintRevealed("c1:integration:answer:0"), "Used hint was not persisted as revealed");
assert(api.getLevelHintBalance() === 0, "Using a hint did not consume its level reward");
context.window.BPMQuestChapter2 = { getState: () => ({ packageComplete: true }) };
assert(api.getEarnedLevelHintCount() === 2, "Level IV did not add the next hint reward");
assert(api.getLevelHintBalance() === 1, "The Level IV reward was not added to the shared hint balance");
api.setPlayerProfile({ id: "hint-study-test", displayName: "Подсказка", mode: "study" });
let studyHintRefreshes = 0;
const studyHintButton = api.createLevelHintButton("c3:contact:identity:record", () => {
  studyHintRefreshes += 1;
});
assert(!studyHintButton.hidden, "Study mode hid the inline hint action");
assert(studyHintButton.textContent === "Использовать подсказку · 1", "Hint action has an unclear label");
studyHintButton.listeners.click[0]();
assert(api.isLevelHintRevealed("c3:contact:identity:record"), "Study mode could not use an earned hint");
assert(studyHintButton.textContent === "Ответ показан", "Used study hint did not update its label");
assert(studyHintRefreshes === 1, "Using a study hint did not refresh the active task");
api.setPlayerProfile(null);
delete context.window.BPMQuestChapter2;

api.beginMission("insight");
assert(api.getState().activeMission === "case", "Locked Insight Tower was opened");

api.beginMission("integration");
const activeHarborMarker = elements.get("harbor-layer").children[1];
assert(activeHarborMarker.innerHTML.includes("Канал"), "Active Integration Harbor pier is missing from the image");
assert(activeHarborMarker.innerHTML.includes(api.missions.integration.prompts[0]), "Integration Harbor prompt is missing from the image");
api.getState().selected = ["outboundService", "jwt", "postJson", "runProcess", "waitResponse"];
api.checkSolution();

assert(!api.getState().gatewayBuilt, "Invalid gateway configuration was accepted");
assert(api.getState().energy === 2, "Invalid gateway configuration did not consume energy");
assert(api.getState().selected[0] === null, "Wrong harbor equipment was not returned");
assert(api.getState().harborLocked.slice(1).every(Boolean), "Correct harbor piers were not locked");

api.getState().selected = [...api.missions.integration.correct];
api.checkSolution();

assert(api.getState().gatewayBuilt, "Gateway test phase did not start");
assert(api.getState().activeSlot === 0, "First gateway test is not active");
assert(
  api.getState().answerOrders["integration:gateway-test-0"][0] !== api.missions.integration.tests[0].correct,
  "Gateway test correct answer is still first"
);
assert(api.getState().harborComplete, "Integration Harbor did not switch to the powered state");
assert(api.getState().harborLocked.every(Boolean), "Configured harbor piers were not locked for signal tests");

api.answerGatewayTest("reject");
assert(api.getState().activeSlot === 0, "Wrong gateway test answer advanced progress");

api.answerGatewayTest("create");
api.answerGatewayTest("reuse");
api.answerGatewayTest("deny");

const finalState = api.getState();
assert(finalState.integrationMissionComplete, "Integration Harbor did not complete");
assert(finalState.xp === 350, `Expected 350 XP after Integration Harbor, got ${finalState.xp}`);
assert(finalState.level === 2, `Expected level 2, got ${finalState.level}`);
assert(elements.get("xp-value").textContent === 100, "Level II XP value is not 100");
assert(elements.get("xp-goal").textContent === 250, "Level II XP goal is not 250");
assert(elements.get("xp-bar").style.width === "40%", "Level II XP bar is not at 40%");
assert(storage.has("bpmsoft-quest-v1"), "Progress was not saved");

api.beginMission("classification");
assert(api.getState().activeMission === "integration", "Locked Solution Gate was opened before Insight Tower");

api.beginMission("solution");
assert(api.getState().activeMission === "integration", "Locked City Nexus was opened before Solution Gate");

api.beginMission("insight");
assert(
  api.getState().answerOrders["insight:question-0"][0] !== api.missions.insight.questions[0].correct,
  "Insight correct answer is still first"
);
const guideDialog = elements.get("dialog-layer").children[1];
assert(guideDialog.innerHTML.includes(api.missions.insight.questions[0].prompt), "Guide question is missing from Insight Tower");
assert(guideDialog.innerHTML.includes("Какой вид дашборда"), "Guide invitation is missing from Insight Tower");
api.answerQuiz("chart");
assert(!api.getState().insightMissionComplete, "Wrong guide answer completed Insight Tower");
assert(api.getState().activeSlot === 0, "Wrong guide answer advanced the dialogue");
assert(api.getState().insightWrongAnswer === "chart", "Wrong guide answer was not highlighted");
api.answerQuiz(api.missions.insight.questions[0].correct);
assert(api.getState().insightWrongAnswer === null, "Guide error state was not cleared");
for (const question of api.missions.insight.questions.slice(1)) api.answerQuiz(question.correct);
assert(api.getState().insightMissionComplete, "Insight Tower did not complete");
assert(api.getState().xp === 400, `Expected 400 XP after Insight Tower, got ${api.getState().xp}`);
assert(api.getState().insightComplete, "Guide dialogue did not reach its final state");
assert(elements.get("xp-value").textContent === 150, "Level II XP value is not 150");
assert(elements.get("xp-goal").textContent === 250, "Level II XP goal changed after Insight Tower");
assert(elements.get("xp-bar").style.width === "60%", "Level II XP bar is not at 60%");

api.beginMission("classification");
assert(api.getState().activeMission === "classification", "Solution Gate did not open after Insight Tower");
assert(api.getState().selected.length === 12, "Classification did not initialize 12 independent requirements");
const categoryOrder = api.getState().answerOrders["classification:categories"];
assert(categoryOrder.length === 5, "Classification did not render five reusable categories");
assert(
  categoryOrder.some((id, index) => id !== api.missions.classification.tools[index].id),
  "Classification categories were not shuffled"
);

const classificationCards = elements.get("solution-slots").children
  .filter((child) => child.className?.includes("classification-requirement"))
  .slice(-12);
const fourthRequirementCard = classificationCards[3];
const lowcodeBasket = elements.get("tool-palette").children
  .filter((child) => child.className?.includes("classification-basket"))
  .reverse()
  .find((child) => child.innerHTML.includes("Low-code настройка"));
let draggedPayload = "";
fourthRequirementCard.listeners.dragstart[0]({
  dataTransfer: {
    setData(type, value) {
      if (type === "text/plain") draggedPayload = value;
    }
  }
});
lowcodeBasket.listeners.drop[0]({
  preventDefault() {},
  dataTransfer: {
    getData() {
      return draggedPayload;
    }
  }
});
assert(draggedPayload === "requirement:3", "Classification drag payload is incorrect");
assert(api.getState().selected[3] === "lowcode", "Requirement card was not assigned through drag-and-drop");

api.beginMission("classification");

api.assignClassification(0, "base");
api.assignClassification(1, "base");
assert(
  api.getState().selected[0] === "base" && api.getState().selected[1] === "base",
  "Classification prevented reuse of the same category"
);
const energyBeforeIncompleteCheck = api.getState().energy;
api.checkSolution();
assert(!api.getState().classificationMissionComplete, "Incomplete classification was accepted");
assert(api.getState().energy === energyBeforeIncompleteCheck, "Incomplete classification consumed energy");
assert(elements.get("mission-hint").textContent.includes("2 из 12"), "Incomplete classification progress hint is missing");

api.getState().selected = [...api.missions.classification.correct];
api.getState().selected[3] = "base";
api.checkSolution();
assert(!api.getState().classificationMissionComplete, "Incorrect classification was accepted");
assert(
  api.getState().energy === Math.max(0, energyBeforeIncompleteCheck - 1),
  "Incorrect classification did not consume energy"
);
assert(api.getState().selected[3] === null, "Incorrect classification was not returned for revision");
assert(api.getState().classificationLocked.filter(Boolean).length === 11, "Correct classification cards were not locked");
assert(
  elements.get("feedback-copy").textContent.includes("Поля, вкладки и детали"),
  "Classification error did not show a requirement-specific explanation"
);

api.getState().selected = [...api.missions.classification.correct];
api.checkSolution();
assert(api.getState().classificationMissionComplete, "Solution Gate did not complete");
assert(api.getState().classificationComplete, "Classification scene did not reach its final state");
assert(api.getState().xp === 450, `Expected 450 XP after Solution Gate, got ${api.getState().xp}`);
assert(elements.get("xp-value").textContent === 200, "Level II XP value is not 200 after Solution Gate");
assert(elements.get("xp-goal").textContent === 250, "Level II XP goal changed after Solution Gate");
assert(elements.get("xp-bar").style.width === "80%", "Level II XP bar is not at 80%");

api.beginMission("solution");
assert(api.getState().activeMission === "solution", "City Nexus did not open after Solution Gate");
assert(api.getState().selected.length === 6, "City Nexus did not initialize six independent nodes");
assert(api.getState().answerOrders["solution:blueprint-tools"].length === 9, "City Nexus palette does not contain nine modules");

const blueprintNodes = elements.get("solution-slots").children
  .filter((child) => child.className?.includes("blueprint-node"))
  .slice(-6);
const requestSectionTool = elements.get("tool-palette").children
  .filter((child) => child.className?.includes("blueprint-tool"))
  .reverse()
  .find((child) => child.innerHTML.includes("Раздел и карточка обращения"));
let blueprintDragPayload = "";
requestSectionTool.listeners.dragstart[0]({
  dataTransfer: {
    setData(type, value) {
      if (type === "text/plain") blueprintDragPayload = value;
    }
  }
});
blueprintNodes[0].listeners.drop[0]({
  preventDefault() {},
  dataTransfer: {
    getData() {
      return blueprintDragPayload;
    }
  }
});
assert(blueprintDragPayload === "tool:requestSection", "City Nexus drag payload is incorrect");
assert(api.getState().selected[0] === "requestSection", "City Nexus module was not assigned through drag-and-drop");

api.beginMission("solution");

api.assignBlueprintModule(0, "requestSection");
api.assignBlueprintModule(1, "categoryDirectory");
const energyBeforeBlueprintIncomplete = api.getState().energy;
api.checkSolution();
assert(!api.getState().blueprintBuilt, "Incomplete City Nexus blueprint was accepted");
assert(api.getState().energy === energyBeforeBlueprintIncomplete, "Incomplete City Nexus blueprint consumed energy");
assert(elements.get("mission-hint").textContent.includes("2 из 6"), "Incomplete blueprint progress hint is missing");

api.getState().selected = [...api.missions.solution.correct];
api.getState().selected[4] = "printReport";
api.checkSolution();
assert(!api.getState().blueprintBuilt, "Incorrect City Nexus blueprint was accepted");
assert(api.getState().selected[4] === null, "Incorrect City Nexus module was not returned to the palette");
assert(api.getState().blueprintLocked.filter(Boolean).length === 5, "Correct City Nexus nodes were not locked");
assert(
  elements.get("feedback-copy").textContent.includes("BPMN-процесс"),
  "City Nexus error did not show a node-specific explanation"
);

api.getState().selected = [...api.missions.solution.correct];
api.checkSolution();
assert(api.getState().blueprintBuilt, "City Nexus acceptance phase did not start");
assert(!api.getState().solutionMissionComplete, "City Nexus completed before acceptance tests");
assert(api.getState().blueprintLocked.every(Boolean), "City Nexus modules were not locked for acceptance");
assert(
  api.getState().answerOrders["solution:blueprint-test-0"][0] !== api.missions.solution.tests[0].correct,
  "First City Nexus acceptance answer is still correct"
);

const energyBeforeWrongAcceptance = api.getState().energy;
api.answerBlueprintTest("draftOnly");
assert(api.getState().activeSlot === 0, "Wrong City Nexus acceptance answer advanced progress");
assert(
  api.getState().energy === Math.max(0, energyBeforeWrongAcceptance - 1),
  "Wrong City Nexus acceptance answer did not consume energy"
);

for (const test of api.missions.solution.tests) api.answerBlueprintTest(test.correct);
assert(api.getState().solutionMissionComplete, "City Nexus did not complete");
assert(api.getState().blueprintComplete, "City Nexus did not reach its final accepted state");
assert(api.getState().xp === 500, `Expected 500 XP after City Nexus, got ${api.getState().xp}`);
assert(elements.get("xp-value").textContent === 250, "Level II XP value is not 250 after City Nexus");
assert(elements.get("xp-goal").textContent === 250, "Level II XP goal changed after City Nexus");
assert(elements.get("xp-bar").style.width === "100%", "Level II XP bar is not complete");
assert(elements.get("feedback-action").dataset.action === "finale", "City Nexus does not lead to the finale screen");

completeBlueprintMission();
assert(api.getState().xp === 500, "Replaying City Nexus awarded XP twice");

completeBuildMission("classification");
assert(api.getState().xp === 500, "Replaying Solution Gate changed final XP");

completeBuildMission("interface");
assert(api.getState().xp === 500, "Replaying an earlier mission awarded XP twice");

storage.set("bpmsoft-quest-v1", JSON.stringify({
  xp: 400,
  energy: 2,
  level: 2,
  missionComplete: true,
  dataMissionComplete: true,
  accessMissionComplete: true,
  processMissionComplete: true,
  caseMissionComplete: true,
  integrationMissionComplete: true,
  insightMissionComplete: true
}));
const migratedState = api.loadState();
assert(!migratedState.classificationMissionComplete, "Old save incorrectly completed Solution Gate");
assert(migratedState.activeMission === "classification", "Old 01–07 save did not migrate to Solution Gate");
assert(migratedState.xp === 400, "Old 01–07 save XP was not preserved canonically");

storage.set("bpmsoft-quest-v1", JSON.stringify({
  xp: 450,
  energy: 3,
  level: 2,
  missionComplete: true,
  dataMissionComplete: true,
  accessMissionComplete: true,
  processMissionComplete: true,
  caseMissionComplete: true,
  integrationMissionComplete: true,
  insightMissionComplete: true,
  classificationMissionComplete: true
}));
const missionEightMigratedState = api.loadState();
assert(!missionEightMigratedState.solutionMissionComplete, "Old 01–08 save incorrectly completed City Nexus");
assert(missionEightMigratedState.activeMission === "solution", "Old 01–08 save did not migrate to City Nexus");
assert(missionEightMigratedState.xp === 450, "Old 01–08 save XP was not preserved canonically");

console.log("Missions 01–09, city finale, progression, penalties, migration, persistence and replay: OK");
