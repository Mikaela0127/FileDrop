import { afterEach, describe, expect, it, vi } from "vitest";
import {
  logEvent,
  observeRequest,
  configureLogSink,
  captureLogs,
  resolveApplicationRevision,
} from "./logger";
import { classifyLogError } from "./log-error-codes";
afterEach(() => {
  configureLogSink(undefined);
  vi.useRealTimers();
  vi.restoreAllMocks();
});
describe("safe structured logging", () => {
  it("awaits a sanitized, bounded batch before completing a request", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const sink = vi.fn(async () => {});
    configureLogSink(sink);
    const response = await observeRequest("files.share", async () => {
      logEvent("files.share", {
        fileId: "123e4567-e89b-42d3-a456-426614174001",
      });
      return Response.json({});
    });
    expect(sink).toHaveBeenCalledTimes(1);
    expect(sink.mock.calls[0]).toMatchObject([
      [
        {
          event: "files.share",
          requestId: response.headers.get("X-Request-ID"),
        },
      ],
    ]);
    sink.mockClear();
    await observeRequest("files.list", async () => Response.json({}));
    expect(sink).not.toHaveBeenCalled();
    await captureLogs(async () => {
      for (let index = 0; index < 100; index++)
        logEvent("server.error", { error: new Error("private text") });
    });
    expect((sink.mock.calls[0] as unknown as [unknown[]])[0]).toHaveLength(32);
    expect(JSON.stringify(sink.mock.calls)).not.toContain("private text");
  });
  it("fails open with a cooldown if the database sink rejects", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    const sink = vi.fn(async () => {
      throw new Error("private connection string");
    });
    configureLogSink(sink);
    for (let i = 0; i < 2; i++) {
      const response = await observeRequest("files.share", async () => {
        logEvent("files.share", {
          fileId: "123e4567-e89b-42d3-a456-426614174001",
        });
        return Response.json({ success: true });
      });
      expect(response.status).toBe(200);
    }
    expect(sink).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(warning.mock.calls)).not.toContain(
      "private connection string",
    );
  });
  it("bounds the wait when persistence hangs", async () => {
    vi.useFakeTimers();
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    configureLogSink(() => new Promise(() => {}));
    const response = observeRequest("files.share", async () => {
      logEvent("client.error", { clientStage: "render" });
      return Response.json({});
    });
    await vi.advanceTimersByTimeAsync(2100);
    expect((await response).status).toBe(200);
  });
  it("recognizes fixed provider codes without exposing unknown names or codes", () => {
    expect(
      classifyLogError({ code: "P2022", message: "private schema detail" }),
    ).toBe("P2022");
    expect(classifyLogError({ name: "AccessDenied" })).toBe("AccessDenied");
    expect(classifyLogError({ name: "PRIVATE", code: "PRIVATE" })).toBe(
      "OPERATION_FAILED",
    );
  });
  it("uses a provider-neutral deployment revision with a Vercel fallback", () => {
    expect(
      resolveApplicationRevision({
        APP_REVISION: "0123456789abcdef0123456789abcdef01234567",
        VERCEL_GIT_COMMIT_SHA: "abcdef1",
      }),
    ).toBe("0123456789abcdef0123456789abcdef01234567");
    expect(
      resolveApplicationRevision({ VERCEL_GIT_COMMIT_SHA: "abcdef1" }),
    ).toBe("abcdef1");
    expect(
      resolveApplicationRevision({
        APP_REVISION: "latest",
        VERCEL_GIT_COMMIT_SHA: "abcdef1",
      }),
    ).toBe("abcdef1");
    expect(
      resolveApplicationRevision({ APP_REVISION: "latest" }),
    ).toBeUndefined();
  });
  it("does not serialize raw messages, URLs, credentials or extra fields", () => {
    const write = vi.spyOn(console, "log").mockImplementation(() => {});
    const secret = "PRIVATE_FILE_NAME_AND_TOKEN";
    const error = new Error(
      `https://storage.example/${secret}?password=${secret}`,
    );
    error.stack = `Error: ${secret}\n at /Users/private/${secret}.ts:32:17`;
    logEvent("files.share", { error, fileId: secret });
    const text = write.mock.calls[0][0] as string;
    expect(text).not.toContain(secret);
    expect(text).not.toContain("/Users");
    expect(JSON.parse(text)).toMatchObject({
      errorCode: "OPERATION_FAILED",
      stackLocations: [{ line: 32, column: 17 }],
    });
  });
  it("correlates concurrent requests without mixing their IDs", async () => {
    const write = vi.spyOn(console, "log").mockImplementation(() => {});
    const responses = await Promise.all(
      [1, 2].map(() =>
        observeRequest("files.list", async () => {
          await Promise.resolve();
          logEvent("files.list");
          return Response.json({});
        }),
      ),
    );
    const ids = responses.map((r) => r.headers.get("X-Request-ID"));
    expect(new Set(ids).size).toBe(2);
    for (const id of ids)
      expect(
        write.mock.calls.filter(
          ([line]) => JSON.parse(line as string).requestId === id,
        ),
      ).toHaveLength(2);
  });
  it("returns a generic error with a reference ID on an uncaught failure", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const response = await observeRequest("upload.initialize", async () => {
      throw new Error("private-password");
    });
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("private-password");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("X-Request-ID")).toBeTruthy();
  });
});
