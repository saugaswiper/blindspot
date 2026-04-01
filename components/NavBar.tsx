import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { SignOutButton } from "@/components/SignOutButton";
import { NavHelpButton } from "@/components/OnboardingTour";
import { ThemeToggle } from "@/components/ThemeToggle";

export async function NavBar() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  return (
    <nav className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
      <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between gap-2">
        <Link href="/" className="text-lg font-bold text-[#1e3a5f] dark:text-blue-300">
          Blindspot
        </Link>

        <div className="flex items-center gap-2 sm:gap-4">
          <NavHelpButton />
          <ThemeToggle />
          {user ? (
            <>
              <Link
                href="/dashboard"
                className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 whitespace-nowrap"
              >
                My Searches
              </Link>
              <span className="hidden sm:block text-xs text-gray-600 dark:text-gray-400 truncate max-w-[160px]">
                {user.email}
              </span>
              <SignOutButton />
            </>
          ) : (
            <>
              <Link
                href="/login"
                className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
              >
                Sign in
              </Link>
              <Link
                href="/signup"
                className="text-sm bg-[#1e3a5f] dark:bg-blue-700 text-white px-3 py-1.5 rounded-md hover:bg-[#2d5a8e] dark:hover:bg-blue-600 transition-colors whitespace-nowrap"
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
