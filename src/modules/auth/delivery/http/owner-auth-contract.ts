import { z } from "zod";

const MAX_LOGIN_BODY_BYTES = 2_048;

export const ownerLoginRequestSchema = z.strictObject({
  password: z.string().min(1).max(1_024),
});

export type OwnerLoginRequest = z.infer<typeof ownerLoginRequestSchema>;

export class InvalidAuthRequestError extends Error {
  constructor() {
    super("Invalid authentication request");
    this.name = "InvalidAuthRequestError";
  }
}

function isJsonContentType(contentType: string | null): boolean {
  return (
    contentType?.split(";", 1)[0]?.trim().toLowerCase() === "application/json"
  );
}

function parseDeclaredLength(contentLength: string | null): number | undefined {
  if (contentLength === null) {
    return undefined;
  }

  if (!/^\d+$/u.test(contentLength)) {
    throw new InvalidAuthRequestError();
  }

  const parsedLength = Number(contentLength);

  if (
    !Number.isSafeInteger(parsedLength) ||
    parsedLength > MAX_LOGIN_BODY_BYTES
  ) {
    throw new InvalidAuthRequestError();
  }

  return parsedLength;
}

export async function parseOwnerLoginRequest(
  request: Request,
): Promise<OwnerLoginRequest> {
  if (!isJsonContentType(request.headers.get("content-type"))) {
    throw new InvalidAuthRequestError();
  }

  const declaredLength = parseDeclaredLength(
    request.headers.get("content-length"),
  );

  if (!request.body) {
    throw new InvalidAuthRequestError();
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      totalBytes += value.byteLength;

      if (totalBytes > MAX_LOGIN_BODY_BYTES) {
        await reader.cancel();
        throw new InvalidAuthRequestError();
      }

      chunks.push(value);
    }
  } catch (error) {
    if (error instanceof InvalidAuthRequestError) {
      throw error;
    }

    throw new InvalidAuthRequestError();
  }

  if (declaredLength !== undefined && declaredLength !== totalBytes) {
    throw new InvalidAuthRequestError();
  }

  const bodyBytes = new Uint8Array(totalBytes);
  let offset = 0;

  for (const chunk of chunks) {
    bodyBytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    const bodyText = new TextDecoder("utf-8", { fatal: true }).decode(
      bodyBytes,
    );
    return ownerLoginRequestSchema.parse(JSON.parse(bodyText));
  } catch {
    throw new InvalidAuthRequestError();
  }
}
