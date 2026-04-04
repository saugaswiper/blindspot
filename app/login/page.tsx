"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

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
    "w-full px-3 py-2 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#4a90d9] focus:border-transparent placeholder:opacity-40";

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{ background: "var(--background)" }}
    >
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold font-serif" style={{ color: "var(--brand)" }}>
            Blindspot
          </h1>
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
                className="flex-1 text-sm py-1.5 rounded transition-all focus:outline-none focus:ring-2 focus:ring-[#4a90d9] focus:ring-offset-1"
                style={
                  mode === m
                    ? { background: "var(--brand)", color: "#fff" }
                    : { color: "var(--muted)" }
                }
              >
                {m === "password" ? "Password" : "Magic Link"}
              </button>
            ))}
          </div>

          {magicLinkSent ? (
            <div className="text-center py-4">
              <p className="font-medium" style={{ color: "var(--foreground)" }}>
                Check your email
              </p>
              <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
                We sent a sign-in link to <span className="font-medium">{email}</span>
              </p>
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
                <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2 dark:text-red-400 dark:bg-red-900/20 dark:border-red-800">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2 px-4 text-white text-sm font-medium rounded-md transition-opacity hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-[#4a90d9] focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ background: "var(--brand)" }}
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
            className="underline underline-offset-2 font-medium hover:opacity-70 transition-opacity focus:outline-none focus:ring-2 focus:ring-[#4a90d9] focus:ring-offset-1 rounded"
            style={{ color: "var(--brand)" }}
          >
            Sign up free
          </Link>
        </p>
      </div>
    </div>
  );
}
