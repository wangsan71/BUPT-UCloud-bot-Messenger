export type FeishuEventBody = {
  challenge?: string;
  token?: string;
  type?: string;
  encrypt?: string;
  schema?: string;
  header?: {
    event_id?: string;
    event_type?: string;
    token?: string;
    create_time?: string;
    app_id?: string;
    tenant_key?: string;
  };
  event?: unknown;
};

export type FeishuInboundMeta = {
  eventType: string | undefined;
  eventId: string | undefined;
  messageId: string | undefined;
  chatId: string | undefined;
  chatType: string | undefined;
  senderOpenId: string | undefined;
  messageType: string | undefined;
  textSnippet: string | undefined;
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

/** Schema 2.0 uses header.event_type; legacy may use body.type / event.type. */
export function getEventType(body: FeishuEventBody): string | undefined {
  if (body.header?.event_type) return body.header.event_type;
  if (typeof body.type === "string" && body.type !== "event_callback") {
    return body.type;
  }
  const ev = body.event as { type?: string } | undefined;
  if (ev && typeof ev.type === "string") return ev.type;
  return undefined;
}

function tryParseContentText(content: unknown): string | undefined {
  if (typeof content !== "string" || !content) return undefined;
  try {
    const obj = JSON.parse(content) as { text?: string };
    if (typeof obj.text === "string") {
      return obj.text.replace(/@_user_\d+/g, "").trim().slice(0, 200);
    }
  } catch {
    return content.slice(0, 200);
  }
  return undefined;
}

/**
 * Extract minimal fields from im.message.receive_v1 (schema 2.0) or close shapes.
 * Safe on unknown events — returns undefineds rather than throwing.
 */
export function extractInboundMeta(body: FeishuEventBody): FeishuInboundMeta {
  const eventType = getEventType(body);
  const eventId = body.header?.event_id;
  const ev = (body.event ?? {}) as {
    sender?: { sender_id?: { open_id?: string }; open_id?: string };
    message?: {
      message_id?: string;
      chat_id?: string;
      chat_type?: string;
      message_type?: string;
      content?: string;
    };
    // legacy v1.0-ish nesting sometimes flattens under event
    message_id?: string;
    chat_id?: string;
    open_id?: string;
  };

  const message = ev.message;
  const messageId = message?.message_id ?? ev.message_id;
  const chatId = message?.chat_id ?? ev.chat_id;
  const chatType = message?.chat_type;
  const senderOpenId =
    ev.sender?.sender_id?.open_id ?? ev.sender?.open_id ?? ev.open_id;
  const messageType = message?.message_type;
  const textSnippet =
    messageType === "text" || !messageType
      ? tryParseContentText(message?.content)
      : undefined;

  return {
    eventType,
    eventId,
    messageId,
    chatId,
    chatType,
    senderOpenId,
    messageType,
    textSnippet,
  };
}

export function isMessageReceiveEvent(body: FeishuEventBody): boolean {
  const t = getEventType(body);
  return t === "im.message.receive_v1" || t === "im.message.receive_v2";
}
