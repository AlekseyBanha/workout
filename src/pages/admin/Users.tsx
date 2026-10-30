import { useEffect, useState, type FormEvent } from "react";
import { z } from "zod";
import { fill, uk } from "../../i18n/uk.ts";
import { invokeAdmin, messageForCode } from "../../lib/admin-api.ts";
import { useAuth } from "../../lib/auth.tsx";
import { formatDate } from "../../lib/dates.ts";
import { supabase } from "../../lib/supabase.ts";
import { asList, asProfile, type Profile, type Role } from "../../lib/types.ts";
import {
  chipButton,
  chipDanger,
  ConfirmDialog,
  ErrorState,
  Field,
  Loading,
  Sheet,
  fieldClass,
  primaryButton,
  useTitle,
} from "../../components/ui.tsx";

const createSchema = z.object({
  email: z.email(uk.errors.email),
  password: z.string().min(8, uk.errors.passwordMin).max(72),
  display_name: z.string().trim().min(1, uk.errors.name).max(80),
  role: z.enum(["user", "admin"]),
});

const passwordSchema = z.object({
  new_password: z.string().min(8, uk.errors.passwordMin).max(72),
});

function issues(error: z.ZodError): Record<string, string> {
  const map: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    if (!map[key]) map[key] = issue.message;
  }
  return map;
}

