export type EncryptedFile = {
  id: string;
  name: string;
  size: number;
  encryptedAt: Date;
  content: string; // Base64 encoded encrypted content
  key: string; // Base64 encoded encryption key
  iv: string; // Base64 encoded initialization vector
};
