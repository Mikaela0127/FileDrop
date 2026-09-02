import {
  copyFileSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readlinkSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { spawnSync } from "node:child_process";

const repositoryRoot = process.cwd();
const temporaryRoot = mkdtempSync(join(tmpdir(), "filedrop-secret-scan-"));

function listCandidateFiles(): readonly string[] {
  const result = spawnSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
    {
      cwd: repositoryRoot,
      encoding: "buffer",
      maxBuffer: 16 * 1024 * 1024,
    },
  );

  if (result.error) {
    throw new Error(
      `Git file listing could not start: ${result.error.message}`,
    );
  }

  if (result.status !== 0) {
    throw new Error("Git could not list the working-tree candidates.");
  }

  return result.stdout.toString("utf8").split("\0").filter(Boolean);
}

function copyCandidate(relativePath: string): boolean {
  const sourcePath = resolve(repositoryRoot, relativePath);
  const repositoryPrefix = `${resolve(repositoryRoot)}${sep}`;

  if (!sourcePath.startsWith(repositoryPrefix)) {
    throw new Error("Git returned a path outside the repository.");
  }

  let sourceStats;

  try {
    sourceStats = lstatSync(sourcePath);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return false;
    }

    throw error;
  }

  const destinationPath = join(temporaryRoot, relativePath);
  mkdirSync(dirname(destinationPath), { recursive: true });

  if (sourceStats.isSymbolicLink()) {
    writeFileSync(destinationPath, readlinkSync(sourcePath));
    return true;
  }

  if (!sourceStats.isFile()) {
    return false;
  }

  copyFileSync(sourcePath, destinationPath);
  return true;
}

try {
  const candidateCount = listCandidateFiles().filter(copyCandidate).length;
  process.stdout.write(
    `Scanning ${candidateCount} tracked or unignored working-tree files.\n`,
  );

  const result = spawnSync(
    "gitleaks",
    ["dir", "--redact", "--no-banner", "--verbose", "."],
    {
      cwd: temporaryRoot,
      stdio: "inherit",
    },
  );

  if (result.error) {
    throw new Error(`Gitleaks could not start: ${result.error.message}`);
  }

  if (result.status !== 0) {
    throw new Error(`Gitleaks reported a working-tree secret candidate.`);
  }
} catch (error) {
  const message = error instanceof Error ? error.message : "unknown failure";
  process.stderr.write(`Working-tree secret scan stopped: ${message}\n`);
  process.exitCode = 1;
} finally {
  rmSync(temporaryRoot, { force: true, recursive: true });
}
