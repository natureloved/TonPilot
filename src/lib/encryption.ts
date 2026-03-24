import crypto from 'crypto';

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;
const ALGORITHM = 'aes-256-gcm';

/**
 * Encrypts a mnemonic using AES-256-GCM.
 * If ENCRYPTION_KEY is missing, logs a warning and falls back to base64 encoding 
 * to prevent crashes during local development, but this is INSECURE for production.
 */
export function encryptMnemonic(text: string): string {
  if (!ENCRYPTION_KEY || ENCRYPTION_KEY.length !== 64) {
    console.warn("⚠️ ENCRYPTION_KEY is missing or invalid (must be 64 hex chars). Falling back to base64 encoding!");
    return Buffer.from(text, 'utf-8').toString('base64');
  }

  const iv = crypto.randomBytes(16);
  const key = Buffer.from(ENCRYPTION_KEY, 'hex');
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  
  // Format: iv:encrypted:authTag
  return `${iv.toString('hex')}:${encrypted}:${authTag}`;
}

/**
 * Decrypts a mnemonic back to plain text.
 * Gracefully handles legacy base64 encoded mnemonics for backward compatibility.
 */
export function decryptMnemonic(encText: string): string {
  // Graceful fallback for existing users whose mnemonics are just base64 encoded
  if (!encText.includes(':')) {
    return Buffer.from(encText, 'base64').toString('utf-8');
  }

  if (!ENCRYPTION_KEY || ENCRYPTION_KEY.length !== 64) {
    throw new Error("ENCRYPTION_KEY is missing or invalid, cannot decrypt secure mnemonic.");
  }

  const parts = encText.split(':');
  if (parts.length !== 3) throw new Error("Invalid encrypted mnemonic format");

  const [ivHex, encryptedHex, authTagHex] = parts;
  const key = Buffer.from(ENCRYPTION_KEY, 'hex');
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  
  return decrypted;
}
