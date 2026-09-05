import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";
import { createOwnerLogsHandler } from "./owner-logs-handler";
import { OWNER_SESSION_COOKIE_NAME } from "../../auth/delivery/http/owner-auth-handlers";
const id = "123e4567-e89b-42d3-a456-426614174001";
function setup() {
  const repository = { list: vi.fn(async () => ({ entries: [], next: null })) };
  const handler = createOwnerLogsHandler(
    {
      authenticate: vi.fn(),
      isAuthenticated: async (token) => token === "owner",
    },
    repository,
  );
  return { repository, handler };
}
function request(query = "", session = "owner") {
  return new NextRequest(
    `https://filedrop.example.test/api/owner/logs${query}`,
    { headers: { cookie: `${OWNER_SESSION_COOKIE_NAME}=${session}` } },
  );
}
describe("owner-only logs", () => {
  it("rejects anonymous access before any log query", async () => {
    const s = setup();
    expect((await s.handler(request("", ""))).status).toBe(401);
    expect(s.repository.list).not.toHaveBeenCalled();
  });
  it("returns bounded uncached results and validates severity and UUID filters", async () => {
    const s = setup();
    const response = await s.handler(request(`?level=error&requestId=${id}`));
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("Vary")).toBe("Cookie");
    expect(s.repository.list).toHaveBeenCalledWith({
      level: "error",
      requestId: id,
    });
    expect(await response.json()).toMatchObject({
      retentionDays: 7,
      maximumRecords: 10_000,
    });
  });
  it.each([
    "?level=unknown",
    "?requestId=secret",
    "?limit=100000",
    "?level=all&level=error",
    "?before=2026-09-01T00:00:00.000Z",
    "?beforeId=" + id,
  ])("rejects invalid/unbounded queries %s", async (query) => {
    const s = setup();
    expect((await s.handler(request(query))).status).toBe(400);
    expect(s.repository.list).not.toHaveBeenCalled();
  });
  it("does not expose database error details or recursively write logs", async () => {
    const s = setup();
    s.repository.list.mockRejectedValue(new Error("private credential"));
    const response = await s.handler(request());
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("private credential");
  });
});
