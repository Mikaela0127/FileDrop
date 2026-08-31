export interface DownloadStatisticsRepository {
  recordDownloadAuthorization(
    fileId: string,
    authorizedAt: Date,
  ): Promise<boolean>;
}
