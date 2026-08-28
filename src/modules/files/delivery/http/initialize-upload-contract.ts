import { z } from "zod";

import { readJsonBody } from "../../../../lib/http/read-json-body";
import {
  isAllowedExpirationSeconds,
  MAX_FILE_SIZE_BYTES,
} from "../../domain/file-policy";

export const initializeUploadRequestSchema = z
  .object({
    originalName: z.string().min(1).max(255),
    contentType: z.string().max(255).optional(),
    sizeBytes: z.number().int().positive().max(MAX_FILE_SIZE_BYTES),
    expirationSeconds: z.number().int().refine(isAllowedExpirationSeconds),
  })
  .strict();

export type InitializeUploadRequest = z.infer<
  typeof initializeUploadRequestSchema
>;

const MAX_INITIALIZE_UPLOAD_BODY_BYTES = 4_096;

export class InvalidInitializeUploadRequestError extends Error {
  constructor() {
    super("Invalid upload initialization request");
    this.name = "InvalidInitializeUploadRequestError";
  }
}

export async function parseInitializeUploadRequest(
  request: Request,
): Promise<InitializeUploadRequest> {
  try {
    return initializeUploadRequestSchema.parse(
      await readJsonBody(request, MAX_INITIALIZE_UPLOAD_BODY_BYTES),
    );
  } catch {
    throw new InvalidInitializeUploadRequestError();
  }
}
