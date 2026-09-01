import { expect, test } from "@playwright/test";

test("production responses include the global browser security policy", async ({
  page,
}) => {
  const response = await page.goto("/");
  const headers = response?.headers();

  expect(headers).toBeDefined();
  expect(headers?.["content-security-policy"]).toContain(
    "connect-src 'self' https://*.r2.cloudflarestorage.com",
  );
  expect(headers?.["content-security-policy"]).toContain(
    "frame-ancestors 'none'",
  );
  expect(headers?.["referrer-policy"]).toBe("no-referrer");
  expect(headers?.["strict-transport-security"]).toBe(
    "max-age=31536000; includeSubDomains",
  );
  expect(headers?.["x-content-type-options"]).toBe("nosniff");
  expect(headers?.["x-frame-options"]).toBe("DENY");
});
