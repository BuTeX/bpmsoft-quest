import { expect, test } from "@playwright/test";

const account = {
  email: `e2e-${Date.now()}@example.com`,
  password: "e2e-account-password"
};

async function expectDesktopViewportFit(page, selector) {
  const metrics = await page.locator(selector).evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return {
      documentOverflow: document.documentElement.scrollHeight - window.innerHeight,
      horizontalOverflow: document.documentElement.scrollWidth - window.innerWidth,
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
      left: rect.left,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight
    };
  });

  expect(metrics.documentOverflow).toBeLessThanOrEqual(1);
  expect(metrics.horizontalOverflow).toBeLessThanOrEqual(1);
  expect(metrics.top).toBeGreaterThanOrEqual(-1);
  expect(metrics.left).toBeGreaterThanOrEqual(-1);
  expect(metrics.right).toBeLessThanOrEqual(metrics.viewportWidth + 1);
  expect(metrics.bottom).toBeLessThanOrEqual(metrics.viewportHeight + 1);
}

test("public landing explains the product and exposes rendered legal pages", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  await expect(page.getByRole("heading", { level: 1 })).toContainText("Принимайте решения");
  await expect(page.getByRole("link", { name: "Начать прохождение" })).toHaveAttribute("href", "/academy.html");
  await expect(page.locator(".chapter-grid article")).toHaveCount(5);
  await expect(page.locator(".hero-visual img")).toHaveJSProperty("complete", true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);

  await page.getByRole("link", { name: "Конфиденциальность" }).click();
  await expect(page.getByRole("heading", { name: "Политика конфиденциальности" })).toBeVisible();
  await expect(page.locator("body")).not.toContainText("{{");
  await expect(page.locator("body")).toContainText("Оператор сервиса");
});

