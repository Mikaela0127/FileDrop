export const UPLOAD_URL_TTL_SECONDS = 15 * 60;

export interface CreateUploadUrlInput {
  objectKey: string;
  contentType: string;
  sizeBytes: number;
  expiresInSeconds: number;
}

export interface UploadAuthorization {
  url: string;
  method: "PUT";
  headers: Readonly<Record<string, string>>;
  expiresAt: Date;
}

export interface UploadUrlProvider {
  createUploadUrl(input: CreateUploadUrlInput): Promise<UploadAuthorization>;
}
