// Placeholder page — Phase 2 will replace this with the full search pipeline.
import Link from "next/link";

export default function SearchPage() {
  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-10 max-w-md w-full text-center">
        <div className="w-12 h-12 rounded-full bg-[#1e3a5f] flex items-center justify-center mx-auto mb-4">
          <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
        <h1 className="text-xl font-semibold text-[#1e3a5f] mb-2">Analyzing research gaps&hellip;</h1>
        <p className="text-sm text-gray-500">
          The search pipeline is coming in Phase 2. Your query was received — well done testing the form!
        </p>
        <Link
          href="/"
          className="mt-6 inline-block text-sm text-[#4a90d9] hover:underline"
        >
          Back to search
        </Link>
      </div>
    </main>
  );
}
