/**
 * Email alert utilities for Blindspot.
 *
 * Manages sending weekly email digests to users who have opted into alerts
 * on their saved searches. When new systematic reviews are discovered, users
 * get notified via email.
 */

import type { ExistingReview } from "@/types";

/**
 * Represents a new review discovered since the last check.
 */
export interface NewReview {
  title: string;
  doi?: string;
  pmid?: string;
  journal?: string;
  year?: number;
  source: string;
}

/**
 * Alert digest data for a single search.
 */
export interface AlertDigest {
  searchId: string;
  query: string;
  newReviews: NewReview[];
  totalReviewsCount: number;
}

/**
 * Find reviews that are new compared to a previous result set.
 *
 * Compares based on DOI or PMID (if available) and title similarity.
 *
 * @param currentReviews - The current set of existing reviews
 * @param previousReviews - The previous set (from last alert check)
 * @returns Array of reviews that are new
 */
export function findNewReviews(
  currentReviews: ExistingReview[],
  previousReviews: ExistingReview[]
): NewReview[] {
  // Build a set of identifiers from previous reviews for fast lookup
  const previousIds = new Set<string>();

  for (const review of previousReviews) {
    if (review.doi) previousIds.add(`doi:${review.doi}`);
    if (review.pmid) previousIds.add(`pmid:${review.pmid}`);
  }

  // Filter for reviews not in the previous set
  const newReviews: NewReview[] = [];

  for (const review of currentReviews) {
    let isNew = true;

    // If we have a DOI or PMID, use that for comparison (most reliable)
    if (review.doi) {
      isNew = !previousIds.has(`doi:${review.doi}`);
    } else if (review.pmid) {
      isNew = !previousIds.has(`pmid:${review.pmid}`);
    } else {
      // Fall back to title-based check for reviews without identifiers
      // (rare but possible from some sources)
      const lowerTitle = review.title.toLowerCase().trim();
      isNew = !previousReviews.some(
        (prev) => prev.title.toLowerCase().trim() === lowerTitle
      );
    }

    if (isNew) {
      newReviews.push({
        title: review.title,
        doi: review.doi,
        pmid: review.pmid,
        journal: review.journal,
        year: review.year,
        source: review.source || "Unknown",
      });
    }
  }

  return newReviews;
}

/**
 * Generate plain-text email body for an alert digest.
 */
export function generatePlainTextEmail(
  digest: AlertDigest,
  unsubscribeToken: string
): string {
  const { query, newReviews, totalReviewsCount } = digest;

  let content = `New Systematic Reviews Found for "${query}"\n`;
  content += `${"=".repeat(60)}\n\n`;

  if (newReviews.length === 0) {
    content += "No new reviews found this week.\n\n";
  } else {
    content += `${newReviews.length} new systematic review(s) discovered:\n\n`;

    for (const review of newReviews) {
      content += `Title: ${review.title}\n`;
      if (review.journal) content += `Journal: ${review.journal}\n`;
      if (review.year) content += `Year: ${review.year}\n`;
      if (review.doi) content += `DOI: ${review.doi}\n`;
      if (review.pmid) content += `PubMed ID: ${review.pmid}\n`;
      content += `Source: ${review.source}\n`;
      content += "\n";
    }
  }

  content += `\nTotal Existing Reviews: ${totalReviewsCount}\n`;
  content += "\n---\n";
  content += "Reply to this email or visit Blindspot to see full analysis.\n";
  content += `To unsubscribe from alerts: ${unsubscribeToken}\n`;

  return content;
}

/**
 * Generate HTML email body for an alert digest.
 * Clean, responsive design suitable for email clients.
 */
