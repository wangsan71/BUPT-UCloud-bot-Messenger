# 飞书通道设置（Phase 1）

Webhook Request URL（**请用自定义域名**；国内常连不上 `*.workers.dev`）：

```
https://playerrone.ccwu.cc/webhook/feishu
```

备用：`https://ucloud-bot.playerrone.ccwu.cc/webhook/feishu`

Encrypt Key／Verification Token 须与 Worker secrets 一致。事件须在 **3 秒内**回 HTTP 200。

官方参考：[接收消息](https://open.feishu.cn/document/server-docs/im-v1/message/events/receive)、[机器人自定义菜单](https://open.feishu.cn/document/client-docs/bot-v3/bot-customized-menu)、[自定义菜单事件](https://open.feishu.cn/document/client-docs/bot-v3/events/menu)。

## 权限

| 用途 | 建议 scope |
|------|------------|
| 单聊收消息 | `im:message.p2p_msg:readonly`（或历史版 `im:message.p2p_msg`） |
| 群聊 @ 机器人 | `im:message.group_at_msg:readonly`（或历史版 `im:message.group_at_msg`） |
| （可选）群内全部用户消息 | `im:message.group_msg`（敏感） |
| 以应用身份发消息 | `im:message:send_as_bot` |

需开启**机器人**能力，并订阅：

- `im.message.receive_v1`
- `application.bot.menu_v6`（菜单项动作为「推送事件」时）

改权限后重新**创建版本并发布**。

## 机器人自定义菜单

菜单在**开发者后台配置**（非 OpenAPI 动态改结构）。

1. **添加应用能力 → 机器人** → **机器人自定义菜单** → 开启。
2. 选展示样式（可切换 / 悬浮）；为作业入口选 **推送事件**，填写唯一 `event_key`。
3. **事件与回调 → 添加事件** → 订阅「机器人自定义菜单事件」`application.bot.menu_v6`。
4. 创建版本并发布；客户端约 5 分钟后生效。仅支持**单聊**。

建议菜单项：

| 显示名 | event_key |
|--------|-----------|
| 待交作业 | `pending_homework` |
| 提交作业 | `submit_homework` |
| 帮助 | `help` |

Worker 将点击写入 D1 `inbound_messages`（`message_type=bot_menu`）并打 stub 日志；真正业务在后续 Phase。

## 扫码／分享加机器人

1. 后台复制 App ID，拼 AppLink：`https://applink.feishu.cn/client/bot/open?appId=你的AppID`，生成二维码发给学生。
2. 或在飞书客户端打开机器人资料卡 → **分享**。
3. 或群设置 → 群机器人 → 添加机器人。

QR／链接仅用于打开 bot，不要写入学号或密码。详见繁体版 `FEISHU.zh-Hant.md`。
