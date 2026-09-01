import { expect, test, type Page } from "@playwright/test";

const TEST_PASSPHRASE = "filedrop-browser-test-passphrase";
const FILE_ID = "123e4567-e89b-42d3-a456-426614174001";
const SHARE_TOKEN = "A".repeat(43);
const FILE_NAME = "architecture-notes.pdf";
const FILE_CONTENT = "FileDrop browser contract fixture";
const FILE_EXPIRES_AT = "2099-09-02T08:00:00.000Z";

async function expectNoHorizontalOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    viewportWidth: window.innerWidth,
    documentWidth: document.documentElement.scrollWidth,
  }));

  expect(dimensions.documentWidth).toBeLessThanOrEqual(
    dimensions.viewportWidth,
  );
}

test("owner can sign in, upload, copy the share URL, and review activity", async ({
  page,
}) => {
  let signedIn = false;

  await page.route("**/api/auth/session", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ authenticated: signedIn }),
    });
  });

  await page.route("**/api/auth/login", async (route) => {
    expect(route.request().method()).toBe("POST");
    expect(route.request().postDataJSON()).toEqual({
      password: TEST_PASSPHRASE,
    });
    signedIn = true;

    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        authenticated: true,
        expiresAt: "2099-09-01T16:00:00.000Z",
      }),
    });
  });

  await page.route("**/api/uploads/initialize", async (route) => {
    expect(route.request().method()).toBe("POST");
    expect(route.request().postDataJSON()).toEqual({
      originalName: FILE_NAME,
      contentType: "application/pdf",
      sizeBytes: Buffer.byteLength(FILE_CONTENT),
      expirationSeconds: 86_400,
    });

    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        fileId: FILE_ID,
        fileExpiresAt: FILE_EXPIRES_AT,
        shareToken: SHARE_TOKEN,
        upload: {
          expiresAt: "2099-09-01T08:15:00.000Z",
          headers: {
            "Content-Type": "application/pdf",
            "If-None-Match": "*",
          },
          method: "PUT",
          url: `https://00000000000000000000000000000000.r2.cloudflarestorage.com/objects/${FILE_ID}`,
        },
      }),
    });
  });

  await page.route(
    "https://00000000000000000000000000000000.r2.cloudflarestorage.com/**",
    async (route) => {
      expect(route.request().method()).toBe("PUT");
      expect(route.request().headers()["content-type"]).toBe("application/pdf");
      expect(route.request().headers()["if-none-match"]).toBe("*");
      await route.fulfill({ status: 200 });
    },
  );

  await page.route("**/api/uploads/*/complete", async (route) => {
    expect(route.request().method()).toBe("POST");
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        fileId: FILE_ID,
        status: "READY",
        expiresAt: FILE_EXPIRES_AT,
        uploadedAt: "2099-09-01T08:01:00.000Z",
      }),
    });
  });

  await page.route("**/api/files", async (route) => {
    expect(signedIn).toBe(true);
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        limit: 50,
        files: [
          {
            id: FILE_ID,
            originalName: FILE_NAME,
            contentType: "application/pdf",
            sizeBytes: Buffer.byteLength(FILE_CONTENT),
            status: "READY",
            expiresAt: FILE_EXPIRES_AT,
            downloadCount: 2,
            lastDownloadedAt: "2099-09-01T09:00:00.000Z",
            createdAt: "2099-09-01T08:00:00.000Z",
          },
        ],
      }),
    });
  });

  await page.goto("/");
  await expect(page).toHaveTitle("FileDrop");
  await expectNoHorizontalOverflow(page);

  await page.getByRole("link", { name: "Open owner upload" }).click();
  await expect(
    page.getByRole("heading", { name: "Owner session required" }),
  ).toBeVisible();

  await page.getByRole("link", { name: "Go to owner sign in" }).click();
  await page.getByLabel("Owner passphrase").fill(TEST_PASSPHRASE);
  await page.getByRole("button", { name: "Create owner session" }).click();
  await expect(page.getByRole("status")).toContainText("Owner session created");

  await page.getByRole("link", { name: "Open upload" }).click();
  await page.getByLabel("File").setInputFiles({
    name: FILE_NAME,
    mimeType: "application/pdf",
    buffer: Buffer.from(FILE_CONTENT),
  });
  await page.getByRole("button", { name: "Upload and verify" }).click();

  const resultHeading = page.getByRole("heading", {
    name: `Upload ready: ${FILE_NAME}`,
  });
  await expect(resultHeading).toBeVisible();
  await expect(resultHeading).toBeFocused();

  const expectedShareUrl = await page.evaluate(
    (token) => new URL(`/d/${token}`, window.location.origin).toString(),
    SHARE_TOKEN,
  );
  await expect(page.getByText(expectedShareUrl, { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Copy share URL" }).click();
  await expect(page.getByRole("status")).toContainText("Share URL copied");
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toBe(expectedShareUrl);
  await expectNoHorizontalOverflow(page);

  await page.getByRole("link", { name: "View file activity" }).click();
  await expect(
    page.getByRole("heading", { name: FILE_NAME, exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Available", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Authorized handoffs", { exact: true }).locator(".."),
  ).toContainText("2");
  await expect(
    page.getByText("Downloads", { exact: true }).locator(".."),
  ).toContainText("2");
  await expectNoHorizontalOverflow(page);
});

test("keyboard users can skip repeated content", async ({ page }) => {
  await page.goto("/");

  const skipLink = page.getByRole("link", { name: "Skip to main content" });
  await page.keyboard.press("Tab");
  await expect(skipLink).toBeFocused();
  await page.keyboard.press("Enter");

  await expect(page.locator("#main-content")).toBeFocused();
});
