import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { createCloudApi } = require('./cloud-api.js');

function createStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
}

function createFetchStub(body = { state: { students: [], history: [] }, version: 1 }) {
  const calls = [];
  const fetch = async (url, options) => {
    calls.push({ url, ...options });
    return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  fetch.calls = calls;
  return fetch;
}

test('cloud client sends bearer token but never stores student data locally', async () => {
  const storage = createStorage();
  const fetch = createFetchStub();
  const client = createCloudApi({ baseUrl: 'https://api.example', fetch, storage });
  await client.setSession({ token: 'session-token', expiresAt: '2026-10-31T00:00:00.000Z' });
  await client.getState();

  assert.equal(fetch.calls[0].headers.Authorization, 'Bearer session-token');
  assert.equal(storage.getItem('teacher_app_students'), null);
  assert.equal(storage.getItem('teacher_app_history'), null);
});

test('expired session is removed before a state request', async () => {
  const storage = createStorage();
  const fetch = createFetchStub();
  const client = createCloudApi({
    baseUrl: 'https://api.example',
    fetch,
    storage,
    now: () => new Date('2026-11-01T00:00:00.000Z'),
  });
  await client.setSession({ token: 'expired', expiresAt: '2026-10-31T00:00:00.000Z' });

  await assert.rejects(client.getState(), /登录已过期/);
  assert.equal(storage.getItem('teacher_app_cloud_session'), null);
  assert.equal(fetch.calls.length, 0);
});

test('standalone app loads the cloud client without an ES-module file import', async () => {
  const html = await fs.readFile(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /<script src="\.\/js\/cloud-api\.js"><\/script>/);
  assert.doesNotMatch(html, /<script type="module">\s*import \{ createCloudApi \} from '\.\/js\/cloud-api\.js';/);
});
