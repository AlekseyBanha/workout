import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabaseConfigured = Boolean(
  url && anonKey && !url.includes("your-project") && !anonKey.includes("your-anon-key"),
);

export const supabase = supabaseConfigured ? createClient(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
}) : null;

export function exerciseImageUrl(path: string | null): string | null {
  if (!path || !supabase) return null;
  return supabase.storage.from("exercise-images").getPublicUrl(path).data.publicUrl;
}
