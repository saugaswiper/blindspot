"use client";

import { useState } from "react";

interface Props {
  searchId: string;
  isSubscribed?: boolean;
  isOwner: boolean;
}

export function AlertSubscription({
  searchId,
  isSubscribed = false,
  isOwner,
}: Props) {
  const [subscribed, setSubscribed] = useState(isSubscribed);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleToggleSubscription() {
    if (isLoading) return;
    setIsLoading(true);
    setMessage(null);

    try {
      const endpoint = subscribed ? "/api/alerts/unsubscribe" : "/api/alerts/subscribe";
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ searchId }),
      });

      const data = (await res.json()) as { success?: boolean; error?: string };

      if (!res.ok || data.error) {
        setMessage(data.error ?? "Failed to update subscription");
        return;
      }

      setSubscribed(!subscribed);
      setMessage(
        subscribed
          ? "You'll no longer receive alerts for this search."
          : "You'll receive weekly email alerts when new reviews are found!"
      );

      // Clear message after 4 seconds
      setTimeout(() => setMessage(null), 4000);
    } catch (error) {
      setMessage("An error occurred. Please try again.");
      console.error("Subscription error:", error);
    } finally {
      setIsLoading(false);
    }
  }

  // Only show to the owner
  if (!isOwner) {
    return null;
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-gray-900">Email Alerts</h3>
          <p className="text-sm text-gray-500 mt-1">
            Get weekly email updates when new systematic reviews are discovered
            on this topic.
          </p>
        </div>
        <button
          onClick={handleToggleSubscription}
          disabled={isLoading}
          className={`shrink-0 px-4 py-2 text-sm font-medium rounded-md border transition-colors disabled:opacity-50 ${
            subscribed
              ? "bg-blue-50 border-[#4a90d9] text-[#4a90d9] hover:bg-blue-100"
              : "border-gray-300 text-gray-700 hover:border-[#4a90d9] hover:text-[#4a90d9]"
          }`}
        >
          {isLoading ? "Updating..." : subscribed ? "Subscribed" : "Subscribe"}
        </button>
      </div>

      {message && (
        <p className={`text-xs mt-3 ${
          subscribed
            ? "text-green-700 bg-green-50"
            : "text-blue-700 bg-blue-50"
        } px-3 py-2 rounded`}>
          {message}
        </p>
      )}
    </div>
  );
}
