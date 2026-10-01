const SESSION_STORAGE_KEY = 'teacher_app_cloud_session';

export class CloudApiError extends Error {
  constructor(message, status = 0) {
    super(message);
    this.name = 'CloudApiError';
    this.status = status;
  }
}

function parseJson(value) {
  try { return JSON.parse(value); } catch { return null; }
}

function messageFor(status, body) {
  if (typeof body?.error === 'string') return body.error;
  if (status === 401) return '登录已过期，请重新登录';
  if (status === 409) return '数据已更新，请重新加载后重试';
  if (status === 429) return '尝试次数过多，请稍后再试';
  return '云端服务暂时不可用，请检查网络后重试';
}

export function createCloudApi({ baseUrl, fetch = globalThis.fetch, storage = globalThis.localStorage, now = () => new Date() }) {
  if (!baseUrl) throw new Error('缺少云端接口地址');
  const url = baseUrl.replace(/\/$/, '');

  function getSession() {
    const raw = storage.getItem(SESSION_STORAGE_KEY);
    const session = raw ? parseJson(raw) : null;
    if (!session?.token || !session?.expiresAt || new Date(session.expiresAt).getTime() <= now().getTime()) {
      if (raw) storage.removeItem(SESSION_STORAGE_KEY);
      return null;
    }
    return session;
  }

  async function request(path, { method = 'GET', body, authenticated = true } = {}) {
    const session = authenticated ? getSession() : null;
    if (authenticated && !session) throw new CloudApiError('登录已过期，请重新登录', 401);
    let response;
    try {
      response = await fetch(`${url}${path}`, {
        method,
        headers: {
          Accept: 'application/json',
          ...(body ? { 'Content-Type': 'application/json' } : {}),
          ...(session ? { Authorization: `Bearer ${session.token}` } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
    } catch {
      throw new CloudApiError('网络连接失败，请检查网络后重试');
    }
    const responseBody = parseJson(await response.text());
    if (!response.ok) {
      if (response.status === 401) storage.removeItem(SESSION_STORAGE_KEY);
      throw new CloudApiError(messageFor(response.status, responseBody), response.status);
    }
    return responseBody;
  }

  return {
    async setSession(session) {
      if (!session?.token || !session?.expiresAt) throw new Error('登录会话格式不正确');
      storage.setItem(SESSION_STORAGE_KEY, JSON.stringify({ token: session.token, expiresAt: session.expiresAt }));
    },
    getSession,
    clearSession() { storage.removeItem(SESSION_STORAGE_KEY); },
    async login(username, passcode) {
      const result = await request('/login', { method: 'POST', body: { username, passcode }, authenticated: false });
      await this.setSession(result);
      return { expiresAt: result.expiresAt };
    },
    getState() { return request('/state'); },
    saveState(state, reason, expectedVersion) { return request('/state', { method: 'PUT', body: { state, reason, expectedVersion } }); },
    listSnapshots() { return request('/snapshots'); },
    restoreSnapshot(id) { return request(`/snapshots/${encodeURIComponent(id)}/restore`, { method: 'POST' }); },
    async logout() {
      try { await request('/logout', { method: 'POST' }); } finally { storage.removeItem(SESSION_STORAGE_KEY); }
    },
  };
}

if (typeof window !== 'undefined') {
  window.createCloudApi = createCloudApi;
  window.CloudApiError = CloudApiError;
}
