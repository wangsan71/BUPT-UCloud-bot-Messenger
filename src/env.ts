export type Env = {
  DB: D1Database;
  FEISHU_APP_ID?: string;
  FEISHU_APP_SECRET?: string;
  FEISHU_ENCRYPT_KEY?: string;
  FEISHU_VERIFICATION_TOKEN?: string;
  /** Set to "1" to enable optional echo reply (needs APP_ID/SECRET + send scopes). */
  FEISHU_ECHO_REPLY?: string;
  LARK_APP_ID?: string;
  LARK_APP_SECRET?: string;
  LARK_ENCRYPT_KEY?: string;
  LARK_VERIFICATION_TOKEN?: string;
  WECOM_CORP_ID?: string;
  WECOM_AGENT_ID?: string;
  WECOM_SECRET?: string;
  WECOM_TOKEN?: string;
  WECOM_ENCODING_AES_KEY?: string;
  SESSION_ENCRYPTION_KEY?: string;
  /** Optional captcha OCR for auth.bupt.edu.cn */
  BYRDOCS_OCR_TOKEN?: string;
  /** Public HTTPS origin for login links (default https://playerrone.ccwu.cc) */
  PUBLIC_BASE_URL?: string;
  /** Temporary send diagnostic gate (remove after debug). */
  DIAG_TOKEN?: string;
};
