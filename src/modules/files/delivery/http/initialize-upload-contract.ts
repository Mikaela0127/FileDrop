import { z } from "zod";

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
