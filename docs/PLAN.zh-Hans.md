# BUPT UCloud 作业通知总计划书（公开脱敏版）

以学生为主：通过飞书（中国版）、Lark（Global）、企业微信登录与交作业，并同步提交到北邮教学云；默认推送新作业、截止提醒与提交结果。后端为 **TypeScript + Hono**，部署于 **Cloudflare Workers + D1**。

> 本文已移除本机绝对路径、个人账号与助手产品细节，适合放到 GitHub。

## 1. 目标与范围

在 Cloudflare Workers 上实现以**学生交作业**为主的消息 bot：

- 通道：飞书（中国）、Lark（Global）、企业微信
- 登录北邮统一认证后：列待办、上传并同步提交到教学云
- 推送：新作业、截止提醒、提交结果
- **不做**独立 Android／iOS App；通知与交作业都「包一层」即时通讯
- 代码放在本仓库（或本地 clone），以 Workers 部署

## 2. 已定决策

| 项目 | 决策 |
|------|------|
| 技术栈 | TypeScript + Hono，部署 Cloudflare Workers |
| 主机 | Cloudflare Workers + D1（参考开源 bot）；自有 Cloudflare 账号部署 |
| 通道 | 飞书（中国）+ Lark（Global）+ 企业微信 |
| 角色 | 主要学生交作业 |
| 上传 | 同步提交到 UCloud 教学云 |
| 登录模型 | 对齐开源 bot：学号 + 统一认证密码 → token 存 D1 |
| 默认通知 | 新作业发布、截止提醒、提交结果 |
| 凭证原则 | 密码只经自建 Workers；不交第三方代理；本地调试勿把密码贴到对话或公开 issue |

## 3. 系统架构

```
学生 → 飞书 / Lark / 企微 → Workers + Hono ⇄ D1（session／订阅）
                              ↓
                    统一认证 + apiucloud.bupt.edu.cn
                              ↑
                         Cron（待办 diff／截止）
                              ↓
                    推送通知 → 飞书 / Lark / 企微
```

二次开发以 [YouXam/ucloud-bot](https://github.com/YouXam/ucloud-bot) 为行为蓝本，把 Telegram 换成飞书／Lark／企微适配层；教学云交互沿用社区客户端路径（**非官方公开 API**）。

## 4. 学生 Bot 流程

1. **绑定登录** — 学生在对应 bot 输入学号与统一认证密码（安全输入或一次性指令）。Workers 使用 `@byrdocs/bupt-auth` 换 token，加密后存 D1；不经第三方公开 worker 转密码。
2. **看待办** — 列出未完成作业（对齐 `/ykt-site/site/student/undone` 等路径），可看详情与截止时间。
3. **上传与提交** — 发送文字／图片／文件；确认后同步提交到教学云；回传成功／失败作为提交结果通知。
4. **自动推送** — Cron 或事件触发：新待办、截止接近（例如 48h／24h／当日）、提交结果。

## 5. 通知规则

| 事件 | 默认 | 内容要点 |
|------|------|----------|
| 新作业发布 | 开 | 标题、截止、课程／链接摘要 |
| 截止提醒 | 开 | 剩 48h／24h／当日（可调） |
| 提交结果 | 开 | 成功／失败、迟交标记 |
| 作业更新 | 后加 | 改题、改截止、补档 |
| 成绩／批改 | 后加 | 若平台有公开状态 |
| 管理员异常 | 后加 | 登录失败、推送失败 |

同一事件 fan-out 到已绑定通道；未使用飞书者可用企微（之后可加邮件兜底）。

## 6. 安全与约束

- 统一认证密码只经自建 Workers；Secrets 用 `wrangler secret`；D1 存加密 token／refresh，避免明文长存。
- 不使用要求学号密码的第三方公开代理（例如公开 `*.workers.dev` 转发层）。
- 注意 Cloudflare Workers 同域互调限制（开源 bot 曾见 520）；可用自定义域名或 service binding。
- 开发／调试时勿把统一认证密码贴到聊天或公开 issue；本机凭证只留在开发者自己的环境。
- 开源参考为 GPL-3.0：二次开发须遵守授权条款。

## 7. 开发阶段

| 阶段 | 内容 | 状态 |
|------|------|------|
| Phase 0 | 仓库骨架：Hono + wrangler + D1 schema + 环境变量说明 | 未开始 |
| Phase 1 | 通道适配：飞书／Lark／企微 webhook 验签与指令路由 | 未开始 |
| Phase 2 | 登录与 session：bupt-auth + D1；列表／详情 | 未开始 |
| Phase 3 | 上传提交同步 UCloud；提交结果通知 | 未开始 |
| Phase 4 | Cron：新待办 diff + 截止提醒；三通道 fan-out | 未开始 |
| Phase 5 | 自建部署文档、自定义域名、安全审视与测试清单 | 未开始 |

状态截至 2026-10-29（UTC+8）：需求已收敛；代码尚未落地。下一步：仓库内起 Phase 0 骨架。

## 8. 参考资料

- [YouXam/ucloud-bot](https://github.com/YouXam/ucloud-bot) — Telegram bot 行为蓝本（Workers + D1）
- [YouXam/ucloud](https://github.com/YouXam/ucloud) — 教学云交互层
- [北邮教学云](https://ucloud.bupt.edu.cn/) — 平台入口（需 CAS）；API 主机 `apiucloud.bupt.edu.cn`

多语文档：`docs/PLAN.zh-Hant.md`、`docs/PLAN.zh-Hans.md`、`docs/PLAN.en.md`。
