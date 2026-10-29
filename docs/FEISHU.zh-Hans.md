# 飞书通道设置（Phase 1）

Webhook Request URL（**请用自定义域名**；国内常连不上 `*.workers.dev`）：

```
https://playerrone.ccwu.cc/webhook/feishu
```

备用：`https://ucloud-bot.playerrone.ccwu.cc/webhook/feishu`

Encrypt Key／Verification Token 须与 Worker secrets 一致。事件须在 **3 秒内**回 HTTP 200。

## 权限

| 用途 | 建议 scope |
|------|------------|
| 单聊收消息 | `im:message.p2p_msg:readonly`（或历史版 `im:message.p2p_msg`） |
| 群聊 @ 机器人 | `im:message.group_at_msg:readonly`（或历史版 `im:message.group_at_msg`） |
| （可选）群内全部用户消息 | `im:message.group_msg`（敏感） |
| 以应用身份发消息 | `im:message:send_as_bot` |

需开启**机器人**能力，并订阅 `im.message.receive_v1`；改权限后重新**创建版本并发布**。

## 扫码／分享加机器人

1. 后台复制 App ID，拼 AppLink：`https://applink.feishu.cn/client/bot/open?appId=你的AppID`，生成二维码发给学生。
2. 或在飞书客户端打开机器人资料卡 → **分享**。
3. 或群设置 → 群机器人 → 添加机器人。

QR／链接仅用于打开 bot，不要写入学号或密码。详见繁体版 `FEISHU.zh-Hant.md`。