export function generateHtmlEmail(
  digest: AlertDigest,
  unsubscribeToken: string
): string {
  const { query, newReviews, totalReviewsCount } = digest;

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f5f5f5; margin: 0; padding: 0; }
    .container { max-width: 600px; margin: 20px auto; background-color: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
    .header { background-color: #1e3a5f; color: white; padding: 32px 24px; }
    .header h1 { margin: 0; font-size: 24px; font-weight: 600; }
    .header p { margin: 8px 0 0 0; opacity: 0.9; font-size: 14px; }
    .content { padding: 24px; }
    .metric { display: inline-block; margin-right: 24px; }
    .metric-label { font-size: 12px; color: #666; text-transform: uppercase; letter-spacing: 0.5px; }
    .metric-value { font-size: 28px; font-weight: bold; color: #1e3a5f; margin-top: 4px; }
    .reviews-section { margin-top: 24px; }
    .review { background-color: #f9f9f9; border-left: 4px solid #4a90d9; padding: 16px; margin-bottom: 12px; border-radius: 4px; }
    .review-title { font-weight: 600; color: #1e3a5f; margin: 0 0 8px 0; }
    .review-meta { font-size: 13px; color: #666; line-height: 1.5; }
    .review-meta span { display: inline-block; margin-right: 12px; }
    .empty-state { text-align: center; padding: 32px 24px; color: #666; }
    .footer { background-color: #f5f5f5; padding: 24px; border-top: 1px solid #e0e0e0; font-size: 12px; color: #666; text-align: center; }
    .footer a { color: #4a90d9; text-decoration: none; }
    .cta-button { display: inline-block; background-color: #4a90d9; color: white; text-decoration: none; padding: 12px 24px; border-radius: 6px; margin-top: 16px; font-weight: 500; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>New Reviews Found</h1>
      <p>Your weekly update for "${query}"</p>
    </div>

    <div class="content">
      <div>
        <div class="metric">
          <div class="metric-label">New This Week</div>
          <div class="metric-value">${newReviews.length}</div>
        </div>
        <div class="metric">
          <div class="metric-label">Total Existing</div>
          <div class="metric-value">${totalReviewsCount}</div>
        </div>
      </div>

      ${
        newReviews.length === 0
          ? `
      <div class="empty-state">
        <p>No new reviews found this week.</p>
      </div>
      `
          : `
      <div class="reviews-section">
        <h3 style="margin-top: 24px; margin-bottom: 12px; color: #1e3a5f;">New Systematic Reviews</h3>
        ${newReviews
          .map(
            (review) => `
        <div class="review">
          <p class="review-title">${escapeHtml(review.title)}</p>
          <div class="review-meta">
            ${review.journal ? `<span><strong>Journal:</strong> ${escapeHtml(review.journal)}</span>` : ""}
            ${review.year ? `<span><strong>Year:</strong> ${review.year}</span>` : ""}
            ${review.source ? `<span><strong>Source:</strong> ${review.source}</span>` : ""}
            ${review.doi ? `<span><strong>DOI:</strong> <a href="https://doi.org/${encodeURIComponent(review.doi)}" style="color: #4a90d9;">${escapeHtml(review.doi)}</a></span>` : ""}
          </div>
        </div>
        `
          )
          .join("")}
      </div>
      `
      }
    </div>

    <div class="footer">
      <p>You received this email because you opted in to weekly alerts for this search.</p>
      <p><a href="${unsubscribeToken}">Unsubscribe from this search</a></p>
    </div>
  </div>
</body>
</html>
  `.trim();
}

/**
 * Escape HTML special characters for safe email rendering.
 */
function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  };
  return text.replace(/[&<>"']/g, (m) => map[m]);
}

/**
 * Check if an alert digest should be sent.
 * Don't send "no new reviews" emails too frequently.
 */
export function shouldSendAlert(newReviews: NewReview[], lastSentAt: Date | null): boolean {
  if (newReviews.length > 0) {
    // Always send when there are new reviews
    return true;
  }

  // Only send "no new reviews" digest if it's been at least 7 days
  if (lastSentAt) {
    const daysSinceLast = (Date.now() - lastSentAt.getTime()) / (1000 * 60 * 60 * 24);
    return daysSinceLast >= 7;
  }

  // Never sent before, so send this first "no new" digest
  return true;
}
