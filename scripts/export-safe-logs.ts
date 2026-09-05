import { createInterface } from "node:readline";
import { extractSafeLog } from "../src/lib/operations/log-export";

async function main() {
  const input = createInterface({ input: process.stdin, crlfDelay: Infinity });
  let written = 0;
  for await (const line of input) {
    const safe = extractSafeLog(line);
    if (safe) {
      process.stdout.write(`${safe}\n`);
      written++;
    }
  }
  process.stderr.write(
    `Exported ${written} allowlisted application log entries. Provider/free-text entries were omitted.\n`,
  );
}
void main().catch(() => {
  process.stderr.write("Log export failed. No raw input was printed.\n");
  process.exitCode = 1;
});
