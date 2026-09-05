import { AsyncLocalStorage } from "node:async_hooks";
import { createHash, randomUUID } from "node:crypto";
import { classifyLogError } from "./log-error-codes";
import { safeLogEntrySchema, type SafeLogEntry } from "./log-export";

type LogSink = (entries: SafeLogEntry[]) => Promise<void>;
const shared = globalThis as typeof globalThis & {
  fileDropLogRuntime?: {
    context: AsyncLocalStorage<{ requestId: string; entries: SafeLogEntry[] }>;
    sink?: LogSink;
    retryAfter: number;
  };
};
const state = (shared.fileDropLogRuntime ??= {
  context: new AsyncLocalStorage(),
  retryAfter: 0,
});
const context = state.context;

export function configureLogSink(sink?: LogSink): void {
  state.sink = sink;
  state.retryAfter = 0;
}

export function shouldPersistLog(entry: SafeLogEntry): boolean {
  return (
    entry.level === "error" ||
    Boolean(entry.fileId) ||
    Boolean(entry.clientStage) ||
    entry.event === "cleanup.run"
  );
}

export async function captureLogs<T>(action: () => Promise<T>): Promise<T> {
  return context.run({ requestId: randomUUID(), entries: [] }, async () => {
    try {
      return await action();
    } finally {
      const entries = context.getStore()!.entries;
      if (state.sink && entries.length && Date.now() >= state.retryAfter) {
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
          await Promise.race([
            state.sink(entries),
            new Promise<never>((_, reject) => {
              timer = setTimeout(
                () => reject(new Error("LOG_WRITE_TIMEOUT")),
                2000,
              );
            }),
          ]);
        } catch {
          // Do not recursively log into the failed sink or fail the user's operation.
          state.retryAfter = Date.now() + 60_000;
          console.warn(
            "FILEDROP_LOG_STORAGE_UNAVAILABLE; application entries remain in stdout",
          );
        } finally {
          clearTimeout(timer);
        }
      }
    }
  });
}
type Event =
  | "upload.initialize"
  | "upload.complete"
  | "download.resolve"
  | "files.list"
  | "files.share"
  | "files.expire"
  | "files.remove"
  | "cleanup.run"
  | "cleanup.object"
  | "auth.login"
  | "auth.logout"
  | "auth.session"
  | "client.error"
  | "server.error";
interface Details {
  fileId?: string;
  status?: number;
  durationMs?: number;
  error?: unknown;
  clientStage?: "render" | "initialize" | "direct-upload" | "complete";
}

export function logEvent(event: Event, details: Details = {}): void {
  const error = details.error;
  // Allowlist fields: no error.message, cause, URL, headers, body, filenames or credentials.
  const stack = error instanceof Error ? (error.stack ?? "") : "";
  const entry = {
    time: new Date().toISOString(),
    level:
      error !== undefined || details.clientStage || (details.status ?? 0) >= 500
        ? "error"
        : "info",
    event,
    requestId: context.getStore()?.requestId ?? randomUUID(),
    ...(details.fileId && /^[a-f0-9-]{36}$/iu.test(details.fileId)
      ? { fileId: details.fileId }
      : {}),
    status: details.status,
    clientStage: details.clientStage,
    durationMs: details.durationMs,
    revision: /^[a-f0-9]{7,40}$/iu.test(process.env.VERCEL_GIT_COMMIT_SHA ?? "")
      ? process.env.VERCEL_GIT_COMMIT_SHA
      : undefined,
    ...(error !== undefined
      ? {
          errorCode: classifyLogError(error),
          stackFingerprint: createHash("sha256")
            .update(stack)
            .digest("hex")
            .slice(0, 16),
          // Coordinates only, never arbitrary stack text or filesystem paths.
          stackLocations: [...stack.matchAll(/:(\d{1,8}):(\d{1,8})\)?$/gmu)]
            .slice(0, 8)
            .map((match) => ({
              line: Number(match[1]),
              column: Number(match[2]),
            })),
        }
      : {}),
  };
  console.log(JSON.stringify(entry));
  const parsed = safeLogEntrySchema.safeParse(entry);
  const buffer = context.getStore()?.entries;
  if (
    parsed.success &&
    shouldPersistLog(parsed.data) &&
    buffer &&
    buffer.length < 32
  )
    buffer.push(parsed.data);
}

export async function observeRequest(
  event: Event,
  action: () => Promise<Response>,
): Promise<Response> {
  return captureLogs(async () => {
    const requestId = context.getStore()!.requestId;
    const started = performance.now();
    let response: Response;
    try {
      response = await action();
    } catch (error) {
      logEvent(event, { error });
      response = Response.json(
        { error: { code: "SERVICE_UNAVAILABLE", requestId } },
        {
          status: 503,
          headers: {
            "Cache-Control": "no-store",
            "Referrer-Policy": "no-referrer",
            "X-Content-Type-Options": "nosniff",
          },
        },
      );
    }
    response.headers.set("X-Request-ID", requestId);
    logEvent(event, {
      status: response.status,
      durationMs: Math.round(performance.now() - started),
    });
    return response;
  });
}
