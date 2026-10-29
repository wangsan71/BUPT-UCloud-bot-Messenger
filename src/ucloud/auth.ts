/**
 * BUPT Teaching Cloud login via CAS + apiucloud oauth/token.
 * Shape adapted from byrdocs/bupt-auth + YouXam/ucloud (Workers-friendly, no browser).
 * Optional BYRDOCS_OCR_TOKEN for captcha; otherwise captcha fails with a clear error.
 */
import { UCloudLoginError, type UCloudSession } from "./types";
export { UCloudLoginError } from "./types";

const SERVICE = "https://ucloud.bupt.edu.cn";
const LOGIN_URL = `https://auth.bupt.edu.cn/authserver/login?service=${SERVICE}`;
const TOKEN_URL = "https://apiucloud.bupt.edu.cn/ykt-basics/oauth/token";
const ROLES_URL =
  "https://apiucloud.bupt.edu.cn/ykt-basics/userroledomaindept/listByUserId";
/** portal:portal_secret — public client id used by the Teaching Cloud web app */
const BASIC_AUTH = "Basic cG9ydGFsOnBvcnRhbF9zZWNyZXQ=";

export type LoginOpts = {
  /** Optional OCR token for auth.bupt.edu.cn captcha (byrdocs OCR). */
  ocrToken?: string;
};

type RoleInfo = { id: string; roleName: string };

function firstSetCookie(res: Response): string | null {
  // Workers may expose getSetCookie(); fall back to single header.
  const anyHeaders = res.headers as Headers & { getSetCookie?: () => string[] };
  if (typeof anyHeaders.getSetCookie === "function") {
    const list = anyHeaders.getSetCookie();
    if (list?.length) {
      const part = list[0]!.split(";")[0]?.trim();
      if (part) return part;
    }
  }
  const raw = res.headers.get("set-cookie");
  if (!raw) return null;
  return raw.split(";")[0]?.trim() || null;
}

async function getCookieAndExecution(opts?: LoginOpts): Promise<{
  cookie: string;
  execution: string;
  captcha?: string;
}> {
  const res = await fetch(LOGIN_URL, {
    headers: {
      "user-agent":
        "Mozilla/5.0 (compatible; BUPT-UCloud-bot/0.1; +https://github.com/wangsan71/BUPT-UCloud-bot-Messenger)",
    },
  });
  const cookie = firstSetCookie(res);
  if (!cookie) {
    throw new UCloudLoginError("login_failed: missing_cas_cookie");
  }
  const html = await res.text();
  const executions = html.match(/<input name="execution" value="(.*?)"/);
  if (!executions?.[1]) {
    throw new UCloudLoginError("login_failed: missing_execution");
  }
  const execution = executions[1];
  const captchaMatch = html.match(/config\.captcha[^{]*{[^}]*id: '(.*?)'/);
  const captchaId = captchaMatch?.[1];
  if (!captchaId) {
    return { cookie, execution };
  }
  const captchaUrl = `https://auth.bupt.edu.cn/authserver/captcha?captchaId=${captchaId}&r=${Math.random().toString().slice(2, 7)}`;
  const ocr = opts?.ocrToken?.trim();
  if (!ocr) {
    throw new UCloudLoginError(
      "login_failed: captcha_required (set BYRDOCS_OCR_TOKEN or retry later)",
    );
  }
  const ocrRes = await fetch(
    "https://ocr.byrdocs.org/ocr?" +
      new URLSearchParams({ url: captchaUrl, cookie, token: ocr }),
  );
  const ocrJson = (await ocrRes.json().catch(() => null)) as {
    text?: string;
    detail?: string;
  } | null;
  if (!ocrJson?.text) {
    throw new UCloudLoginError(
      "login_failed: captcha_ocr_failed" +
        (ocrJson?.detail ? `: ${ocrJson.detail}` : ""),
    );
  }
  return { cookie, execution, captcha: ocrJson.text };
}

async function exchangeTicket(ticket: string): Promise<UCloudSession> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      accept: "application/json, text/plain, */*",
      authorization: BASIC_AUTH,
      "content-type": "application/x-www-form-urlencoded",
      "tenant-id": "000000",
      Referer: "https://ucloud.bupt.edu.cn/",
    },
    body: `ticket=${encodeURIComponent(ticket)}&grant_type=third`,
  });
  if (!res.ok) {
    throw new UCloudLoginError(`login_failed: token_exchange_${res.status}`);
  }
  return (await res.json()) as UCloudSession;
}

