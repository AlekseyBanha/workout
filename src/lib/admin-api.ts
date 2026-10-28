import { uk } from "../i18n/uk.ts";
import { supabase } from "./supabase.ts";

const messages: Record<string, string> = {
  forbidden: uk.admin.forbidden,
  invalid_input: uk.errors.generic,
  email_taken: uk.admin.emailTaken,
  cannot_delete_self: uk.admin.cannotDeleteSelf,
  unauthorized: uk.login.invalid,
  create_failed: uk.errors.generic,
  delete_failed: uk.errors.generic,
  reset_failed: uk.errors.generic,
  config: uk.login.configText,
  network: uk.errors.network,
};

export function messageForCode(code: string): string {
  return messages[code] ?? uk.errors.generic;
}

export async function invokeAdmin<T>(name: string, body: object): Promise<T> {
  if (!supabase) throw new Error("config");
  try {
    const { data, error } = await supabase.functions.invoke(name, { body });
    if (error) {
      let code = "generic";
      const context = (error as { context?: Response }).context;
      if (context && typeof context.json === "function") {
        try {
          const payload = (await context.json()) as { error?: string };
          if (payload.error) code = payload.error;
        } catch {
          code = "generic";
        }
      } else if (/failed to fetch|network/i.test(error.message)) {
        code = "network";
      }
      throw new Error(code);
    }
    return data as T;
  } catch (error) {
    if (error instanceof Error && messages[error.message]) throw error;
    if (error instanceof TypeError) throw new Error("network");
    throw new Error("generic");
  }
}

export function authErrorCode(message: string): string {
  if (/invalid login|invalid credentials|email not confirmed/i.test(message)) return "unauthorized";
  if (/fetch|network|failed/i.test(message)) return "network";
  return "generic";
}
