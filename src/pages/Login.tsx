import { useState, type FormEvent } from "react";
import { Navigate } from "react-router";
import { z } from "zod";
import { uk } from "../i18n/uk.ts";
import { authErrorCode, messageForCode } from "../lib/admin-api.ts";
import { useAuth } from "../lib/auth.tsx";
import { supabaseConfigured } from "../lib/supabase.ts";
import { Field, Loading, Logo, fieldClass, primaryButton, useTitle } from "../components/ui.tsx";

const loginSchema = z.object({
  email: z.email(uk.errors.email),
  password: z.string().min(1, uk.login.passwordRequired),
});

function issues(error: z.ZodError): Record<string, string> {
  const map: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    if (!map[key]) map[key] = issue.message;
  }
  return map;
}

export function LoginPage() {
  const { session, loading, signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldError, setFieldError] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);
  useTitle(uk.login.title);

  if (loading) return <Loading />;
  if (session) return <Navigate to="/exercises" replace />;

  async function submit(event: FormEvent) {
    event.preventDefault();
    const parsed = loginSchema.safeParse({ email, password });
    if (!parsed.success) {
      setFieldError(issues(parsed.error));
      setFormError("");
      return;
    }
    setFieldError({});
    if (!supabaseConfigured) {
      setFormError(uk.login.configText);
      return;
    }
    setBusy(true);
    const message = await signIn(parsed.data.email, parsed.data.password);
    setBusy(false);
    setFormError(message ? messageForCode(authErrorCode(message)) : "");
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-lg flex-col justify-center px-4 py-10">
      <div className="mb-8 flex items-center gap-3">
        <Logo className="h-12 w-12" />
        <div>
          <h1 className="text-2xl font-semibold">{uk.appName}</h1>
          <p className="text-sm text-muted">{uk.tagline}</p>
        </div>
      </div>
      {!supabaseConfigured ? (
        <div className="mb-4 rounded-2xl border border-amber/40 bg-amber/10 px-4 py-3 text-sm">
          <p className="font-medium">{uk.login.configTitle}</p>
          <p className="mt-1 text-muted">{uk.login.configText}</p>
        </div>
      ) : null}
      <form className="space-y-4 rounded-3xl border border-line bg-panel p-4" noValidate onSubmit={(event) => void submit(event)}>
        <Field label={uk.login.email} error={fieldError.email}>
          <input
            className={fieldClass}
            type="email"
            autoComplete="username"
            inputMode="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </Field>
        <Field label={uk.login.password} error={fieldError.password}>
          <input
            className={fieldClass}
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </Field>
        {formError ? <p className="text-sm text-danger">{formError}</p> : null}
        <button type="submit" className={primaryButton} disabled={busy}>
          {busy ? uk.login.submitting : uk.login.submit}
        </button>
      </form>
    </div>
  );
}