async function getUserRoles(token: string): Promise<RoleInfo[]> {
  const res = await fetch(ROLES_URL, {
    headers: {
      authorization: BASIC_AUTH,
      "Blade-Auth": token,
    },
  });
  if (!res.ok) return [];
  const json = (await res.json()) as { data?: RoleInfo[] };
  return json.data ?? [];
}

async function refreshWithIdentity(
  refreshToken: string,
  identity?: string,
): Promise<UCloudSession> {
  const body = new URLSearchParams();
  body.set("grant_type", "refresh_token");
  body.set("refresh_token", refreshToken);
  if (identity) body.set("identity", identity);
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      authorization: BASIC_AUTH,
      "content-type": "application/x-www-form-urlencoded",
    },
    body,
  });
  if (!res.ok) {
    throw new UCloudLoginError(`login_failed: refresh_${res.status}`);
  }
  return (await res.json()) as UCloudSession;
}

/**
 * Login with student id + unified-auth password.
 * Returns access/refresh tokens; does not persist anything.
 */
export async function loginUCloud(
  username: string,
  password: string,
  opts?: LoginOpts,
): Promise<UCloudSession> {
  const studentId = username.trim();
  const pass = password;
  if (!studentId || !pass) {
    throw new UCloudLoginError("login_failed: empty_credentials");
  }

  const sessionData = await getCookieAndExecution(opts);
  let body =
    `username=${encodeURIComponent(studentId)}` +
    `&password=${encodeURIComponent(pass)}` +
    (sessionData.captcha
      ? `&captcha=${encodeURIComponent(sessionData.captcha)}`
      : "") +
    "&submit=%E7%99%BB%E5%BD%95&type=username_password" +
    `&execution=${sessionData.execution}&_eventId=submit`;

  const response = await fetch(LOGIN_URL, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      cookie: sessionData.cookie,
      referer: LOGIN_URL,
      "user-agent":
        "Mozilla/5.0 (compatible; BUPT-UCloud-bot/0.1; +https://github.com/wangsan71/BUPT-UCloud-bot-Messenger)",
    },
    body,
    redirect: "manual",
  });

  if (response.status !== 302) {
    if (response.status === 401) {
      throw new UCloudLoginError("login_failed: invalid_credentials");
    }
    throw new UCloudLoginError(`login_failed: cas_${response.status}`);
  }
  const location = response.headers.get("Location");
  if (!location) {
    throw new UCloudLoginError("login_failed: missing_redirect");
  }
  const ticket = new URL(location).searchParams.get("ticket");
  if (!ticket) {
    throw new UCloudLoginError("login_failed: missing_ticket");
  }

  const userInfo = await exchangeTicket(ticket);
  if (!userInfo.refresh_token) {
    throw new UCloudLoginError("login_failed: missing_refresh_token");
  }

  const roles = await getUserRoles(userInfo.refresh_token);
  if (roles.length === 0) {
    // Still usable for some APIs; return ticket exchange result.
    return userInfo;
  }
  const preferred =
    roles.find((r) => r.roleName === "学生") ?? roles[0]!;
  try {
    return await refreshWithIdentity(userInfo.refresh_token, preferred.id);
  } catch {
    return userInfo;
  }
}

/** Refresh access token using stored refresh_token. */
export async function refreshUCloud(
  refreshToken: string,
): Promise<UCloudSession> {
  return refreshWithIdentity(refreshToken);
}