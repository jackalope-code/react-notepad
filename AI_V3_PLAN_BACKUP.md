# V3 Plan Backup (Resume Point)

> Backup of the originally approved plan, kept at the repo root so this context can be recovered if the session/workspace is interrupted mid-implementation. Track progress against the phase list below; resume at the first incomplete phase.
>
> **Do not reference personal user directories, usernames, or absolute local file paths anywhere in this document.** Use repo-relative paths only (e.g. `src/Notepad.tsx:68-106`, not `C:\Users\<name>\...\src\Notepad.tsx:68-106`).

# Multi-Document v3 Storage Redesign: IndexedDB, Chained Migration, Export-Time Extensions, Markdown Rendering, and Reliability/Perf Test Coverage

Harden the existing test suite first, then ship a breaking `v3` storage format — multi-document tabs (each with an export-time-only file extension choice and optional per-document live-markdown rendering) backed by IndexedDB, with an explicit chained `v1→v2→v3` migration, runtime data-integrity safeguards, coverage-enforced test gaps, and small/medium/large document performance benchmarks.

## Current State (confirmed by code audit)

- Text is **already** stored as `lines: string[]`, not a single string, at the React-state/localStorage layer (`src/Notepad.tsx:68-106`).
- A `v1` (plain string) → `v2` (`{version:2, lines/title/options}`) migration already exists in `src/utils/notepadTypes.ts:104-144`, implemented as fallthrough logic inside `parseTextLines`/`parseTitle`/`parseOptions` (not as separately-named migration functions).
- The `<textarea>` DOM value is still `lines.join('\n')`, re-split into an array on every keystroke (`src/Notepad.tsx:154-159`).
- Undo/redo uses a range-replacement delta model (`computeDelta`/`applyDelta`/`revertDelta`), already well-tested.
- Only a single document is supported: one `text`, one `title`, one `options` key in `localStorage`, wired through `useNotepad()`.
- `localStorage` has a hard ~5–10MB per-origin quota — **incompatible** with the medium (100MB) / large (2GB) document targets requested. This is the primary driver for switching the v3 backend to **IndexedDB**.
- `src/utils/persistence.tsx` is unused/dead scaffold code — will be removed.
- **Perf findings from a prior audit (Text Editor Storage Migration conversation)**, incorporated into this plan:
  - Full `lines.join('\n')`/`.split('\n')` of the whole document on every keystroke (`src/Notepad.tsx:154-159,179`) — evaluated and intentionally left as-is; consistent with the existing "no rope/piece-table rewrite" non-goal below, since it's not the dominant cost and a rewrite isn't warranted at this scope.
  - Synchronous, un-debounced `localStorage.setItem` on every keystroke (`src/utils/useLocalStorage.tsx:21-24`) — identified as the bigger of the two costs; **decision: not patched on the current `localStorage` hook**, since Phase 3 replaces it with debounced IndexedDB writes (using the already-unused `debounce` from `functions.tsx`) — fixing it twice isn't worth it given the v3 migration is imminent.
  - `getCursorLine` scans from line 0 on every call (`src/Notepad.tsx:55-62`) — minor, but addressed opportunistically in Phase 5 below since that phase already touches this function to add column tracking.

## Goals

1. **Test hardening first, with prioritized coverage gaps**: close all identified gaps in current coverage (including previously-untested `App.tsx`/`NavBar.tsx`) before any redesign, establishing a regression baseline.
2. **v3 = breaking change, explicitly versioned**: new format is tagged `version: 3`; old `localStorage` v1/v2 data is migrated once, automatically, on first load.
3. **Explicit chained migration functions**: `migrateV1toV2()` and `migrateV2toV3()` as separate, independently unit-tested functions, composed as `migrateV2toV3(migrateV1toV2(raw))` — not a single monolithic parser.
4. **Multi-document model**: N open documents as tabs, new tab via rightmost `+` button, independent `lines`/`title`/`options`/undo-redo per document, all tabs + active index persisted.
5. **Storage backend: IndexedDB** for the v3 workspace (documents + tabs), enabling realistic multi-MB/GB document storage. `localStorage` is only read from (never written to) for legacy v1/v2 migration input.
6. **Data integrity during migration**: verify no content loss (line/char count checks) after each migration stage; fail-safe fallback to a blank document (never throw/crash) if migration produces invalid data; legacy `localStorage` keys are left untouched as a backup, never deleted.
7. **Coverage-enforced testing**: add `@vitest/coverage-v8` with a minimum threshold (e.g. 90%) scoped to `src/utils/**` (migration/storage logic), so untested surfaces fail CI, not just human review.
8. **Reliability/speed/correctness benchmarks**: dedicated tests for small (10KB), medium (100MB), and large (2GB) documents covering edit correctness, edit/migration speed budgets, and memory usage where measurable in Node/jsdom.
9. **Export**: "Save as file" opens an export dialog where the user picks the **file extension at export time** (dropdown of `.txt .md .yaml .json .py .java .c .cpp` plus an arbitrary free-text option), then downloads via `Blob` + `<a download>` (cross-platform, no File System Access API dependency). Extension is not stored on the document; it can differ every time the same document is exported.
10. **Per-document live markdown rendering**: an inline WYSIWYG editor (markdown syntax renders live in place, e.g. `**bold**` -> bold) toggled per-document via a dedicated Document Settings page (Save/Back). New documents default to **markdown enabled = true**; documents migrated from legacy v1/v2 data default to **false** (no surprise behavior change for existing users). Setting persists with the document in IndexedDB.
11. **Routing**: introduce `react-router-dom` with `/` (tab bar + active document editor) and `/settings/:documentId` (per-document settings) routes.
12. **Cursor position display**: track and display **line and column** (not just line) in a status bar at the bottom-left of the editor, for both the plain-textarea and future TipTap markdown editors.
13. **Optional line-number gutter**: a global toolbar toggle (next to "Wrap text") that shows a visual-only line-count gutter — not part of the text content, not selectable/copyable, not saved into `lines`.
14. **Clear undo/redo controls**: fix the invalid `aria-details` attribute (→ `aria-label`) on the existing undo/redo buttons, add visible text/tooltip labels, and disable each button when there's nothing to undo/redo.
15. **No functional regressions**: undo/redo, cursor-line tracking, and wrap option keep working per-tab.

