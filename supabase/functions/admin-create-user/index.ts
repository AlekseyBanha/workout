import { json, readJson, requireAdmin } from "../_shared/admin.ts";

Deno.serve(async (req) => {
  const gate = await requireAdmin(req);
  if (gate instanceof Response) return gate;

  const body = await readJson(req);
  if (body instanceof Response) return body;

  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  const displayName = String(body.display_name ?? "").trim();
  const role = body.role === "admin" ? "admin" : body.role === "user" ? "user" : "";

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 8 || password.length > 72) {
    return json({ error: "invalid_input" }, 400);
  }
  if (!displayName || displayName.length > 80 || !role) {
    return json({ error: "invalid_input" }, 400);
  }

  const { data, error } = await gate.admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name: displayName },
  });

  if (error || !data.user) {
    const message = error?.message?.toLowerCase() ?? "";
    if (message.includes("already") || message.includes("registered") || message.includes("exists")) {
      return json({ error: "email_taken" }, 400);
    }
    return json({ error: "create_failed" }, 400);
  }

  const patch: { display_name: string; role?: string } = { display_name: displayName };
  if (role === "admin") patch.role = "admin";

  const { error: profileError } = await gate.admin
    .from("profiles")
    .update(patch)
    .eq("id", data.user.id);

  if (profileError) {
    await gate.admin.auth.admin.deleteUser(data.user.id);
    return json({ error: "create_failed" }, 500);
  }

  return json({ user_id: data.user.id });
});
