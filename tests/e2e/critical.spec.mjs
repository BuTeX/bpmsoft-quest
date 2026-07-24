import { expect, test } from "@playwright/test";

const account = {
  email: `e2e-${Date.now()}@example.com`,
  password: "e2e-account-password"
};

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
    if (
      response.status() >= 400
      && !(response.status() === 401 && response.url().endsWith("/api/auth/session"))
    ) unexpectedResponses.push(`${response.status()} ${response.url()}`);
  });

  await page.goto("/academy.html");
  await expect(page.locator("html")).toHaveClass(/visual-update/);
  await expect(page.locator("html")).toHaveClass(/living-world-update/);
  await expect(page.locator(".living-world-layer")).toHaveCount(5);
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
  await expect(page.locator("#map-title")).toHaveText("Базовый курс");
  await expect(page.locator("#chapter-switcher")).toBeVisible();
  await expect(page.locator("#show-first-chapter")).toBeEnabled();
  await expect(page.locator("#show-second-chapter")).toBeDisabled();
  await expect(page.locator("script[src^='chapter4.js']")).toHaveCount(1);
  await expect(page.locator("script[src^='chapter5.js']")).toHaveCount(1);

  await page.locator('[data-zone="interface"]').first().click();
  await expect(page.locator("#mission-intro")).toBeVisible();
  await expect(page.locator("main")).toHaveAttribute("inert", "");
  await page.keyboard.press("Escape");
  await expect(page.locator("#mission-intro")).toBeHidden();

  await page.locator("#player-profile").click();
  await expect(page.locator("#player-access-modal")).toBeVisible();
  await expect(page.locator("main")).toHaveAttribute("inert", "");
  await page.getByText("Изучение и осмотр", { exact: true }).click();
  await expect(page.locator("#player-mode-study")).toBeChecked();
  await page.locator("#player-access-submit").click();
  await expect(page.locator("#player-access-modal")).toBeHidden();
  for (const id of ["show-first-chapter", "show-second-chapter", "show-third-chapter", "show-fourth-chapter", "show-fifth-chapter"]) {
    await expect(page.locator(`#${id}`)).toBeEnabled();
  }
  await page.locator("#show-fifth-chapter").click();
  await expect(page.locator("#chapter5-prologue")).toBeVisible();
  await page.locator("#chapter5-prologue-start").click();
  await expect(page.locator("#show-fifth-chapter")).toHaveClass(/is-active/);
  await page.locator("#show-first-chapter").click();
  await expect(page.locator("#map-title")).toHaveText("Все задания Академии");

  await page.goto("/update");
  await expect(page.locator("html")).toHaveClass(/living-world-update/);
  await expect(page.locator("#player-profile")).toBeVisible();
  await expect(page.locator("#map-title")).toHaveText("Все задания Академии");
  await expect(page.locator(".living-world-layer")).toHaveCount(5);
  await expect(page.locator(".world-stage .living-world-badge")).toBeVisible();
  await expect(page.locator('.living-world-layer[data-effect-count="5"]')).toHaveCount(5);
  const cityEffectSets = await page.locator("[data-living-world]").evaluateAll((stages) =>
    stages.map((stage) => stage.getAttribute("data-world-effects"))
  );
  expect(new Set(cityEffectSets).size).toBe(5);
  expect(cityEffectSets.every((effects) => effects?.split(" ").length === 5)).toBe(true);
  const flyingFigures = await page.locator("[data-living-world]").evaluateAll((stages) =>
    stages.map((stage) => {
      const passage = stage.querySelector(".living-world-passage-primary");
      const style = passage ? getComputedStyle(passage, "::after") : null;
      return style ? `${style.clipPath}|${style.borderRadius}|${style.backgroundImage}` : "";
    })
  );
  expect(new Set(flyingFigures).size).toBe(5);

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
