import { describe, expect, it } from "vitest";

import { generateShareToken, hashShareToken } from "./share-token";

describe("share tokens", () => {
  it("generates URL-safe 256-bit bearer tokens", () => {
    const firstToken = generateShareToken();
    const secondToken = generateShareToken();

    expect(firstToken).toMatch(/^[A-Za-z0-9_-]{43}$/u);
    expect(secondToken).not.toBe(firstToken);
  });

  it("hashes tokens to the database representation", () => {
    expect(hashShareToken("test-token")).toBe(
      "4c5dc9b7708905f77f5e5d16316b5dfb425e68cb326dcd55a860e90a7707031e",
    );
  });
});
