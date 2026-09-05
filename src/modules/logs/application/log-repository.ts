import { z } from "zod";
import type { SafeLogEntry } from "../../../lib/operations/log-export";

export const LOG_RETENTION_DAYS = 7;
export const LOG_ROW_LIMIT = 10_000;
export const logQuerySchema = z
  .object({
    level: z.enum(["all", "info", "error"]).default("all"),
    requestId: z.string().uuid().optional(),
    before: z.iso.datetime().optional(),
    beforeId: z.string().uuid().optional(),
  })
  .strict()
  .refine((query) => Boolean(query.before) === Boolean(query.beforeId));
export type LogQuery = z.infer<typeof logQuerySchema>;
export interface LogPage {
  entries: (SafeLogEntry & { id: string })[];
  next: { before: string; beforeId: string } | null;
}
export interface LogRepository {
  append(entries: SafeLogEntry[]): Promise<void>;
  list(query: LogQuery): Promise<LogPage>;
  prune(): Promise<void>;
}
