"use client";

export type ClientFailureStage =
  "render" | "initialize" | "direct-upload" | "complete";

// Best effort: no local storage, filenames, URLs, raw errors or session values.
export function reportClientFailure(
  stage: ClientFailureStage,
  fileId?: string,
): void {
  void fetch("/api/diagnostics", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ stage, ...(fileId ? { fileId } : {}) }),
    keepalive: true,
    signal: AbortSignal.timeout(5000),
  }).catch(() => {
    /* Reporting must never prevent error recovery. */
  });
}
