import { expect, test } from "@playwright/test";
const id = "123e4567-e89b-42d3-a456-426614174001";
const token = "A".repeat(43);
const fixture = {
  id,
  originalName: "managed-file.txt",
  contentType: "text/plain",
  sizeBytes: 42,
  status: "READY",
  expiresAt: "2099-01-01T00:00:00.000Z",
  createdAt: "2026-01-01T00:00:00.000Z",
  downloadCount: 2,
  lastDownloadedAt: null,
  canRecoverShareLink: true,
};

test("owner retrieves a stable link and confirms expiry and retryable record deletion", async ({
  page,
}) => {
  let status = "READY";
  let removed = false;
  let expiryCalls = 0;
  let removalCalls = 0;
  await page.route("**/api/files", (route) =>
    route.fulfill({
      json: { files: removed ? [] : [{ ...fixture, status }], limit: 50 },
    }),
  );
  await page.route(`**/api/files/${id}/share`, async (route) => {
    expect(route.request().postDataJSON()).toEqual({ confirmed: false });
    await route.fulfill({
      json: { url: new URL(`/d/${token}`, route.request().url()).toString() },
    });
  });
  await page.route(`**/api/files/${id}/expire`, async (route) => {
    expect(route.request().postDataJSON()).toEqual({ confirmed: true });
    expiryCalls++;
    status = "EXPIRED";
    await route.fulfill({ json: { success: true } });
  });
  await page.route(`**/api/files/${id}`, async (route) => {
    expect(route.request().method()).toBe("DELETE");
    expect(route.request().postDataJSON()).toEqual({ confirmed: true });
    removalCalls++;
    if (removalCalls === 1)
      return route.fulfill({
        status: 503,
        headers: { "X-Request-ID": id },
        json: { error: { code: "FILE_MANAGEMENT_UNAVAILABLE" } },
      });
    removed = true;
    await route.fulfill({ json: { success: true } });
  });
  await page.goto("/files");
  await page.getByRole("button", { name: "Get share link" }).click();
  await expect(page.getByRole("textbox", { name: "Share link" })).toHaveValue(
    new RegExp(`/d/${token}$`),
  );
  const original = await page
    .getByRole("textbox", { name: "Share link" })
    .inputValue();
  await page.getByRole("button", { name: "Get share link" }).click();
  await expect(page.getByRole("textbox", { name: "Share link" })).toHaveValue(
    original,
  );
  await page.getByRole("button", { name: "Copy link", exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toBe(original);

  await page.getByRole("button", { name: "Expire file", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("button", { name: "Cancel" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  expect(expiryCalls).toBe(0);
  await page.getByRole("button", { name: "Expire file", exact: true }).click();
  await dialog.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(page.getByText("Expired", { exact: true })).toBeVisible();
  expect(expiryCalls).toBe(1);
  await expect(
    page.getByRole("button", { name: "Get share link" }),
  ).toHaveCount(0);

  await page
    .getByRole("button", { name: "Delete record", exact: true })
    .click();
  await dialog.getByRole("button", { name: "Cancel" }).click();
  expect(removalCalls).toBe(0);
  await page
    .getByRole("button", { name: "Delete record", exact: true })
    .click();
  await dialog.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(dialog.getByRole("status")).toContainText(`Reference: ${id}`);
  await expect(
    page.getByRole("heading", { name: fixture.originalName, exact: true }),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "No file records yet" }),
  ).toBeVisible();
  expect(removalCalls).toBe(2);
});

test("an upload that can no longer complete is shown as failed and can be deleted", async ({
  page,
}) => {
  const recentId = "123e4567-e89b-42d3-a456-426614174002";
  let removed = false;
  await page.route(`**/api/files/${id}`, async (route) => {
    expect(route.request().method()).toBe("DELETE");
    expect(route.request().postDataJSON()).toEqual({ confirmed: true });
    removed = true;
    await route.fulfill({ json: { success: true } });
  });
  await page.route("**/api/files", (route) =>
    route.fulfill({
      json: {
        files: [
          ...(removed
            ? []
            : [
                {
                  ...fixture,
                  originalName: "abandoned.mp4",
                  status: "PENDING",
                  canRecoverShareLink: true,
                },
              ]),
          {
            ...fixture,
            id: recentId,
            originalName: "in-flight.mp4",
            status: "PENDING",
            createdAt: new Date().toISOString(),
          },
        ],
        limit: 50,
      },
    }),
  );
  await page.goto("/files");

  const abandoned = page
    .getByRole("heading", { name: "abandoned.mp4", exact: true })
    .locator("xpath=ancestor::li[1]");
  const inFlight = page
    .getByRole("heading", { name: "in-flight.mp4", exact: true })
    .locator("xpath=ancestor::li[1]");
  await expect(
    abandoned.getByText("Upload failed", { exact: true }),
  ).toBeVisible();
  await expect(
    abandoned.getByRole("button", { name: "Delete record", exact: true }),
  ).toBeVisible();
  await expect(
    inFlight.getByText("Pending upload", { exact: true }),
  ).toBeVisible();
  await expect(inFlight.getByRole("button")).toHaveCount(0);

  await abandoned
    .getByRole("button", { name: "Delete record", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Confirm", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "abandoned.mp4", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "in-flight.mp4", exact: true }),
  ).toBeVisible();
  expect(removed).toBe(true);
});

test("legacy files warn before replacement and the management modal fits narrow screens", async ({
  page,
}) => {
  let shareCalls = 0;
  await page.route("**/api/files", (route) =>
    route.fulfill({
      json: { files: [{ ...fixture, canRecoverShareLink: false }], limit: 50 },
    }),
  );
  await page.route(`**/api/files/${id}/share`, async (route) => {
    shareCalls++;
    expect(route.request().postDataJSON()).toEqual({
      confirmed: shareCalls === 1,
    });
    await route.fulfill({
      json: { url: new URL(`/d/${token}`, route.request().url()).toString() },
    });
  });
  await page.goto("/files");
  await page.getByRole("button", { name: "Create replacement link" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("invalidate its previous share link");
  const box = await dialog.boundingBox();
  expect(box!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  await dialog.getByRole("button", { name: "Cancel" }).click();
  expect(shareCalls).toBe(0);
  await page.getByRole("button", { name: "Create replacement link" }).click();
  await dialog.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Share link" })).toBeVisible();
  await page.getByRole("button", { name: "Get share link" }).click();
  await expect.poll(() => shareCalls).toBe(2);
  const dimensions = await page.evaluate(() => ({
    width: window.innerWidth,
    document: document.documentElement.scrollWidth,
  }));
  expect(dimensions.document).toBeLessThanOrEqual(dimensions.width);
});
