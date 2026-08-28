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
let ownerAuthContext: OwnerAuthContext | undefined;

export interface OwnerAuthContext {
  appOrigin: string;
  authentication: ReturnType<typeof createOwnerAuthentication>;
  secureCookies: boolean;
}

function getOwnerAuthContext(): OwnerAuthContext {
  if (ownerAuthContext) {
    return ownerAuthContext;
  }

  const configuration = requireOwnerAuthConfig(getServerEnv());
  ownerAuthContext = {
    appOrigin: configuration.appOrigin,
    authentication: createOwnerAuthentication({
      passwordVerifier: new ScryptOwnerPasswordVerifier(
        configuration.passwordHash,
      ),
      sessionManager: new JoseOwnerSessionManager(configuration.sessionSecret),
    }),
    secureCookies: configuration.secureCookies,
  };

  return ownerAuthContext;
}

function getOwnerAuthHttpHandlers(): OwnerAuthHttpHandlers {
  if (ownerAuthHttpHandlers) {
    return ownerAuthHttpHandlers;
  }

  const context = getOwnerAuthContext();

  ownerAuthHttpHandlers = createOwnerAuthHttpHandlers({
    appOrigin: context.appOrigin,
    authentication: context.authentication,
    secureCookies: context.secureCookies,
  });

  return ownerAuthHttpHandlers;
}

export async function withOwnerAuthContext(
  handler: (context: OwnerAuthContext) => Promise<NextResponse>,
): Promise<NextResponse> {
  try {
    return await handler(getOwnerAuthContext());
  } catch (error) {
    if (error instanceof OwnerAuthConfigurationError) {
      return ownerAuthUnavailableResponse();
    }

    throw error;
  }
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
