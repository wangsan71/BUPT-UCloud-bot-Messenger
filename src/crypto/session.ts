/**
 * AES-GCM helpers for Teaching Cloud tokens at rest (D1).
 * Key material: SHA-256(SESSION_ENCRYPTION_KEY) -> 256-bit AES key.
 * Wire format: base64(iv[12] || ciphertext+tag).
 */
function encodeUtf8(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

function decodeUtf8(buf: ArrayBuffer | Uint8Array): string {
  return new TextDecoder().decode(buf);
}

function b64ToBytes(b64: string): Uint8Array {
  const clean = b64.replace(/\s+/g, "");
  if (!clean) throw new Error("invalid_ciphertext");
  const bin = atob(clean);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToB64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]!);
  return btoa(s);
}

async function deriveAesKey(secret: string): Promise<CryptoKey> {
  const hash = await crypto.subtle.digest("SHA-256", encodeUtf8(secret.trim()));
  return crypto.subtle.importKey("raw", hash, { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt",
  ]);
}

export async function encryptSessionPayload(
  secret: string,
  plaintext: string,
): Promise<string> {
  if (!secret?.trim()) throw new Error("missing_session_encryption_key");
  const key = await deriveAesKey(secret);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipherBuf = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encodeUtf8(plaintext),
  );
  const combined = new Uint8Array(12 + cipherBuf.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(cipherBuf), 12);
  return bytesToB64(combined);
}

export async function decryptSessionPayload(
  secret: string,
  blob: string,
): Promise<string> {
  if (!secret?.trim()) throw new Error("missing_session_encryption_key");
  const key = await deriveAesKey(secret);
  const raw = b64ToBytes(blob.trim());
  if (raw.byteLength < 28) throw new Error("invalid_session_blob");
  const iv = raw.slice(0, 12);
  const data = raw.slice(12);
  try {
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      key,
      data,
    );
    return decodeUtf8(plain);
  } catch {
    throw new Error("session_decrypt_failed");
  }
}