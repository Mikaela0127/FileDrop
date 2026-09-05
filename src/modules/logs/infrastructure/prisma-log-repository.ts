import type { PrismaClient } from "../../../generated/prisma/client";
import {
  safeLogEntrySchema,
  type SafeLogEntry,
} from "../../../lib/operations/log-export";
import {
  LOG_RETENTION_DAYS,
  LOG_ROW_LIMIT,
  type LogRepository,
  type LogQuery,
} from "../application/log-repository";

export class PrismaLogRepository implements LogRepository {
  constructor(
    private readonly client: PrismaClient,
    private readonly clock = () => new Date(),
  ) {}
  private cutoff() {
    return new Date(this.clock().getTime() - LOG_RETENTION_DAYS * 86_400_000);
  }
  async append(entries: SafeLogEntry[]) {
    const safe = entries
      .slice(0, 32)
      .map((entry) => safeLogEntrySchema.parse(entry));
    if (!safe.length) return;
    await this.client.$transaction(
      async (tx) => {
        // Serialize log writes/pruning across instances; do not lock file operations.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(7060601)`;
        await tx.operationalLog.createMany({
          data: safe.map((entry) => ({
            time: new Date(entry.time),
            level: entry.level,
            event: entry.event,
            requestId: entry.requestId,
            payload: entry,
          })),
        });
        await tx.operationalLog.deleteMany({
          where: { time: { lt: this.cutoff() } },
        });
        await tx.$executeRaw`DELETE FROM operational_logs WHERE id IN (SELECT id FROM operational_logs ORDER BY time DESC, id DESC OFFSET ${LOG_ROW_LIMIT})`;
      },
      { maxWait: 1000, timeout: 1500 },
    );
  }
  async prune() {
    await this.client.operationalLog.deleteMany({
      where: { time: { lt: this.cutoff() } },
    });
  }
  async list(query: LogQuery) {
    const rows = await this.client.operationalLog.findMany({
      where: {
        time: { gte: this.cutoff() },
        ...(query.level !== "all" ? { level: query.level } : {}),
        ...(query.requestId ? { requestId: query.requestId } : {}),
        ...(query.before && query.beforeId
          ? {
              OR: [
                { time: { lt: new Date(query.before) } },
                { time: new Date(query.before), id: { lt: query.beforeId } },
              ],
            }
          : {}),
      },
      orderBy: [{ time: "desc" }, { id: "desc" }],
      take: 101,
      select: { id: true, time: true, payload: true },
    });
    const page = rows.slice(0, 100);
    const last = page.at(-1);
    return {
      entries: page.flatMap((row) => {
        const safe = safeLogEntrySchema.safeParse(row.payload);
        return safe.success ? [{ ...safe.data, id: row.id }] : [];
      }),
      next:
        rows.length > 100 && last
          ? { before: last.time.toISOString(), beforeId: last.id }
          : null,
    };
  }
}
