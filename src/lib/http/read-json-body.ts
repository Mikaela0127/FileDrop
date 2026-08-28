export class InvalidJsonRequestError extends Error {
  constructor() {
    super("Invalid JSON request");
    this.name = "InvalidJsonRequestError";
  }
}

function isJsonContentType(contentType: string | null): boolean {
  return (
    contentType?.split(";", 1)[0]?.trim().toLowerCase() === "application/json"
  );
}

function parseDeclaredLength(
  contentLength: string | null,
  maximumBytes: number,
): number | undefined {
  if (contentLength === null) {
    return undefined;
  }

  if (!/^\d+$/u.test(contentLength)) {
    throw new InvalidJsonRequestError();
  }

  const parsedLength = Number(contentLength);

  if (!Number.isSafeInteger(parsedLength) || parsedLength > maximumBytes) {
    throw new InvalidJsonRequestError();
  }

  return parsedLength;
}

export async function readJsonBody(
  request: Request,
  maximumBytes: number,
): Promise<unknown> {
  if (
    !Number.isSafeInteger(maximumBytes) ||
    maximumBytes < 1 ||
    !isJsonContentType(request.headers.get("content-type"))
  ) {
    throw new InvalidJsonRequestError();
  }

  const declaredLength = parseDeclaredLength(
    request.headers.get("content-length"),
    maximumBytes,
  );

  if (!request.body) {
    throw new InvalidJsonRequestError();
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

      if (totalBytes > maximumBytes) {
        await reader.cancel();
        throw new InvalidJsonRequestError();
      }

      chunks.push(value);
    }
  } catch (error) {
    if (error instanceof InvalidJsonRequestError) {
      throw error;
    }

    throw new InvalidJsonRequestError();
  }

  if (declaredLength !== undefined && declaredLength !== totalBytes) {
    throw new InvalidJsonRequestError();
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
    return JSON.parse(bodyText);
  } catch {
    throw new InvalidJsonRequestError();
  }
}
