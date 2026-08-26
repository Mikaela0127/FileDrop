import "server-only";

import type { NextResponse } from "next/server";

import {
  OwnerAuthConfigurationError,
  requireOwnerAuthConfig,
} from "../../../lib/config/owner-auth-config";
import { getServerEnv } from "../../../lib/config/server-env";
import { createOwnerAuthentication } from "../application/owner-authentication";
import {
  createOwnerAuthHttpHandlers,
  ownerAuthUnavailableResponse,
  type OwnerAuthHttpHandlers,
} from "../delivery/http/owner-auth-handlers";
import { JoseOwnerSessionManager } from "./crypto/jose-owner-session-manager";
import { ScryptOwnerPasswordVerifier } from "./crypto/scrypt-owner-password";

let ownerAuthHttpHandlers: OwnerAuthHttpHandlers | undefined;

function getOwnerAuthHttpHandlers(): OwnerAuthHttpHandlers {
  if (ownerAuthHttpHandlers) {
    return ownerAuthHttpHandlers;
  }

  const configuration = requireOwnerAuthConfig(getServerEnv());
  const authentication = createOwnerAuthentication({
    passwordVerifier: new ScryptOwnerPasswordVerifier(
      configuration.passwordHash,
    ),
    sessionManager: new JoseOwnerSessionManager(configuration.sessionSecret),
  });

  ownerAuthHttpHandlers = createOwnerAuthHttpHandlers({
    appOrigin: configuration.appOrigin,
    authentication,
    secureCookies: configuration.secureCookies,
  });

  return ownerAuthHttpHandlers;
}

export async function withOwnerAuthHttpHandlers(
  handler: (handlers: OwnerAuthHttpHandlers) => Promise<NextResponse>,
): Promise<NextResponse> {
  try {
    return await handler(getOwnerAuthHttpHandlers());
  } catch (error) {
    if (error instanceof OwnerAuthConfigurationError) {
      return ownerAuthUnavailableResponse();
    }

    throw error;
  }
}
