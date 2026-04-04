"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

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
            <div className="text-center py-4">
              <p className="font-medium" style={{ color: "var(--foreground)" }}>
                Check your email
              </p>
              <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
                We sent a confirmation link to{" "}
                <span className="font-medium">{email}</span>.
                Click it to activate your account.
              </p>
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
                <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2 dark:text-red-400 dark:bg-red-900/20 dark:border-red-800">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2 px-4 text-white text-sm font-medium rounded-md transition-opacity hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-[#4a90d9] focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ background: "var(--brand-surface)" }}
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
            className="underline underline-offset-2 font-medium hover:opacity-70 transition-opacity focus:outline-none focus:ring-2 focus:ring-[#4a90d9] focus:ring-offset-1 rounded"
            style={{ color: "var(--brand)" }}
          >
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
