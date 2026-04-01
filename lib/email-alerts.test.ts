import { describe, it, expect } from "vitest";
import {
  findNewReviews,
  generatePlainTextEmail,
  generateHtmlEmail,
  shouldSendAlert,
  type NewReview,
  type AlertDigest,
} from "./email-alerts";
import type { ExistingReview } from "@/types";

describe("email-alerts", () => {
  describe("findNewReviews", () => {
    it("detects new reviews by DOI", () => {
      const current: ExistingReview[] = [
        {
          title: "New Review A",
          doi: "10.1234/new-a",
          pmid: undefined,
          journal: "Journal A",
          year: 2024,
          abstract_snippet: "",
          source: "PubMed",
        },
        {
          title: "Old Review B",
          doi: "10.1234/old-b",
          pmid: undefined,
          journal: "Journal B",
          year: 2023,
          abstract_snippet: "",
          source: "PubMed",
        },
      ];

      const previous: ExistingReview[] = [
        {
          title: "Old Review B",
          doi: "10.1234/old-b",
          pmid: undefined,
          journal: "Journal B",
          year: 2023,
          abstract_snippet: "",
          source: "PubMed",
        },
      ];

      const newReviews = findNewReviews(current, previous);
      expect(newReviews).toHaveLength(1);
      expect(newReviews[0].title).toBe("New Review A");
      expect(newReviews[0].doi).toBe("10.1234/new-a");
    });

    it("detects new reviews by PMID when DOI unavailable", () => {
      const current: ExistingReview[] = [
        {
          title: "New Review",
          pmid: "12345678",
          doi: undefined,
          journal: "Journal A",
          year: 2024,
          abstract_snippet: "",
          source: "PubMed",
        },
      ];

      const previous: ExistingReview[] = [];

      const newReviews = findNewReviews(current, previous);
      expect(newReviews).toHaveLength(1);
      expect(newReviews[0].pmid).toBe("12345678");
    });

    it("detects new reviews by title similarity when no identifier", () => {
      const current: ExistingReview[] = [
        {
          title: "A Review",
          pmid: undefined,
          doi: undefined,
          journal: "Journal",
          year: 2024,
          abstract_snippet: "",
          source: "PubMed",
        },
      ];

      const previous: ExistingReview[] = [];

      const newReviews = findNewReviews(current, previous);
      expect(newReviews).toHaveLength(1);
    });

    it("ignores duplicates with different case in title", () => {
      const current: ExistingReview[] = [
        {
          title: "A REVIEW",
          pmid: undefined,
          doi: undefined,
          journal: "Journal",
          year: 2024,
          abstract_snippet: "",
          source: "PubMed",
        },
      ];

      const previous: ExistingReview[] = [
        {
          title: "a review",
          pmid: undefined,
          doi: undefined,
          journal: "Journal",
          year: 2024,
          abstract_snippet: "",
          source: "PubMed",
        },
      ];

      const newReviews = findNewReviews(current, previous);
      expect(newReviews).toHaveLength(0);
    });

    it("handles empty lists", () => {
      const newReviews = findNewReviews([], []);
      expect(newReviews).toHaveLength(0);
    });
  });

  describe("generatePlainTextEmail", () => {
    it("generates a valid email with new reviews", () => {
      const digest: AlertDigest = {
        searchId: "test-id",
        query: "CBT for anxiety",
        newReviews: [
          {
            title: "Cognitive Behavioral Therapy Review",
            doi: "10.1234/test",
            pmid: "12345",
            journal: "Lancet",
            year: 2024,
            source: "PubMed",
          },
        ],
        totalReviewsCount: 42,
      };

      const email = generatePlainTextEmail(digest, "https://example.com/unsubscribe");

      expect(email).toContain("CBT for anxiety");
      expect(email).toContain("1 new systematic review");
      expect(email).toContain("Cognitive Behavioral Therapy Review");
      expect(email).toContain("Lancet");
      expect(email).toContain("2024");
      expect(email).toContain("Total Existing Reviews: 42");
    });

    it("generates email with no new reviews", () => {
      const digest: AlertDigest = {
        searchId: "test-id",
        query: "Test query",
        newReviews: [],
        totalReviewsCount: 10,
      };

      const email = generatePlainTextEmail(digest, "https://example.com/unsubscribe");

      expect(email).toContain("No new reviews found this week");
      expect(email).toContain("Total Existing Reviews: 10");
    });
  });

  describe("generateHtmlEmail", () => {
    it("generates valid HTML email", () => {
      const digest: AlertDigest = {
        searchId: "test-id",
        query: "CBT for anxiety",
        newReviews: [
          {
            title: "Test Review",
            doi: "10.1234/test",
            journal: "Journal",
            year: 2024,
            source: "PubMed",
          },
        ],
        totalReviewsCount: 10,
      };

      const html = generateHtmlEmail(digest, "https://example.com/unsubscribe");

      expect(html).toContain("<!DOCTYPE html>");
      expect(html).toContain("CBT for anxiety");
      expect(html).toContain("Test Review");
      expect(html).toContain("Journal");
      expect(html).toContain("Unsubscribe");
    });

    it("escapes HTML in titles", () => {
      const digest: AlertDigest = {
        searchId: "test-id",
        query: "Test & Review",
        newReviews: [
          {
            title: 'A Review with <script> & "quotes"',
            source: "PubMed",
          },
        ],
        totalReviewsCount: 1,
      };

      const html = generateHtmlEmail(digest, "https://example.com/unsubscribe");

      expect(html).toContain("&lt;script&gt;");
      expect(html).toContain("&quot;");
      expect(html).toContain("&amp;");
    });
  });

  describe("shouldSendAlert", () => {
    it("always sends when there are new reviews", () => {
      const newReviews: NewReview[] = [
        { title: "Test", source: "PubMed" },
      ];
      expect(shouldSendAlert(newReviews, null)).toBe(true);
      expect(shouldSendAlert(newReviews, new Date())).toBe(true);
    });

    it("sends initial 'no new reviews' digest", () => {
      expect(shouldSendAlert([], null)).toBe(true);
    });

    it("does not repeat 'no new reviews' within 7 days", () => {
      const now = new Date();
      const lastSent = new Date(now.getTime() - 1000 * 60 * 60 * 24 * 3); // 3 days ago
      expect(shouldSendAlert([], lastSent)).toBe(false);
    });

    it("sends 'no new reviews' after 7+ days", () => {
      const now = new Date();
      const lastSent = new Date(now.getTime() - 1000 * 60 * 60 * 24 * 8); // 8 days ago
      expect(shouldSendAlert([], lastSent)).toBe(true);
    });
  });
});
