"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { ThemeToggle } from "@/components/ThemeToggle";

type Mode = "password" | "magic-link";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [magicLinkSent, setMagicLinkSent] = useState(false);

  async function handlePasswordLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      router.push("/dashboard");
      router.refresh();
    }
  }

  async function handleMagicLink(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${location.origin}/` },
    });

    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      setMagicLinkSent(true);
      setLoading(false);
    }
  }

  const inputClass =
    "w-full px-3 py-2 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[color:var(--ring)] placeholder:opacity-40";

  return (
    <div
      className="relative min-h-screen flex items-center justify-center px-4"
      style={{ background: "var(--background)" }}
    >
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link
            href="/"
            className="inline-block rounded focus:outline-none focus:ring-2 focus:ring-[color:var(--ring)] focus:ring-offset-2 [--tw-ring-offset-color:var(--background)]"
          >
            <h1 className="text-2xl font-bold font-serif" style={{ color: "var(--brand)" }}>
              Blindspot
            </h1>
          </Link>
          <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
            Sign in to your account
          </p>
        </div>

        <div
          className="rounded-lg shadow-sm p-8"
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
          }}
        >
          {/* Mode toggle */}
          <div
            className="flex rounded-md p-1 mb-6"
            style={{ border: "1px solid var(--border)" }}
          >
            {(["password", "magic-link"] as Mode[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => { setMode(m); setError(null); }}
                className="flex-1 text-sm py-1.5 rounded transition-all focus:outline-none focus:ring-2 focus:ring-[color:var(--ring)] focus:ring-offset-1 [--tw-ring-offset-color:var(--surface)]"
                style={
                  mode === m
                    ? { background: "var(--brand-surface)", color: "var(--on-brand)", border: "1px solid var(--brand-border)" }
                    : { color: "var(--muted)", border: "1px solid transparent" }
                }
              >
                {m === "password" ? "Password" : "Magic Link"}
              </button>
            ))}
          </div>

          {magicLinkSent ? (
            <div className="text-center py-4" role="status" aria-live="polite">
              <div
                className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full"
                style={{ background: "var(--success-bg)", color: "var(--success)" }}
              >
                <span className="text-lg" aria-hidden="true">✓</span>
              </div>
              <p className="font-medium" style={{ color: "var(--foreground)" }}>
                Check your email
              </p>
              <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
                We sent a sign-in link to <span className="font-medium">{email}</span>
              </p>
              <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
                It expires in 1 hour.
              </p>
              <button
                type="button"
                onClick={() => setMagicLinkSent(false)}
                className="mt-4 text-sm underline underline-offset-2 hover:opacity-70 transition-opacity focus:outline-none focus:ring-2 focus:ring-[color:var(--ring)] focus:ring-offset-2 [--tw-ring-offset-color:var(--surface)] rounded"
                style={{ color: "var(--brand)" }}
              >
                Didn&apos;t get it? Back to sign in
              </button>
            </div>
          ) : (
            <form
              onSubmit={mode === "password" ? handlePasswordLogin : handleMagicLink}
              className="space-y-4"
            >
              <div>
                <label
                  htmlFor="email"
                  className="block text-sm font-medium mb-1"
                  style={{ color: "var(--foreground)" }}
                >
                  Email address
                </label>
                <input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={inputClass}
                  style={{
                    background: "var(--surface)",
                    color: "var(--foreground)",
                    border: "1px solid var(--border)",
                  }}
                  placeholder="you@university.edu"
                />
              </div>

              {mode === "password" && (
                <div>
                  <label
                    htmlFor="password"
                    className="block text-sm font-medium mb-1"
                    style={{ color: "var(--foreground)" }}
                  >
                    Password
                  </label>
                  <input
                    id="password"
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={inputClass}
                    style={{
                      background: "var(--surface)",
                      color: "var(--foreground)",
                      border: "1px solid var(--border)",
                    }}
                    placeholder="••••••••"
                  />
                </div>
              )}

              {error && (
                <p
                  role="alert"
                  className="text-sm rounded px-3 py-2"
                  style={{ color: "var(--danger)", background: "var(--danger-bg)", border: "1px solid var(--danger)" }}
                >
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2 px-4 text-sm font-medium rounded-md transition-opacity hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-[color:var(--ring)] focus:ring-offset-2 [--tw-ring-offset-color:var(--surface)] disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ background: "var(--brand-surface)", color: "var(--on-brand)", border: "1px solid var(--brand-border)" }}
              >
                {loading
                  ? "Signing in..."
                  : mode === "password"
                  ? "Sign in"
                  : "Send magic link"}
              </button>
            </form>
          )}
        </div>

        <p className="text-center text-sm mt-4" style={{ color: "var(--muted)" }}>
          Don&apos;t have an account?{" "}
          <Link
            href="/signup"
            className="underline underline-offset-2 font-medium hover:opacity-70 transition-opacity focus:outline-none focus:ring-2 focus:ring-[color:var(--ring)] focus:ring-offset-1 [--tw-ring-offset-color:var(--background)] rounded"
            style={{ color: "var(--brand)" }}
          >
            Sign up free
          </Link>
        </p>
      </div>
    </div>
  );
}
