export interface ShareTokenCipher {
  encrypt(token: string, objectKey: string): string;
  decrypt(envelope: string, objectKey: string): string;
}