test("critical player journey loads all maps and protects modal focus", async ({ page }) => {
  const unexpectedResponses = [];
  page.on("response", (response) => {
    const expectedProgressConflict = response.status() === 409
      && response.request().method() === "PUT"
      && new URL(response.url()).pathname.startsWith("/api/account/progress/");
    if (
      response.status() >= 400
      && !(response.status() === 401 && response.url().endsWith("/api/auth/session"))
      && !expectedProgressConflict
    ) unexpectedResponses.push(`${response.status()} ${response.url()}`);
  });

  await page.goto("/academy.html");
  await expect(page.locator("html")).toHaveClass(/visual-update/);
  await expect(page.locator("html")).toHaveClass(/living-world-update/);
  await expect(page.locator(".living-world-layer")).toHaveCount(6);
  const primaryHeaderHeight = await page.locator(".topbar").evaluate((element) => element.getBoundingClientRect().height);
  expect(primaryHeaderHeight).toBeLessThanOrEqual(132);
  await expect(page.locator("#player-access-modal")).toBeVisible();
  await page.getByRole("tab", { name: "Регистрация" }).click();
  await page.locator("#player-name").fill("E2E Аналитик");
  await page.locator("#player-email").fill(account.email);
  await page.locator("#player-password").fill(account.password);
  await page.locator("#player-password-confirm").fill(account.password);
  await page.locator("#player-terms-accepted").check();
  await page.locator("#player-privacy-accepted").check();
  await page.getByRole("button", { name: "Создать аккаунт" }).click();

  await expect(page.locator("#player-profile")).toBeVisible({ timeout: 30_000 });
  await expect(page.locator("#world-map-view")).toBeVisible();
  await expect(page.locator("#world-total-progress")).toHaveText("0 / 45");
  await expect(page.locator(".world-city-node")).toHaveCount(5);
  await expect(page.locator(".world-overview-stage .living-world-badge")).toBeVisible();
  await expect(page.locator(".world-overview-image")).toHaveJSProperty("complete", true);
  await expect(page.locator(".world-overview-image")).toHaveCSS("transform", "none");
  await expect(page.locator("#chapter-switcher")).toBeVisible();
  await expect(page.locator("#show-world-map")).toHaveClass(/is-active/);
  await expect(page.locator("#show-second-chapter")).toBeDisabled();
  await expect(page.locator('[data-world-row="chapter1"]')).toHaveClass(/is-current/);
  await expect(page.locator('[data-world-row="chapter2"]')).toHaveClass(/is-locked/);
  await expect(page.locator("script[src^='chapter4.js']")).toHaveCount(1);
  await expect(page.locator("script[src^='chapter5.js']")).toHaveCount(1);
  await expect(page).toHaveTitle("Академия Гуд Программ | BPMSoft Quest");

  for (const viewport of [
    { width: 1920, height: 720 },
    { width: 1440, height: 800 },
    { width: 1024, height: 768 }
  ]) {
    await page.setViewportSize(viewport);
    await expectDesktopViewportFit(page, ".world-overview-layout");
  }
  await page.setViewportSize({ width: 1280, height: 720 });

  await page.locator('[data-world-row="chapter1"] button').click();
  await expect(page.locator("#world-entry-modal")).toBeVisible();
  await expect(page.locator("#world-entry-title")).toHaveText("Открыть карту — Академия аналитиков?");
  await expect(page.locator("main")).toHaveAttribute("inert", "");
  await page.locator("#world-entry-confirm").click();
  await expect(page.locator("#map-title")).toHaveText("Базовый курс");
  await expectDesktopViewportFit(page, ".map-layout");
  await page.locator('[data-zone="interface"]').first().click();
  await expect(page.locator("#mission-intro")).toBeVisible();
  await expect(page.locator("main")).toHaveAttribute("inert", "");
  await page.locator("#mission-intro-start").click();
  await expect(page.locator("#mission-view")).toBeVisible();
  await expectDesktopViewportFit(page, ".mission-layout");
  await expect(page.locator(".mission-actions")).toBeInViewport();
  await page.locator("#back-to-map").click();
  await expect(page.locator("#mission-intro")).toBeHidden();

  await page.locator("#player-profile").click();
  await expect(page.locator("#player-access-modal")).toBeVisible();
  await expect(page.locator("main")).toHaveAttribute("inert", "");
  await page.getByText("Изучение и осмотр", { exact: true }).click();
  await expect(page.locator("#player-mode-study")).toBeChecked();
  await page.locator("#player-access-submit").click();
  await expect(page.locator("#player-access-modal")).toBeHidden();
  await page.locator("#show-world-map").click();
  for (const chapter of ["chapter1", "chapter2", "chapter3", "chapter4", "chapter5"]) {
    await expect(page.locator(`[data-world-row="${chapter}"] button`)).toHaveAttribute("aria-disabled", "false");
  }

  await page.locator('[data-world-row="chapter2"] button').click();
  await page.locator("#world-entry-confirm").click();
  await expect(page.locator("#chapter2-prologue")).toBeVisible();
  await page.locator("#chapter2-prologue-start").click();
  await page.locator('[data-c2-zone="portal"]').first().click();
  await expect(page.locator("#chapter2-mission-intro")).toBeVisible();
  await page.locator("#chapter2-mission-intro-start").click();
  await expect(page.locator("#chapter2-mission-view")).toBeVisible();
  await expectDesktopViewportFit(page, ".c2-mission-layout");
  const chapter2Board = page.locator("#chapter2-board");
  await expect(chapter2Board).toHaveCSS("overflow-y", "auto");
  const chapter2BoardMetrics = await chapter2Board.evaluate((board) => ({
    clientHeight: board.clientHeight,
    scrollHeight: board.scrollHeight
  }));
  expect(chapter2BoardMetrics.scrollHeight).toBeGreaterThan(chapter2BoardMetrics.clientHeight);
  await chapter2Board.evaluate((board) => {
    board.scrollTop = board.scrollHeight;
  });
  expect(await chapter2Board.evaluate((board) => board.scrollTop)).toBeGreaterThan(0);
  await expect(page.locator(".c2-slot:last-child .c2-answer:last-child")).toBeInViewport();
  await page.locator("#chapter2-back-to-map").click();
  await page.locator("#show-world-map").click();

  await page.locator('.world-city-node[data-world-chapter="chapter5"]').click();
  await expect(page.locator("#world-entry-title")).toHaveText("Открыть карту — Авиакомпания «Гуд Авиа»?");
  await page.locator("#world-entry-confirm").click();
  await expect(page.locator("#chapter5-prologue")).toBeVisible();
  await page.locator("#chapter5-prologue-start").click();
  await expect(page.locator("#chapter-navigation-context")).toContainText("Гуд Авиа");
  await page.locator("#show-world-map").click();
  await page.locator('[data-world-row="chapter1"] button').click();
  await page.locator("#world-entry-confirm").click();
  await expect(page.locator("#map-title")).toHaveText("Все задания Академии");

  await page.goto("/update");
  await expect(page.locator("html")).toHaveClass(/living-world-update/);
  await expect(page.locator("#player-profile")).toBeVisible();
  await expect(page.locator("#world-map-view")).toBeVisible();
  await expect(page.locator(".world-overview-stage .living-world-badge")).toBeVisible();
  await expect(page.locator(".living-world-layer")).toHaveCount(6);
  await page.locator('[data-world-row="chapter1"] button').click();
  await page.locator("#world-entry-confirm").click();
  await expect(page.locator("#map-title")).toHaveText("Все задания Академии");
  await expect(page.locator(".world-stage .living-world-badge")).toBeVisible();
  await expect(page.locator('.living-world-layer[data-effect-count="5"]')).toHaveCount(6);
  const cityEffectSets = await page.locator("[data-living-world]").evaluateAll((stages) =>
    stages.map((stage) => stage.getAttribute("data-world-effects"))
  );
  expect(new Set(cityEffectSets).size).toBe(6);
  expect(cityEffectSets.every((effects) => effects?.split(" ").length === 5)).toBe(true);
  const flyingFigures = await page.locator("[data-living-world]").evaluateAll((stages) =>
    stages.map((stage) => {
      const passage = stage.querySelector(".living-world-passage-primary");
      const style = passage ? getComputedStyle(passage, "::after") : null;
      return style ? `${style.clipPath}|${style.borderRadius}|${style.backgroundImage}` : "";
    })
  );
  expect(new Set(flyingFigures).size).toBe(6);
  const worldProcessElements = page.locator('.world-overview-stage [data-process-element]');
  await expect(worldProcessElements).toHaveCount(6);
  expect(await worldProcessElements.evaluateAll((elements) =>
    new Set(elements.map((element) => element.getAttribute("data-process-element"))).size
  )).toBe(6);
  await expect(page.locator(".world-stage [data-process-element]")).toHaveCount(0);
  await expect(page.locator(".world-stage .living-world-effect-comets .living-world-passage")).toHaveCount(3);

  expect(unexpectedResponses).toEqual([]);
});

test("admin analytics shows live event telemetry", async ({ page }) => {
  await page.goto("/admin.html");
  await expect(page.locator("#admin-auth")).toBeVisible();
  await page.locator("#admin-password").fill("e2e-admin-password");
  await page.locator("#auth-submit").click();
  await expect(page.locator("#admin-auth")).toBeHidden();
  await expect(page.locator("#data-source")).toContainText("Живые события");
  await expect(page.locator("#page-title")).toHaveText("Сводка Академии");
});

test("mobile login dialog has no horizontal overflow and traps focus", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/academy.html");
  const dialog = page.locator("#player-access-form");
  await expect(dialog).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  for (let index = 0; index < 12; index += 1) await page.keyboard.press("Tab");
  expect(await page.evaluate(() => document.querySelector("#player-access-form")?.contains(document.activeElement))).toBe(true);
});
