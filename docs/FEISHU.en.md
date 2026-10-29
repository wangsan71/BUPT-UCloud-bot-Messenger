# Feishu channel setup (Phase 1)

Request URL (prefer custom domain; `*.workers.dev` is often unreachable from mainland China):

```
https://playerrone.ccwu.cc/webhook/feishu
```

Backup: `https://ucloud-bot.playerrone.ccwu.cc/webhook/feishu`

Encrypt Key / Verification Token must match Worker secrets. Feishu expects HTTP 200 within ~3s; the Worker logs to D1 then returns `{}`.

Docs: [Receive message](https://open.feishu.cn/document/server-docs/im-v1/message/events/receive), [Open bot AppLink](https://open.feishu.cn/document/common-capabilities/applink-protocol/supported-protocol/open-a-bot).

## Required scopes (enable any needed)

| Purpose | Scope (console names may vary) |
|---------|--------------------------------|
| DM to bot | `im:message.p2p_msg:readonly` (or legacy `im:message.p2p_msg`) |
| Group @ bot | `im:message.group_at_msg:readonly` (or legacy `im:message.group_at_msg`) |
| Optional: all group user msgs | `im:message.group_msg` (sensitive) |
| Send as bot | `im:message:send_as_bot` |

Also enable **Bot** capability and subscribe to `im.message.receive_v1`. Re-publish after permission/event changes.

## QR / share onboarding

1. Copy **App ID** from Credentials.
2. AppLink: `https://applink.feishu.cn/client/bot/open?appId=YOUR_APP_ID` → make a QR.
3. Or share the bot card from the Feishu client; or add via group **Settings → Group bots**.

QR/AppLink must not carry student IDs or passwords.

## Worker behavior

Decrypt/verify → for `im.message.receive_v1` insert into `inbound_messages` → `200 {}`. Optional echo when `FEISHU_ECHO_REPLY=1` + App ID/Secret (off by default).
