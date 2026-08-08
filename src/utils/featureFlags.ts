// ---------------------------------------------------------------------------
// Phase 13 feature flags — rope data structure & virtualized editor
// ---------------------------------------------------------------------------
//
// Two independent flags, both defaulting to the new/optimal behavior. These
// are intentionally plain code-level constants for now — there is no
// runtime settings UI to toggle them yet. That's a deliberate scoping
// decision (see the plan doc's Phase 13), not an oversight: a future
// upgrade could expose these via a debug/demo panel or a `localStorage`
// override, but building that UI is out of scope for this phase.
//
// `USE_ROPE_MODEL` selects the in-memory text representation used by
// `useWorkspace()`'s per-document edit/undo/redo model:
//   - false (legacy): `LinesBuffer`, a thin wrapper around the original
//     `lines: string[]` + `computeDelta`/`applyDelta`/`revertDelta` model.
//   - true (default): `RopeBuffer`, backed by the new `Rope` class.
// Either way, `lines: string[]` remains the on-disk (IndexedDB) format —
// this flag only affects the in-memory runtime representation.
export const USE_ROPE_MODEL = true;

// `USE_VIRTUALIZED_EDITOR` selects which component renders the active
// plain-text document:
//   - false (legacy): `Notepad`, the existing native `<textarea>`.
//   - true (default): `VirtualizedNotepad`, a windowed/virtualized editor
//     that only renders the visible line range.
// Only affects the plain-text editor — `MarkdownNotepad` (TipTap/
// ProseMirror) is unaffected by either flag.
export const USE_VIRTUALIZED_EDITOR = true;
