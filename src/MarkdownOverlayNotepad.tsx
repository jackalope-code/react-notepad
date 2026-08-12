import styled from 'styled-components';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { getCursorPosition, type NotepadOptions } from './Notepad';
import { WINDOW_LINES, OVERSCAN_LINES, useMeasuredLineHeight } from './VirtualizedNotepad';
import { computeLineSegments } from './utils/markdownTokenizer';

// ---------------------------------------------------------------------------
// MarkdownOverlayNotepad (Phase 8.5 Part B)
// ---------------------------------------------------------------------------
//
// Replaces the TipTap/ProseMirror-based `MarkdownNotepad`. Rendered instead
// of it when `activeDocument.markdownEnabled` is true (see `MainView.tsx`).
//
// Rendering approach — a "visible-syntax overlay": a real `<textarea>`
// (transparent text, visible caret) sits on top of a `pointer-events: none`
// styled `<div>` showing the same text with markdown syntax highlighted.
// The user types into the textarea exactly as with plain-text `Notepad`;
// the overlay div is purely decorative and never receives input. This is
// deliberately *not* `contentEditable`/a rich-text document model — the
// stored `lines: string[]` is always the literal on-screen markdown text,
// with zero serialization step (unlike TipTap, which had to convert its
// ProseMirror doc to/from a markdown string on every change).
//
// Because this is textarea-based, it reuses the Phase 13 windowing pattern
// directly from `VirtualizedNotepad` (same `WINDOW_LINES`/`OVERSCAN_LINES`
// constants and scroll-window math) — markdown-enabled documents get the
// same large-document windowing behavior as plain-text ones, which TipTap
// never had (Phase 13 was explicitly scoped to plain-text `Notepad` only).
//
// Highlighting is computed once per edit via `computeLineSegments` (see
// `utils/markdownTokenizer.ts`) against the *full* document text — lexing
// only the visible window would risk misclassifying multi-line constructs
// (fenced code blocks, multi-line blockquotes) that straddle a window
// boundary. Only the segments for the currently windowed lines are
// rendered into the overlay.
//
// Known limitation, inherited from `VirtualizedNotepad` (documented there
// too): soft-wrapped lines break the 1:1 mapping between a source line and
// a single visual row, which can desync the overlay from the textarea when
// word-wrap is on and a line wraps. Not fixed here — same accepted
// trade-off as the plain-text virtualized editor.

const VirtualScrollContainer = styled.div`
  position: relative;
  width: 100%;
  height: 100dvh;
  overflow-y: auto;
  overflow-x: hidden;
`;

const Sizer = styled.div<{ $height: number }>`
  height: ${(p) => p.$height}px;
`;

const WindowRow = styled.div<{ $top: number; $height: number }>`
  position: absolute;
  top: ${(p) => p.$top}px;
  left: 0;
  width: 100%;
  height: ${(p) => p.$height}px;
`;

// Shared font metrics — kept identical between the overlay and the
// textarea so highlighted text lines up exactly with the real caret
// position underneath it (see `VirtualizedNotepad`'s analogous risk note).
const SHARED_FONT_CSS = `
  font-family: monospace;
  font-size: 1rem;
  line-height: 20px;
  padding: 0;
  margin: 0;
`;

type WrapProps = { notepadWrap: boolean };

