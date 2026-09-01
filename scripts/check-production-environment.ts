import "dotenv/config";

import { parseProductionEnv } from "../src/lib/config/production-env";

try {
  parseProductionEnv(process.env);
  process.stdout.write(
    "Production environment is valid: HTTPS origin, encrypted remote PostgreSQL, owner authentication, cleanup authentication, and R2 are configured.\n",
  );
} catch (error) {
  const message =
    error instanceof Error
      ? error.message
      : "Production environment validation failed";
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
}
