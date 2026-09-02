import "dotenv/config";

import { spawnSync } from "node:child_process";

import { assertLocalReleaseDatabaseUrl } from "../src/lib/operations/local-release-database";

type ReleaseCheck = Readonly<{
  args: readonly string[];
  command: string;
  name: string;
}>;

const pnpmCommand = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

const checks: readonly ReleaseCheck[] = [
  {
    name: "repository secret history",
    command: pnpmCommand,
    args: ["run", "security:secrets"],
  },
  {
    name: "working-tree secret scan",
    command: pnpmCommand,
    args: ["run", "security:working-tree"],
  },
  {
    name: "high-severity dependency audit",
    command: pnpmCommand,
    args: ["run", "security:audit"],
  },
  {
    name: "Prisma schema validation",
    command: pnpmCommand,
    args: ["run", "db:validate"],
  },
  {
    name: "Prisma Client generation",
    command: pnpmCommand,
    args: ["run", "db:generate"],
  },
  {
    name: "formatting",
    command: pnpmCommand,
    args: ["run", "format:check"],
  },
  {
    name: "lint",
    command: pnpmCommand,
    args: ["run", "lint"],
  },
  {
    name: "TypeScript",
    command: pnpmCommand,
    args: ["run", "typecheck"],
  },
  {
    name: "unit tests",
    command: pnpmCommand,
    args: ["run", "test"],
  },
  {
    name: "PostgreSQL integration tests",
    command: pnpmCommand,
    args: ["run", "test:integration"],
  },
  {
    name: "production build",
    command: pnpmCommand,
    args: ["run", "build"],
  },
  {
    name: "browser end-to-end tests",
    command: pnpmCommand,
    args: ["run", "test:e2e"],
  },
];

function runCheck(check: ReleaseCheck, index: number): void {
  process.stdout.write(
    `\n[release ${index + 1}/${checks.length}] ${check.name}\n`,
  );

  const result = spawnSync(check.command, [...check.args], {
    env: process.env,
    stdio: "inherit",
  });

  if (result.error) {
    throw new Error(`${check.name} could not start: ${result.error.message}`);
  }

  if (result.status !== 0) {
    throw new Error(
      `${check.name} failed with exit code ${result.status ?? 1}.`,
    );
  }
}

try {
  assertLocalReleaseDatabaseUrl(process.env.DATABASE_URL);

  checks.forEach(runCheck);

  process.stdout.write(
    `\nRelease candidate passed all ${checks.length} local checks.\n`,
  );
} catch (error) {
  const message = error instanceof Error ? error.message : "unknown failure";
  process.stderr.write(`\nRelease check stopped: ${message}\n`);
  process.exitCode = 1;
}
