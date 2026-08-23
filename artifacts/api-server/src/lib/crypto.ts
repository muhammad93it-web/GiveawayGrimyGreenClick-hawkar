import { createHash, createHmac, randomBytes, createCipheriv, createDecipheriv } from "crypto";

/**
 * Derive a 32-byte AES-256-GCM key from SESSION_SECRET using SHA-256.
 */
function deriveEncryptionKey(): Buffer {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error("SESSION_SECRET environment variable is required");
  }
  return createHash("sha256").update(secret).digest();
}

/**
 * Encrypt plaintext using AES-256-GCM.
 * Returns "iv:authTag:ciphertext" (all hex-encoded).
 */
export function encrypt(plaintext: string): string {
  const key = deriveEncryptionKey();
  const iv = randomBytes(12); // 96-bit IV for GCM
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return [iv.toString("hex"), authTag.toString("hex"), encrypted.toString("hex")].join(":");
}

/**
 * Decrypt a value produced by encrypt().
 */
export function decrypt(encoded: string): string {
  const key = deriveEncryptionKey();
  const parts = encoded.split(":");
  if (parts.length !== 3) {
    throw new Error("Invalid encrypted value format");
  }
  const [ivHex, authTagHex, ciphertextHex] = parts;
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");
  const ciphertext = Buffer.from(ciphertextHex, "hex");
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return decrypted.toString("utf8");
}

/**
 * Hash a value with SHA-256 and return the hex digest.
 */
export function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/**
 * Generate a cryptographically random opaque token (hex-encoded).
 */
export function generateToken(bytes = 32): string {
  return randomBytes(bytes).toString("hex");
}

/**
 * Constant-time comparison for strings to prevent timing attacks.
 */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return createHmac("sha256", "timing-safe").update(a).digest().equals(
    createHmac("sha256", "timing-safe").update(b).digest(),
  );
}