const HighlightOverlay = styled.div.withConfig({
  shouldForwardProp: (prop) => prop !== 'notepadWrap',
})<WrapProps>`
  position: absolute;
  inset: 0;
  pointer-events: none;
  ${SHARED_FONT_CSS}
  white-space: ${(p) => (p.notepadWrap ? 'pre-wrap' : 'pre')};
  overflow-wrap: ${(p) => (p.notepadWrap ? 'break-word' : 'normal')};
  overflow: hidden;
  color: #1a1a1a;

  /* NOTE: font-size / letter-spacing must never be changed here for any
   * class that can appear on the *active* line (the one the cursor is
   * currently on) — the overlay is only alignment-correct as long as
   * every character on that line stays exactly as wide as the
   * corresponding character in the real monospace textarea underneath it.
   * "Inactive" lines (see .md-heading-scaled below) are safe to enlarge
   * visually via a transform, which doesn't affect layout width, instead
   * of a font-size change, which does. */
  .md-marker {
    color: #b3b3b3;
  }
  /* Hidden by default — revealed (back to .md-marker's dimmed style) only
   * on the line the cursor currently occupies. Uses color: transparent
   * rather than display: none so the character still occupies its
   * normal width and stays aligned with the real textarea underneath.
   * !important: this combines additively with other content classes
   * (e.g. "md-heading md-marker md-marker-hidden") that carry their own
   * color, which would otherwise win the cascade on specificity/source
   * order — "hidden" must always take priority when present. */
  .md-marker-hidden {
    color: transparent !important;
  }
  .md-heading {
    font-weight: bold;
    color: #0f172a;
  }
  /* Applied only to heading *content* (not its # marker) on inactive
   * lines. transform: scale() enlarges the rendered glyphs without
   * changing the element's layout box width/height, so it can't desync
   * the overlay from the real caret position the way a font-size change
   * would. The active line never gets this class, so it always renders
   * at plain, accurate size while being edited. */
  .md-heading-scaled {
    display: inline-block;
    transform-origin: left center;
  }
  .md-heading-scaled.md-heading-1 {
    transform: scale(1.5);
  }
  .md-heading-scaled.md-heading-2 {
    transform: scale(1.35);
  }
  .md-heading-scaled.md-heading-3 {
    transform: scale(1.2);
  }
  .md-heading-scaled.md-heading-4 {
    transform: scale(1.1);
  }
  .md-heading-scaled.md-heading-5 {
    transform: scale(1.05);
  }
  .md-strong {
    font-weight: bold;
  }
  .md-em {
    font-style: italic;
  }
  .md-del {
    text-decoration: line-through;
  }
  .md-code,
  .md-code-block {
    background-color: #f0f0f0;
  }
  .md-link-text {
    color: #2563eb;
    text-decoration: underline;
  }
  .md-blockquote {
    color: #555555;
    font-style: italic;
  }
  .md-list-item {
    font-weight: 500;
  }
  .md-list-item.md-marker,
  .md-list-item .md-marker {
    color: #2563eb;
    font-weight: bold;
  }
  /* Substitutes a real bullet glyph for an unordered list's raw "-"/"*"/"+"
   * marker on inactive lines. The original character is hidden with
   * visibility: hidden (not display: none) so it still reserves its
   * exact width; the bullet is drawn on top via ::before, which is
   * explicitly re-shown since visibility is otherwise inherited. */
  .md-bullet-glyph {
    position: relative;
    visibility: hidden;
  }
  .md-bullet-glyph::before {
    content: '•';
    visibility: visible;
    position: absolute;
    left: 0;
    top: 0;
    color: #2563eb;
    font-weight: bold;
  }
`;

const OverlayLine = styled.div`
  min-height: 1em;
`;

const TransparentTextArea = styled.textarea.withConfig({
  shouldForwardProp: (prop) => prop !== 'notepadWrap',
})<WrapProps>`
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  ${SHARED_FONT_CSS}
  background: transparent;
  color: transparent;
  caret-color: black;
  border: none;
  resize: none;
  overflow: hidden;
  white-space: ${(p) => (p.notepadWrap ? 'pre-wrap' : 'pre')};
  overflow-wrap: ${(p) => (p.notepadWrap ? 'break-word' : 'normal')};
`;

const StatusBar = styled.div`
  position: fixed;
  bottom: 0;
  left: 0;
  padding: 2px 8px;
  font-size: 0.8rem;
  background-color: #f0f0f0;
  border-top: 1px solid lightgray;
`;

interface MarkdownOverlayNotepadProps {
  lines: string[];
  setLines: (lines: string[], cursorLine: number) => void;
  options: NotepadOptions;
}

