import { describe, expect, it } from "vitest";

import { createHealthResponse } from "./health-response";

describe("health response", () => {
  it("reports only the public liveness contract without caching", async () => {
    const response = createHealthResponse();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      service: "filedrop",
      status: "ok",
    });
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("pragma")).toBe("no-cache");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("does not disclose deployment or dependency details", async () => {
    const body = JSON.stringify(await createHealthResponse().json());

    expect(body).not.toContain("database");
    expect(body).not.toContain("storage");
    expect(body).not.toContain("version");
    expect(body).not.toContain("environment");
  });
});
