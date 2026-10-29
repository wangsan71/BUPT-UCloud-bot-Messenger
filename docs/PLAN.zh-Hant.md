# BUPT UCloud 功課通知總計劃書（公開脱敏版）

學生為主：經飛書（中國版）、Lark（Global）、企業微信登入與交功課，並同步提交到北郵教學雲；預設推送新作業、截止提醒與提交結果。後端為 **TypeScript + Hono**，部署於 **Cloudflare Workers + D1**。

> 本文已移除本機絕對路徑、個人帳號與助手產品細節，適合放上 GitHub。

## 1. 目標與範圍

在 Cloudflare Workers 上實作以**學生交功課**為主的訊息 bot：

- 通道：飛書（中國）、Lark（Global）、企業微信
- 導流：**掃 QR Code 加入機器人**（平台後台「添加 bot」QR，或開啟 bot 對話的 deep-link QR）
- 登入北郵統一認證後：列待辦、上傳並同步提交到教學雲
- 推送：新作業、截止提醒、提交結果
- **不做**獨立 Android／iOS App；通知與交功課都「包一層」即時通訊
- 程式碼放在本倉庫（或本地 clone），以 Workers 部署

## 2. 已定決策

| 項目 | 決策 |
|------|------|
| 技術棧 | TypeScript + Hono，部署 Cloudflare Workers |
| 主機 | Cloudflare Workers + D1（參考開源 bot）；自有 Cloudflare 帳號部署 |
| 通道 | 飛書（中國）+ Lark（Global）+ 企業微信 |
| 導流 | 掃 QR 加 bot（平台 QR／deep-link QR），再於對話內綁定學號 |
| 角色 | 主要學生交功課 |
| 上傳 | 同步提交到 UCloud 教學雲 |
| 登入模型 | 對齊開源 bot：學號 + 統一認證密碼 → token 存 D1 |
| 預設通知 | 新作業發佈、截止提醒、提交結果 |
| 憑證原則 | 密碼只經自架 Workers；不交第三方代理；本地除錯勿把密碼貼上對話或公開 issue |

## 3. 系統架構

```
學生掃 QR → 飛書 / Lark / 企微 bot 對話 → Workers + Hono ⇄ D1（session／訂閱）
                                              ↓
                                    統一認證 + apiucloud.bupt.edu.cn
                                              ↑
                                         Cron（待辦 diff／截止）
                                              ↓
                                    推送通知 → 飛書 / Lark / 企微
```

二次開發以 [YouXam/ucloud-bot](https://github.com/YouXam/ucloud-bot) 為行為藍本，把 Telegram 換成飛書／Lark／企微適配層；教學雲交互沿用社群客戶端路徑（**非官方公開 API**）。

## 4. 學生 Bot 流程

1. **掃碼加入** — 學生掃描飛書／Lark／企微的「添加機器人」QR（或 deep-link QR），進入 bot 對話。QR 可由課程群／海報分發；不強制人人先裝同一款 App（三通道並行）。
2. **綁定登入** — 學生在對應 bot 輸入學號與統一認證密碼（安全輸入或一次性指令）。Workers 使用 `@byrdocs/bupt-auth` 換 token，加密後存 D1；不經第三方公開 worker 轉密碼。
3. **看待辦** — 列出未完成作業（對齊 `/ykt-site/site/student/undone` 等路徑），可看詳情與截止時間。
4. **上傳與提交** — 傳送文字／圖片／檔案；確認後同步提交到教學雲；回傳成功／失敗作為提交結果通知。
5. **自動推送** — Cron 或事件觸發：新待辦、截止接近（例如 48h／24h／當日）、提交結果。

## 5. 通知規則

| 事件 | 預設 | 內容要點 |
|------|------|----------|
| 新作業發佈 | 開 | 標題、截止、課程／連結摘要 |
| 截止提醒 | 開 | 剩 48h／24h／當日（可調） |
| 提交結果 | 開 | 成功／失敗、遲交標記 |
| 作業更新 | 後加 | 改題、改截止、補檔 |
| 成績／批改 | 後加 | 若平台有公開狀態 |
| 管理員異常 | 後加 | 登入失敗、推送失敗 |

同一事件 fan-out 到已綁定通道；未使用飛書者可用企微（之後可加電郵兜底）。

## 6. 安全與約束

- 統一認證密碼只經自架 Workers；Secrets 用 `wrangler secret`；D1 存加密 token／refresh，避免明文長存。
- 不使用要求學號密碼的第三方公開代理（例如公開 `*.workers.dev` 轉發層）。
- 注意 Cloudflare Workers 同域互調限制（開源 bot 曾見 520）；可用自訂域名或 service binding。
- 開發／除錯時勿把統一認證密碼貼上聊天或公開 issue；本機憑證只留在開發者自己的環境。
- 開源參考為 GPL-3.0：二次開發須遵守授權條款。
- QR／deep-link 只用於「打開／添加 bot」，不承載學號或密碼。

## 7. 開發階段

| 階段 | 內容 | 狀態 |
|------|------|------|
| Phase 0 | 倉庫骨架：Hono + wrangler + D1 schema + 環境變數說明 | 完成 |
| Phase 1 | 通道適配：飛書／Lark／企微 webhook 驗簽與指令路由；掃碼導流說明；自定義選單 stub | 進行中（飛書收消息 + 選單 + QR 文檔） |
| Phase 2 | 登入與 session：bupt-auth + D1；列表／詳情 | 未開始 |
| Phase 3 | 上傳提交同步 UCloud；提交結果通知 | 未開始 |
| Phase 4 | Cron：新待辦 diff + 截止提醒；三通道 fan-out | 未開始 |
| Phase 5 | 自架部署文件、自訂域名、安全審視與測試清單 | 未開始 |

狀態截至 2026-10-30（UTC+8）：Phase 0 完成；Phase 1 飛書 webhook 已驗簽／解密，ack `im.message.receive_v1` 與 `application.bot.menu_v6`（D1 `inbound_messages`；選單 key stub：`pending_homework`／`submit_homework`／`help`）。掃碼與選單配置見 `docs/FEISHU.zh-Hant.md`。

## 8. 參考資料

- [YouXam/ucloud-bot](https://github.com/YouXam/ucloud-bot) — Telegram bot 行為藍本（Workers + D1）
- [YouXam/ucloud](https://github.com/YouXam/ucloud) — 教學雲交互層
- [北郵教學雲](https://ucloud.bupt.edu.cn/) — 平台入口（需 CAS）；API 主機 `apiucloud.bupt.edu.cn`

多語文件：`docs/PLAN.zh-Hant.md`、`docs/PLAN.zh-Hans.md`、`docs/PLAN.en.md`。
