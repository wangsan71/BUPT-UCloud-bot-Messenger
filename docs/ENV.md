# Environment & secrets (placeholders)

Do **not** commit real values. Use `.dev.vars` locally (gitignored) and `wrangler secret put` in production.

## Cloudflare

| Name | Where | Notes |
|------|--------|--------|
| Account / API token | Local Wrangler login | `npx wrangler login` |
| D1 `database_id` | `wrangler.toml` | After `npx wrangler d1 create bupt-ucloud-bot` |

## Feishu (China)

| Secret | Purpose |
|--------|---------|
| `FEISHU_APP_ID` | App ID |
| `FEISHU_APP_SECRET` | App secret |
| `FEISHU_ENCRYPT_KEY` | Event encrypt key (if enabled) |
| `FEISHU_VERIFICATION_TOKEN` | Event verification token |
| `FEISHU_ECHO_REPLY` | Optional: set `1` to echo a short reply after message events (needs App ID/Secret + `im:message:send_as_bot`) |

Webhook path: `POST /webhook/feishu`

**Request URL (use custom domain; China often cannot reach `*.workers.dev`):**

`https://playerrone.ccwu.cc/webhook/feishu`

Backup (may NXDOMAIN on some campus DNS): `https://ucloud-bot.playerrone.ccwu.cc/webhook/feishu`

### Encrypt Key / URL verification

When Encrypt Key is set, Feishu POSTs `{"encrypt":"..."}` (AES-256-CBC). The Worker decrypts with `SHA-256(Encrypt Key)` then returns **only** `{"challenge":"..."}`.

Algorithm matches [Feishu receive-events docs](https://open.feishu.cn/document/server-docs/event-subscription-guide/event-subscription-configure-/encrypt-key-encryption-configuration-case) and `@larksuiteoapi/node-sdk` `AESCipher`.

**Temporary workaround** if console shows 「Challenge code没有返回」 while debugging:

1. Clear / leave empty **Encrypt Key** in Feishu console → Encryption strategy.
2. Save Request URL (plaintext `url_verification` works).
3. Re-fill Encrypt Key and save again once decrypt is confirmed.

When piping secrets on Windows, avoid a trailing newline (e.g. write bytes to a file and `wrangler secret put NAME < file`). The Worker also `.trim()`s encrypt key / token.

Onboarding / scopes / QR steps: see **`docs/FEISHU.zh-Hant.md`** (also `.en.md` / `.zh-Hans.md`). Publish the bot and share AppLink QR or client share card.

## Lark (Global)

| Secret | Purpose |
|--------|---------|
| `LARK_APP_ID` | App ID |
| `LARK_APP_SECRET` | App secret |
| `LARK_ENCRYPT_KEY` | Event encrypt key (if enabled) |
| `LARK_VERIFICATION_TOKEN` | Event verification token |

Webhook path: `POST /webhook/lark`

Onboarding: same pattern as Feishu — **QR to add the bot**.

## WeCom (企业微信)

| Secret | Purpose |
|--------|---------|
| `WECOM_CORP_ID` | Corp ID |
| `WECOM_AGENT_ID` | Agent / app ID |
| `WECOM_SECRET` | App secret |
| `WECOM_TOKEN` | Callback Token |
| `WECOM_ENCODING_AES_KEY` | Callback EncodingAESKey |

Webhook path: `GET|POST /webhook/wecom`

Onboarding: WeCom admin console **contact me / QR** for the app, or a deep-link QR into the bot chat.

## App crypto

| Secret | Purpose |
|--------|---------|
| `SESSION_ENCRYPTION_KEY` | Encrypt Teaching Cloud tokens in D1 (generate a long random string) |

## Local `.dev.vars` example

```ini
FEISHU_APP_ID=
FEISHU_APP_SECRET=
FEISHU_ENCRYPT_KEY=
FEISHU_VERIFICATION_TOKEN=
FEISHU_ECHO_REPLY=
LARK_APP_ID=
LARK_APP_SECRET=
LARK_ENCRYPT_KEY=
LARK_VERIFICATION_TOKEN=
WECOM_CORP_ID=
WECOM_AGENT_ID=
WECOM_SECRET=
WECOM_TOKEN=
WECOM_ENCODING_AES_KEY=
SESSION_ENCRYPTION_KEY=
```