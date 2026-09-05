import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "../../../generated/prisma/client";
import { assertLocalReleaseDatabaseUrl } from "../../../lib/operations/local-release-database";
import { LOG_ROW_LIMIT } from "../application/log-repository";
import { PrismaLogRepository } from "./prisma-log-repository";

const databaseUrl = process.env.DATABASE_URL;
assertLocalReleaseDatabaseUrl(databaseUrl);
const schema = `log_fixture_${randomUUID().replaceAll("-", "")}`;
const admin = new PrismaClient({
  adapter: new PrismaPg({ connectionString: databaseUrl }),
});
const client = new PrismaClient({
  adapter: new PrismaPg(
    { connectionString: databaseUrl, options: `-c search_path=${schema}` },
    { schema },
  ),
});
const now = new Date("2026-09-06T08:00:00.000Z");
const repository = new PrismaLogRepository(client, () => now);
const entry = {
  time: now.toISOString(),
  level: "error" as const,
  event: "upload.complete" as const,
  requestId: randomUUID(),
  errorCode: "P2022" as const,
};
const row = () => ({
  id: randomUUID(),
  time: now,
  level: entry.level,
  event: entry.event,
  requestId: entry.requestId,
  payload: entry,
});

beforeAll(async () => {
  // Fresh local-only schema: retention tests must never prune real application logs.
  await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
  await admin.$executeRawUnsafe(
    `CREATE TABLE "${schema}".operational_logs (LIKE public.operational_logs INCLUDING ALL)`,
  );
});
afterEach(async () => {
  await client.operationalLog.deleteMany({});
});
afterAll(async () => {
  await client.$disconnect();
  await admin.$executeRawUnsafe(
    `DROP TABLE IF EXISTS "${schema}".operational_logs`,
  );
  await admin.$executeRawUnsafe(`DROP SCHEMA "${schema}"`);
  await admin.$disconnect();
});

describe("persistent owner logs", () => {
  it("persists only allowlisted payloads and keeps logs independent of file records", async () => {
    await repository.append([
      { ...entry, fileId: randomUUID(), ...{ password: "PRIVATE_VALUE" } },
    ]);
    const page = await repository.list({
      level: "error",
      requestId: entry.requestId,
    });
    expect(page.entries).toHaveLength(1);
    expect(
      JSON.stringify(await client.operationalLog.findMany()),
    ).not.toContain("PRIVATE_VALUE");
    expect(page.entries[0].errorCode).toBe("P2022");
    expect((await repository.list({ level: "info" })).entries).toHaveLength(0);
  });
  it("hides and prunes expired logs without exposing malformed payloads", async () => {
    const old = new Date(now.getTime() - 8 * 86_400_000);
    await client.operationalLog.createMany({
      data: [
        { ...row(), time: old },
        { ...row(), payload: { token: "PRIVATE_VALUE" } },
      ],
    });
    expect((await repository.list({ level: "all" })).entries).toHaveLength(0);
    await repository.prune();
    expect(await client.operationalLog.count()).toBe(1);
    await repository.append([entry]);
    expect((await repository.list({ level: "all" })).entries).toHaveLength(1);
  });
  it("pages deterministically across matching timestamps", async () => {
    await client.operationalLog.createMany({
      data: Array.from({ length: 101 }, row),
    });
    const first = await repository.list({ level: "all" });
    expect(first.entries).toHaveLength(100);
    const second = await repository.list({ level: "all", ...first.next! });
    expect(second.entries).toHaveLength(1);
    expect(
      new Set([...first.entries, ...second.entries].map((item) => item.id))
        .size,
    ).toBe(101);
    expect(second.next).toBeNull();
  });
  it("enforces the retained row cap under concurrent appends", async () => {
    for (let i = 0; i < LOG_ROW_LIMIT; i += 1000)
      await client.operationalLog.createMany({
        data: Array.from({ length: 1000 }, row),
      });
    await Promise.all([repository.append([entry]), repository.append([entry])]);
    expect(await client.operationalLog.count()).toBe(LOG_ROW_LIMIT);
  });
});
