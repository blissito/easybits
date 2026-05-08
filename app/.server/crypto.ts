import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  type CipherGCM,
  type DecipherGCM,
} from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;
const AUTH_TAG_BYTES = 16;

function getKey(): Buffer {
  const hex = process.env.SECRETS_MASTER_KEY;
  if (!hex) {
    throw new Error(
      "SECRETS_MASTER_KEY env var missing. Generate with `openssl rand -hex 32` and set it as a Fly secret."
    );
  }
  if (hex.length !== 64) {
    throw new Error(
      "SECRETS_MASTER_KEY must be a 64-char hex string (32 bytes)."
    );
  }
  return Buffer.from(hex, "hex");
}

export function encryptSecret(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv) as CipherGCM;
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, ciphertext]).toString("base64");
}

export function decryptSecret(blob: string): string {
  const key = getKey();
  const buf = Buffer.from(blob, "base64");
  if (buf.length < IV_BYTES + AUTH_TAG_BYTES) {
    throw new Error("encrypted blob too short");
  }
  const iv = buf.subarray(0, IV_BYTES);
  const authTag = buf.subarray(IV_BYTES, IV_BYTES + AUTH_TAG_BYTES);
  const ciphertext = buf.subarray(IV_BYTES + AUTH_TAG_BYTES);
  const decipher = createDecipheriv(ALGORITHM, key, iv) as DecipherGCM;
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString(
    "utf8"
  );
}
