export interface OwnerPasswordVerifier {
  verify(password: string): Promise<boolean>;
}

export class PasswordVerificationBusyError extends Error {
  constructor() {
    super("Password verification capacity is busy");
    this.name = "PasswordVerificationBusyError";
  }
}
