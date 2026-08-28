import { describe, expect, it } from "vitest";

import { generateObjectKey, isObjectKey } from "./object-key";

describe("generateObjectKey", () => {
  it("creates an opaque storage key without user metadata", () => {
    const objectKey = generateObjectKey();

    expect(objectKey).toMatch(
      /^objects\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u,
    );
    expect(objectKey).not.toContain("architecture.pdf");
  });

  it("recognizes only the opaque key format owned by FileDrop", () => {
    expect(isObjectKey("objects/123e4567-e89b-42d3-a456-426614174000")).toBe(
      true,
    );
    expect(isObjectKey("objects/private-plan.pdf")).toBe(false);
    expect(isObjectKey("../objects/123e4567-e89b-42d3-a456-426614174000")).toBe(
      false,
    );
  });
});
