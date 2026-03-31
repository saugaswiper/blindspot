import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { SignOutButton } from "@/components/SignOutButton";
import { NavHelpButton } from "@/components/OnboardingTour";

export async function NavBar() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  return (
    <nav className="bg-white border-b border-gray-200">
      <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between gap-2">
        <Link href="/" className="text-lg font-bold text-[#1e3a5f]">
          Blindspot
        </Link>

        <div className="flex items-center gap-2 sm:gap-4">
          <NavHelpButton />
          {user ? (
            <>
              <Link
                href="/dashboard"
                className="text-sm text-gray-500 hover:text-gray-700 whitespace-nowrap"
              >
                My Searches
              </Link>
              <span className="hidden sm:block text-xs text-gray-400 truncate max-w-[160px]">
                {user.email}
              </span>
              <SignOutButton />
            </>
          ) : (
            <>
              <Link href="/login" className="text-sm text-gray-500 hover:text-gray-700">
                Sign in
              </Link>
              <Link
                href="/signup"
                className="text-sm bg-[#1e3a5f] text-white px-3 py-1.5 rounded-md hover:bg-[#2d5a8e] transition-colors whitespace-nowrap"
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
