import { describe, expect, it } from "vitest";

import {
  InvalidAuthRequestError,
  parseOwnerLoginRequest,
} from "./owner-auth-contract";

function jsonRequest(body: string, headers: HeadersInit = {}): Request {
  return new Request("https://filedrop.example.test/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body,
  });
}

describe("owner login HTTP contract", () => {
  it("accepts only the expected JSON shape", async () => {
    await expect(
      parseOwnerLoginRequest(
        jsonRequest(JSON.stringify({ password: "owner password" })),
      ),
    ).resolves.toEqual({ password: "owner password" });

    await expect(
      parseOwnerLoginRequest(
        jsonRequest(
          JSON.stringify({ password: "owner password", isOwner: true }),
        ),
      ),
    ).rejects.toThrowError(InvalidAuthRequestError);
  });

  it("requires an application/json content type", async () => {
    const request = new Request(
      "https://filedrop.example.test/api/auth/login",
      {
        method: "POST",
        headers: { "content-type": "text/plain" },
        body: "owner password",
      },
    );

    await expect(parseOwnerLoginRequest(request)).rejects.toThrowError(
      InvalidAuthRequestError,
    );
  });

  it("rejects a declared or streamed body over two KiB", async () => {
    await expect(
      parseOwnerLoginRequest(
        jsonRequest(JSON.stringify({ password: "p" }), {
          "content-length": "2049",
        }),
      ),
    ).rejects.toThrowError(InvalidAuthRequestError);

    await expect(
      parseOwnerLoginRequest(
        jsonRequest(JSON.stringify({ password: "p".repeat(2_049) })),
      ),
    ).rejects.toThrowError(InvalidAuthRequestError);
  });

  it("rejects a mismatched declared content length", async () => {
    await expect(
      parseOwnerLoginRequest(
        jsonRequest(JSON.stringify({ password: "owner password" }), {
          "content-length": "1",
        }),
      ),
    ).rejects.toThrowError(InvalidAuthRequestError);
  });

  it("rejects malformed JSON and invalid UTF-8", async () => {
    await expect(parseOwnerLoginRequest(jsonRequest("{"))).rejects.toThrowError(
      InvalidAuthRequestError,
    );

    const invalidUtf8 = new Uint8Array([0xc3, 0x28]);
    const request = new Request(
      "https://filedrop.example.test/api/auth/login",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: invalidUtf8,
      },
    );
    await expect(parseOwnerLoginRequest(request)).rejects.toThrowError(
      InvalidAuthRequestError,
    );
  });
});
