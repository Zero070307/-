export const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000;
export const LOGIN_WINDOW_MS = 15 * 60 * 1000;
export const MAX_LOGIN_FAILURES = 5;

export function sessionExpiresAt(issuedAt: Date): Date {
  return new Date(issuedAt.getTime() + SESSION_DURATION_MS);
}

export function isLoginLocked(attempts: Date[], now: Date): boolean {
  return attempts.filter((attempt) => now.getTime() - attempt.getTime() >= 0 && now.getTime() - attempt.getTime() < LOGIN_WINDOW_MS).length >= MAX_LOGIN_FAILURES;
}

export function createSessionToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
