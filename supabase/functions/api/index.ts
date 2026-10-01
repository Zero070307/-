import { createClient } from "npm:@supabase/supabase-js@2.49.1";
import { createApi } from "./handler.ts";
import { createSupabaseStore } from "./supabase-store.ts";

const required = (name: string): string => {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing required secret: ${name}`);
  return value;
};

const client = createClient(required("SUPABASE_URL"), required("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
const allowedOrigins = (Deno.env.get("ALLOWED_ORIGINS") ?? "https://zero070307.github.io").split(",").map((origin) => origin.trim()).filter(Boolean);

Deno.serve(createApi({
  store: createSupabaseStore(client),
  adminUsername: required("ADMIN_USERNAME"),
  adminPasscode: required("ADMIN_PASSCODE"),
  bootstrapSecret: required("BOOTSTRAP_SECRET"),
  allowedOrigins,
}));
