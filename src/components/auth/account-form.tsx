"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { useSession } from "@/components/progress/session-provider";
import { requestJson } from "@/lib/learning/client";
const resultSchema = z.object({ signedIn: z.boolean(), confirmationRequired: z.boolean() });
export function AccountForm({ confirmationFailed = false }: { confirmationFailed?: boolean }) {
  const { user, loading, configured, refresh, pendingAnswers, error: loadError } = useSession();
  const router = useRouter();
  const [signup, setSignup] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  async function authenticate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    const form = new FormData(event.currentTarget);
    try {
      const result = await requestJson("/api/auth", resultSchema, {
        action: signup ? "signup" : "signin",
        email: String(form.get("email")).trim(),
        password: String(form.get("password")),
      });
      if (result.confirmationRequired) {
        setNotice(
          "Check your email to confirm your account. Open the link in this browser, then sign in.",
        );
      } else if (result.signedIn) {
        await refresh(true);
        router.push("/");
        router.refresh();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Authentication failed. Retry.");
    } finally {
      setBusy(false);
    }
  }
  if (loading)
    return (
      <section className="soft-panel mt-7" role="status">
        Loading your account…
      </section>
    );
  if (loadError)
    return (
      <section className="soft-panel mt-7">
        <p role="alert">{loadError}</p>
        <Button className="mt-4" onClick={() => refresh()}>
          Retry loading account
        </Button>
      </section>
    );
  if (!configured)
    return (
      <section className="soft-panel mt-7 max-w-xl">
        <h2 className="section-title">Saved learning starts with Supabase.</h2>
        <p className="mt-3 text-sm leading-7 text-muted-foreground">
          This installation is in preview mode. Configure the two public Supabase environment
          variables and apply the migrations using the README setup guide. No credentials are
          included in this repository.
        </p>
        <p className="mt-3 text-xs text-muted-foreground">
          You can keep exploring the lessons. Preview progress resets on reload and is not
          transferred into an account.
        </p>
      </section>
    );
  return (
    <section className="soft-panel mt-7 max-w-xl">
      {user ? (
        <>
          <h2 className="section-title">Your learning account</h2>
          <p className="mt-3 break-all text-sm">{user.email}</p>
          <p className="mt-3 text-xs leading-6 text-muted-foreground">
            Your history belongs to this account and loads when you sign in on another device.
            Signing out keeps your saved history.
          </p>
          {pendingAnswers.length > 0 && (
            <p role="status" className="mt-4 text-xs">
              Some answers await confirmation. Sync them before signing out. If you sign out, they
              remain in this browser for this account.
            </p>
          )}
          <Button
            variant="outline"
            disabled={busy}
            className="mt-5"
            onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                await requestJson("/api/auth", resultSchema, { action: "signout" });
                await refresh(true);
                router.refresh();
              } catch (e) {
                setError(e instanceof Error ? e.message : "Sign-out failed. Retry.");
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "Signing out…" : "Sign out"}
          </Button>
        </>
      ) : (
        <>
          <h2 className="section-title">
            {signup ? "Create your learning account" : "Welcome back"}
          </h2>
          <p className="mt-3 text-xs leading-6 text-muted-foreground">
            Sign in to save your answers, resume lessons and build your review history. Preview
            progress is not imported.
          </p>
          <form onSubmit={authenticate} className="mt-5 space-y-4">
            <div>
              <label htmlFor="email" className="text-xs font-semibold">
                Email
              </label>
              <input
                required
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                maxLength={254}
                disabled={busy}
                className="mt-2 block h-11 w-full rounded-lg border bg-white px-3 text-sm"
              />
            </div>
            <div>
              <label htmlFor="password" className="text-xs font-semibold">
                Password{signup ? " (at least 8 characters)" : ""}
              </label>
              <input
                required
                id="password"
                name="password"
                type="password"
                autoComplete={signup ? "new-password" : "current-password"}
                minLength={signup ? 8 : 1}
                maxLength={128}
                disabled={busy}
                className="mt-2 block h-11 w-full rounded-lg border bg-white px-3 text-sm"
              />
            </div>
            <Button type="submit" disabled={busy} className="w-full">
              {busy ? "Please wait…" : signup ? "Create account" : "Sign in"}
            </Button>
          </form>
          <button
            disabled={busy}
            onClick={() => {
              setSignup(!signup);
              setError(null);
              setNotice(null);
            }}
            className="mt-4 text-xs font-semibold underline"
          >
            {signup ? "Already have an account? Sign in" : "New here? Create an account"}
          </button>
        </>
      )}
      {confirmationFailed && (
        <p role="alert" className="mt-5 text-sm">
          Email confirmation failed or expired. Open the original confirmation link in the browser
          used to register, or sign in if already confirmed.
        </p>
      )}
      {notice && (
        <p role="status" className="mt-5 text-sm leading-7">
          {notice}
        </p>
      )}
      {error && (
        <p role="alert" className="mt-5 text-sm text-destructive">
          {error}
        </p>
      )}
    </section>
  );
}
