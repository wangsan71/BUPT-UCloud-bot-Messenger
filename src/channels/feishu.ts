export type FeishuEventBody = {
  challenge?: string;
  token?: string;
  type?: string;
  encrypt?: string;
  schema?: string;
  header?: { event_type?: string; token?: string };
  event?: unknown;
};

export async function parseFeishuBody(
  rawText: string,
  encryptKey: string | undefined,
): Promise<FeishuEventBody> {
  let parsed: FeishuEventBody;
  try {
    parsed = JSON.parse(rawText) as FeishuEventBody;
  } catch {
    throw new Error("invalid_json");
  }
  if (parsed.encrypt && typeof parsed.encrypt === "string") {
    const key = encryptKey?.trim();
    if (!key) {
      throw new Error("missing_encrypt_key");
    }
    const { decryptFeishuEncrypt } = await import("../crypto/feishu");
    const plain = await decryptFeishuEncrypt(key, parsed.encrypt);
    try {
      return JSON.parse(plain) as FeishuEventBody;
    } catch {
      throw new Error("decrypt_json_invalid");
    }
  }
  return parsed;
}

export function isUrlVerification(body: FeishuEventBody): boolean {
  return (
    body.type === "url_verification" ||
    (typeof body.challenge === "string" &&
      body.challenge.length > 0 &&
      !body.header &&
      !body.schema)
  );
}

export function tokenMatches(
  body: FeishuEventBody,
  expected: string | undefined,
): boolean {
  const want = expected?.trim();
  if (!want) return true;
  const got = body.token ?? body.header?.token;
  if (!got) return true;
  return got === want;
}