import { expect, it } from "vitest";
import { extractSafeLog } from "./log-export";
const entry = {
  time: "2026-09-05T08:00:00.000Z",
  event: "files.remove",
  level: "info",
  requestId: "123e4567-e89b-42d3-a456-426614174001",
};
it("exports only known application fields from direct and wrapped logs", () => {
  const withSecrets = {
    ...entry,
    password: "PRIVATE",
    path: "/d/PRIVATE",
    headers: { cookie: "PRIVATE" },
  };
  expect(JSON.parse(extractSafeLog(JSON.stringify(withSecrets))!)).toEqual(
    entry,
  );
  expect(
    JSON.parse(
      extractSafeLog(
        JSON.stringify({
          message: JSON.stringify(withSecrets),
          requestPath: "/d/PRIVATE",
        }),
      )!,
    ),
  ).toEqual(entry);
});
it("omits unstructured provider errors and malformed field values", () => {
  expect(extractSafeLog("private stack trace")).toBeUndefined();
  expect(
    extractSafeLog(JSON.stringify({ message: "private error" })),
  ).toBeUndefined();
  expect(
    extractSafeLog(JSON.stringify({ ...entry, event: "PRIVATE" })),
  ).toBeUndefined();
  expect(
    extractSafeLog(JSON.stringify({ ...entry, fileId: "PRIVATE" })),
  ).toBeUndefined();
});
