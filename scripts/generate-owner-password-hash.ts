import { hashOwnerPassword } from "../src/modules/auth/infrastructure/crypto/scrypt-owner-password";

async function readPasswordFromStandardInput(): Promise<string> {
  if (process.stdin.isTTY) {
    throw new Error(
      "Refusing visible password input. Pipe a hidden shell variable as documented in README.md.",
    );
  }

  process.stdin.setEncoding("utf8");
  let password = "";

  for await (const chunk of process.stdin) {
    password += chunk;
  }

  return password;
}

try {
  const password = await readPasswordFromStandardInput();
  process.stdout.write(`${await hashOwnerPassword(password)}\n`);
} catch (error) {
  const message =
    error instanceof Error ? error.message : "Could not hash owner password";
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
}
