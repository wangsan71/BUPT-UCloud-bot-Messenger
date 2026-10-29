# 飛書通道設定（Phase 1）

Webhook Request URL（**請用自訂域名**；國內常連唔到 `*.workers.dev`）：

```
https://playerrone.ccwu.cc/webhook/feishu
```

備用：`https://ucloud-bot.playerrone.ccwu.cc/webhook/feishu`

Encrypt Key／Verification Token 須與 Worker secrets（`FEISHU_ENCRYPT_KEY`、`FEISHU_VERIFICATION_TOKEN`）一致。事件須喺 **3 秒內**回 HTTP 200；Worker 會先寫 D1 日誌再回 `{}`。

官方參考：[接收消息事件](https://open.feishu.cn/document/server-docs/im-v1/message/events/receive)、[機器人自定義選單](https://open.feishu.cn/document/client-docs/bot-v3/bot-customized-menu)、[自定義選單事件](https://open.feishu.cn/document/client-docs/bot-v3/events/menu)、[打開機器人會話 AppLink](https://open.feishu.cn/document/common-capabilities/applink-protocol/supported-protocol/open-a-bot)。

---

## 1. 權限（API 權限）

開發者後台 → **開發配置 → 權限管理 → API 權限**，按需要開通（名稱以控制台為準；下列為官方文檔常用 scope）：

| 用途 | 建議 scope |
|------|------------|
| 接收用戶發給機器人嘅單聊 | `im:message.p2p_msg:readonly`（或歷史版 `im:message.p2p_msg`） |
| 接收群聊中 @ 機器人 | `im:message.group_at_msg:readonly`（或歷史版 `im:message.group_at_msg`） |
| （可選）群內全部用戶消息 | `im:message.group_msg`（敏感，慎開） |
| 以應用身份發消息（回覆／推送） | `im:message:send_as_bot` |

亦須：**應用能力 → 添加「機器人」**，並喺 **事件與回調** 訂閱：

- `im.message.receive_v1`（接收消息）
- `application.bot.menu_v6`（機器人自定義選單事件；選單項響應動作為「推送事件」時必需）

改權限或事件後，要再 **創建版本 → 申請發佈** 先生效。

---

## 2. 機器人自定義選單（功課 bot 建議）

選單喺**開發者後台配置**（唔經 OpenAPI 動態改結構；點擊後可選「推送事件」到 Webhook）。

### 2.1 控制台步驟

1. 開發者後台 → 你的應用 → **添加應用能力 → 機器人**（已開則進入機器人配置頁）。
2. 找到 **機器人自定義選單** → 編輯 → 狀態切換為 **開啟**。
3. 選擇展示樣式：
   - **可切換選單**（飛書 ≥ 5.27）：最多 3 個主選單，每個最多 5 個子選單。
   - **懸浮選單**（飛書 ≥ 7.22）：最多 5 個主選單，每個最多 10 個子選單。
4. 為每個要用 Worker 處理嘅項，響應動作選 **推送事件**，並填寫唯一 **event_key**（1–30 字符；見下表建議值）。
5. 另兩種動作（本階段唔靠 Worker）：**跳轉至指定連結**、**發送文字消息**（後者需飛書 ≥ 7.22）。
6. 保存後 → **事件與回調 → 事件配置 → 添加事件** → 搜尋並訂閱 **「機器人自定義選單事件」**（`application.bot.menu_v6`）。
7. **創建應用版本並發佈**。客戶端生效可能延遲約 **5 分鐘**。

限制：目前選單**只支援單聊**，唔支援群聊。

### 2.2 建議選單項（功課 bot）

| 顯示名稱 | event_key（推送事件） | Worker stub |
|----------|----------------------|-------------|
| 待交作業 | `pending_homework` | `stub_pending_homework` |
| 提交作業 | `submit_homework` | `stub_submit_homework` |
| 幫助 | `help` | `stub_help` |

event_key 必須與上表一致，Worker 先按 key 打 stub 日誌；真正列待辦／提交在後續 Phase。

### 2.3 事件體要點

- 事件類型：`application.bot.menu_v6`
- 關鍵字段：`event.event_key`、`event.operator.operator_id.open_id`
- **唔帶** `chat_id`；之後若要回覆，用 `receive_id_type=open_id` 對 operator 發消息
- Worker：同收消息一樣解密／驗簽 → 寫入 D1 `inbound_messages`（`message_type=bot_menu`，`text_snippet=menu:<event_key>`）→ 立即 `200 {}`

---

## 3. 掃碼／分享加入機器人（學生導流）

應用已發佈、可用範圍包含目標學生後：

### 方法 A：AppLink（推薦，易生成 QR）

1. 開發者後台 → **憑證與基礎信息** → 複製 **App ID**（形如 `cli_…`）。
2. 拼連結（官方 AppLink）：

   ```
   https://applink.feishu.cn/client/bot/open?appId=你的AppID
   ```

3. 用任意二維碼產生器把呢條 URL 做成 QR，貼課程群／海報。
4. 學生用飛書掃碼 → 打開與機器人對話（飛書外掃會先引導開啟／下載飛書）。

### 方法 B：飛書客戶端內分享

1. 飛書搜尋你嘅機器人名稱，打開資料卡。
2. 右上角 **分享** → 轉發名片或複製連結／二維碼畀同學。

### 方法 C：拉入課程群

電腦端群聊 → **設定 → 群機器人 → 添加機器人** → 選你嘅應用機器人。群內學生可用 `@機器人` 互動（需已開群 @ 相關權限）。選單本身只喺單聊顯示。

> QR／AppLink **只用於打開／添加 bot**，唔好把學號或密碼寫入連結參數。

跨租戶／校外用戶要單聊或入外部群時，須企業認證並喺發佈版本開啟「對外共享」相關選項（見[官方說明](https://open.feishu.cn/document/develop-robots/add-bot-to-external-group)）。多數校內自建應用只需可用範圍內學生即可。

---

## 4. 本階段 Worker 行為

- 驗簽／解密／Verification Token（與 Phase 1 URL 驗證相同）。
- `im.message.receive_v1`：抽出 `message_id`、`chat_id`、`sender open_id`、文字摘要 → 寫入 D1 `inbound_messages` → **立即 200 `{}`**。
- `application.bot.menu_v6`：抽出 `event_key`、`operator open_id` → 同一張 `inbound_messages` → stub 日誌（`pending_homework`／`submit_homework`／`help`）→ **立即 200 `{}`**。
- 可選回聲回覆：本機／生產設 `FEISHU_ECHO_REPLY=1` 且已配置 `FEISHU_APP_ID`／`FEISHU_APP_SECRET` 與 `im:message:send_as_bot` 時，會喺 ack 後非同步回一句「已收到…」（預設關閉；選單點擊暫唔自動回覆）。

---

## 5. 控制台下一步檢查清單

1. 確認 Request URL 為 `https://playerrone.ccwu.cc/webhook/feishu`，Encrypt Key 已開且與 secret 一致。
2. 權限：至少單聊 `im:message.p2p_msg:readonly`；若要群 @，加 `im:message.group_at_msg:readonly`；若要回覆，加 `im:message:send_as_bot`。
3. 事件：已訂閱 `im.message.receive_v1` **同** `application.bot.menu_v6`，版本已發佈。
4. 機器人自定義選單已開，三個項嘅 event_key 分別為 `pending_homework`／`submit_homework`／`help`，動作為「推送事件」。
5. 用 AppLink／分享 QR 加 bot，單聊發一句字或撳選單；Cloudflare Worker 日誌應見到 `feishu_event`／`feishu_menu_stub`。
