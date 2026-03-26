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

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-[#1e3a5f]">Blindspot</h1>
          <p className="text-gray-600 mt-1 text-sm">Sign in to your account</p>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-8">
          {/* Mode toggle */}
          <div className="flex rounded-md border border-gray-200 p-1 mb-6">
            <button
              type="button"
              onClick={() => { setMode("password"); setError(null); }}
              className={`flex-1 text-sm py-1.5 rounded transition-colors focus:outline-none focus:ring-2 focus:ring-[#2d5a8e] focus:ring-offset-1 ${
                mode === "password"
                  ? "bg-[#1e3a5f] text-white"
                  : "text-gray-700 hover:text-gray-900"
              }`}
            >
              Password
            </button>
            <button
              type="button"
              onClick={() => { setMode("magic-link"); setError(null); }}
              className={`flex-1 text-sm py-1.5 rounded transition-colors focus:outline-none focus:ring-2 focus:ring-[#2d5a8e] focus:ring-offset-1 ${
                mode === "magic-link"
                  ? "bg-[#1e3a5f] text-white"
                  : "text-gray-700 hover:text-gray-900"
              }`}
            >
              Magic Link
            </button>
          </div>

          {magicLinkSent ? (
            <div className="text-center py-4">
              <p className="text-gray-700 font-medium">Check your email</p>
              <p className="text-gray-600 text-sm mt-1">
                We sent a sign-in link to <span className="font-medium">{email}</span>
              </p>
            </div>
          ) : (
            <form onSubmit={mode === "password" ? handlePasswordLogin : handleMagicLink} className="space-y-4">
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                  Email address
                </label>
                <input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm text-gray-900 placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-[#2d5a8e] focus:border-transparent"
                  placeholder="you@university.edu"
                />
              </div>

              {mode === "password" && (
                <div>
                  <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                    Password
                  </label>
                  <input
                    id="password"
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm text-gray-900 placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-[#2d5a8e] focus:border-transparent"
                    placeholder="••••••••"
                  />
                </div>
              )}

              {error && (
                <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2 px-4 bg-[#1e3a5f] text-white text-sm font-medium rounded-md hover:bg-[#2d5a8e] focus:outline-none focus:ring-2 focus:ring-[#2d5a8e] focus:ring-offset-2 transition-colors disabled:bg-[#4a6580] disabled:text-white disabled:cursor-not-allowed"
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

        <p className="text-center text-sm text-gray-600 mt-4">
          Don&apos;t have an account?{" "}
          <Link href="/signup" className="text-[#1e3a5f] hover:text-[#2d5a8e] underline underline-offset-2 font-medium focus:outline-none focus:ring-2 focus:ring-[#2d5a8e] focus:ring-offset-1 rounded">
            Sign up free
          </Link>
        </p>
      </div>
    </div>
  );
}
