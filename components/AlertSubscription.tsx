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
    <div
      className="rounded-lg p-4 sm:p-5 mt-4"
      style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <h3 className="text-sm font-semibold" style={{ color: "var(--foreground)" }}>
            Email Alerts
          </h3>
          <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
            Get weekly email updates when new systematic reviews are discovered
            on this topic.
          </p>
        </div>
        <button
          onClick={handleToggleSubscription}
          disabled={isLoading}
          className="shrink-0 px-4 py-2 text-sm font-medium rounded-md transition-all disabled:opacity-50"
          style={
            subscribed
              ? {
                  background: "color-mix(in srgb, var(--accent) 12%, transparent)",
                  border: "1px solid var(--accent)",
                  color: "var(--accent)",
                }
              : {
                  background: "transparent",
                  border: "1px solid var(--border)",
                  color: "var(--muted)",
                }
          }
        >
          {isLoading ? "Updating…" : subscribed ? "Subscribed ✓" : "Subscribe"}
        </button>
      </div>

      {message && (
        <p
          className="text-xs mt-3 px-3 py-2 rounded"
          style={{
            color: subscribed ? "var(--accent)" : "var(--foreground)",
            background: "var(--surface-2)",
          }}
        >
          {message}
        </p>
      )}
    </div>
  );
}
