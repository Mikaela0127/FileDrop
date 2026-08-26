import { type NextRequest, NextResponse } from "next/server";

import {
  InvalidOwnerCredentialsError,
  OwnerAuthenticationBusyError,
  type OwnerAuthentication,
} from "../../application/owner-authentication";
import {
  InvalidAuthRequestError,
  parseOwnerLoginRequest,
} from "./owner-auth-contract";

export const OWNER_SESSION_COOKIE_NAME = "filedrop_owner_session";

interface OwnerAuthHttpHandlersDependencies {
  appOrigin: string;
  authentication: OwnerAuthentication;
  secureCookies: boolean;
}

export interface OwnerAuthHttpHandlers {
  login(request: NextRequest): Promise<NextResponse>;
  logout(request: NextRequest): Promise<NextResponse>;
  session(request: NextRequest): Promise<NextResponse>;
}

function jsonResponse(body: unknown, status = 200): NextResponse {
  const response = NextResponse.json(body, { status });
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Pragma", "no-cache");
  response.headers.set("X-Content-Type-Options", "nosniff");
  return response;
}

function errorResponse(code: string, status: number): NextResponse {
  return jsonResponse({ error: { code } }, status);
}

function isTrustedMutationOrigin(
  request: NextRequest,
  expectedOrigin: string,
): boolean {
  const originHeader = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");

  if (!originHeader || (fetchSite && fetchSite !== "same-origin")) {
    return false;
  }

  try {
    return new URL(originHeader).origin === expectedOrigin;
  } catch {
    return false;
  }
}

function cookieOptions(secure: boolean) {
  return {
    httpOnly: true,
    path: "/",
    priority: "high" as const,
    sameSite: "strict" as const,
    secure,
  };
}

export function ownerAuthUnavailableResponse(): NextResponse {
  return errorResponse("AUTH_UNAVAILABLE", 503);
}

export function createOwnerAuthHttpHandlers({
  appOrigin,
  authentication,
  secureCookies,
}: OwnerAuthHttpHandlersDependencies): OwnerAuthHttpHandlers {
  return {
    async login(request) {
      if (!isTrustedMutationOrigin(request, appOrigin)) {
        return errorResponse("FORBIDDEN_ORIGIN", 403);
      }

      let loginRequest;

      try {
        loginRequest = await parseOwnerLoginRequest(request);
      } catch (error) {
        if (error instanceof InvalidAuthRequestError) {
          return errorResponse("INVALID_REQUEST", 400);
        }

        throw error;
      }

      try {
        const ownerSession = await authentication.authenticate(
          loginRequest.password,
        );
        const response = jsonResponse({
          authenticated: true,
          expiresAt: ownerSession.expiresAt.toISOString(),
        });

        response.cookies.set({
          name: OWNER_SESSION_COOKIE_NAME,
          value: ownerSession.token,
          expires: ownerSession.expiresAt,
          ...cookieOptions(secureCookies),
        });

        return response;
      } catch (error) {
        if (error instanceof InvalidOwnerCredentialsError) {
          return errorResponse("INVALID_CREDENTIALS", 401);
        }

        if (error instanceof OwnerAuthenticationBusyError) {
          const response = errorResponse("AUTHENTICATION_BUSY", 429);
          response.headers.set("Retry-After", "5");
          return response;
        }

        throw error;
      }
    },

    async logout(request) {
      if (!isTrustedMutationOrigin(request, appOrigin)) {
        return errorResponse("FORBIDDEN_ORIGIN", 403);
      }

      const response = jsonResponse({ authenticated: false });
      response.cookies.set({
        name: OWNER_SESSION_COOKIE_NAME,
        value: "",
        expires: new Date(0),
        maxAge: 0,
        ...cookieOptions(secureCookies),
      });
      return response;
    },

    async session(request) {
      const token = request.cookies.get(OWNER_SESSION_COOKIE_NAME)?.value;
      const authenticated = await authentication.isAuthenticated(token);
      return jsonResponse({ authenticated });
    },
  };
}
