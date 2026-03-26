import { z } from "zod";
import type { SearchInput } from "@/types";

const simpleSearchSchema = z.object({
  mode: z.literal("simple"),
  queryText: z
    .string()
    .min(3, "Please enter at least 3 characters")
    .max(500, "Query is too long (max 500 characters)"),
});

const picoSearchSchema = z.object({
  mode: z.literal("pico"),
  pico: z.object({
    population: z
      .string()
      .min(2, "Population field is required")
      .max(300, "Too long"),
    intervention: z
      .string()
      .min(2, "Intervention field is required")
      .max(300, "Too long"),
    comparison: z.string().max(300, "Too long").optional(),
    outcome: z
      .string()
      .min(2, "Outcome field is required")
      .max(300, "Too long"),
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
