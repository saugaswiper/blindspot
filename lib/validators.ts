import { z } from "zod";
import type { SearchInput } from "@/types";

// ---------------------------------------------------------------------------
// Shared sanitizer
// ---------------------------------------------------------------------------

/**
 * Strips ASCII control characters (0x00–0x1F, 0x7F) from a string.
 *
 * Control characters have no legitimate use in search queries and can be used
 * in prompt-injection attempts (e.g. embedded newlines that push adversarial
 * text past the user-input boundary in Gemini prompts).
 */
function stripControlChars(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/[\x00-\x1F\x7F]/g, " ").replace(/\s+/g, " ").trim();
}

/** Sanitize control chars, then enforce min/max length. */
const sanitizedString = (min: number, max: number, label: string) =>
  z
    .string()
    .transform(stripControlChars)
    .pipe(
      z
        .string()
        .min(min, `${label} must be at least ${min} characters`)
        .max(max, `${label} is too long (max ${max} characters)`)
    );

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const simpleSearchSchema = z.object({
  mode: z.literal("simple"),
  queryText: sanitizedString(3, 500, "Query"),
});

const picoSearchSchema = z.object({
  mode: z.literal("pico"),
  pico: z.object({
    population:   sanitizedString(2, 300, "Population"),
    intervention: sanitizedString(2, 300, "Intervention"),
    comparison:   z
                    .string()
                    .transform(stripControlChars)
                    .pipe(z.string().max(300, "Comparison is too long (max 300 characters)"))
                    .optional(),
    outcome:      sanitizedString(2, 300, "Outcome"),
  }),
});

const searchSchema = z.discriminatedUnion("mode", [
  simpleSearchSchema,
  picoSearchSchema,
]);

export type ValidationResult =
  | { success: true; data: SearchInput }
  | { success: false; errors: Record<string, string> };

export function validateSearchInput(input: unknown): ValidationResult {
  const result = searchSchema.safeParse(input);

  if (result.success) {
    return { success: true, data: result.data as SearchInput };
  }

  const errors: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const key = issue.path.join(".") || "root";
    errors[key] = issue.message;
  }
  return { success: false, errors };
}
