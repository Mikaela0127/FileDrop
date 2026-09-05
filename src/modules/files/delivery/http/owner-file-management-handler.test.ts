import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createOwnerFileManagementHandler,
  type ManagementAction,
} from "./owner-file-management-handler";
import { OWNER_SESSION_COOKIE_NAME } from "../../../auth/delivery/http/owner-auth-handlers";
import { FileManagementError } from "../../application/manage-owner-file";
const origin = "https://filedrop.example.test";
const id = "123e4567-e89b-42d3-a456-426614174001";
function setup() {
  const management = {
    share: vi.fn(async () => ({ token: "A".repeat(43) })),
    expire: vi.fn(async () => {}),
    remove: vi.fn(async () => {}),
  };
  const authentication = {
    authenticate: vi.fn(),
    isAuthenticated: vi.fn(async (token) => token === "owner"),
  };
  return {
    management,
    handler: createOwnerFileManagementHandler({
      appOrigin: origin,
      authentication,
      management,
    }),
  };
}
function request(body: unknown, session = "owner", requestOrigin = origin) {
  return new NextRequest(`${origin}/api/files/${id}`, {
    method: "POST",
    headers: {
      Origin: requestOrigin,
      Cookie: `${OWNER_SESSION_COOKIE_NAME}=${session}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}
afterEach(() => vi.restoreAllMocks());
describe("owner management HTTP boundary", () => {
  it.each(["share", "expire", "remove"] as ManagementAction[])(
    "protects %s from anonymous and cross-origin requests before any mutation",
    async (action) => {
      const s = setup();
      expect(
        (await s.handler(request({ confirmed: true }, ""), id, action)).status,
      ).toBe(401);
      expect(
        (
          await s.handler(
            request({ confirmed: true }, "owner", "https://attacker.example"),
            id,
            action,
          )
        ).status,
      ).toBe(403);
      expect(s.management[action]).not.toHaveBeenCalled();
    },
  );
  it.each(["expire", "remove"] as ManagementAction[])(
    "requires a literal confirmation boolean for %s",
    async (action) => {
      const s = setup();
      expect((await s.handler(request({}), id, action)).status).toBe(409);
      expect(
        (await s.handler(request({ confirmed: "true" }), id, action)).status,
      ).toBe(400);
      expect(s.management[action]).not.toHaveBeenCalled();
      expect(
        (await s.handler(request({ confirmed: true }), id, action)).status,
      ).toBe(200);
    },
  );
  it("rejects malformed IDs, oversized bodies and unknown fields", async () => {
    const s = setup();
    expect((await s.handler(request({}), "bad-id", "share")).status).toBe(400);
    expect(
      (await s.handler(request({ secret: "x".repeat(1000) }), id, "share"))
        .status,
    ).toBe(400);
    expect(
      (await s.handler(request({ secret: "x" }), id, "share")).status,
    ).toBe(400);
    expect(s.management.share).not.toHaveBeenCalled();
  });
  it("returns the owner link with no caching and no hash or ciphertext", async () => {
    const s = setup();
    const response = await s.handler(request({}), id, "share");
    expect(await response.json()).toEqual({
      url: `${origin}/d/${"A".repeat(43)}`,
    });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("Vary")).toBe("Cookie");
  });
  it("maps expected conflicts and hides raw provider failures", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const s = setup();
    s.management.remove.mockRejectedValueOnce(
      new FileManagementError("UPLOAD_GRANT_ACTIVE"),
    );
    expect(
      (await s.handler(request({ confirmed: true }), id, "remove")).status,
    ).toBe(409);
    s.management.remove.mockRejectedValueOnce(
      new Error("PRIVATE_DATABASE_CREDENTIAL"),
    );
    const response = await s.handler(
      request({ confirmed: true }),
      id,
      "remove",
    );
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("PRIVATE_DATABASE_CREDENTIAL");
  });
});
