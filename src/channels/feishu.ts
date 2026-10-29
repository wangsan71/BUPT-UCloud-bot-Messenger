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
  /** Bot custom menu event_key (application.bot.menu_v6). */
  menuKey: string | undefined;
};

/** Suggested menu event_key values — configure the same keys in Feishu console. */
export const MENU_KEYS = {
  pendingHomework: "pending_homework",
  submitHomework: "submit_homework",
  help: "help",
} as const;

export type MenuKeyStub =
  | (typeof MENU_KEYS)[keyof typeof MENU_KEYS]
  | string;

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

export function isMessageReceiveEvent(body: FeishuEventBody): boolean {
  const t = getEventType(body);
  return t === "im.message.receive_v1" || t === "im.message.receive_v2";
}

/** Bot custom menu click — console action "推送事件" / Push event. */
export function isBotMenuEvent(body: FeishuEventBody): boolean {
  return getEventType(body) === "application.bot.menu_v6";
}

/**
 * Stub router for menu keys configured in Feishu console.
 * Real homework flows land in later phases; here we only name the handler.
 */
export function stubMenuHandler(menuKey: string | undefined): string {
  switch (menuKey) {
    case MENU_KEYS.pendingHomework:
      return "stub_pending_homework";
    case MENU_KEYS.submitHomework:
      return "stub_submit_homework";
    case MENU_KEYS.help:
      return "stub_help";
    default:
      return "stub_unknown_menu";
  }
}

/**
 * Extract minimal fields from im.message.receive_v1 or application.bot.menu_v6.
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
    message_id?: string;
    chat_id?: string;
    open_id?: string;
    // application.bot.menu_v6
    event_key?: string;
    operator?: {
      operator_name?: string;
      operator_id?: {
        open_id?: string;
        user_id?: string;
        union_id?: string;
      };
    };
    timestamp?: number;
  };

  if (isBotMenuEvent(body)) {
    const menuKey =
      typeof ev.event_key === "string" && ev.event_key.length > 0
        ? ev.event_key.slice(0, 30)
        : undefined;
    const senderOpenId = ev.operator?.operator_id?.open_id ?? ev.open_id;
    return {
      eventType,
      eventId,
      messageId: undefined,
      chatId: undefined,
      chatType: "p2p",
      senderOpenId,
      messageType: "bot_menu",
      textSnippet: menuKey ? `menu:${menuKey}` : undefined,
      menuKey,
    };
  }

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
    menuKey: undefined,
  };
}
