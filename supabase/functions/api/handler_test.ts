import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createApi } from "./handler.ts";

const now = new Date("2026-10-01T00:00:00.000Z");

function createFakeStore() {
  const sessions = new Map<string, { expiresAt: Date; revokedAt: Date | null }>();
  return {
    credentials: null as { username: string; passwordHash: string } | null,
    attempts: [] as Date[],
    async getCredentials() { return this.credentials; },
    async saveCredentials(username: string, passwordHash: string) { this.credentials = { username, passwordHash }; },
    async getAttempts() { return this.attempts; },
    async saveAttempts(_clientKey: string, attempts: Date[]) { this.attempts = attempts; },
    async createSession(tokenHash: string, expiresAt: Date) { sessions.set(tokenHash, { expiresAt, revokedAt: null }); },
    async getSession(tokenHash: string) { return sessions.get(tokenHash) ?? null; },
    async revokeSession(tokenHash: string) { const session = sessions.get(tokenHash); if (session) session.revokedAt = now; },
  };
}

Deno.test("state route rejects a request without a bearer token", async () => {
  const api = createApi({ store: createFakeStore(), now: () => now, adminUsername: "test-admin", adminPasscode: "1234" });
  const response = await api(new Request("https://api.example/state"));
  assertEquals(response.status, 401);
});

Deno.test("login returns a token that expires in 30 days after valid credentials", async () => {
  const api = createApi({ store: createFakeStore(), now: () => now, adminUsername: "test-admin", adminPasscode: "1234" });
  const response = await api(new Request("https://api.example/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: "test-admin", passcode: "1234" }),
  }));
  const body = await response.json();
  assertEquals(response.status, 200);
  assertEquals(body.expiresAt, "2026-10-31T00:00:00.000Z");
  assertEquals(typeof body.token, "string");
});
