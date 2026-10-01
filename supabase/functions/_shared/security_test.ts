import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { isLoginLocked, sessionExpiresAt } from "./security.ts";

Deno.test("a session expires exactly 30 days after issue time", () => {
  const issuedAt = new Date("2026-10-01T00:00:00.000Z");
  assertEquals(sessionExpiresAt(issuedAt).toISOString(), "2026-10-31T00:00:00.000Z");
});

Deno.test("five failed attempts lock the same client for 15 minutes", () => {
  const attempts = Array.from({ length: 5 }, () => new Date("2026-10-01T00:00:00.000Z"));
  assertEquals(isLoginLocked(attempts, new Date("2026-10-01T00:01:00.000Z")), true);
});
