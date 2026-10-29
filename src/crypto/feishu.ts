/**
 * Feishu / Lark AES-256-CBC (Encrypt Key), matching open.feishu.cn + @larksuiteoapi/node-sdk AESCipher.
 *
 * Encrypt: PKCS7-pad plaintext → random 16-byte IV → AES-256-CBC → base64(iv || ciphertext)
 * Decrypt: base64-decode → IV = first 16 bytes → AES-256-CBC with key = SHA-256(encryptKey)
 * Web Crypto AES-CBC strips PKCS7 on decrypt / adds it on encrypt.
 */
function encodeUtf8(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

function decodeUtf8(buf: ArrayBuffer | Uint8Array): string {
  return new TextDecoder().decode(buf);
}

/** Standard base64 → bytes (strips whitespace; rejects empty). */
function b64ToBytes(b64: string): Uint8Array {
  const clean = b64.replace(/\s+/g, "");
  if (!clean) throw new Error("invalid_ciphertext");
  try {
    const bin = atob(clean);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    throw new Error("invalid_ciphertext");
  }
}

function bytesToB64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]!);
  return btoa(s);
}

async function sha256Key(encryptKey: string): Promise<ArrayBuffer> {
  return crypto.subtle.digest("SHA-256", encodeUtf8(encryptKey.trim()));
}

export async function decryptFeishuEncrypt(
  encryptKey: string,
  encryptBase64: string,
): Promise<string> {
  const keyHash = await sha256Key(encryptKey);
  const raw = b64ToBytes(encryptBase64.trim());
  // Need IV (16) + at least one AES block (16); total multiple of 16
  if (raw.byteLength < 32 || raw.byteLength % 16 !== 0) {
    throw new Error("invalid_ciphertext");
  }
  const iv = raw.slice(0, 16);
  const data = raw.slice(16);
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyHash,
    { name: "AES-CBC" },
    false,
    ["decrypt"],
  );
  try {
    const plainBuf = await crypto.subtle.decrypt(
      { name: "AES-CBC", iv },
      cryptoKey,
      data,
    );
    return decodeUtf8(plainBuf);
  } catch {
    throw new Error("decrypt_failed");
  }
}

/** Build Feishu-style encrypt blob for tests / local probes. */
export async function encryptFeishuPayload(
  encryptKey: string,
  plaintext: string,
): Promise<string> {
  const keyHash = await sha256Key(encryptKey);
  const iv = crypto.getRandomValues(new Uint8Array(16));
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyHash,
    { name: "AES-CBC" },
    false,
    ["encrypt"],
  );
  const cipherBuf = await crypto.subtle.encrypt(
    { name: "AES-CBC", iv },
    cryptoKey,
    encodeUtf8(plaintext),
  );
  const combined = new Uint8Array(16 + cipherBuf.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(cipherBuf), 16);
  return bytesToB64(combined);
}

/** Optional request signature check when Encrypt Key is set. */
export async function verifyFeishuSignature(
  encryptKey: string,
  timestamp: string,
  nonce: string,
  body: string,
  signature: string,
): Promise<boolean> {
  const content = encodeUtf8(
    timestamp + nonce + encryptKey.trim() + body,
  );
  const digest = await crypto.subtle.digest("SHA-256", content);
  const hex = [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return hex === signature.toLowerCase();
}