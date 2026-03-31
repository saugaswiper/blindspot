/**
 * lib/protocol-storage.ts
 *
 * Pure utilities for protocol draft file operations.
 *
 * Previously the filename-derivation logic lived inline inside ProtocolBlock.
 * Extracting it here makes it independently testable and reusable (e.g. for
 * server-side filename generation if protocol drafts are ever served as
 * downloadable files from an API endpoint).
 */

// ---------------------------------------------------------------------------
// deriveProtocolFilename
// ---------------------------------------------------------------------------

/**
 * Derive a filesystem-safe `.md` filename from the first Markdown heading
 * in a protocol draft.
 *
 * Algorithm:
 * 1. Find the first `# Heading` line (ATX-style, single `#`).
 * 2. Lowercase the heading text.
 * 3. Replace any run of non-alphanumeric characters with a single hyphen.
 * 4. Strip leading/trailing hyphens.
 * 5. Truncate to 60 characters.
 * 6. Append `.md`.
 *
 * Falls back to `"protocol.md"` when:
 * - No `# Heading` line is found.
 * - The slug produced by the above steps is empty (e.g. heading is all
 *   punctuation).
 *
 * @param protocol - The full Markdown text of the protocol draft.
 * @returns A filename string ending in `.md`.
 *
 * @example
 * deriveProtocolFilename("# A Systematic Review of CBT for Insomnia\n...");
 * // → "a-systematic-review-of-cbt-for-insomnia.md"
 *
 * @example
 * deriveProtocolFilename("No heading here");
 * // → "protocol.md"
 */
export function deriveProtocolFilename(protocol: string): string {
  const titleMatch = protocol.match(/^#\s+(.+)$/m);
  if (!titleMatch) return "protocol.md";

  const slug = titleMatch[1]
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);

  return `${slug || "protocol"}.md`;
}

// ---------------------------------------------------------------------------
// hasStoredProtocol
// ---------------------------------------------------------------------------

/**
 * Return `true` when a protocol draft string is non-null and non-empty.
 *
 * This guard is used in several places in the UI to decide whether to show the
 * stored draft immediately (status = "done") or the generate-prompt CTA
 * (status = "idle").
 *
 * @param draft - The value of `protocol_draft` from Supabase (may be null/undefined).
 */
export function hasStoredProtocol(draft: string | null | undefined): draft is string {
  return typeof draft === "string" && draft.trim().length > 0;
}