const MarkdownOverlayNotepad = ({ lines, setLines, options }: MarkdownOverlayNotepadProps) => {
  const lineHeight = useMeasuredLineHeight();
  const [windowStart, setWindowStart] = useState(0);
  const [cursorPosition, setCursorPosition] = useState<{ line: number; column: number } | null>(null);
  const textAreaRef = useRef<HTMLTextAreaElement>(null);
  const pendingSelectionRef = useRef<number | null>(null);

  const effectiveWindowStart = Math.max(0, Math.min(windowStart, Math.max(0, lines.length - 1)));
  const windowEnd = Math.min(lines.length, effectiveWindowStart + WINDOW_LINES);
  const windowLines = lines.slice(effectiveWindowStart, windowEnd);

  // Lexed against the full document so multi-line constructs (fenced code
  // blocks, multi-line blockquotes) straddling a window boundary are still
  // classified correctly — only the window's slice is actually rendered.
  const allLineSegments = useMemo(() => computeLineSegments(lines.join('\n')), [lines]);

  function handleScroll(event: React.UIEvent<HTMLDivElement>) {
    const scrollTop = event.currentTarget.scrollTop;
    const viewportHeight = event.currentTarget.clientHeight;
    const firstVisibleLine = Math.floor(scrollTop / lineHeight);
    const visibleLineCount = Math.ceil(viewportHeight / lineHeight) || 1;

    const desiredStart = Math.max(0, firstVisibleLine - OVERSCAN_LINES);
    const desiredEnd = Math.min(lines.length, firstVisibleLine + visibleLineCount + OVERSCAN_LINES);

    setWindowStart((prevStart) => {
      const prevEnd = Math.min(lines.length, prevStart + WINDOW_LINES);
      if (desiredStart >= prevStart && desiredEnd <= prevEnd) return prevStart;
      const maxStart = Math.max(0, lines.length - WINDOW_LINES);
      return Math.max(0, Math.min(desiredStart, maxStart));
    });
  }

  function handleChange(event: React.ChangeEvent<HTMLTextAreaElement>) {
    const newWindowLines = event.target.value.split('\n');
    const nextLines = [...lines.slice(0, effectiveWindowStart), ...newWindowLines, ...lines.slice(windowEnd)];

    const positionInWindow = getCursorPosition(newWindowLines, event.target.selectionStart);
    const cursorLine = effectiveWindowStart + positionInWindow.line;
    setCursorPosition({ line: cursorLine, column: positionInWindow.column });
    pendingSelectionRef.current = event.target.selectionStart;
    setLines(nextLines, cursorLine);
  }

  // After a controlled re-render updates the textarea's value prop (which
  // may differ from what the user typed if the window was capped at
  // WINDOW_LINES and a line was dropped from the end), restore the cursor
  // to where the user placed it. Without this, the browser resets
  // selectionStart to the end of the new value, causing the cursor to
  // jump to the bottom of the visible window.
  useLayoutEffect(() => {
    if (pendingSelectionRef.current !== null && textAreaRef.current) {
      const pos = Math.min(pendingSelectionRef.current, textAreaRef.current.value.length);
      textAreaRef.current.selectionStart = pos;
      textAreaRef.current.selectionEnd = pos;
      pendingSelectionRef.current = null;
    }
  });

  function handleCursorMove(
    event:
      | React.KeyboardEvent<HTMLTextAreaElement>
      | React.MouseEvent<HTMLTextAreaElement>
      | React.SyntheticEvent<HTMLTextAreaElement>,
  ) {
    const positionInWindow = getCursorPosition(windowLines, event.currentTarget.selectionStart);
    setCursorPosition({
      line: effectiveWindowStart + positionInWindow.line,
      column: positionInWindow.column,
    });
  }

  // Track cursor position via the document-level 'selectionchange' event.
  // On mobile, onFocus/onClick fire before the browser has updated
  // selectionStart to the tapped position, causing the active line to be
  // off by one. selectionchange fires after the selection is actually
  // updated, giving us the correct position.
  const selectionHandlerRef = useRef<() => void>(() => {});
  selectionHandlerRef.current = () => {
    const ta = textAreaRef.current;
    if (ta && document.activeElement === ta) {
      const positionInWindow = getCursorPosition(windowLines, ta.selectionStart);
      setCursorPosition({
        line: effectiveWindowStart + positionInWindow.line,
        column: positionInWindow.column,
      });
    }
  };

  useEffect(() => {
    const handler = () => selectionHandlerRef.current();
    document.addEventListener('selectionchange', handler);
    return () => document.removeEventListener('selectionchange', handler);
  }, []);

  const windowHeight = Math.max(windowLines.length, 1) * lineHeight;
  // Markdown markers (##, **, *, >, etc.) are hidden by default and only
  // revealed on the line the cursor currently occupies (before any
  // interaction, cursorPosition is null and every line stays hidden).
  const activeLine = cursorPosition?.line ?? -1;

  return (
    <>
      <VirtualScrollContainer onScroll={handleScroll} data-testid="virtual-scroll-container">
        <Sizer $height={lines.length * lineHeight} />
        <WindowRow $top={effectiveWindowStart * lineHeight} $height={windowHeight}>
          <HighlightOverlay
            notepadWrap={options.text.notepadWrap}
            aria-hidden="true"
            data-testid="markdown-overlay"
          >
            {windowLines.map((line, i) => {
              const globalIndex = effectiveWindowStart + i;
              const segments = allLineSegments[globalIndex] ?? [{ text: line, className: '' }];
              const isActiveLine = globalIndex === activeLine;
              return (
                <OverlayLine key={globalIndex}>
                  {segments.map((seg, j) => {
                    const classList = seg.className ? seg.className.split(' ') : [];
                    const isMarker = classList.includes('md-marker');
                    const isBulletMarker = classList.includes('md-list-marker-bullet');
                    const isHeadingContent = classList.includes('md-heading') && !isMarker;

                    const extra: string[] = [];
                    if (!isActiveLine) {
                      if (isMarker) extra.push('md-marker-hidden');
                      if (isBulletMarker) extra.push('md-bullet-glyph');
                      if (isHeadingContent) extra.push('md-heading-scaled');
                    }

                    const className = [seg.className, ...extra].filter(Boolean).join(' ');
                    return (
                      <span key={j} className={className || undefined}>
                        {seg.text}
                      </span>
                    );
                  })}
                </OverlayLine>
              );
            })}
          </HighlightOverlay>
          <TransparentTextArea
            ref={textAreaRef}
            data-testid="markdown-overlay-textarea"
            notepadWrap={options.text.notepadWrap}
            wrap={options.text.notepadWrap ? 'on' : 'off'}
            value={windowLines.join('\n')}
            onChange={handleChange}
            onKeyUp={handleCursorMove}
            onClick={handleCursorMove}
            onSelect={handleCursorMove}
            onTouchEnd={() => requestAnimationFrame(() => selectionHandlerRef.current())}
          />
        </WindowRow>
      </VirtualScrollContainer>
      <StatusBar>
        {cursorPosition !== null
          ? `Line ${cursorPosition.line + 1}, Col ${cursorPosition.column + 1}`
          : 'Line —, Col —'}
      </StatusBar>
    </>
  );
};

export default MarkdownOverlayNotepad;
