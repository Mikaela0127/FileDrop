const response = await fetch("http://127.0.0.1:3000/api/health", {
  cache: "no-store",
  signal: AbortSignal.timeout(3_000),
});
const body = await response.json();

if (
  response.status !== 200 ||
  body?.service !== "filedrop" ||
  body?.status !== "ok"
) {
  process.exitCode = 1;
}
