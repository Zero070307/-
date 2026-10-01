import bcrypt from "npm:bcryptjs@2.4.3";
import { AppState } from "../_shared/contracts.ts";
import { createSessionToken, isLoginLocked, SESSION_DURATION_MS, sessionExpiresAt, sha256 } from "../_shared/security.ts";

export type Session = { expiresAt: Date; revokedAt: Date | null };

export type ApiStore = {
  getCredentials(): Promise<{ username: string; passwordHash: string } | null>;
  saveCredentials(username: string, passwordHash: string): Promise<void>;
  getAttempts(clientKey: string): Promise<Date[]>;
  saveAttempts(clientKey: string, attempts: Date[]): Promise<void>;
  createSession(tokenHash: string, expiresAt: Date): Promise<void>;
  getSession(tokenHash: string): Promise<Session | null>;
  revokeSession(tokenHash: string): Promise<void>;
  getState?: () => Promise<{ state: AppState; version: number }>;
  saveState?: (state: AppState, reason: string, expectedVersion: number) => Promise<number>;
  listSnapshots?: () => Promise<Array<{ id: string; reason: string; createdAt: string }>>;
  restoreSnapshot?: (id: string) => Promise<number>;
  bootstrapState?: (state: AppState) => Promise<number>;
};

export type ApiOptions = {
  store: ApiStore;
  now?: () => Date;
  adminUsername: string;
  adminPasscode: string;
  bootstrapSecret?: string;
  allowedOrigins?: string[];
};

function json(body: unknown, status = 200, origin?: string): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...(origin ? { "access-control-allow-origin": origin, "vary": "origin" } : {}),
    },
  });
}

function requestOrigin(request: Request, allowedOrigins: string[]): string | undefined {
  const origin = request.headers.get("origin") ?? "";
  return allowedOrigins.includes(origin) ? origin : undefined;
}

function clientKey(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0].trim() || request.headers.get("cf-connecting-ip") || "unknown-client";
}

