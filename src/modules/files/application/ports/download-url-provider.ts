export const DOWNLOAD_URL_TTL_SECONDS = 5 * 60;

export interface CreateDownloadUrlInput {
  objectKey: string;
  originalName: string;
  expiresInSeconds: number;
}

export interface DownloadAuthorization {
  url: string;
  expiresAt: Date;
}

export interface DownloadUrlProvider {
  createDownloadUrl(
    input: CreateDownloadUrlInput,
  ): Promise<DownloadAuthorization>;
}
