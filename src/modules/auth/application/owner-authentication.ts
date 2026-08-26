import {
  PasswordVerificationBusyError,
  type OwnerPasswordVerifier,
} from "./ports/owner-password-verifier";
import type {
  OwnerSession,
  OwnerSessionManager,
} from "./ports/owner-session-manager";

const MAX_PASSWORD_BYTES = 1_024;

export class InvalidOwnerCredentialsError extends Error {
  constructor() {
    super("Invalid owner credentials");
    this.name = "InvalidOwnerCredentialsError";
  }
}

export class OwnerAuthenticationBusyError extends Error {
  constructor() {
    super("Owner authentication is temporarily busy");
    this.name = "OwnerAuthenticationBusyError";
  }
}

export interface OwnerAuthentication {
  authenticate(password: string): Promise<OwnerSession>;
  isAuthenticated(token: string | undefined): Promise<boolean>;
}

export interface OwnerAuthenticationDependencies {
  passwordVerifier: OwnerPasswordVerifier;
  sessionManager: OwnerSessionManager;
}

function isAllowedPasswordInput(password: string): boolean {
  const passwordBytes = new TextEncoder().encode(password).byteLength;
  return passwordBytes > 0 && passwordBytes <= MAX_PASSWORD_BYTES;
}

export function createOwnerAuthentication({
  passwordVerifier,
  sessionManager,
}: OwnerAuthenticationDependencies): OwnerAuthentication {
  return {
    async authenticate(password) {
      if (!isAllowedPasswordInput(password)) {
        throw new InvalidOwnerCredentialsError();
      }

      let passwordMatches: boolean;

      try {
        passwordMatches = await passwordVerifier.verify(password);
      } catch (error) {
        if (error instanceof PasswordVerificationBusyError) {
          throw new OwnerAuthenticationBusyError();
        }

        throw error;
      }

      if (!passwordMatches) {
        throw new InvalidOwnerCredentialsError();
      }

      return sessionManager.issue();
    },

    isAuthenticated(token) {
      return sessionManager.verify(token);
    },
  };
}
