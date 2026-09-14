import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';

/**
 * Symmetric encryption for secrets that must be read back in plaintext later
 * (unlike passwords, which are hashed with Argon2 and never recovered).
 *
 * Format: base64(salt[16] | iv[12] | authTag[16] | ciphertext) - self-contained,
 * so a stored value carries everything needed to decrypt it and the key can be
 * rotated per-row without a schema change.
 */
const SALT_LEN = 16;
const IV_LEN = 12;
const TAG_LEN = 16;

function secret(): string {
  const key = process.env.ENCRYPTION_KEY;
  if (!key || key.length < 32) {
    throw new Error(
      'ENCRYPTION_KEY is missing or shorter than 32 characters. Set it in .env before storing encrypted secrets.',
    );
  }
  return key;
}

export function encryptSecret(plain: string): string {
  const salt = randomBytes(SALT_LEN);
  const iv = randomBytes(IV_LEN);
  const key = scryptSync(secret(), salt, 32);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return Buffer.concat([salt, iv, cipher.getAuthTag(), ciphertext]).toString('base64');
}

export function decryptSecret(stored: string): string {
  const raw = Buffer.from(stored, 'base64');
  const salt = raw.subarray(0, SALT_LEN);
  const iv = raw.subarray(SALT_LEN, SALT_LEN + IV_LEN);
  const tag = raw.subarray(SALT_LEN + IV_LEN, SALT_LEN + IV_LEN + TAG_LEN);
  const ciphertext = raw.subarray(SALT_LEN + IV_LEN + TAG_LEN);
  const key = scryptSync(secret(), salt, 32);
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}
