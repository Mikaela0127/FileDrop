import {
  parseProductionSmokeBaseUrl,
  ProductionSmokeCheckError,
  ProductionSmokeConfigurationError,
  runProductionSmoke,
} from "../src/lib/operations/production-smoke";

async function main(): Promise<void> {
  try {
    const baseUrl = parseProductionSmokeBaseUrl(
      process.env.FILEDROP_SMOKE_BASE_URL,
    );
    const result = await runProductionSmoke({ baseUrl });

    for (const check of result.passedChecks) {
      console.log(`PASS ${check}`);
    }

    console.log(
      `Production smoke test passed (${result.passedChecks.length}).`,
    );
  } catch (error) {
    if (
      error instanceof ProductionSmokeConfigurationError ||
      error instanceof ProductionSmokeCheckError
    ) {
      console.error(`Production smoke test failed: ${error.message}.`);
    } else {
      console.error("Production smoke test failed unexpectedly.");
    }

    process.exitCode = 1;
  }
}

void main();
