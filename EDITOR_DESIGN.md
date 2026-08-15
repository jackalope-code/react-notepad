# Markdown Overlay Editor Design

This document explains how `MarkdownOverlayNotepad` renders a syntax-highlighted markdown view on top of a real, editable `<textarea>` while keeping the visible caret aligned with the markdown overlay.

## High-level pattern: visible-syntax overlay

`MarkdownOverlayNotepad` (in `src/MarkdownOverlayNotepad.tsx`) uses two layers inside the same `EditorContainer`:

1. **A `HighlightOverlay` `<div>`** — styled, `pointer-events: none`, renders the document text with markdown syntax colored and scaled.
2. **A `TransparentTextArea` `<textarea>`** — transparent text, black caret, receives all keyboard/mouse/touch input.

Both layers occupy exactly the same rectangle (`position: absolute; inset: 0`). They share the same font, font-size, line-height, and zero padding/margin via `SHARED_FONT_CSS`, so every character in the overlay sits at the same x/y position as the corresponding character in the real textarea.

The stored document is always `lines: string[]` of literal markdown text. There is no rich-text serialization step. The overlay is purely decorative; the user is typing directly into the textarea.

## Why a real textarea instead of contentEditable

A real `<textarea>` gives us several properties for free:

- Native selection, caret, and IME behavior.
- Arrow keys, Home/End, Ctrl+A, select-all, etc. work as expected.
- No need to maintain a custom selection model or map DOM selections back to the source document.
- The document stays as plain text; the overlay only styles what is already there.

The trade-off is that the editor must guarantee the overlay text lines up pixel-for-pixel with the textarea text, especially on the active line.

## Keeping the caret and overlay aligned

Alignment relies on three invariants:

1. **Same font metrics.** Both layers use the same `monospace 1rem` font and `line-height: 20px`. Every source line is exactly one 20px visual row in both layers (when wrapping is off).

2. **Same row grid.** `OverlayLine` is fixed to `height: 20px`. This prevents scaled heading glyphs from stretching the overlay row and pushing subsequent lines out of sync with the 20px textarea rows.

3. **Same origin.** Both the `HighlightOverlay` and the `TransparentTextArea` fill the same `EditorContainer` with `inset: 0`, so their top/left origins are identical. The `HighlightOverlay` has `pointer-events: none`, so clicks and taps pass through to the textarea.

The black caret the user sees is the browser's native caret in the `TransparentTextArea`. Because the overlay characters sit directly on top of the textarea characters, the caret appears to be "inside" the highlighted markdown text even though the overlay never receives input.

## Windowing (large documents)

Like `VirtualizedNotepad`, `MarkdownOverlayNotepad` only loads a window of `WINDOW_LINES` (200) lines into the textarea at once:

- A tall `Sizer` element gives the scroll container the correct total scrollable height (`lines.length * lineHeight`).
- The visible `WindowRow` is absolutely positioned at `effectiveWindowStart * lineHeight`.
- The `textarea.value` is `windowLines.join('\n')`, a slice of the full document.
- `computeLineSegments` lexes the *full* document text once per edit, but only the visible window's segments are rendered.

Within the visible window, the overlay rows again match the textarea rows one-for-one because of `SHARED_FONT_CSS` and `OverlayLine height: 20px`.

## Active line and marker reveal

Markdown syntax markers (`##`, `*`, `>`, etc.) are hidden by default on inactive lines using `color: transparent`. Only the line that currently contains the caret has its markers revealed.

The active line is derived from `cursorPosition`, which is computed from the real `textarea.selectionStart` via `getCursorPosition(windowLines, selectionStart)`. Because `selectionStart` is the source of truth, the marker reveal tracks the real caret.

Selection tracking uses:

- A document-level `selectionchange` listener.
- `onTouchEnd` with `setTimeout(..., 0)` on mobile, because touch/focus events can fire before the browser has updated `selectionStart`.

See `CARET_BUGS.md` for the history of selection/caret bugs and fixes.

## Heading visual scaling

Inactive heading lines (`#`, `##`, etc.) are visually enlarged with `transform: scale(...)` rather than `font-size`:

- `transform` does not change the layout width of a character, so the overlay's heading text stays the same width as the underlying textarea text.
- `font-size` would change character widths and immediately desync the overlay from the caret.
- `OverlayLine height: 20px` clips the scaled glyphs to their own row, preventing visual overflow into adjacent rows while preserving the larger heading look.

## Source of truth

The single source of truth for the caret position is `textarea.selectionStart`. The overlay's `cursorPosition` state is always derived from it. When they stay in sync, the visible caret, the status bar, and the revealed markdown markers all point to the same logical line.
