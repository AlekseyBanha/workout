import { isUuid, json, readJson, requireAdmin } from "../_shared/admin.ts";

Deno.serve(async (req) => {
  const gate = await requireAdmin(req);
  if (gate instanceof Response) return gate;

  const body = await readJson(req);
  if (body instanceof Response) return body;

  const userId = String(body.user_id ?? "");
  const password = String(body.new_password ?? "");
  if (!isUuid(userId) || password.length < 8 || password.length > 72) {
    return json({ error: "invalid_input" }, 400);
  }

  const { error } = await gate.admin.auth.admin.updateUserById(userId, { password });
  if (error) return json({ error: "reset_failed" }, 400);

  return json({ ok: true });
});
