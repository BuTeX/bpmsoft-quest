import { expect, test } from "@playwright/test";

const chapter1Flags = [
  "missionComplete",
  "dataMissionComplete",
  "accessMissionComplete",
  "processMissionComplete",
  "caseMissionComplete",
  "integrationMissionComplete",
  "insightMissionComplete",
  "classificationMissionComplete",
  "solutionMissionComplete"
];

const chapter2Flags = [
  "sortingComplete",
  "portalComplete",
  "signalComplete",
  "cycleComplete",
  "packageComplete",
  "traceComplete",
  "changeComplete",
  "oracleComplete",
  "contourComplete"
];

test("task 11 keeps sequential answers while account progress sync is delayed", async ({ page }) => {
  const email = `chapter2-sync-${Date.now()}@example.com`;
  await page.goto("/academy.html");
  await page.getByRole("tab", { name: "Регистрация" }).click();
  await page.locator("#player-name").fill("Проверка задания 11");
  await page.locator("#player-email").fill(email);
  await page.locator("#player-password").fill("chapter2-sync-password");
  await page.locator("#player-password-confirm").fill("chapter2-sync-password");
  await page.locator("#player-terms-accepted").check();
  await page.locator("#player-privacy-accepted").check();
  await page.getByRole("button", { name: "Создать аккаунт" }).click();
  await expect(page.locator("#player-profile")).toBeVisible({ timeout: 30_000 });

  await page.evaluate(({ chapter1Flags, chapter2Flags }) => {
    const now = new Date(Date.now() + 60_000).toISOString();
    localStorage.setItem("bpmsoft-quest-v1", JSON.stringify({
      energy: 3,
      revealedLevelHints: [],
      introSeen: [],
      ...Object.fromEntries(chapter1Flags.map((flag) => [flag, true]))
    }));
    localStorage.setItem("bpmsoft-quest-updated-at", now);
    localStorage.setItem("bpmsoft-quest-chapter2-v1", JSON.stringify({
      chapterId: "copper-frontier",
      energy: 3,
      introSeen: ["sorting", "portal"],
      prologueSeen: true,
      attempts: 1,
      activePhase: 0,
      answers: {},
      locked: {},
      missionProgress: {},
      achievementGranted: false,
      ...Object.fromEntries(chapter2Flags.map((flag, index) => [flag, index === 0]))
    }));
    localStorage.setItem("bpmsoft-quest-chapter2-updated-at", now);
  }, { chapter1Flags, chapter2Flags });

  await page.reload();
  await expect(page.locator("#player-access-modal")).toBeHidden({ timeout: 30_000 });
  await expect(page.locator("#world-total-progress")).toHaveText("10 / 45", { timeout: 30_000 });

  await page.locator('[data-world-row="chapter2"] button').click();
  await page.locator("#world-entry-confirm").click();
  const initialSave = page.waitForResponse((response) => (
    response.request().method() === "PUT"
    && new URL(response.url()).pathname === "/api/account/progress/chapter2"
    && response.status() === 200
  ));
  await page.locator('[data-c2-zone="portal"]').first().click();
  await expect(page.locator("#chapter2-mission-view")).toBeVisible();
  await initialSave;

  let firstSaveAccepted;
  const firstSaveAcceptedPromise = new Promise((resolve) => {
    firstSaveAccepted = resolve;
  });
  let delayFirstSave = true;
  await page.route("**/api/account/progress/chapter2", async (route) => {
    if (route.request().method() !== "PUT" || !delayFirstSave) {
      await route.continue();
      return;
    }
    delayFirstSave = false;
    const response = await route.fetch();
    firstSaveAccepted();
    await new Promise((resolve) => setTimeout(resolve, 900));
    await route.fulfill({ response });
  });

  const correctAnswers = await page.evaluate(() => (
    window.BPMQuestChapter2.missions.portal.phases[0].slots.map((slot) => slot.correct)
  ));
  const selectCorrect = async (index) => {
    await page.locator(".c2-slot").nth(index).locator(`[data-option="${correctAnswers[index]}"]`).click();
  };

  await selectCorrect(0);
  await firstSaveAcceptedPromise;
  await selectCorrect(1);
  await page.waitForTimeout(350);
  await selectCorrect(2);
  await selectCorrect(3);
  await selectCorrect(4);

  await expect(page.locator("#chapter2-selection-count")).toHaveText("5 / 5");
  await expect(page.locator(".c2-slot .c2-answer.is-selected")).toHaveCount(5);
  await expect(page.locator("#chapter2-check-phase")).toBeEnabled();
  await page.waitForTimeout(1_200);
  await expect(page.locator("#chapter2-selection-count")).toHaveText("5 / 5");
  await page.locator("#chapter2-check-phase").click();
  await expect(page.locator("#chapter2-feedback-title")).toHaveText("Матрица согласована");
});
