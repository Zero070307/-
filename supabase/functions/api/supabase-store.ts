import { SupabaseClient } from "npm:@supabase/supabase-js@2.49.1";
import { AppState } from "../_shared/contracts.ts";
import { ApiStore, Session } from "./handler.ts";

function requireData<T>(data: T | null, error: { message: string } | null): T {
  if (error) throw new Error(error.message);
  if (data === null) throw new Error("database returned no data");
  return data;
}

export function createSupabaseStore(client: SupabaseClient): ApiStore {
  return {
    async getCredentials() {
      const { data, error } = await client.from("admin_credentials").select("username,password_hash").eq("id", true).maybeSingle();
      if (error) throw new Error(error.message);
      return data ? { username: data.username, passwordHash: data.password_hash } : null;
    },
    async saveCredentials(username, passwordHash) {
      const { error } = await client.from("admin_credentials").upsert({ id: true, username, password_hash: passwordHash, updated_at: new Date().toISOString() });
      if (error) throw new Error(error.message);
    },
    async getAttempts(clientKey) {
      const { data, error } = await client.from("login_attempts").select("attempts").eq("client_key", clientKey).maybeSingle();
      if (error) throw new Error(error.message);
      return Array.isArray(data?.attempts) ? data.attempts.map((value) => new Date(String(value))).filter((value) => !Number.isNaN(value.getTime())) : [];
    },
    async saveAttempts(clientKey, attempts) {
      const { error } = await client.from("login_attempts").upsert({ client_key: clientKey, attempts: attempts.map((attempt) => attempt.toISOString()), updated_at: new Date().toISOString() });
      if (error) throw new Error(error.message);
    },
    async createSession(tokenHash, expiresAt) {
      const { error } = await client.from("admin_sessions").insert({ token_hash: tokenHash, expires_at: expiresAt.toISOString() });
      if (error) throw new Error(error.message);
    },
    async getSession(tokenHash): Promise<Session | null> {
      const { data, error } = await client.from("admin_sessions").select("expires_at,revoked_at").eq("token_hash", tokenHash).maybeSingle();
      if (error) throw new Error(error.message);
      return data ? { expiresAt: new Date(data.expires_at), revokedAt: data.revoked_at ? new Date(data.revoked_at) : null } : null;
    },
    async revokeSession(tokenHash) {
      const { error } = await client.from("admin_sessions").update({ revoked_at: new Date().toISOString() }).eq("token_hash", tokenHash);
      if (error) throw new Error(error.message);
    },
    async getState() {
      const { data, error } = await client.rpc("get_current_state");
      const row = requireData(Array.isArray(data) ? data[0] : data, error);
      return { state: row.state as AppState, version: Number(row.version) };
    },
    async saveState(state, reason, expectedVersion) {
      const { data, error } = await client.rpc("save_state_with_snapshot", { p_state: state, p_reason: reason, p_expected_version: expectedVersion });
      return Number(requireData(data, error));
    },
    async listSnapshots() {
      const { data, error } = await client.from("app_snapshots").select("id,reason,created_at").order("created_at", { ascending: false });
      return requireData(data, error).map((row) => ({ id: row.id, reason: row.reason, createdAt: row.created_at }));
    },
    async restoreSnapshot(id) {
      const { data, error } = await client.rpc("restore_snapshot_with_snapshot", { p_snapshot_id: id });
      return Number(requireData(data, error));
    },
    async bootstrapState(state) {
      const { data, error } = await client.rpc("bootstrap_state_once", { p_state: state });
      return Number(requireData(data, error));
    },
  };
}
