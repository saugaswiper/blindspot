import Link from "next/link";
import { NavBar } from "@/components/NavBar";

/**
 * /alerts/unsubscribed
 *
 * Confirmation page shown after a user clicks the one-click unsubscribe
 * link in their weekly email digest.
 *
 * Accepts an optional `?error=` query parameter to show a contextual message:
 *   - (none)       → success: "You've been unsubscribed"
 *   - invalid      → bad token format in the link
 *   - not_found    → token not found (alert may have been deleted or already unsubscribed)
 *   - server       → unexpected server error during unsubscribe
 */

interface PageProps {
  searchParams: Promise<{ error?: string }>;
}

type ErrorCode = "invalid" | "not_found" | "server";

const ERROR_MESSAGES: Record<ErrorCode, { heading: string; body: string }> = {
  invalid: {
    heading: "Invalid unsubscribe link",
    body: "This unsubscribe link is malformed. If you received it in an email from Blindspot, please sign in to manage your alert preferences directly.",
  },
  not_found: {
    heading: "Already unsubscribed",
    body: "This alert subscription was not found — it may have already been cancelled or the link has expired. No action was needed.",
  },
  server: {
    heading: "Something went wrong",
    body: "We couldn't process your unsubscribe request right now. Please try again in a moment, or sign in to manage your alert preferences.",
  },
};

export default async function UnsubscribedPage({ searchParams }: PageProps) {
  const { error } = await searchParams;

  const isError = !!error;
  const errorCode = (error as ErrorCode | undefined) ?? null;
  const errorContent = errorCode ? ERROR_MESSAGES[errorCode] ?? ERROR_MESSAGES.server : null;

  return (
    <main className="min-h-screen bg-gray-50">
      <NavBar />

      <div className="max-w-lg mx-auto px-4 py-20 text-center">
        {isError ? (
          <>
            {/* Error state */}
            <div className="w-14 h-14 rounded-full bg-amber-100 flex items-center justify-center mx-auto mb-6">
              <span className="text-2xl" aria-hidden="true">⚠</span>
            </div>

            <h1 className="text-2xl font-bold text-[#1e3a5f] mb-3">
              {errorContent?.heading ?? "Something went wrong"}
            </h1>
            <p className="text-gray-600 text-sm leading-relaxed mb-8">
              {errorContent?.body ?? ERROR_MESSAGES.server.body}
            </p>

            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Link
                href="/dashboard"
                className="inline-block text-sm bg-[#1e3a5f] text-white px-5 py-2.5 rounded-md hover:bg-[#2d5a8e] transition-colors"
              >
                Manage alerts in dashboard
              </Link>
              <Link
                href="/"
                className="inline-block text-sm border border-gray-300 text-gray-700 px-5 py-2.5 rounded-md hover:border-gray-400 hover:bg-white transition-colors"
              >
                Back to home
              </Link>
            </div>
          </>
        ) : (
          <>
            {/* Success state */}
            <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-6">
              <span className="text-2xl" aria-hidden="true">✓</span>
            </div>

            <h1 className="text-2xl font-bold text-[#1e3a5f] mb-3">
              You&apos;ve been unsubscribed
            </h1>
            <p className="text-gray-600 text-sm leading-relaxed mb-8">
              You&apos;ll no longer receive weekly email digests for this search topic.
              You can re-enable alerts at any time from your searches dashboard.
            </p>

            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Link
                href="/dashboard"
                className="inline-block text-sm bg-[#1e3a5f] text-white px-5 py-2.5 rounded-md hover:bg-[#2d5a8e] transition-colors"
              >
                View my searches
              </Link>
              <Link
                href="/"
                className="inline-block text-sm border border-gray-300 text-gray-700 px-5 py-2.5 rounded-md hover:border-gray-400 hover:bg-white transition-colors"
              >
                Run a new search
              </Link>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
