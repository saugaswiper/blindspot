import { isLivingReview, isLivingReviewByTitle } from "./living-review-detection";

describe("Living Review Detection", () => {
  describe("isLivingReview()", () => {
    it("detects 'living systematic review' in title", () => {
      expect(
        isLivingReview(
          "A living systematic review of cognitive behavioral therapy for insomnia",
          "Abstract text here"
        )
      ).toBe(true);
    });

    it("detects 'living review' in abstract", () => {
      expect(
        isLivingReview(
          "Cognitive behavioral therapy for insomnia",
          "This is a living review that is continuously updated with new evidence..."
        )
      ).toBe(true);
    });

    it("is case-insensitive", () => {
      expect(
        isLivingReview(
          "A LIVING SYSTEMATIC REVIEW of treatments",
          "Abstract here"
        )
      ).toBe(true);
    });

    it("detects both variants", () => {
      expect(
        isLivingReview(
          "A Living Review of Meta-Analyses",
          "This living systematic review updates evidence monthly"
        )
      ).toBe(true);
    });

    it("returns false for non-living reviews", () => {
      expect(
        isLivingReview(
          "A systematic review of cognitive behavioral therapy",
          "This review summarizes the current evidence on CBT for insomnia"
        )
      ).toBe(false);
    });

    it("returns false for reviews mentioning 'living' in other contexts", () => {
      expect(
        isLivingReview(
          "Quality of life in patients with depression",
          "Living conditions and mental health outcomes were assessed"
        )
      ).toBe(false);
    });
  });

  describe("isLivingReviewByTitle()", () => {
    it("detects living reviews by title alone", () => {
      expect(
        isLivingReviewByTitle(
          "A living systematic review of depression treatments"
        )
      ).toBe(true);
    });

    it("returns false when no living indicator in title", () => {
      expect(
        isLivingReviewByTitle("A systematic review of depression treatments")
      ).toBe(false);
    });
  });
});