## Phase 0 — `UPGRADE_README.md` (Rationale & Rope Alternative) `[DONE - NEEDS TESTING]`

Write `UPGRADE_README.md` at the repo root, as a **living doc** (revisited/updated in Phase 10 once the rest of this plan actually ships). Contents:

- [x] **Where we're at today**: current `lines: string[]` model, v1→v2 localStorage migration, delta-based undo/redo — summarized from the "Current State" section above.
- [x] **Perf improvements & choices made so far**: the three findings from the prior audit (full `join`/`split` per keystroke, un-debounced `localStorage.setItem`, `getCursorLine`'s O(n) scan) and the reasoning already captured above for each — why the `join`/`split` cost was left alone, why the `localStorage` debounce fix was deferred to Phase 3's IndexedDB writes instead of patched twice, and how Phase 5 opportunistically fixes the cursor-scan cost as a byproduct of adding column tracking.
- [x] **What a rope would gain** (trie is not applicable here — tries suit prefix lookups like autocomplete, not mutable document text; a **rope** or piece-table is the correct structure for this use case): explain that a rope avoids full-document `join`/`split` per keystroke by representing text as a balanced tree of chunks, making edits/inserts O(log n) instead of O(n), and would let the live `<textarea>` UI itself scale to very large documents (the one gap this plan's IndexedDB/perf work explicitly does **not** close — see Flagged Risks).
- [x] **Starting point for a rope implementation** (sketch only, not implemented in this plan): outline swapping `lines: string[]` for a rope data structure behind the same `computeDelta`/`applyDelta`/`revertDelta` interface so undo/redo logic wouldn't need to change; note that the `<textarea>` DOM element itself would still need to be replaced with a virtualized/windowed rendering component (e.g. rendering only visible lines) since a native `<textarea>` requires the full string as its `value` regardless of the underlying data structure — so a rope alone doesn't fix DOM rendering at scale, both changes would be needed together.
- [x] Cross-reference this plan file (`notepad-storage-multidoc-38c0f1.md`) as the source of truth for what's actually being implemented now; the README documents rationale/history and a **future** option, not new work being done in this pass.

## Phase 1 — Test Hardening & Coverage-Gap Fixes (prioritized first) `[DONE - NEEDS TESTING]`

This phase is intentionally the **first priority** — closing these gaps establishes the regression baseline everything else builds on.

- [x] **New `App.test.tsx`** (currently zero coverage): title input updates value and calls `setTitle`; wrap checkbox toggles `options.text.notepadWrap`; Undo/Redo buttons call `undo()`/`redo()`; an end-to-end integration flow (type → remount → content persists) exercising `useNotepad()` + `Notepad` together through `App`, not just each in isolation.
- [x] **Fix undo/redo button clarity** (`src/App.tsx:47-48`): replace invalid `aria-details='Undo'/'Redo'` with `aria-label`, add a visible text/tooltip label next to each icon, and disable the button when `stateIndex < 0` (undo) or `stateIndex >= stateHistory.length - 1` (redo). Add tests asserting accessible names and the disabled state at history boundaries.
- [x] **New `NavBar.test.tsx`**: renders children, contains the GitHub link.
- [x] `src/Notepad.hook.test.ts`: rapid undo/redo past history bounds, long sequential-edit chains, corrupted-JSON recovery — plus additional **undo/redo history depth tests**: many sequential edits (10+) followed by full-undo-to-start and full-redo-to-end, and verifying `stateHistory`/`stateIndex` stay consistent throughout.
- [x] `src/Notepad.component.test.tsx`: cursor-line edge cases around multi-line paste, empty documents, trailing empty line (content ending in `\n`), and a keyboard-driven (`keyDown`) cursor-move test distinct from the existing mouse-driven ones.
- [x] Styled-component behavior: assert the computed `overflow-x` CSS actually changes with the `notepadWrap` prop (not just the `wrap` DOM attribute). **Found and fixed a real bug**: the CSS had a double-semicolon (`'none;'` + template's own `;`) AND used an invalid CSS value (`none` is not a valid `overflow-x` keyword — valid values are `visible|hidden|clip|scroll|auto`). Fixed to `hidden`/`scroll`.
- [x] `src/utils/notepadTypes.test.ts`: adversarial parse inputs (`null`, arrays, nested garbage) — added for `parseTextLines`, `parseTitle`, and `parseOptions`.
- [x] `src/utils/useLocalStorage.test.ts`: behavior when `localStorage.setItem` throws (quota/private-browsing) — covers both the mount-time default write and the setter path.
- [x] `src/utils/functions.tsx` (`debounce`): new `functions.test.ts` added (delay, coalescing, last-call-args, timer reset).
- [x] Added `@vitest/coverage-v8`, configured in `vitest.config.ts` (`coverage.include`: `src/utils/**`, `src/Notepad.tsx`, `src/App.tsx`; 90% thresholds for lines/statements/functions/branches). Added `npm run test:coverage` script. **Removed `src/utils/persistence.tsx`** (confirmed zero imports) since it was dead scaffold code dragging coverage to 0% on an unused file — this satisfies Phase 10's removal step early since the "confirm no imports" precondition was already met.
- [x] Confirmed 100% pass — 120/120 tests pass, 100% coverage (statements/branches/functions/lines) on all included files, `tsc -b --noEmit` clean. This is the regression baseline for everything after.

## Phase 2 — Chained Migration Design (v1 → v2 → v3) `[DONE - NEEDS TESTING]`

`src/utils/notepadTypes.ts` additions:

```ts
// Existing v1/v2 shapes stay; new explicit stage functions added alongside.

function migrateV1toV2(raw: { text: string; title: string; optionsRaw: string }): StoredV2Bundle {
  // wraps existing parseTextLines/parseTitle/parseOptions v1-fallback logic
  // returns { version: 2, lines, title, options }
}

function migrateV2toV3(v2: StoredV2Bundle): StoredWorkspaceV3 {
  // wraps single v2 document as documents: [ { id: uuid(), title, lines, options } ]
  // returns { version: 3, documents: [...], activeDocumentId }
}

function loadWorkspace(legacyKeys: LegacyLocalStorageSnapshot): StoredWorkspaceV3 {
  // if v3 already exists in IndexedDB -> return it directly
  // else: migrateV2toV3(migrateV1toV2(legacyKeys)) with integrity checks at each stage
}
```

- [x] `StoredDocumentV3 { id: string; title: string; lines: string[]; options: NotepadOptions; markdownEnabled: boolean }` (no stored `extension` -- extension is chosen only at export time, never persisted)
- [x] `StoredWorkspaceV3 { version: 3; documents: StoredDocumentV3[]; activeDocumentId: string }`
- [x] `migrateV2toV3` defaults migrated legacy documents to `markdownEnabled: false` (safe default; no behavior change for existing users until they explicitly opt in via Document Settings). New documents created via `addDocument()` default to `markdownEnabled: true` (to be wired up in Phase 4's `addDocument()`).
- [x] **Integrity checks** after each stage: implemented `verifyTextMigrationIntegrity` in `notepadTypes.ts` — checks line count and char count for the v1 plain-text migration path; on mismatch, logs a warning via `console.warn` and falls back to a blank document (`['']`) rather than persisting corrupt data. (The v2 JSON path is trusted since it's already structurally validated by `JSON.parse` + `Array.isArray`.)
- [x] Legacy `localStorage` keys (`react-notepad-text/-title/-options`) are read once, migration result written to IndexedDB, **old keys left in place** (not deleted) as a rollback safety net. (`migrateV1toV2`/`loadWorkspace` only *read* legacy keys — no deletion logic exists; actual IndexedDB write-through happens in Phase 3.)
- [x] **Mixed-version edge case**: the three legacy keys (`text`/`title`/`options`) migrated independently in the past, so they can each be at a different version at once (e.g. `text` still v1 while `title`/`options` are already v2) — `migrateV1toV2` handles any combination since it delegates to the already-independent `parseTextLines`/`parseTitle`/`parseOptions`. Covered by dedicated mixed-version tests in `notepadTypes.test.ts`.

## Phase 3 — IndexedDB Persistence Layer `[DONE - NEEDS TESTING]`

- [x] New `src/utils/indexedDbStore.ts`: thin promise-based wrapper (`getWorkspace()`, `putWorkspace(ws)`) around a single IndexedDB database/object-store keyed by a fixed workspace id. Tested with `fake-indexeddb` (new devDependency) in `indexedDbStore.test.ts` — round-trip, overwrite, and "IndexedDB unavailable" rejection.
- [x] New `src/useWorkspace.ts` hook replaces `useNotepad()` (not yet wired into `App.tsx` — that's Phase 4):
  - [x] Async load on mount: check IndexedDB → if empty, run migration chain from `localStorage` → persist result to IndexedDB → set state.
  - [x] Exposes a `loading` flag and a `persistenceAvailable` flag (surfaces IndexedDB fail-safe status) so `App.tsx` can render a lightweight loading state in Phase 4.
  - [x] `documents`, `activeDocumentId`, `setActiveDocumentId`, `addDocument()`, `closeDocument(id)`, per-doc `setLines/setTitle/setOptions/setMarkdownEnabled/undo/redo`, plus `getHistory(id)`.
  - [x] Writes to IndexedDB are debounced (using the now-tested `debounce` from `functions.tsx`, 300ms) per edit to avoid excessive I/O on large documents.
- [x] Per-document undo/redo history stays in React state (not persisted, keyed by document id), matching current behavior.
- [x] **Fail-safe behavior**: if `indexedDB` is unavailable or `getWorkspace()`/`putWorkspace()` throw, `useWorkspace()` falls back to an in-memory-only blank workspace and sets `persistenceAvailable: false` rather than crashing the app.
- [x] **Found and fixed a real bug during testing**: initial implementation read `documentsRef.current`/`historyByDoc` state directly, which is stale for every call after the first when multiple mutations (e.g. `setTitle` + `setOptions` + `setMarkdownEnabled`) happen within the same React 18 batched update — silently dropping all but the last update. Fixed by introducing a synchronous ref-commit pattern (`commitDocuments`/`commitActiveDocumentId`/`commitHistory`) where refs are the canonical source of truth, updated synchronously before each state update, rather than relying on a re-render to refresh them. Covered by a dedicated regression test in `useWorkspace.test.ts` (multi-field update test) that previously failed with the ref-staleness bug and now passes.
- [x] `src/useWorkspace.test.ts`: 16 tests — initial load (blank/migrated/existing-IndexedDB/fallback), document management (add/close/switch, never-zero-documents invariant), per-document editing + independent undo/redo, `getHistory`, and debounced persistence (via `vi.useFakeTimers`).
- [x] Coverage: added `src/useWorkspace.ts` to `vitest.config.ts`'s `coverage.include`. Added `/* v8 ignore */` pragmas for a handful of genuinely unreachable-without-a-real-browser branches (IndexedDB `onupgradeneeded`'s always-true store-exists guard, `onerror` handlers requiring real storage failures, and `notepadTypes.ts`'s `migrateV1toV2` integrity-check fallback which is unreachable via the current deterministic `parseTextLines` path but kept as defense-in-depth). 153/153 tests pass, all coverage thresholds (90%) met, `tsc -b --noEmit` clean.

## Phase 4 — Multi-Document UI & Export-Time Extension Picker `[DONE - NEEDS TESTING]`

- [x] New `TabBar` component (`src/TabBar.tsx`): one tab per document + trailing `+` button (always rightmost, calls `addDocument()`); click to switch active; close (`×`) affordance hidden when only one document remains (last-tab-cannot-close invariant enforced upstream in `useWorkspace`).
- [x] Clicking `+` opens `NewDocumentDialog` (`src/NewDocumentDialog.tsx`): title input only (defaults to "Untitled", trims whitespace), no extension choice at creation. `addDocument(title)` creates the `StoredDocumentV3` with `markdownEnabled: true` by default.
- [x] `src/App.tsx` rewritten to use `useWorkspace()`, renders `TabBar`, passes active document's `lines/title/options` into `Notepad`, shows a `Loading…` state while the workspace loads.
- [x] "Save as file" toolbar button opens `ExportDialog` (`src/ExportDialog.tsx`): extension `<select>` pre-populated with `txt, md, yaml, json, py, java, c, cpp`, plus an "Other…" option revealing a free-text field for an arbitrary extension (validated via exported `isValidExtension`). Confirming builds a `Blob` + temporary `<a download="{title}.{chosenExtension}">` and triggers the download; extension not persisted.
- [x] **Invariant**: `closeDocument()` never allows zero open documents; `TabBar` only renders a close button when `documents.length > 1`. Closing a tab persists the removal via debounced IndexedDB write.
- [x] Tests added: `App.test.tsx` (12), `TabBar.test.tsx` (6), `NewDocumentDialog.test.tsx` (6), `ExportDialog.test.tsx` (9, incl. `isValidExtension` units), plus a `useWorkspace.test.ts` regression test for debounced-persistence failure.
- [x] Confirmed: 182/182 tests pass; `App.tsx` 100% coverage; aggregate branch coverage 92.78% (above 90% threshold); `tsc -b --noEmit` clean.

## Phase 5 — Cursor Position (Line & Column) and Optional Line-Number Gutter `[DONE - NEEDS TESTING]`

- [x] Added `getCursorPosition(lines, cursorPos): { line, column }` (single pass over `lines`) alongside the unchanged `getCursorLine` (still used internally for delta bookkeeping).
- [x] Replaced the top-of-editor "Line X" `<div>` with a fixed bottom-left `StatusBar` showing `Line {n}, Col {m}` (`Line —, Col —` before any interaction).
- [x] **Fixed the known single-click cursor bug**: root cause was `onMouseDown` firing before `selectionStart` updates for the new click. Replaced with `onClick`/`onSelect`/`onKeyUp`/`onFocus`. Regression test added.
- [x] New global toolbar checkbox "Line numbers" next to "Wrap text" in `App.tsx`, stored as `options.text.showLineNumbers` (optional, default `false`). Kept per-document (like the existing `notepadWrap` toggle) rather than literally global, for consistency with the existing per-document options architecture.
- [x] Scroll-synced `LineNumberGutter` (`aria-hidden`, `user-select: none`, `data-testid="line-number-gutter"`) rendered alongside the textarea.
- [x] Also fixed a pre-existing label/input association bug in `App.tsx` (missing `id` attributes for `htmlFor` targets).
- [x] Tests added across `Notepad.component.test.tsx` and `App.test.tsx`. Confirmed: 198/198 tests pass, `tsc -b --noEmit` clean, coverage thresholds met.
- [~] Word-wrap/visual-row gutter desync risk documented as a known limitation, not resolved.
- [ ] TipTap cursor-position adaptation deferred to Phase 6.

## Phase 6 — Live Markdown Rendering (TipTap) `[DONE - NEEDS TESTING]` — superseded by Phase 8.5

- [x] Added `@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/pm`, `tiptap-markdown` (v3-compatible). `npm run build` succeeds (one non-blocking >500kB chunk warning from ProseMirror, not addressed).
- [x] New `MarkdownNotepad.tsx`: TipTap `EditorContent` + `StarterKit`/`Markdown` extensions; `onUpdate` calls `editor.storage.markdown.getMarkdown()` (via a typed helper since `tiptap-markdown` doesn't augment `Storage`) and splits back into `lines`, calling the same `setLines(lines, cursorLine)` prop as `Notepad` — reuses `useWorkspace`'s existing per-document persistence/undo-redo, no changes needed there.
- [x] `App.tsx` conditionally renders `MarkdownNotepad` vs. `Notepad` based on `activeDocument.markdownEnabled`. "Line numbers" checkbox hidden in markdown mode (no textarea gutter to sync).
- [x] `getTiptapCursorPosition(editor)` adapter added: **documented best-effort approximation** using ProseMirror block boundaries as line breaks (`doc.textBetween` with `\n` separators), since exact markdown-source line/column isn't recoverable from the rendered tree.
- [x] **Data safety** confirmed: `lines` updates synchronously per keystroke (no drop-on-toggle risk); a `lastEmittedRef` guard prevents the external-sync `useEffect` from clobbering in-flight typing/echo-looping; pasted content is always parsed through ProseMirror's schema before being re-serialized to markdown, so raw HTML can't leak into `lines`.
- [x] Tests: new `MarkdownNotepad.test.tsx` (6 tests). Updated `App.test.tsx`'s tab-switching test (new docs default to `markdownEnabled: true`, so second tab is now a TipTap contenteditable, not a textarea). Added `MarkdownNotepad.tsx` to coverage `include`.
- [x] Confirmed: 204/204 tests pass, `tsc -b --noEmit` clean, `npm run build` succeeds, coverage thresholds met.
- [ ] **Not yet wired**: no UI to toggle `markdownEnabled` on an existing doc yet (`setMarkdownEnabled` exists, unused) — deferred to Phase 7's Document Settings page.

## Phase 7 — Routing & Document Settings Page `[DONE - NEEDS TESTING]`

- [x] Added `react-router-dom`. `App.tsx` is now a `HashRouter` shell (not `BrowserRouter`, since GH Pages has no SPA 404 fallback for the `base: '/react-notepad/'` subpath). Routes: `/` → `MainView.tsx` (old `App.tsx` body, moved verbatim), `/settings/:documentId` → new `DocumentSettings.tsx`.
- [x] **Deviation found during implementation**: each route calling `useWorkspace()` independently caused a debounce race (Settings could navigate back before its write flushed, so MainView's separate instance reloaded stale data). Fixed by hoisting a single `useWorkspace()` into `App.tsx`, passed down as a `workspace` prop to both routes.
- [x] `TabBar.tsx` gained a required `onSettingsClick` prop; renders a gear-icon button only on the active tab.
- [x] `DocumentSettings.tsx`: "Live Markdown Rendering" checkbox with local pending state, **Save** (persists + navigates to `/`) and **Back** (navigates to `/`, discards) buttons.
- [x] **Orphaned-id handling**: unknown `documentId` → `<Navigate to="/" replace />`.
- [x] Tests: `TabBar.test.tsx` updated + new test; `App.test.tsx` gained 4 integration tests (settings nav, Back, Save, orphaned-id redirect). Note: the orphaned-id test needed to navigate via a `hashchange` event *after* mount rather than presetting `window.location.hash` before render — the latter was flaky in the full multi-file suite.
- [x] Confirmed: 209/209 tests pass (stable across repeated runs), `tsc -b --noEmit` clean, `npm run build` succeeds, coverage thresholds met.

## Phase 8 — Migration, Integrity & Coverage Tests `[NOT STARTED]`

- [ ] `notepadTypes.test.ts`: unit tests for `migrateV1toV2` and `migrateV2toV3` **independently** (each stage testable in isolation), plus the composed `loadWorkspace` for v1→v3 and v2→v3 end-to-end paths, v3-passthrough (no-op) when IndexedDB already has v3 data, and the **mixed-version** case (legacy keys at different versions simultaneously).
- [ ] Integrity-check tests: deliberately corrupt intermediate output (e.g. truncate a line) and assert fallback-to-blank-document behavior fires instead of throwing or silently losing data.
- [ ] `indexedDbStore.test.ts`: round-trip put/get, using `fake-indexeddb` (new dev dependency) for jsdom compatibility; simulated `indexedDB.open` failure exercising the Phase 3 fail-safe fallback; simulated quota-exceeded rejection on `putWorkspace` (parallel to the existing `localStorage` quota test).
- [ ] `useWorkspace.test.ts`: add/close tabs, active-tab switching, per-tab undo/redo isolation, persistence round-trip across remount, migration-on-first-load from seeded `localStorage`, the last-tab-cannot-close invariant, and closing a tab actually persisting (reload doesn't resurrect it).
- [ ] `TabBar.test.tsx`: `+` always rightmost; tab switching; close-tab fallback selection; New Document dialog creates a document with only a title (no extension prompt).
- [ ] `export.test.ts`: Export Document dialog offers preset + arbitrary extensions; `Blob` contents and filename built from title + the extension chosen at export time (including sanitizing filesystem-unsafe characters, empty/whitespace-only titles, and unicode titles); exporting the same document twice with different chosen extensions produces different filenames without mutating stored document state; two tabs with identical titles exporting with the same extension doesn't crash or corrupt either `Blob`.
- [ ] `MarkdownNotepad.test.tsx`: typing markdown syntax renders expected inline formatting; content round-trips through `lines: string[]` correctly (no HTML leaking into stored data); toggling `markdownEnabled` swaps editors without losing content, including mid-edit toggles; pasting raw HTML is sanitized to markdown text.
- [ ] `DocumentSettings.test.tsx` (with a router test wrapper): renders current markdown toggle state; **Save** persists change and navigates to `/`; **Back** discards in-progress change and navigates to `/` unchanged; navigating to a deleted document's settings id redirects to `/`.
- [ ] `CursorStatus.test.tsx` / `Notepad.component.test.tsx` additions: bottom-left status bar shows correct `Line {n}, Col {m}` across typing, arrow-key navigation, and mouse clicks — including a regression test that a **single** click updates the cursor position without requiring a second click.
- [ ] `LineNumberGutter.test.tsx`: toggling the global "Line numbers" checkbox shows/hides the gutter; gutter text has `user-select: none` and is excluded from any copy/selection of the textarea content; gutter count matches `lines.length` and updates as lines are added/removed.
- [ ] Enforce coverage threshold (from Phase 1 tooling) now against the full new `src/utils/**` surface, including the new migration/IndexedDB files.

## Phase 8.5 — Custom Markdown Overlay Editor (Replaces TipTap) `[DONE]`

Replaces Phase 6's TipTap/ProseMirror `MarkdownNotepad` with a fully custom "visible-syntax overlay" editor, at the user's explicit request to not depend on a pre-built rich-text editor. Reuses the Phase 13 `TextBuffer`/`VirtualizedNotepad` windowing architecture instead of a `contentEditable` document model.

- [x] New `src/utils/markdownTokenizer.ts`: wraps `marked.lexer()` and recovers exact `{start, end}` source character offsets per styled span (headings, bold/italic/strikethrough, inline code, fenced code blocks, links, lists, blockquotes) — `marked`'s lexer is designed to emit HTML, not offsets, so this is custom offset-recovery glue, not just a lexer call. Defensive by design: any lexing failure falls back to fully unstyled plain text rather than corrupting/hiding content.
- [x] New `src/MarkdownOverlayNotepad.tsx`: a real `<textarea>` (transparent text, visible native caret) with a `pointer-events: none` styled `<div>` overlay on top showing the same text with markdown syntax highlighted. Not `contentEditable` — `lines: string[]` is always the literal on-screen text, zero serialization step (unlike TipTap, which had to convert its ProseMirror doc to/from a markdown string on every change).
- [x] Reuses `VirtualizedNotepad`'s `WINDOW_LINES`/`OVERSCAN_LINES`/`useMeasuredLineHeight` windowing directly — markdown-enabled documents now get the same large-document windowing behavior as plain-text ones, which TipTap never had (Phase 13 was explicitly scoped to plain-text `Notepad` only).
- [x] `MainView.tsx` renders `MarkdownOverlayNotepad` instead of `MarkdownNotepad` when `activeDocument.markdownEnabled`. Removed `MarkdownNotepad.tsx`/`MarkdownNotepad.test.tsx`/`getTiptapCursorPosition` entirely (not kept behind a flag — full replacement, per explicit request). Removed `@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/pm`, `tiptap-markdown` from `package.json`.
- [x] **Bug found post-ship and fixed**: an early version scaled heading text via `font-size` in the overlay. Since the overlay must stay character-width-aligned with the invisible monospace textarea underneath it for the caret to track correctly, this desynced overlay glyphs from the real caret position — the caret was actually at the true end of the line, just visually hidden under the wider heading text, making it appear "stuck." Fixed by never changing `font-size`/letter-spacing for any class that can appear on the actively-edited line.
- [x] **Active-line / inactive-line rendering split**, added to reconcile "headings should look bigger" with "the editor must stay accurate while typing": the line the cursor currently occupies renders in plain, accurate form (normal size, raw `#`/`**`/`*`/list markers visible); every other line renders in a stylized form (headings enlarged, markers hidden, list bullets replaced with a real `•` glyph). This is the standard Typora/Obsidian live-preview pattern and the only way to have both properties simultaneously without a real contentEditable document model.
  - Heading enlargement on inactive lines uses CSS `transform: scale()`, **not** `font-size` — `transform` doesn't change the element's layout box width, so it can't desync the caret even on lines adjacent to the active one.
  - **Known trade-off, not resolved**: `transform: scale()` also doesn't reflow layout *height*. `VirtualizedNotepad`'s windowing math assumes a uniform, fixed line height for every line (`useMeasuredLineHeight()` × line count) for scroll-position/sizer calculations. An enlarged inactive heading can therefore visually bleed into the line directly below it (a cosmetic overlap) without affecting scroll-position accuracy or virtualization correctness, which stay exact. A pixel-perfect fix would require variable-row-height virtualization — a much larger architectural change — so this is accepted as-is, the same way Phase 5's word-wrap/gutter desync risk was accepted rather than solved.
  - Markdown markers are hidden via `color: transparent !important` (not `display: none`), so the hidden character still reserves its layout width — required for the same alignment-safety reason.
  - List bullet substitution (`•` for unordered `-`/`*`/`+`, left alone for ordered `1.` numbering) uses `visibility: hidden` + an absolutely-positioned `::before` pseudo-element, for the same width-preservation reason.
- [x] Tests: `markdownTokenizer.test.ts` (38 tests — offset correctness per feature, nesting, round-trip/reconstruction safety, adversarial input, ATX heading closing-sequence markers, ordered-vs-bullet marker classification); `MarkdownOverlayNotepad.test.tsx` (22 tests — overlay/textarea text-content parity, windowing, className application, active/inactive-line reveal-hide behavior, heading-scale/bullet-glyph gating, no-transformation edits). Updated 3 stale `App.test.tsx` assertions that checked for TipTap's `.tiptap` DOM class.
- [x] Confirmed: 358/358 tests pass, `tsc -b --noEmit` clean, `npm run build` succeeds.

## Phase 9 — Size-Tiered Performance & Memory Tests `[NOT STARTED]`

New `notepadTypes.perf.test.ts` (or a dedicated `perf/` folder run via `npm run test`), parameterized across:

| Tier | Size | What's tested |
|---|---|---|
| Small | 10KB | Baseline correctness: edit latency, migration round-trip, undo/redo delta correctness |
| Medium | 100MB | `migrateV1toV2`/`migrateV2toV3` completes within a defined time budget (e.g. <2s); IndexedDB `putWorkspace`/`getWorkspace` round-trip succeeds and preserves content; `computeDelta` on a single-line-changed 100MB doc stays fast (confirms delta algorithm doesn't scan unnecessarily) |
| Large | 2GB | Same operations, higher budget; **explicitly flag** that a 2GB single JS string approaches/exceeds practical string and `Blob`/structured-clone limits in some environments — test will assert graceful behavior (either succeeds within budget, or fails fast with a clear error) rather than assuming success |

- [ ] Memory usage measured via `process.memoryUsage().heapUsed` deltas in Node (Vitest environment), acknowledging this is an approximation, not exact browser memory profiling.
- [ ] These tests target the **in-memory model and IndexedDB persistence**, not the `<textarea>` DOM rendering — rendering a literal 2GB string into a real `<textarea>` is a separate, out-of-scope UI/virtualization problem (see Non-Goals).
- [ ] Perf tests run in a separate, longer-timeout Vitest project/config so they don't slow down the default `npm run test` feedback loop; wire a separate `npm run test:perf` script.

## Phase 10 — Cleanup & Verification `[NOT STARTED]`

- [ ] **Update `UPGRADE_README.md`** (from Phase 0) to reflect what actually shipped: confirm/correct the "where we're at" section against the final v3 architecture (IndexedDB, tabs, markdown, extensions, cursor/line-numbers), and note whether the rope/piece-table option is still the recommended next step or if priorities have shifted.
- [ ] Remove `src/utils/persistence.tsx` (confirm no imports first).
- [ ] Run full `npm run test` (with coverage) and `npm run test:perf`; run `npm run build` to confirm no TS errors.
- [ ] Manual smoke test: fresh install, seeded v1 `localStorage`, seeded v2 `localStorage`, multi-tab add/close/switch, undo/redo per-tab (including disabled-state at history boundaries), wrap toggle, line-number gutter toggle, cursor status bar (line+col) while typing/clicking/arrow-navigating — with specific attention to **single-click** mouse clicks updating the cursor position immediately (no double-click required), markdown toggle via Document Settings (Save and Back both paths, verifying new docs default on / migrated docs default off), file export choosing several different extensions for the same document, and a manual large-paste test in the real browser UI to observe actual textarea behavior at scale.

## Phase 12 — Touch D-Pad for Cursor Navigation `[NOT STARTED]`

*(Numbered Phase 12 per explicit request; Phase 11 does not exist in this plan.)*

- [ ] New `CursorDPad.tsx`: floating fixed-position D-pad (4 directional buttons), shown only when `window.matchMedia('(pointer: coarse)').matches` (touch device), re-checked on the media query's `change` event.
- [ ] **Notepad (textarea)**: synthetic `KeyboardEvent`s don't move `selectionStart` in real browsers (untrusted events) — movement computed manually (line/column math off `lines`) then applied via `textarea.setSelectionRange()`, re-running the same cursor-status-update logic the click/keyup handlers use.
- [ ] **MarkdownNotepad (TipTap)**: same limitation for `contenteditable`. Use ProseMirror's public APIs directly: `Selection.near(doc.resolve(pos ± 1))` for Left/Right; `view.coordsAtPos`/`view.posAtCoords` (screen-coordinate-based) for Up/Down; dispatch via `editor.view.dispatch(tr.setSelection(...))`.
- [ ] `preventDefault()` on button press to avoid stealing focus/closing the on-screen keyboard; hold-to-repeat (~350ms initial delay, ~80ms interval).
- [ ] Tests: D-pad visibility gated on `matchMedia` mock; each direction's boundary clamping; status bar updates after a single press (no double-press needed, same spirit as the Phase 5 single-click fix); hold-repeat via `vi.useFakeTimers()`; no focus/selection loss.
- [ ] **Not in scope**: no separate scroll-only buttons — this D-pad only moves the cursor, per the chosen design.

## Phase 13 — Rope Data Structure & Virtualized Editor, Behind Two Independent Flags `[DONE]`

Reverses two original Non-Goals (rope rewrite, virtualized rendering), delivering the Phase 0 README's "starting point sketch" as a real, defaulted-on implementation — gated behind two independent code-level flags so it's reversible and differentially testable against the current model. Scoped to plain-text `Notepad` only; `MarkdownNotepad`/ProseMirror unchanged.

- [x] New `featureFlags.ts`: `USE_ROPE_MODEL = true` and `USE_VIRTUALIZED_EDITOR = true` (both default to the new/optimal behavior). Code-level constants only — no runtime toggle UI yet; noted as a future demo/debug-panel upgrade.
- [x] New `TextBuffer` interface with two implementations — `LinesBuffer` (wraps current `lines: string[]` behavior exactly) and `RopeBuffer` (backed by a new `Rope` class) — selected via `USE_ROPE_MODEL`. `computeDelta`/`applyDelta`/`revertDelta` operate against this abstraction so undo/redo semantics are identical either way.
- [x] New `rope.ts`: custom balanced leaf/concat `Rope` class (no new dependency) — `insert`/`delete`/`slice`/`charAt`/`toString`/`toLines`/`fromLines`/`length`, O(log n) edits.
- [x] New `VirtualizedNotepad.tsx`: windowed rendering (visible line range from scroll position + line height) through the same `TextBuffer` abstraction; used instead of `Notepad.tsx` when `USE_VIRTUALIZED_EDITOR` is true; `Notepad.tsx` remains the fallback.
- [x] **Storage format unaffected by either flag**: `lines: string[]` stays the persisted IndexedDB shape regardless of flag state — rope is purely in-memory, converted at the storage boundary.
- [x] Tests — shared conformance suite (`TextBuffer` interface run against both `LinesBuffer`/`RopeBuffer`, same assertions); `rope.test.ts` edge cases + differential/fuzz testing vs. a naive reference string; migration/round-trip safety (flag-flip round-trip produces byte-identical `lines`); `computeDelta`/`applyDelta`/`revertDelta` re-run against both backends; `VirtualizedNotepad.test.tsx` (visible-range calc, editing-while-scrolled, fallback on flag-off, no data loss); flag-combination smoke matrix (all 4 combinations mount + accept an edit without throwing).
- [x] Update `UPGRADE_README.md` and this plan's Non-Goals to cross-reference that they're superseded by this phase.

## Flagged Risks (need acknowledgment, not blocking plan approval)

- Rendering a 100MB–2GB document in a single native `<textarea>` will be slow/unresponsive in real browsers regardless of storage backend — this is a DOM/rendering limitation, not fixed by IndexedDB. This plan's perf tests cover the **storage/migration/edit-model** layer honestly at those sizes; making the live UI itself smooth at 2GB would require a virtualized/windowed editor (rope or line-windowing in the render layer), which remains a **non-goal** here per earlier scoping.
- ~~TipTap (`MarkdownNotepad`) is a `contentEditable`-based rich editor with its own DOM/virtual-doc overhead, generally **worse** than a plain `<textarea>` at multi-MB+ document sizes.~~ Superseded by Phase 8.5 — TipTap was removed entirely in favor of `MarkdownOverlayNotepad`, a `<textarea>`-based overlay editor that reuses Phase 13's windowing, so markdown-enabled documents now get the same large-document virtualization as plain-text ones.
- **(Phase 8.5)** `MarkdownOverlayNotepad`'s inactive-line heading enlargement uses CSS `transform: scale()`, which doesn't reflow layout height — an enlarged heading can visually bleed into the line directly below it. Doesn't affect scroll-position/virtualization correctness (those stay exact), purely a cosmetic overlap. A pixel-perfect fix would require variable-row-height virtualization, out of scope for now.

## Explicit Non-Goals

- No File System Access API / live re-save-to-same-file (download-only export).
- No virtualized/windowed `<textarea>` rendering for huge documents — perf tests validate the storage/migration/model layer, not live DOM editing at 2GB. *(Superseded by Phase 13: a virtualized editor (`VirtualizedNotepad.tsx`) is now implemented, behind `USE_VIRTUALIZED_EDITOR`.)*
- No rope/piece-table rewrite of the in-memory editing model — `lines: string[]` + delta-based undo stays. *(Superseded by Phase 13: a rope-backed `TextBuffer` (`RopeBuffer`/`rope.ts`) is now implemented, behind `USE_ROPE_MODEL`, with `lines: string[]` remaining the on-disk format either way.)*
- No perf/memory testing of the markdown rendering path at 100MB/2GB tiers; markdown mode is scoped for typical note-sized documents. *(Note: since Phase 8.5, markdown documents use `MarkdownOverlayNotepad`, which reuses Phase 13's virtualization — this non-goal is less pressing than when it was written against TipTap, but still not formally perf-tested.)*
