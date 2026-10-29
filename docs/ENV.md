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

Webhook path: `POST /webhook/feishu`

Onboarding: publish the bot in Feishu Open Platform and share the **platform add-bot QR** or a **deep-link QR** that opens the bot chat.

## Lark (Global)

| Secret | Purpose |
|--------|---------|
| `LARK_APP_ID` | App ID |
| `LARK_APP_SECRET` | App secret |
| `LARK_ENCRYPT_KEY` | Event encrypt key (if enabled) |
| `LARK_VERIFICATION_TOKEN` | Event verification token |

Webhook path: `POST /webhook/lark`

Onboarding: same pattern as Feishu — **QR to add the bot** (console QR or deep link).

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

## Feishu Request URL (Phase 1)

Paste this in Feishu Open Platform → Events & Callbacks → Request URL, then save:

`https://bupt-ucloud-bot-messenger.thomassan1031.workers.dev/webhook/feishu`

If Feishu shows timeout (请求超时), China often cannot reach `*.workers.dev`. Prefer a Workers **custom domain** on a zone already in this Cloudflare account. As of deploy, `areoneplayer.top` is **not** in the account (only `playerrone.ccwu.cc`). Add the site in Cloudflare Dashboard and point nameservers first; note: no ICP filing may still block access from mainland China.
