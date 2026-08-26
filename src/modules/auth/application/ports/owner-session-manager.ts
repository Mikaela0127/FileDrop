export interface OwnerSession {
  expiresAt: Date;
  token: string;
}

export interface OwnerSessionManager {
  issue(): Promise<OwnerSession>;
  verify(token: string | undefined): Promise<boolean>;
}
