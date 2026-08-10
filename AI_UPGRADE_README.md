# Upgrade Rationale: v3 Multi-Document Storage Redesign

> **Living document.** This file is updated as the plan in `notepad-storage-multidoc-38c0f1.md` (Windsurf plans directory) actually ships, so it always reflects the real, current state of the codebase — not just the original intent. See `V3_PLAN_BACKUP.md` at the repo root for the full phase-by-phase plan and progress checklist.

## Where we're at today

- Text is stored as `lines: string[]`, not a single string, at the React-state/`localStorage` layer (`src/Notepad.tsx`).
- A `v1` (plain string) → `v2` (`{version: 2, lines/title/options}`) migration already exists, implemented as fallthrough logic inside `parseTextLines`/`parseTitle`/`parseOptions` in `src/utils/notepadTypes.ts` (not as separately-named migration functions — that's one of the things this upgrade formalizes for the `v2` → `v3` step).
- The `<textarea>` DOM value is `lines.join('\n')`, re-split into an array on every keystroke (`src/Notepad.tsx`, `handleTextChange`).
- Undo/redo uses a range-replacement delta model (`computeDelta`/`applyDelta`/`revertDelta` in `src/utils/notepadTypes.ts`), which stays structurally unchanged through this upgrade.
- Only a single document is supported today: one `text`, one `title`, one `options` key in `localStorage`, wired through `useNotepad()`.

## Perf improvements & choices made so far

Three perf findings were identified from a prior audit. Each was deliberately triaged rather than blanket-fixed:

1. **Full `lines.join('\n')` / `.split('\n')` of the whole document on every keystroke.** Left as-is. This is O(n) per keystroke, but for the document sizes this app realistically targets in its `<textarea>`-based UI, it isn't the dominant cost, and rewriting the in-memory model is a much bigger structural change (see "What a rope would gain" below) — not warranted just to fix this one call site.
2. **Synchronous, un-debounced `localStorage.setItem` on every keystroke** (`src/utils/useLocalStorage.tsx`). This was the bigger of the two measured costs. Decision: **not patched on the current `localStorage` hook.** Phase 3 of the upgrade plan replaces `localStorage` persistence entirely with debounced IndexedDB writes (using the already-present-but-unused `debounce` export in `src/utils/functions.tsx`). Patching the old hook and then replacing it a few phases later would be wasted work.
3. **`getCursorLine` scans from line 0 on every call** (`src/Notepad.tsx`). Minor cost, but addressed opportunistically in the cursor-position phase of the plan, since that phase already touches this function to add column tracking — a single combined `getCursorPosition(lines, cursorPos)` pass replaces the separate line-scan and column-scan, so the O(n) scan happens once per cursor event instead of twice.

## What a rope would gain

A **trie** is not the right structure here — tries are for prefix lookups (e.g. autocomplete), not mutable document text. The right comparison is a **rope** (or piece-table), which is the standard structure for large-document text editors.

- A rope represents text as a balanced tree of chunks rather than one flat string/array. Insertions and deletions become **O(log n)** instead of the current **O(n)** full-array operations.
- This would let the live `<textarea>`-equivalent UI itself scale to very large documents — which is explicitly **not** solved by this upgrade. IndexedDB fixes the *storage* ceiling (`localStorage`'s ~5–10MB quota), but a native `<textarea>` still requires the full string as its `value` regardless of backend, so editing a 100MB–2GB document in the live UI remains slow/unresponsive after this upgrade ships. See the Flagged Risks section of the plan.
- A rope is the natural prerequisite for building a virtualized/windowed editor (rendering only visible lines), which is the actual fix for large-document UI responsiveness.

## Rope + virtualized editor: now implemented (Phase 13), behind flags

The sketch below was originally "not built in this upgrade." **Phase 13 supersedes that** — both pieces are now implemented, but defaulted-on behind two independent, reversible code-level flags (`src/utils/featureFlags.ts`: `USE_ROPE_MODEL`, `USE_VIRTUALIZED_EDITOR`) rather than an unconditional rewrite, so the original array-based model remains available and differentially testable:

1. `src/utils/textBuffer.ts` defines a `TextBuffer` interface implemented by both `LinesBuffer` (wraps the original `lines: string[]` behavior exactly) and `RopeBuffer` (backed by the new `src/utils/rope.ts` `Rope` class — a custom balanced leaf/concat tree with O(log n) `insert`/`delete`). `computeDelta`/`applyDelta`/`revertDelta` in `src/utils/notepadTypes.ts` are unchanged; `useWorkspace.ts` now calls them through whichever `TextBuffer` `createTextBuffer()` selects, so undo/redo semantics are identical either way.
2. `src/VirtualizedNotepad.tsx` is the windowed-rendering replacement for the `<textarea>` DOM element (rendering only a scroll-position-derived window of lines behind a real `<textarea>`, next to an invisible sizer element for correct scrollbar range). `MainView.tsx` renders it instead of `Notepad.tsx` when `USE_VIRTUALIZED_EDITOR` is true; `Notepad.tsx` remains the fallback and is unaffected when the flag is off.
3. The persisted storage format is unaffected by either flag: `lines: string[]` stays the on-disk IndexedDB shape regardless — the rope is purely an in-memory representation, converted at the storage boundary.
4. Scoped to plain-text `Notepad`/`VirtualizedNotepad` only; `MarkdownNotepad`/ProseMirror is unchanged by this phase.

See `V3_PLAN_BACKUP.md` Phase 13 for the full checklist and test coverage (rope fuzz/differential tests, shared `TextBuffer` conformance suite, flag-flip round-trip safety, and a flag-combination smoke matrix).

## Current upgrade status

Cross-reference `V3_PLAN_BACKUP.md` (repo root) and the canonical plan `notepad-storage-multidoc-38c0f1.md` for the authoritative, up-to-date phase-by-phase checklist. This README documents rationale and history; it is **not** the source of truth for what's implemented — the plan's phase status tags (`[NOT STARTED]` / `[IN PROGRESS]` / `[DONE - NEEDS TESTING]` / `[DONE]`) are.

This section will be updated once the plan actually ships (Phase 10) to reflect the real final v3 architecture (IndexedDB, tabs, markdown, extensions, cursor/line-numbers) and to re-confirm or revise whether the rope option above is still the recommended next step.
