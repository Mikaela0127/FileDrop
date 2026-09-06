import { expect, test } from "@playwright/test";

const fileId = "123e4567-e89b-42d3-a456-426614174001";
const file = {
  id: fileId,
  originalName: "language-test.txt",
  contentType: "text/plain",
  sizeBytes: 42,
  status: "READY",
  expiresAt: "2099-01-01T00:00:00.000Z",
  createdAt: "2026-01-01T00:00:00.000Z",
  downloadCount: 1,
  lastDownloadedAt: null,
  canRecoverShareLink: true,
};

test("English is the default and a selected Chinese language persists across the owner interface", async ({
  page,
}) => {
  await page.route("**/api/auth/session", (route) =>
    route.fulfill({ json: { authenticated: false } }),
  );
  await page.route("**/api/files", (route) =>
    route.fulfill({ json: { files: [file], limit: 50 } }),
  );
  await page.route("**/api/owner/logs?**", (route) =>
    route.fulfill({
      json: {
        entries: [],
        next: null,
        retentionDays: 7,
        maximumRecords: 10_000,
      },
    }),
  );

  await page.goto("/");
  const language = page.getByRole("button", { name: "Language: English" });
  await expect(language).toHaveAttribute("aria-expanded", "false");
  await expect(
    page.getByRole("heading", {
      name: "Private file sharing, built to expire.",
    }),
  ).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  const triggerBounds = await language.boundingBox();
  const closedMainBounds = await page.getByRole("main").boundingBox();
  expect(triggerBounds!.y + triggerBounds!.height).toBeLessThanOrEqual(
    closedMainBounds!.y,
  );

  await language.click();
  const panelBounds = await page
    .getByRole("group", { name: "Language", exact: true })
    .boundingBox();
  const openMainBounds = await page.getByRole("main").boundingBox();
  expect(openMainBounds!.y).toBe(closedMainBounds!.y);
  expect(panelBounds!.y).toBeGreaterThanOrEqual(
    triggerBounds!.y + triggerBounds!.height,
  );
  expect(panelBounds!.x).toBeGreaterThanOrEqual(0);
  expect(panelBounds!.x + panelBounds!.width).toBeLessThanOrEqual(
    page.viewportSize()!.width,
  );
  await expect(
    page.getByRole("button", { name: "English", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("Escape");
  await expect(language).toBeFocused();
  await expect(language).toHaveAttribute("aria-expanded", "false");
  expect((await page.getByRole("main").boundingBox())!.y).toBe(
    closedMainBounds!.y,
  );
  await language.click();
  await page.getByRole("button", { name: "简体中文", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "私密文件分享，按时自动过期。" }),
  ).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
  expect(
    await page.evaluate(() => localStorage.getItem("filedrop-language")),
  ).toBe("zh-CN");

  await page.goto("/login");
  await expect(page.getByLabel("管理员口令")).toBeVisible();
  await page.goto("/upload");
  await expect(
    page.getByRole("heading", { name: "需要管理员会话" }),
  ).toBeVisible();
  await page.goto("/files");
  await expect(page.getByText("可用", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "使文件过期" }).click();
  await expect(page.getByRole("dialog")).toContainText("此操作无法撤销");
  await page.getByRole("button", { name: "取消" }).click();
  await page.goto("/owner/logs");
  await expect(page.getByRole("heading", { name: "管理员日志" })).toBeVisible();
  await expect(page.getByRole("button", { name: "刷新日志" })).toBeVisible();

  await page.goto("/missing-language-test-page");
  await expect(page.getByRole("heading", { name: "找不到页面" })).toBeVisible();

  await page.getByRole("button", { name: "语言: 简体中文" }).click();
  await page.getByRole("button", { name: "繁體中文", exact: true }).click();
  await expect(page.getByRole("heading", { name: "找不到頁面" })).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "語言: 繁體中文" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "語言: 繁體中文" }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-TW");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
