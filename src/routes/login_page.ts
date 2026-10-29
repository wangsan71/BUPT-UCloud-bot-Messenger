/**
 * Short-lived HTTPS login form: GET /login?token=...  POST /api/login
 * Prefer this over putting passwords in Feishu chat history.
 */
import type { Context } from "hono";
import { replyFeishuDm } from "../channels/feishu_reply";
import {
  bindUserSession,
  challengeIsValid,
  getLoginChallenge,
  markChallengeUsed,
} from "../db/bindings";
import { loginUCloud, UCloudLoginError } from "../ucloud/auth";
import type { Env } from "../env";

function loginHtml(opts: {
  token: string;
  error?: string;
  done?: boolean;
  studentHint?: string;
}): string {
  if (opts.done) {
    return `<!DOCTYPE html><html lang="zh-Hant"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>登入成功</title>
<style>body{font-family:system-ui,sans-serif;max-width:28rem;margin:2rem auto;padding:0 1rem;line-height:1.5} .ok{color:#0a7}</style></head>
<body><h1 class="ok">登入成功</h1><p>已綁定學號 <strong>${escapeHtml(opts.studentHint ?? "")}</strong>。可返回飛書單聊使用「待交作業」。</p>
<p>每位同學獨立綁定，不會共用他人的教學雲 session。</p></body></html>`;
  }
  const err = opts.error
    ? `<p style="color:#c00">${escapeHtml(opts.error)}</p>`
    : "";
  return `<!DOCTYPE html><html lang="zh-Hant"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>教學雲登入</title>
<style>
body{font-family:system-ui,sans-serif;max-width:28rem;margin:2rem auto;padding:0 1rem;line-height:1.5}
label{display:block;margin:.75rem 0 .25rem;font-weight:600}
input{width:100%;padding:.5rem;font-size:1rem;box-sizing:border-box}
button{margin-top:1rem;padding:.6rem 1rem;font-size:1rem;width:100%;cursor:pointer}
.note{color:#555;font-size:.9rem}
</style></head><body>
<h1>北郵教學雲綁定</h1>
<p class="note">此連結約 15 分鐘有效，且只綁定產生連結時的飛書帳號。密碼只提交到本站，不會寫入飛書聊天。</p>
${err}
<form method="POST" action="/api/login" autocomplete="on">
<input type="hidden" name="token" value="${escapeHtml(opts.token)}"/>
<label for="student_id">學號</label>
<input id="student_id" name="student_id" required autocomplete="username" inputmode="text"/>
<label for="password">統一認證密碼</label>
<input id="password" name="password" type="password" required autocomplete="current-password"/>
<button type="submit">登入並綁定</button>
</form>
<p class="note">完成後可關閉此頁，返回飛書。</p>
</body></html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function handleLoginPageGet(c: Context<{ Bindings: Env }>) {
  const token = c.req.query("token")?.trim();
  if (!token) {
    return c.html(
      loginHtml({
        token: "",
        error: "缺少 token。請回到飛書單聊傳送「登入」取得新連結。",
      }),
      400,
    );
  }
  const ch = await getLoginChallenge(c.env.DB, token);
  if (!ch || !challengeIsValid(ch)) {
    return c.html(
      loginHtml({
        token,
        error: "連結無效或已過期。請回到飛書單聊重新傳送「登入」。",
      }),
      400,
    );
  }
  return c.html(loginHtml({ token }));
}

export async function handleLoginApiPost(c: Context<{ Bindings: Env }>) {
  const ct = c.req.header("content-type") || "";
  let token = "";
  let studentId = "";
  let password = "";
  try {
    if (ct.includes("application/json")) {
      const body = (await c.req.json()) as {
        token?: string;
        student_id?: string;
        password?: string;
      };
      token = body.token?.trim() ?? "";
      studentId = body.student_id?.trim() ?? "";
      password = body.password ?? "";
    } else {
      const form = await c.req.parseBody();
      token = String(form.token ?? "").trim();
      studentId = String(form.student_id ?? "").trim();
      password = String(form.password ?? "");
    }
  } catch {
    return c.html(
      loginHtml({ token: "", error: "無法解析表單。" }),
      400,
    );
  }

  // Never log password / student credentials.
  if (!token || !studentId || !password) {
    return c.html(
      loginHtml({
        token,
        error: "請填寫學號與密碼。",
      }),
      400,
    );
  }

  const ch = await getLoginChallenge(c.env.DB, token);
  if (!ch || !challengeIsValid(ch)) {
    return c.html(
      loginHtml({
        token,
        error: "連結無效或已過期。請回到飛書重新取得登入連結。",
      }),
      400,
    );
  }

  const key = c.env.SESSION_ENCRYPTION_KEY?.trim();
  if (!key) {
    return c.html(
      loginHtml({
        token,
        error: "服務未配置 SESSION_ENCRYPTION_KEY。",
      }),
      503,
    );
  }

  try {
    const session = await loginUCloud(studentId, password, {
      ocrToken: c.env.BYRDOCS_OCR_TOKEN,
    });
    const sid = session.user_name || session.account || studentId;
    await bindUserSession({
      db: c.env.DB,
      channel: ch.channel,
      openId: ch.openId,
      chatId: ch.chatId,
      studentId: sid,
      displayName: session.real_name ?? null,
      session,
      encryptionKey: key,
    });
    await markChallengeUsed(c.env.DB, token);

    // Notify Feishu DM asynchronously-ish (still in request; login already slow).
    const name = session.real_name ? `（${session.real_name}）` : "";
    c.executionCtx.waitUntil(
      replyFeishuDm(c.env, {
        chatId: ch.chatId,
        openId: ch.openId,
        text: `登入成功：已綁定學號 ${sid}${name}。可使用「待交作業」。`,
      }).catch((e) =>
        console.warn(
          "login_notify_failed",
          e instanceof Error ? e.message : String(e),
        ),
      ),
    );

    const wantsJson = (c.req.header("accept") || "").includes("application/json");
    if (wantsJson) {
      return c.json({ ok: true, student_id: sid, real_name: session.real_name ?? null });
    }
    return c.html(
      loginHtml({ token, done: true, studentHint: sid + name }),
    );
  } catch (e) {
    const msg =
      e instanceof UCloudLoginError
        ? e.message
        : e instanceof Error
          ? e.message
          : String(e);
    console.warn("login_api_failed", msg);
    return c.html(loginHtml({ token, error: `登入失敗：${msg}` }), 401);
  }
}