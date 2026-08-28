import { z } from "zod";

const fileIdSchema = z.string().uuid();

export class InvalidCompleteUploadRequestError extends Error {
  constructor() {
    super("Invalid upload completion request");
    this.name = "InvalidCompleteUploadRequestError";
  }
}

export function parseCompleteUploadFileId(fileId: string): string {
  const result = fileIdSchema.safeParse(fileId);

  if (!result.success) {
    throw new InvalidCompleteUploadRequestError();
  }

  return result.data;
}
