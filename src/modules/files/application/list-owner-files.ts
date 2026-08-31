import type {
  OwnerFileCatalogItem,
  OwnerFileCatalogRepository,
} from "./ports/owner-file-catalog-repository";

export const OWNER_FILE_CATALOG_LIMIT = 50;

export interface ListOwnerFilesResult {
  files: OwnerFileCatalogItem[];
  limit: number;
}

export interface ListOwnerFilesDependencies {
  fileCatalogRepository: OwnerFileCatalogRepository;
}

export function createListOwnerFiles({
  fileCatalogRepository,
}: ListOwnerFilesDependencies) {
  return async function listOwnerFiles(): Promise<ListOwnerFilesResult> {
    return {
      files: await fileCatalogRepository.listRecent(OWNER_FILE_CATALOG_LIMIT),
      limit: OWNER_FILE_CATALOG_LIMIT,
    };
  };
}
