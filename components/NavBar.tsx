import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { SignOutButton } from "@/components/SignOutButton";
import { NavHelpButton } from "@/components/OnboardingTour";
import { ThemeToggle } from "@/components/ThemeToggle";

export async function NavBar() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  return (
    <nav
      style={{
        borderBottom: "1px solid var(--border)",
        background: "var(--surface)",
      }}
    >
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-2">
        {/* Wordmark */}
        <Link
          href="/"
          className="font-serif text-xl tracking-tight transition-opacity hover:opacity-80"
          style={{ color: "var(--foreground)" }}
        >
          Blindspot
        </Link>

        <div className="flex items-center gap-1 sm:gap-3">
          <NavHelpButton />
          <ThemeToggle />

          {user ? (
            <>
              <Link
                href="/dashboard"
                className="text-sm transition-opacity hover:opacity-100 hidden sm:block px-2 py-1"
                style={{ color: "var(--muted)", opacity: 0.8 }}
              >
                My Searches
              </Link>
              <span
                className="hidden md:block text-xs truncate max-w-[140px]"
                style={{ color: "var(--muted)" }}
              >
                {user.email}
              </span>
              <SignOutButton />
            </>
          ) : (
            <>
              <Link
                href="/login"
                className="text-sm px-2 py-1 transition-opacity hover:opacity-100"
                style={{ color: "var(--muted)", opacity: 0.8 }}
              >
                Sign in
              </Link>
              <Link
                href="/signup"
                className="text-sm font-medium px-3.5 py-1.5 rounded transition-colors whitespace-nowrap"
                style={{
                  background: "var(--brand-surface)",
                  color: "#f4f1ea",
                }}
              >
                Sign up free
              </Link>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}
