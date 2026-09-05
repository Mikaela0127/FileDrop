import { NextRequest } from "next/server";
import { expect, it, vi } from "vitest";
import { createClientDiagnosticsHandler } from "./client-diagnostics-handler";
import { OWNER_SESSION_COOKIE_NAME } from "../../../auth/delivery/http/owner-auth-handlers";

const origin = "https://filedrop.example.test";
function request(body: unknown, session = "owner", source = origin) {
  return new NextRequest(`${origin}/api/diagnostics`, {
    method: "POST",
    headers: {
      Origin: source,
      Cookie: `${OWNER_SESSION_COOKIE_NAME}=${session}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}
it("bounds authenticated client reporting and rejects arbitrary diagnostic text", async () => {
  const output = vi.spyOn(console, "log").mockImplementation(() => {});
  try {
    const handler = createClientDiagnosticsHandler({
      appOrigin: origin,
      authentication: {
        authenticate: vi.fn(),
        isAuthenticated: async (token) => token === "owner",
      },
    });
    expect((await handler(request({ stage: "render" }, ""))).status).toBe(401);
    expect(
      (
        await handler(
          request({ stage: "render" }, "owner", "https://attacker.example"),
        )
      ).status,
    ).toBe(403);
    expect(
      (await handler(request({ stage: "render", error: "PRIVATE_VALUE" })))
        .status,
    ).toBe(400);
    expect((await handler(request({ stage: "unknown" }))).status).toBe(400);
    expect((await handler(request({ stage: "direct-upload" }))).status).toBe(
      202,
    );
    for (let i = 0; i < 30; i++) await handler(request({ stage: "render" }));
    expect((await handler(request({ stage: "render" }))).status).toBe(429);
    expect(JSON.stringify(output.mock.calls)).not.toContain("PRIVATE_VALUE");
  } finally {
    output.mockRestore();
  }
});
