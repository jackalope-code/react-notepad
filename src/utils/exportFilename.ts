// ---------------------------------------------------------------------------
// Export filename construction (Phase 8)
// ---------------------------------------------------------------------------
//
// Builds the filename used when exporting a document to a downloadable file.
// The document title is user-controlled free text and may contain
// characters that are unsafe or illegal in filenames on common filesystems
// (e.g. Windows disallows `/ \ : * ? " < > |`). This module sanitizes the
// title before it's combined with the chosen extension, without ever
// mutating the stored document title itself.

const UNSAFE_FILENAME_CHARS = /[/\\:*?"<>|]/g;

/**
 * Sanitizes a document title for use as a filename: trims surrounding
 * whitespace, replaces filesystem-unsafe characters with `_`, and falls
 * back to "Untitled" if the result is empty (e.g. an empty or
 * whitespace-only title). Unicode characters are preserved as-is.
 */
export function sanitizeFilenameTitle(title: string): string {
  const trimmed = title.trim();
  const sanitized = trimmed.replace(UNSAFE_FILENAME_CHARS, '_');
  return sanitized.length > 0 ? sanitized : 'Untitled';
}

/**
 * Builds the full export filename from a document's title and the
 * extension chosen at export time. Pure function — never mutates the
 * source title, so exporting the same document twice with different
 * extensions (or two documents with identical titles) is always safe.
 */
export function buildExportFilename(title: string, extension: string): string {
  return `${sanitizeFilenameTitle(title)}.${extension}`;
}
