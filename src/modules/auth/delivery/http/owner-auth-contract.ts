import { z } from "zod";

import { readJsonBody } from "../../../../lib/http/read-json-body";

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

export async function parseOwnerLoginRequest(
  request: Request,
): Promise<OwnerLoginRequest> {
  try {
    return ownerLoginRequestSchema.parse(
      await readJsonBody(request, MAX_LOGIN_BODY_BYTES),
    );
  } catch {
    throw new InvalidAuthRequestError();
  }
}
