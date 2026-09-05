export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { getServerEnv } = await import("./lib/config/server-env");
    getServerEnv();
    const { installLogStorage } =
      await import("./modules/logs/infrastructure/log-composition");
    installLogStorage();
  }
}

export async function onRequestError(error: unknown): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { captureLogs, logEvent } = await import("./lib/operations/logger");
    await captureLogs(async () => {
      logEvent("server.error", { error });
    });
  }
}