async function requestJson(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const value = await request.json();
    return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function isAppState(value: unknown): value is AppState {
  return Boolean(value && typeof value === "object" && Array.isArray((value as AppState).students) && Array.isArray((value as AppState).history));
}

export function createApi(options: ApiOptions) {
  const now = options.now ?? (() => new Date());
  const allowedOrigins = options.allowedOrigins ?? ["https://zero070307.github.io", "http://localhost:3000"];

  async function authenticate(request: Request): Promise<{ tokenHash: string } | null> {
    const authorization = request.headers.get("authorization") ?? "";
    if (!authorization.startsWith("Bearer ")) return null;
    const token = authorization.slice("Bearer ".length).trim();
    if (!token) return null;
    const tokenHash = await sha256(token);
    const session = await options.store.getSession(tokenHash);
    if (!session || session.revokedAt || session.expiresAt.getTime() <= now().getTime()) return null;
    return { tokenHash };
  }

  return async function handleRequest(request: Request): Promise<Response> {
    const origin = requestOrigin(request, allowedOrigins);
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: origin ? {
        "access-control-allow-origin": origin,
        "access-control-allow-methods": "GET,POST,PUT,OPTIONS",
        "access-control-allow-headers": "authorization,content-type,x-bootstrap-secret",
        "vary": "origin",
      } : {} });
    }

    const requestPath = new URL(request.url).pathname;
    const apiIndex = requestPath.indexOf("/api");
    const path = apiIndex >= 0 ? requestPath.slice(apiIndex + 4) || "/" : requestPath || "/";
    try {
      if (request.method === "POST" && path === "/login") {
        const body = await requestJson(request);
        const username = typeof body?.username === "string" ? body.username.trim() : "";
        const passcode = typeof body?.passcode === "string" ? body.passcode : "";
        if (!username || !/^\d{4}$/.test(passcode)) return json({ error: "账号或口令格式不正确" }, 400, origin);

        const key = clientKey(request);
        const activeAttempts = (await options.store.getAttempts(key)).filter((attempt) => now().getTime() - attempt.getTime() < 15 * 60 * 1000);
        if (isLoginLocked(activeAttempts, now())) return json({ error: "尝试次数过多，请 15 分钟后再试" }, 429, origin);

        let credentials = await options.store.getCredentials();
        if (!credentials && username === options.adminUsername && passcode === options.adminPasscode) {
          credentials = { username, passwordHash: bcrypt.hashSync(passcode, 12) };
          await options.store.saveCredentials(credentials.username, credentials.passwordHash);
        }
        const valid = Boolean(credentials && credentials.username === username && bcrypt.compareSync(passcode, credentials.passwordHash));
        if (!valid) {
          activeAttempts.push(now());
          await options.store.saveAttempts(key, activeAttempts);
          return json({ error: "账号或口令错误" }, 401, origin);
        }

        await options.store.saveAttempts(key, []);
        const token = createSessionToken();
        const expiresAt = sessionExpiresAt(now());
        await options.store.createSession(await sha256(token), expiresAt);
        return json({ token, expiresAt: expiresAt.toISOString() }, 200, origin);
      }

      if (request.method === "POST" && path === "/bootstrap") {
        const suppliedSecret = request.headers.get("x-bootstrap-secret") ?? "";
        if (!options.bootstrapSecret || suppliedSecret !== options.bootstrapSecret) return json({ error: "未授权的初始导入请求" }, 401, origin);
        const body = await requestJson(request);
        if (!isAppState(body)) return json({ error: "初始数据格式不正确" }, 400, origin);
        if (!options.store.bootstrapState) return json({ error: "初始导入尚未配置" }, 500, origin);
        return json({ version: await options.store.bootstrapState(body) }, 201, origin);
      }

      const auth = await authenticate(request);
      if (!auth) return json({ error: "登录已过期，请重新登录" }, 401, origin);

      if (request.method === "POST" && path === "/logout") {
        await options.store.revokeSession(auth.tokenHash);
        return json({ ok: true }, 200, origin);
      }
      if (request.method === "GET" && path === "/session") return json({ ok: true }, 200, origin);
      if (request.method === "GET" && path === "/state") {
        if (!options.store.getState) return json({ error: "云端数据尚未配置" }, 500, origin);
        return json(await options.store.getState(), 200, origin);
      }
      if (request.method === "PUT" && path === "/state") {
        const body = await requestJson(request);
        const reason = typeof body?.reason === "string" ? body.reason.trim() : "更新数据";
        const expectedVersion = typeof body?.expectedVersion === "number" ? body.expectedVersion : NaN;
        if (!isAppState(body?.state) || !Number.isInteger(expectedVersion)) return json({ error: "保存数据格式不正确" }, 400, origin);
        if (!options.store.saveState) return json({ error: "云端数据尚未配置" }, 500, origin);
        return json({ version: await options.store.saveState(body.state, reason, expectedVersion) }, 200, origin);
      }
      if (request.method === "GET" && path === "/snapshots") {
        if (!options.store.listSnapshots) return json({ error: "恢复功能尚未配置" }, 500, origin);
        return json({ snapshots: await options.store.listSnapshots() }, 200, origin);
      }
      const restoreMatch = path.match(/^\/snapshots\/([^/]+)\/restore$/);
      if (request.method === "POST" && restoreMatch) {
        if (!options.store.restoreSnapshot) return json({ error: "恢复功能尚未配置" }, 500, origin);
        return json({ version: await options.store.restoreSnapshot(restoreMatch[1]) }, 200, origin);
      }
      return json({ error: "未找到接口" }, 404, origin);
    } catch (error) {
      const message = error instanceof Error ? error.message : "未知错误";
      if (message.includes("stale state version")) return json({ error: "数据已更新，请重新加载后重试" }, 409, origin);
      return json({ error: "服务器暂时无法处理请求" }, 500, origin);
    }
  };
}
