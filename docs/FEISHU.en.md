# Feishu channel setup (Phase 1)

Request URL (prefer custom domain; `*.workers.dev` is often unreachable from mainland China):

```
https://playerrone.ccwu.cc/webhook/feishu
```

Backup: `https://ucloud-bot.playerrone.ccwu.cc/webhook/feishu`

Encrypt Key / Verification Token must match Worker secrets. Feishu expects HTTP 200 within ~3s; the Worker logs to D1 then returns `{}`.

Docs: [Receive message](https://open.feishu.cn/document/server-docs/im-v1/message/events/receive), [Bot custom menu](https://open.feishu.cn/document/client-docs/bot-v3/bot-customized-menu), [Menu event](https://open.feishu.cn/document/client-docs/bot-v3/events/menu), [Open bot AppLink](https://open.feishu.cn/document/common-capabilities/applink-protocol/supported-protocol/open-a-bot).

## Required scopes (enable any needed)

| Purpose | Scope (console names may vary) |
|---------|--------------------------------|
| DM to bot | `im:message.p2p_msg:readonly` (or legacy `im:message.p2p_msg`) |
| Group @ bot | `im:message.group_at_msg:readonly` (or legacy `im:message.group_at_msg`) |
| Optional: all group user msgs | `im:message.group_msg` (sensitive) |
| Send as bot | `im:message:send_as_bot` |

Also enable **Bot** capability and subscribe to:

- `im.message.receive_v1`
- `application.bot.menu_v6` (when menu items use **Push event**)

Re-publish after permission/event changes.

## Bot custom menu

Menus are configured in the **developer console** (not via OpenAPI for structure).

1. **Add capabilities → Bot → Bot custom menu** → enable.
2. Choose collapsible or persistent style. For homework actions, set response to **Push event** and set a unique `event_key` (1–30 chars).
3. **Events & callbacks → Add event** → subscribe to **Bot custom menu event** (`application.bot.menu_v6`).
4. Create a version and publish; client may take ~5 minutes. Menus are **DM-only** (no group chat).

Suggested items for this homework bot:

| Label | `event_key` | Worker stub |
|-------|-------------|-------------|
| Pending homework | `pending_homework` | `stub_pending_homework` |
| Submit homework | `submit_homework` | `stub_submit_homework` |
| Help | `help` | `stub_help` |

Payload highlights: `event.event_key`, `event.operator.operator_id.open_id` (no `chat_id`). Worker logs into the same D1 `inbound_messages` table (`message_type=bot_menu`, `text_snippet=menu:<key>`) and acks `200 {}`.

## QR / share onboarding

1. Copy **App ID** from Credentials.
2. AppLink: `https://applink.feishu.cn/client/bot/open?appId=YOUR_APP_ID` → make a QR.
3. Or share the bot card from the Feishu client; or add via group **Settings → Group bots**.

QR/AppLink must not carry student IDs or passwords.

## Worker behavior

Decrypt/verify → for `im.message.receive_v1` or `application.bot.menu_v6` insert into `inbound_messages` → `200 {}`. Menu clicks run named stubs only (homework flows later). Optional message echo when `FEISHU_ECHO_REPLY=1` + App ID/Secret (off by default).


## Phase 2 login

Primary docs: `docs/FEISHU.zh-Hant.md` §6 (DM-only login link + multi-user bind).
