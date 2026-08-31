import "server-only";

import type { NextResponse } from "next/server";

import { prisma } from "../../../lib/database/prisma";
import { withOwnerAuthContext } from "../../auth/infrastructure/owner-auth-composition";
import { createListOwnerFiles } from "../application/list-owner-files";
import {
  createOwnerFileCatalogHttpHandler,
  type OwnerFileCatalogHttpHandler,
} from "../delivery/http/owner-file-catalog-handler";
import { PrismaFileRepository } from "./persistence/prisma-file-repository";

let ownerFileCatalogHttpHandler: OwnerFileCatalogHttpHandler | undefined;

export function withOwnerFileCatalogHttpHandler(
  handler: (catalog: OwnerFileCatalogHttpHandler) => Promise<NextResponse>,
): Promise<NextResponse> {
  return withOwnerAuthContext(async ({ authentication }) => {
    if (!ownerFileCatalogHttpHandler) {
      const fileCatalogRepository = new PrismaFileRepository(prisma);
      ownerFileCatalogHttpHandler = createOwnerFileCatalogHttpHandler({
        authentication,
        listOwnerFiles: createListOwnerFiles({ fileCatalogRepository }),
      });
    }

    return handler(ownerFileCatalogHttpHandler);
  });
}