export function AdminUsersPage() {
  const { profile } = useAuth();
  const [users, setUsers] = useState<Profile[]>([]);
  const [phase, setPhase] = useState<"loading" | "error" | "ready">("loading");
  const [reload, setReload] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);
  const [resetTarget, setResetTarget] = useState<Profile | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Profile | null>(null);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");
  const [fieldError, setFieldError] = useState<Record<string, string>>({});
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState<Role>("user");
  const [nextPassword, setNextPassword] = useState("");
  useTitle(uk.admin.users);

  useEffect(() => {
    if (!supabase) return;
    let active = true;
    setPhase("loading");
    supabase
      .from("profiles")
      .select("id, email, display_name, role, created_at")
      .order("created_at", { ascending: false })
      .then(({ data, error }) => {
        if (!active) return;
        if (error) {
          setPhase("error");
          return;
        }
        setUsers(asList(data, asProfile));
        setPhase("ready");
      });
    return () => {
      active = false;
    };
  }, [reload]);

  function resetCreate() {
    setEmail("");
    setPassword("");
    setDisplayName("");
    setRole("user");
    setFieldError({});
    setFormError("");
  }

  async function createUser(event: FormEvent) {
    event.preventDefault();
    const parsed = createSchema.safeParse({ email, password, display_name: displayName, role });
    if (!parsed.success) {
      setFieldError(issues(parsed.error));
      return;
    }
    setFieldError({});
    setBusy(true);
    setFormError("");
    try {
      await invokeAdmin("admin-create-user", parsed.data);
      setCreateOpen(false);
      resetCreate();
      setReload((value) => value + 1);
    } catch (error) {
      setFormError(messageForCode(error instanceof Error ? error.message : "generic"));
    } finally {
      setBusy(false);
    }
  }

  async function resetPassword(event: FormEvent) {
    event.preventDefault();
    if (!resetTarget) return;
    const parsed = passwordSchema.safeParse({ new_password: nextPassword });
    if (!parsed.success) {
      setFieldError(issues(parsed.error));
      return;
    }
    setBusy(true);
    setFormError("");
    try {
      await invokeAdmin("admin-reset-password", { user_id: resetTarget.id, new_password: parsed.data.new_password });
      setResetTarget(null);
      setNextPassword("");
    } catch (error) {
      setFormError(messageForCode(error instanceof Error ? error.message : "generic"));
    } finally {
      setBusy(false);
    }
  }

  async function deleteUser() {
    if (!deleteTarget) return;
    setBusy(true);
    setFormError("");
    try {
      await invokeAdmin("admin-delete-user", { user_id: deleteTarget.id });
      setDeleteTarget(null);
      setReload((value) => value + 1);
    } catch (error) {
      setFormError(messageForCode(error instanceof Error ? error.message : "generic"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{uk.admin.users}</h1>
        <button
          type="button"
          className={`${primaryButton} w-auto px-4`}
          onClick={() => {
            resetCreate();
            setCreateOpen(true);
          }}
        >
          {uk.admin.createUser}
        </button>
      </div>
      {phase === "loading" ? <Loading /> : null}
      {phase === "error" ? <ErrorState message={uk.admin.usersError} onRetry={() => setReload((value) => value + 1)} /> : null}
      {phase === "ready" && users.length === 0 ? <p className="text-sm text-muted">{uk.admin.usersEmpty}</p> : null}
      {phase === "ready" && users.length > 0 ? (
        <div className="overflow-x-auto rounded-3xl border border-line">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="bg-panel text-muted">
              <tr>
                <th className="px-3 py-3 font-medium">{uk.admin.email}</th>
                <th className="px-3 py-3 font-medium">{uk.admin.name}</th>
                <th className="px-3 py-3 font-medium">{uk.admin.role}</th>
                <th className="px-3 py-3 font-medium">{uk.admin.created}</th>
                <th className="px-3 py-3 font-medium">{uk.admin.actions}</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id} className="border-t border-line">
                  <td className="px-3 py-3 break-all">{user.email}</td>
                  <td className="px-3 py-3">{user.display_name}</td>
                  <td className="px-3 py-3">{user.role === "admin" ? uk.admin.roleAdmin : uk.admin.roleUser}</td>
                  <td className="px-3 py-3">{formatDate(user.created_at.slice(0, 10))}</td>
                  <td className="px-3 py-3">
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        className={chipButton}
                        onClick={() => {
                          setResetTarget(user);
                          setNextPassword("");
                          setFieldError({});
                          setFormError("");
                        }}
                      >
                        {uk.admin.resetPassword}
                      </button>
                      <button
                        type="button"
                        className={chipDanger}
                        onClick={() => {
                          if (user.id === profile?.id) {
                            setFormError(uk.admin.cannotDeleteSelf);
                            return;
                          }
                          setFormError("");
                          setDeleteTarget(user);
                        }}
                      >
                        {uk.delete}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {createOpen ? (
        <Sheet title={uk.admin.createUser} onClose={() => setCreateOpen(false)}>
          <form className="space-y-3" noValidate onSubmit={(event) => void createUser(event)}>
            <Field label={uk.admin.email} error={fieldError.email}>
              <input className={fieldClass} type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
            </Field>
            <Field label={uk.admin.password} error={fieldError.password}>
              <input className={fieldClass} type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
            </Field>
            <Field label={uk.admin.name} error={fieldError.display_name}>
              <input className={fieldClass} value={displayName} onChange={(event) => setDisplayName(event.target.value)} />
            </Field>
            <Field label={uk.admin.role}>
              <select className={fieldClass} value={role} onChange={(event) => setRole(event.target.value === "admin" ? "admin" : "user")}>
                <option value="user">{uk.admin.roleUser}</option>
                <option value="admin">{uk.admin.roleAdmin}</option>
              </select>
            </Field>
            {formError ? <p className="text-sm text-danger">{formError}</p> : null}
            <button type="submit" className={primaryButton} disabled={busy}>{busy ? uk.saving : uk.admin.createUser}</button>
          </form>
        </Sheet>
      ) : null}
      {resetTarget ? (
        <Sheet title={uk.admin.resetPassword} onClose={() => setResetTarget(null)}>
          <form className="space-y-3" noValidate onSubmit={(event) => void resetPassword(event)}>
            <p className="text-sm text-muted">{resetTarget.email}</p>
            <Field label={uk.admin.newPassword} error={fieldError.new_password}>
              <input className={fieldClass} type="password" value={nextPassword} onChange={(event) => setNextPassword(event.target.value)} />
            </Field>
            {formError ? <p className="text-sm text-danger">{formError}</p> : null}
            <button type="submit" className={primaryButton} disabled={busy}>{busy ? uk.saving : uk.save}</button>
          </form>
        </Sheet>
      ) : null}
      {deleteTarget ? (
        <ConfirmDialog
          title={uk.admin.deleteUser}
          body={formError || fill(uk.admin.deleteUserConfirm, { email: deleteTarget.email })}
          confirmLabel={uk.delete}
          busy={busy}
          onClose={() => setDeleteTarget(null)}
          onConfirm={() => void deleteUser()}
        />
      ) : null}
      {formError && !createOpen && !resetTarget && !deleteTarget ? <p className="text-sm text-danger">{formError}</p> : null}
    </div>
  );
}
