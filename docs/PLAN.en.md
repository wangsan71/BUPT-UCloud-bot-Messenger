# BUPT UCloud Homework Messaging — Master Plan (Public, Redacted)

Student-first messaging bot: sign in and submit homework via **Feishu (China)**, **Lark (Global)**, and **WeCom**, with submissions synced to BUPT Teaching Cloud (UCloud). Default notifications: new homework, deadline reminders, and submit results. Backend: **TypeScript + Hono** on **Cloudflare Workers + D1**.

> Local absolute paths, personal accounts, and assistant-product details are removed for safe GitHub publication.

## 1. Goals and scope

Build a **student homework** bot on Cloudflare Workers:

- Channels: Feishu (CN), Lark (Global), WeCom
- Onboarding: **scan a QR code to add the bot** (platform “add bot” QR, or a deep-link QR that opens the bot chat)
- After BUPT unified auth: list todos, upload, and sync-submit to Teaching Cloud
- Push: new assignments, deadline reminders, submit outcomes
- **No** native Android/iOS app; wrap messaging apps for notify + submit
- Code lives in this repo (or a local clone) and deploys as Workers

## 2. Decisions

| Item | Decision |
|------|----------|
| Stack | TypeScript + Hono on Cloudflare Workers |
| Hosting | Workers + D1 (pattern from the open-source bot); deploy with your own Cloudflare account |
| Channels | Feishu (CN) + Lark (Global) + WeCom |
| Onboarding | Scan QR to add the bot (platform QR / deep-link QR), then bind student ID in chat |
| Role | Primarily student submission |
| Upload | Sync submit to UCloud Teaching Cloud |
| Auth model | Match the open-source bot: student ID + unified-auth password → tokens in D1 |
| Default notifies | New homework, deadline reminders, submit results |
| Credentials | Passwords only through self-hosted Workers; no third-party password proxies; never paste passwords into chat or public issues |

## 3. Architecture

```
Student scans QR → Feishu / Lark / WeCom bot chat → Workers + Hono ⇄ D1 (sessions / subscriptions)
                                                      ↓
                                        Unified auth + apiucloud.bupt.edu.cn
                                                      ↑
                                             Cron (todo diff / deadlines)
                                                      ↓
                                        Push → Feishu / Lark / WeCom
```

Behavior follows [YouXam/ucloud-bot](https://github.com/YouXam/ucloud-bot), swapping Telegram for Feishu/Lark/WeCom adapters. Teaching Cloud access uses community client routes (**not an official public API**).

## 4. Student bot flow

1. **Scan to join** — Student scans the Feishu / Lark / WeCom “add bot” QR (or deep-link QR) and opens the bot chat. QR codes can be shared in course groups or posters; classmates need not install the same app (three channels in parallel).
2. **Bind / login** — Student enters student ID and unified-auth password in the bot (secure input or one-shot command). Workers obtain tokens via `@byrdocs/bupt-auth`, store them encrypted in D1; never forward passwords through a public third-party worker.
3. **List todos** — Unfinished work (aligned with paths such as `/ykt-site/site/student/undone`), with detail and deadlines.
4. **Upload and submit** — Text / images / files; confirm then sync-submit to Teaching Cloud; success/failure becomes a submit-result notification.
5. **Auto push** — Cron or events: new todos, approaching deadlines (e.g. 48h / 24h / due day), submit results.

## 5. Notification rules

| Event | Default | Payload focus |
|-------|---------|---------------|
| New homework | On | Title, deadline, course / link summary |
| Deadline reminder | On | 48h / 24h / due day (configurable) |
| Submit result | On | Success / failure, late flag |
| Homework update | Later | Spec change, deadline change, extra files |
| Grades / review | Later | If the platform exposes status |
| Admin errors | Later | Login failure, push failure |

Fan-out one event to all bound channels; WeCom covers classmates without Feishu (email can be a later fallback).

## 6. Security constraints

- Unified-auth passwords only on self-hosted Workers; secrets via `wrangler secret`; D1 holds encrypted tokens/refresh, not long-lived plaintext passwords.
- Do not use third-party public proxies that ask for student ID + password (e.g. public `*.workers.dev` forwarders).
- Watch Cloudflare same-zone Worker-to-Worker limits (open-source bot saw HTTP 520); use a custom domain or service bindings.
- Never paste unified-auth passwords into chat or public issues; keep local credentials on the developer’s own machine only.
- Upstream reference is GPL-3.0 — derivative work must comply.
- QR / deep links only open or add the bot; they must not carry student IDs or passwords.

## 7. Phases

| Phase | Work | Status |
|-------|------|--------|
| Phase 0 | Repo skeleton: Hono + wrangler + D1 schema + env docs | Done |
| Phase 1 | Channel adapters: Feishu / Lark / WeCom webhook verify + command routing; QR onboarding notes | In progress (Feishu receive + QR docs) |
| Phase 2 | Login & session: bupt-auth + D1; list / detail | Not started |
| Phase 3 | Upload submit sync to UCloud; submit-result notify | Not started |
| Phase 4 | Cron: new-todo diff + deadline reminders; three-channel fan-out | Not started |
| Phase 5 | Self-host docs, custom domain, security review, test checklist | Not started |

As of 2026-10-30 (UTC+8): Phase 0 done; Phase 1 Feishu webhook verifies/decrypts and acks `im.message.receive_v1` (D1 `inbound_messages`). See `docs/FEISHU.en.md`.

## 8. References

- [YouXam/ucloud-bot](https://github.com/YouXam/ucloud-bot) — Telegram bot behavior reference (Workers + D1)
- [YouXam/ucloud](https://github.com/YouXam/ucloud) — Teaching Cloud client layer
- [BUPT Teaching Cloud](https://ucloud.bupt.edu.cn/) — Portal (CAS); API host `apiucloud.bupt.edu.cn`

Localized docs: `docs/PLAN.zh-Hant.md`, `docs/PLAN.zh-Hans.md`, `docs/PLAN.en.md`.
