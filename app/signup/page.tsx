"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { ThemeToggle } from "@/components/ThemeToggle";

export default function SignupPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      setLoading(false);
      return;
    }

    const supabase = createClient();
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${location.origin}/` },
    });

    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      setSuccess(true);
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
            Create a free account to save your searches
          </p>
        </div>

        <div
          className="rounded-lg shadow-sm p-8"
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
          }}
        >
          {success ? (
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
                We sent a confirmation link to{" "}
                <span className="font-medium">{email}</span>.
                Click it to activate your account.
              </p>
              <Link
                href="/login"
                className="mt-4 inline-block text-sm underline underline-offset-2 hover:opacity-70 transition-opacity focus:outline-none focus:ring-2 focus:ring-[color:var(--ring)] focus:ring-offset-2 [--tw-ring-offset-color:var(--surface)] rounded"
                style={{ color: "var(--brand)" }}
              >
                Back to sign in
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSignup} className="space-y-4">
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
                  placeholder="Min. 8 characters"
                />
              </div>

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
                {loading ? "Creating account..." : "Create free account"}
              </button>
            </form>
          )}
        </div>

        <p className="text-center text-sm mt-4" style={{ color: "var(--muted)" }}>
          Already have an account?{" "}
          <Link
            href="/login"
            className="underline underline-offset-2 font-medium hover:opacity-70 transition-opacity focus:outline-none focus:ring-2 focus:ring-[color:var(--ring)] focus:ring-offset-1 [--tw-ring-offset-color:var(--background)] rounded"
            style={{ color: "var(--brand)" }}
          >
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
