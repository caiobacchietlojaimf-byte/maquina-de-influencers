import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
let client: SupabaseClient | undefined;
export function serverDb() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_KEY) {
    if (process.env.VERCEL) throw new Error("Persistência do sistema indisponível");
    return null;
  }
  return client ??= createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    ...(process.env.MI_DB_SECRET ? { global: { headers: { "x-mi-secret": process.env.MI_DB_SECRET } } } : {}),
  });
}
