/**
 * Feishu / Lark event payload AES-256-CBC decrypt (Encrypt Key).
 * Key = SHA-256(encryptKey); IV = first 16 bytes of base64-decoded ciphertext.
 * Web Crypto AES-CBC removes PKCS7 padding automatically.
 */
export async function decryptFeishuEncrypt(
  encryptKey: string,
  encryptBase64: string,
): Promise<string> {
  const keyHash = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(encryptKey),
  );
  const raw = Uint8Array.from(atob(encryptBase64), (c) => c.charCodeAt(0));
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
  const plainBuf = await crypto.subtle.decrypt(
    { name: "AES-CBC", iv },
    cryptoKey,
    data,
  );
  return new TextDecoder().decode(plainBuf);
}

/** Optional request signature check when Encrypt Key is set. */
export async function verifyFeishuSignature(
  encryptKey: string,
  timestamp: string,
  nonce: string,
  body: string,
  signature: string,
): Promise<boolean> {
  const content = new TextEncoder().encode(timestamp + nonce + encryptKey + body);
  const digest = await crypto.subtle.digest("SHA-256", content);
  const hex = [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return hex === signature;
}
