import { expect, test } from "@playwright/test";
const id = "123e4567-e89b-42d3-a456-426614174001";
const entry = {
  id,
  time: "2026-09-06T08:00:00.000Z",
  event: "upload.complete",
  level: "error",
  requestId: id,
  errorCode: "P2022",
};
test("owner can open, filter, inspect, page and export logs on desktop and mobile", async ({
  page,
}) => {
  await page.route("**/api/files", (route) =>
    route.fulfill({ json: { files: [], limit: 50 } }),
  );
  await page.route("**/api/owner/logs?**", async (route) => {
    const query = new URL(route.request().url()).searchParams;
    if (query.has("requestId")) expect(query.get("requestId")).toBe(id);
    const older = query.has("before");
    await route.fulfill({
      json: {
        entries: [
          { ...entry, event: older ? "files.expire" : "upload.complete" },
        ],
        next: older ? null : { before: entry.time, beforeId: id },
      },
    });
  });
  await page.goto("/files");
  await page.getByRole("link", { name: "View owner logs" }).click();
  await expect(
    page.getByRole("heading", { name: "upload.complete" }),
  ).toBeVisible();
  await page.getByLabel("Severity").selectOption("error");
  await page.getByLabel("Request ID", { exact: true }).fill(id);
  await page.getByRole("button", { name: "Apply filters" }).click();
  await expect(page.getByRole("status")).toHaveText("Showing 1 log entries.");
  await page.getByText("Details", { exact: true }).click();
  await expect(page.locator("pre")).toContainText(id);
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download this page" }).click();
  expect((await download).suggestedFilename()).toBe("filedrop-owner-logs.log");
  await page.getByRole("button", { name: "Older logs" }).click();
  await expect(
    page.getByRole("heading", { name: "files.expire" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Refresh logs" }).click();
  await expect(
    page.getByRole("heading", { name: "upload.complete" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
test("logs require a session and present recoverable database failures", async ({
  page,
}) => {
  let status = 401;
  await page.route("**/api/owner/logs?**", (route) =>
    route.fulfill({ status, json: { error: { code: "UNAVAILABLE" } } }),
  );
  await page.goto("/owner/logs");
  await expect(
    page.getByRole("heading", { name: "Owner session required" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Download this page" }),
  ).toHaveCount(0);
  status = 503;
  await page.reload();
  await expect(page.getByRole("status")).toContainText("Logs are unavailable");
  await expect(
    page.getByRole("button", { name: "Refresh logs" }),
  ).toBeEnabled();
});
