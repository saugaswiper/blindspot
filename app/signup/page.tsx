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

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-[#1e3a5f] dark:text-blue-300">Blindspot</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1 text-sm">Create a free account to save your searches</p>
        </div>

        <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm p-8">
          {success ? (
            <div className="text-center py-4">
              <p className="text-gray-700 dark:text-gray-300 font-medium">Check your email</p>
              <p className="text-gray-600 dark:text-gray-400 text-sm mt-1">
                We sent a confirmation link to <span className="font-medium">{email}</span>.
                Click it to activate your account.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSignup} className="space-y-4">
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Email address
                </label>
                <input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-800 placeholder:text-gray-500 dark:placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#2d5a8e] focus:border-transparent"
                  placeholder="you@university.edu"
                />
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-800 placeholder:text-gray-500 dark:placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#2d5a8e] focus:border-transparent"
                  placeholder="Min. 8 characters"
                />
              </div>

              {error && (
                <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded px-3 py-2">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2 px-4 bg-[#1e3a5f] dark:bg-blue-700 text-white text-sm font-medium rounded-md hover:bg-[#2d5a8e] dark:hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-[#2d5a8e] focus:ring-offset-2 transition-colors disabled:bg-[#4a6580] disabled:text-white disabled:cursor-not-allowed"
              >
                {loading ? "Creating account..." : "Create free account"}
              </button>
            </form>
          )}
        </div>

        <p className="text-center text-sm text-gray-600 dark:text-gray-400 mt-4">
          Already have an account?{" "}
          <Link href="/login" className="text-[#1e3a5f] dark:text-blue-400 hover:text-[#2d5a8e] dark:hover:text-blue-300 underline underline-offset-2 font-medium focus:outline-none focus:ring-2 focus:ring-[#2d5a8e] focus:ring-offset-1 rounded">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
