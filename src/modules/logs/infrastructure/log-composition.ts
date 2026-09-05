import "server-only";
import { prisma } from "../../../lib/database/prisma";
import { configureLogSink } from "../../../lib/operations/logger";
import { PrismaLogRepository } from "./prisma-log-repository";

export const logRepository = new PrismaLogRepository(prisma);
export function installLogStorage() {
  configureLogSink((entries) => logRepository.append(entries));
}
