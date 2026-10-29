# BUPT-UCloud-bot-Messenger

Homework messaging bot for BUPT Teaching Cloud (UCloud). Students use **Feishu (China)**, **Lark (Global)**, or **WeCom** to list todos, submit homework (synced to UCloud), and receive default pushes: new homework, deadline reminders, submit results.

Stack: **TypeScript + Hono** on **Cloudflare Workers + D1**.

## Docs

- [Plan (Traditional Chinese)](docs/PLAN.zh-Hant.md)
- [Plan (Simplified Chinese)](docs/PLAN.zh-Hans.md)
- [Plan (English)](docs/PLAN.en.md)
- [Environment & secrets](docs/ENV.md)

## Onboarding (QR)

Share a **scan-to-add-bot** QR for each channel:

- Feishu / Lark: Open Platform bot QR, or a deep-link QR that opens the bot chat
- WeCom: admin “contact me” / app QR, or deep-link QR into the bot

## Phase 0 status

Repo skeleton is in place: Hono app, webhook placeholders, D1 schema, wrangler config. Channel verify, CAS login, and submit sync come in later phases.

## Develop

```bash
npm install
cp docs/ENV.md .   # read placeholders; create gitignored .dev.vars locally
npx wrangler d1 create bupt-ucloud-bot   # then put database_id into wrangler.toml
npx wrangler d1 migrations apply bupt-ucloud-bot --local
npm run dev
```

Health: `GET /` and `GET /health`. Webhooks: `POST /webhook/feishu`, `POST /webhook/lark`, `GET|POST /webhook/wecom`.

## Deploy

```bash
npx wrangler login
npx wrangler d1 migrations apply bupt-ucloud-bot
# put secrets listed in docs/ENV.md
npm run deploy
```

Point each platform’s event callback URL at your Worker routes above.

## License note

Behavior reference projects may be GPL-3.0; check before publishing derivatives.
