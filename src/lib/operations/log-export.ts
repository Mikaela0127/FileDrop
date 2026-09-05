import { z } from "zod";
import { LOG_ERROR_CODES } from "./log-error-codes";

export const safeLogEntrySchema = z.object({
  time: z.iso.datetime(),
  level: z.enum(["info", "error"]),
  event: z.enum([
    "upload.initialize",
    "upload.complete",
    "download.resolve",
    "files.list",
    "files.share",
    "files.expire",
    "files.remove",
    "cleanup.run",
    "cleanup.object",
    "auth.login",
    "auth.logout",
    "auth.session",
    "client.error",
    "server.error",
  ]),
  requestId: z.string().uuid(),
  fileId: z.string().uuid().optional(),
  status: z.number().int().min(100).max(599).optional(),
  durationMs: z.number().int().nonnegative().optional(),
  revision: z
    .string()
    .regex(/^[a-f0-9]{7,40}$/iu)
    .optional(),
  errorCode: z.enum(LOG_ERROR_CODES).optional(),
  stackFingerprint: z
    .string()
    .regex(/^[a-f0-9]{16}$/u)
    .optional(),
  stackLocations: z
    .array(
      z.object({
        line: z.number().int().nonnegative(),
        column: z.number().int().nonnegative(),
      }),
    )
    .max(8)
    .optional(),
  clientStage: z
    .enum(["render", "initialize", "direct-upload", "complete"])
    .optional(),
});

export type SafeLogEntry = z.infer<typeof safeLogEntrySchema>;

export function extractSafeLog(line: string): string | undefined {
  if (Buffer.byteLength(line) > 262_144) return;
  try {
    let value: unknown = JSON.parse(line);
    // Accept application JSONL or Vercel CLI JSONL with the application line in message.
    if (
      value &&
      typeof value === "object" &&
      "message" in value &&
      typeof value.message === "string"
    )
      value = JSON.parse(value.message);
    const result = safeLogEntrySchema.safeParse(value);
    if (result.success) return JSON.stringify(result.data); // z.object strips unrecognized provider fields.
  } catch {
    /* Provider output and free text are intentionally omitted. */
  }
}
