import { isUuid, json, readJson, requireAdmin } from "../_shared/admin.ts";

Deno.serve(async (req) => {
  const gate = await requireAdmin(req);
  if (gate instanceof Response) return gate;

  const body = await readJson(req);
  if (body instanceof Response) return body;

  const userId = String(body.user_id ?? "");
  if (!isUuid(userId)) return json({ error: "invalid_input" }, 400);
  if (userId === gate.userId) return json({ error: "cannot_delete_self" }, 400);

  const { error } = await gate.admin.auth.admin.deleteUser(userId);
  if (error) return json({ error: "delete_failed" }, 400);

  return json({ ok: true });
});
