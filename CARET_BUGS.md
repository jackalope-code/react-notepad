# Caret, Focus, and Overlay Bugs — Findings & Fixes

This document records recent UI bugs in `react-notepad` (v3 branch) involving caret/cursor placement, tapping, focus, and overlay alignment. It also notes which issues are specific to the Markdown overlay editor vs the plain text editors.

## 1. Mobile list-item tap selects the wrong line

### Symptom
In the Markdown editor, tapping a list item such as:

```markdown
* Item 1
* Item 2
* Item 3
```

- The caret moved to the correct line, but the bullet marker was revealed on the *previous* line.
- Tapping Item 2 revealed the `*` on Item 1; tapping Item 3 revealed it on Item 2.
- Item 1 could not be selected at all.

### Root cause
On mobile, `onFocus` / `onClick` fire **before** the browser updates `selectionStart` to the tapped position. The event handler therefore read the *old* caret position (usually at the end of the previous line). `getCursorPosition` mapped that stale offset to the previous line, so the "active line" used for marker styling was off by one.

### Fix
- Removed `onFocus` from the textarea in `MarkdownOverlayNotepad`.
- Added a document-level `selectionchange` listener that reads `selectionStart` **after** the browser has actually updated the selection.
- Removed the `document.activeElement === ta` guard from the `selectionchange` handler, because the event can fire during the focus transition before the textarea is reported as `activeElement`.
- Changed `onTouchEnd` from `requestAnimationFrame` to `setTimeout(..., 0)` so the browser has finished the focus/selection settle before we read `selectionStart`.
- Kept `onClick`, `onKeyUp`, and `onSelect` for desktop and test coverage.

### Scope
**Markdown editor only** (`MarkdownOverlayNotepad.tsx`). The plain text editors do not use per-line marker reveal logic.

---

## 2. New document textarea is not tappable / does not auto-focus

### Symptom
After creating a new document, the text input area was barely visible and could not be tapped. There was no easy way to start typing.

### Root cause
A new document starts with `lines: ['']` (one empty line). In `VirtualizedNotepad` and `MarkdownOverlayNotepad`, the textarea/window height was `max(windowLines.length, 1) * lineHeight = 20px`, making the tappable area essentially a single 20px row. No auto-focus was set on the textarea.

### Fix
- Added `min-height: 100dvh` to:
  - `MarkdownOverlayNotepad` `WindowRow`
  - `VirtualizedNotepad` `OverlayTextArea`
  - `VirtualizedNotepad` `Sizer` (so the scrollable track also fills the viewport for small docs)
  - `MarkdownOverlayNotepad` `Sizer` (same)
- Added `autoFocus` to the textarea in all three editor components.
- Added `key={activeDocument.id}` to the editor components in `MainView.tsx`, forcing a remount when switching documents. This makes `autoFocus` trigger for a newly created document and also resets per-document internal state (scroll position, cursor).

### Scope
Both virtualized editors (`MarkdownOverlayNotepad` and `VirtualizedNotepad`). The legacy `Notepad` already used `height: 100dvh`; it only needed `autoFocus`.

---

## 3. Line numbers setting missing for Markdown-enabled documents

### Symptom
The "Line numbers" checkbox was hidden when a document had Markdown rendering enabled, even though `MarkdownOverlayNotepad` had no line-number gutter.

### Root cause
`MainView.tsx` wrapped the line-numbers checkbox in `{!activeDocument.markdownEnabled && ...}`.

### Fix
- Implemented a `LineNumberGutter` in `MarkdownOverlayNotepad`.
- Restructured `MarkdownOverlayNotepad` to use `display: flex` on `WindowRow` with a new `EditorContainer` so the gutter and the overlay/textarea do not overlap.
- Removed the Markdown guard in `MainView.tsx`; the checkbox now appears for all documents.

### Scope
**Markdown editor only** (`MarkdownOverlayNotepad.tsx` and `MainView.tsx`). `VirtualizedNotepad` and `Notepad` already supported line numbers.

---

## 4. Tapping around `##` headings selects the wrong line

### Symptom
After `##` or other heading markers, repeated taps on the same area moved the cursor to different lines. Sometimes the caret was visible on one line but input appeared on another. Some lines could not be selected; the line above was selected instead.

### Root cause
The `.md-heading-scaled` CSS uses `transform: scale(...)` to enlarge heading text on inactive lines. `transform` does not affect the layout box, so the enlarged glyphs visually overflow their 20px row into the row above and/or below. The real `textarea` under the overlay still uses a strict 20px line height. A user taps on what looks like heading text, but the tap coordinate is actually over a different row in the underlying textarea, so `selectionStart` is placed in the wrong line.

### Fix
- Set `OverlayLine` to a fixed `height: 20px` (replacing the previous `min-height: 1em`) so every overlay row exactly matches the real `<textarea>` row, preventing scaled headings from pushing subsequent lines out of alignment.
- Added `overflow: hidden` to `OverlayLine` so the scaled heading glyphs are clipped to their own row and cannot visually overflow into adjacent rows.
- Combined with the selection tracking fixes above, this ensures `selectionStart` and the overlay's active-line marker reveal stay on the same logical row. The scaled-heading feature itself is preserved.

### Scope
**Markdown editor only** (`MarkdownOverlayNotepad.tsx`). Plain text editors do not apply heading transforms or overlays.

---

## 5. Stacked headings: caret appears one row below on `Test` lines

### Symptom
With consecutive headings followed by plain text, e.g.:

```markdown
# Header 1 ##
## Header 2 ##
### Header 3 ###
#### Header 4 ####
Test
Test
Test
```

- Clicking a `Test` line often placed the visual caret/marker reveal on the `Test` line *below* the one being edited.
- The first `Test` line appeared unselectable.
- The real `selectionStart` could be correct, but the overlay's active-line styling was visually off.

### Root cause
This is the combined effect of the two issues above: stale/early `selectionStart` reads (section 1) plus heading glyphs that were not strictly confined to 20px overlay rows (section 4). Until both were fixed, the active-line state and the visual overlay could drift, especially with several scaled headings in a row.

### Fix
Apply the selection tracking fix from section 1 (remove `activeElement` guard, use `setTimeout` for touch) and the overlay row fix from section 4 (fixed `height: 20px` with `overflow: hidden`) together. Reloading the document with both fixes in place restores 1:1 alignment.

### Scope
**Markdown editor only** (`MarkdownOverlayNotepad.tsx`).

---

## Markdown editor vs plain text editor specificity

| Issue | Markdown overlay only | Plain text too |
|-------|----------------------|----------------|
| Mobile list bullet off-by-one | ✅ `MarkdownOverlayNotepad` marker-reveal logic | ❌ |
| New doc too small / no auto-focus | ✅ (virtualized markdown) | ✅ `VirtualizedNotepad` and `Notepad` |
| Line numbers missing | ✅ No gutter existed in Markdown editor | ❌ |
| Heading tap misalignment | ✅ Heading-scaled visual overflow | ❌ |
| Stacked headings caret one row below | ✅ `MarkdownOverlayNotepad` combined selection/overlay issue | ❌ |
