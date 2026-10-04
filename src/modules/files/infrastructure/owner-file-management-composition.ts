import "server-only";
import type { NextRequest } from "next/server";
import { prisma } from "../../../lib/database/prisma";
import { getServerEnv } from "../../../lib/config/server-env";
import { parseShareTokenKeyring } from "../../../lib/config/share-token-keyring";
import { observeRequest } from "../../../lib/operations/logger";
import { withOwnerAuthContext } from "../../auth/infrastructure/owner-auth-composition";
import { createAbandonUpload } from "../application/abandon-upload";
import { createCompleteUpload } from "../application/complete-upload";
import { createManageOwnerFile } from "../application/manage-owner-file";
import {
  createOwnerFileManagementHandler,
  type ManagementAction,
} from "../delivery/http/owner-file-management-handler";
import { PrismaFileRepository } from "./persistence/prisma-file-repository";
import { AesShareTokenCipher } from "./storage/aes-share-token-cipher";
import { getR2ObjectStore } from "./storage/r2-object-store";

export function handleOwnerFileManagement(
  request: NextRequest,
  id: string,
  action: ManagementAction,
) {
  return observeRequest(
    action === "share"
      ? "files.share"
      : action === "expire"
        ? "files.expire"
        : "files.remove",
    () =>
      withOwnerAuthContext(async ({ authentication, appOrigin }) => {
        const repository = new PrismaFileRepository(prisma);
        const management = createManageOwnerFile({
          abandonUpload: (fileId) =>
            createAbandonUpload({
              completeUpload: createCompleteUpload({
                fileRepository: repository,
                objectStore: getR2ObjectStore(),
              }),
              fileRepository: repository,
            })(fileId),
          repository,
          getCipher: () =>
            new AesShareTokenCipher(
              parseShareTokenKeyring(getServerEnv().SHARE_TOKEN_KEYRING),
            ),
          getObjectStore: getR2ObjectStore,
        });
        return createOwnerFileManagementHandler({
          authentication,
          appOrigin,
          management,
        })(request, id, action);
      }),
  );
}
