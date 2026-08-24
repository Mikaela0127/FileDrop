import "server-only";

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../../generated/prisma/client";
import { getServerEnv } from "../config/server-env";

const globalForPrisma = globalThis as unknown as {
  fileDropPrisma?: PrismaClient;
};

function createPrismaClient(): PrismaClient {
  const environment = getServerEnv();
  const adapter = new PrismaPg({ connectionString: environment.DATABASE_URL });

  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.fileDropPrisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.fileDropPrisma = prisma;
}
