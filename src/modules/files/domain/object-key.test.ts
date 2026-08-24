import { describe, expect, it } from "vitest";

import { generateObjectKey } from "./object-key";

describe("generateObjectKey", () => {
  it("creates an opaque storage key without user metadata", () => {
    const objectKey = generateObjectKey();

    expect(objectKey).toMatch(
      /^objects\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u,
    );
    expect(objectKey).not.toContain("architecture.pdf");
  });
});
