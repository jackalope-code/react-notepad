import styled from 'styled-components';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Dialog, DialogTitle, DialogContent, TextField, IconButton } from '@mui/material';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faXmark } from '@fortawesome/free-solid-svg-icons';
import mermaid from 'mermaid';
import { getCursorPosition, type NotepadOptions } from './Notepad';
import { WINDOW_LINES, OVERSCAN_LINES } from './VirtualizedNotepad';
import { computeLineSegments, findChartFences, type ChartFence } from './utils/markdownTokenizer';
import InsertToolbar from './InsertToolbar';
import Dpad, { type DpadDirection } from './Dpad';
import { useIsTouchDevice } from './useIsTouchDevice';
import { useOverflow } from './useOverflow';
import { useMeasuredCharWidth } from './useMeasuredCharWidth';

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
  min-height: 100dvh;
`;

const WindowRow = styled.div<{ $top: number; $height: number }>`
  position: absolute;
  top: ${(p) => p.$top}px;
  left: 0;
  width: 100%;
  height: ${(p) => p.$height}px;
  min-height: 100dvh;
  display: flex;
  align-items: stretch;
`;

// Shared font metrics — kept identical between the overlay and the
// textarea so highlighted text lines up exactly with the real caret
// position underneath it (see `VirtualizedNotepad`'s analogous risk note).
// Single source of truth for the shared 20px line grid — every layout
// calculation in this file (chart spacer heights, chart thumbnail
// top/height, window sizing) must use this exact constant rather than a
// separately-measured value, or it desyncs from the real textarea/overlay
// rows below, which always render at exactly this height per SHARED_FONT_CSS.
const LINE_HEIGHT_PX = 20;

const SHARED_FONT_CSS = `
  font-family: monospace;
  font-size: 1rem;
  line-height: ${LINE_HEIGHT_PX}px;
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
  /* Table cell/row decoration — border/background only, never a height or
   * font-size change, so it can't desync the overlay from the textarea
   * (each table row is still exactly one 20px source line). Always shown
   * (not gated on the active line) since it's a persistent visual table,
   * not a hideable syntax marker. */
  .md-table-cell {
    background-color: #f8fafc;
    border-top: 1px solid #cbd5e1;
    border-bottom: 1px solid #cbd5e1;
  }
  .md-table-pipe {
    color: #94a3b8;
  }
  /* Fallback styling for a chart-fence line rendered as plain text (only
   * possible at a window boundary edge case — see ChartThumbnail usage
   * below); normally these lines are replaced entirely by a thumbnail. */
  .md-chart-block {
    background-color: #eef2ff;
  }
`;

const LineNumberGutter = styled.div`
  flex: 0 0 auto;
  padding: 0 8px;
  text-align: right;
  color: gray;
  background-color: #f5f5f5;
  border-right: 1px solid lightgray;
  font-family: monospace;
  white-space: pre;
  user-select: none;
`;

const EditorContainer = styled.div`
  position: relative;
  flex: 1 1 auto;
  min-width: 0;
`;

const OverlayLine = styled.div`
  height: 20px;
`;

// A chart fence block renders as a single flow element spanning exactly as
// many pixels as it would have taken as N separate 20px OverlayLines — so
// it never changes the total flow height and can't push later lines out of
// sync with the textarea underneath (see CARET_BUGS.md / EDITOR_DESIGN.md).
const ChartBlockRow = styled.div<{ $height: number }>`
  height: ${(p) => p.$height}px;
  width: 100%;
`;

// Positioned absolutely (top/height passed via inline style) inside
// ChartOverlayLayer, which is rendered *after* TransparentTextArea in the
// DOM — i.e. on top of it — so this is the topmost element wherever a
// chart is drawn. That's essential, not decorative: previously the real
// textarea painted on top of the (pointer-events: none) HighlightOverlay,
// so its native caret/spellcheck rendered over the chart and it silently
// intercepted every click before the thumbnail's onClick ever fired. See
// ChartOverlayLayer below for the rest of this fix.
const ChartThumbnailContainer = styled.div`
  position: absolute;
  left: 0;
  right: 0;
  pointer-events: auto;
  cursor: pointer;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border: 1px dashed #94a3b8;
  background-color: #f8fafc;
  border-radius: 4px;

  & svg {
    width: 100%;
    height: 100%;
    // Charts are preview-only here; the whole thumbnail box should open the
    // editor, not just the visible chart shapes. Pie charts in particular can
    // leave large transparent areas that don't bubble clicks without this.
    pointer-events: none;
  }

  & svg * {
    pointer-events: none;
    // Charts are preview-only here; the whole thumbnail box should open the
    // editor, not just the visible chart shapes. Pie charts in particular can
    // leave large transparent areas that don't bubble clicks without this.
    pointer-events: none;
  }

  & svg * {
    pointer-events: none;
  }
`;

// pointer-events: none so any gap/edge-case pixel not covered by an actual
// ChartThumbnailContainer child falls through to the real textarea below.
const ChartOverlayLayer = styled.div`
  position: absolute;
  inset: 0;
  pointer-events: none;
`;

const ChartErrorBadge = styled.div`
  color: #b91c1c;
  font-size: 0.8rem;
  padding: 0 8px;
`;

const ChartPreviewPane = styled.div`
  flex: 1;
  min-height: 240px;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: auto;
  border: 1px solid #e2e8f0;
  border-radius: 4px;
  padding: 8px;

  & svg {
    max-width: 100%;
    max-height: 100%;
  }
`;

let mermaidInitialized = false;
function ensureMermaidInitialized() {
  if (!mermaidInitialized) {
    mermaid.initialize({ startOnLoad: false, securityLevel: 'strict' });
    mermaidInitialized = true;
  }
}

interface ChartThumbnailProps {
  id: string;
  source: string;
  top: number;
  heightPx: number;
  onOpenEditor: () => void;
}

// Renders a fixed-size (heightPx) rendered preview of a mermaid chart, or a
// small error badge if the source is invalid. The container's box size
// never depends on the rendered SVG's natural size — the SVG is stretched
// to fill it (see ChartThumbnailContainer's `& svg` rule) — so the chart
// can never grow the overlay row beyond the fence's line count.
function ChartThumbnail({ id, source, top, heightPx, onOpenEditor }: ChartThumbnailProps) {
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    ensureMermaidInitialized();
    let cancelled = false;
    mermaid
      .render(`chart-thumb-${id}`, source.trim() || ' ')
      .then((result) => {
        if (!cancelled) {
          setSvg(result.svg);
          setError(null);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setSvg(null);
          setError(err instanceof Error ? err.message : String(err));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [id, source]);

  return (
    <ChartThumbnailContainer
      style={{ top, height: heightPx }}
      onClick={onOpenEditor}
      data-testid="chart-thumbnail"
      data-line-start={id}
      role="button"
      aria-label="Edit chart"
    >
      {error ? (
        <ChartErrorBadge>⚠ Invalid chart — tap to edit</ChartErrorBadge>
      ) : svg ? (
        <div style={{ width: '100%', height: '100%' }} dangerouslySetInnerHTML={{ __html: svg }} />
      ) : (
        <span>Rendering…</span>
      )}
    </ChartThumbnailContainer>
  );
}

interface ChartEditorPopoverProps {
  fence: ChartFence | null;
  // Edits are only committed to the document when the popover closes —
  // whichever way that happens (Close button, backdrop click, or Escape,
  // all funnel through this single handler with the latest source) — so
  // there's no separate Save/Cancel distinction for the user to reason
  // about, and no risk of a keystroke-by-keystroke commit racing with the
  // fence's own startLine/endLine shifting while the popover is still open.
  onClose: (source: string) => void;
}

// Floating popover — a MUI Dialog — positioned outside the document flow
// entirely, so nothing about it can ever affect the overlay/textarea line
// grid. This is the *only* place chart source text is edited; the inline
// thumbnail is never directly editable (see EDITOR_DESIGN.md / plan).
function ChartEditorPopover({ fence, onClose }: ChartEditorPopoverProps) {
  const [source, setSource] = useState('');
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (fence) setSource(fence.source);
  }, [fence]);

  useEffect(() => {
    if (!fence) return;
    ensureMermaidInitialized();
    let cancelled = false;
    const timeout = setTimeout(() => {
      mermaid
        .render('chart-editor-preview', source.trim() || ' ')
        .then((result) => {
          if (!cancelled) {
            setSvg(result.svg);
            setError(null);
          }
        })
        .catch((err) => {
          if (!cancelled) {
            setSvg(null);
            setError(err instanceof Error ? err.message : String(err));
          }
        });
      // Debounced (rather than on every keystroke) since mermaid.render()
      // re-parses/lays out the whole diagram synchronously each call.
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [fence, source]);

  function handleClose() {
    onClose(source);
  }

  return (
    <Dialog open={fence !== null} onClose={handleClose} maxWidth="md" fullWidth data-testid="chart-editor-popover">
      <DialogTitle style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        Edit Chart
        <IconButton onClick={handleClose} aria-label="Close" size="small" data-testid="chart-editor-close">
          <FontAwesomeIcon icon={faXmark} />
        </IconButton>
      </DialogTitle>
      <DialogContent style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <TextField
          multiline
          minRows={10}
          fullWidth
          value={source}
          onChange={(e) => setSource(e.target.value)}
          slotProps={{ input: { style: { fontFamily: 'monospace' } } }}
        />
        <ChartPreviewPane>
          {error ? (
            <ChartErrorBadge>{error}</ChartErrorBadge>
          ) : svg ? (
            <div dangerouslySetInnerHTML={{ __html: svg }} />
          ) : (
            <span>Rendering…</span>
          )}
        </ChartPreviewPane>
      </DialogContent>
    </Dialog>
  );
}

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
  overflow-y: hidden;
  overflow-x: ${(p) => (p.notepadWrap ? 'hidden' : 'auto')};
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
  const lineHeight = LINE_HEIGHT_PX;
  const [windowStart, setWindowStart] = useState(0);
  const [cursorPosition, setCursorPosition] = useState<{ line: number; column: number } | null>(null);
  const textAreaRef = useRef<HTMLTextAreaElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const pendingSelectionRef = useRef<number | null>(null);
  const pendingDpadTargetRef = useRef<{ line: number; column: number } | null>(null);
  const desiredColumnRef = useRef<number | null>(null);

  const isTouch = useIsTouchDevice();
  const containerOverflow = useOverflow(scrollContainerRef, [lines]);
  const textAreaOverflow = useOverflow(textAreaRef, [lines, windowStart]);
  const charWidth = useMeasuredCharWidth(textAreaRef);

  // Set while the user is in "placement mode" after choosing a table size
  // or chart type from InsertToolbar — the next click/tap in the document
  // inserts these lines at that position instead of moving the cursor.
  const [pendingInsertLines, setPendingInsertLines] = useState<string[] | null>(null);
  // The chart fence currently open in the floating editor popover, or null.
  const [chartPopoverFence, setChartPopoverFence] = useState<ChartFence | null>(null);

  const effectiveWindowStart = Math.max(0, Math.min(windowStart, Math.max(0, lines.length - 1)));
  const windowEnd = Math.min(lines.length, effectiveWindowStart + WINDOW_LINES);
  const windowLines = lines.slice(effectiveWindowStart, windowEnd);

  // Lexed against the full document so multi-line constructs (fenced code
  // blocks, multi-line blockquotes) straddling a window boundary are still
  // classified correctly — only the window's slice is actually rendered.
  const allLineSegments = useMemo(() => computeLineSegments(lines.join('\n')), [lines]);
  // Top-level mermaid fences, by line range, so their raw text can be
  // replaced with a fixed-size ChartThumbnail (see ChartThumbnail above).
  const chartFences = useMemo(() => findChartFences(lines.join('\n')), [lines]);

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
    desiredColumnRef.current = positionInWindow.column;
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

    if (pendingDpadTargetRef.current && textAreaRef.current) {
      const { line, column } = pendingDpadTargetRef.current;
      if (line >= effectiveWindowStart && line < windowEnd) {
        const targetWindowLines = lines.slice(effectiveWindowStart, windowEnd);
        let index = 0;
        for (let i = 0; i < line - effectiveWindowStart; i++) {
          index += targetWindowLines[i].length + 1;
        }
        const targetLineText = targetWindowLines[line - effectiveWindowStart] ?? '';
        index += Math.min(column, targetLineText.length);
        textAreaRef.current.selectionStart = index;
        textAreaRef.current.selectionEnd = index;
        setCursorPosition({ line, column });
        pendingDpadTargetRef.current = null;
      }
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
    desiredColumnRef.current = positionInWindow.column;
  }

  // D-pad movement: translate a directional click into a target logical
  // (line, column). If the target is already inside the visible window we
  // apply it immediately; otherwise we shift the virtualized window and let
  // the layout effect place the caret on the next render.
  function handleDpadMove(direction: DpadDirection) {
    const current = cursorPosition ?? { line: effectiveWindowStart, column: 0 };
    let targetLine = current.line;
    let targetColumn = current.column;
    const desiredColumn = desiredColumnRef.current ?? current.column;

    switch (direction) {
      case 'left':
        if (targetColumn > 0) {
          targetColumn--;
        } else if (targetLine > 0) {
          targetLine--;
          targetColumn = lines[targetLine].length;
        }
        desiredColumnRef.current = targetColumn;
        break;
      case 'right':
        if (targetColumn < (lines[targetLine]?.length ?? 0)) {
          targetColumn++;
        } else if (targetLine < lines.length - 1) {
          targetLine++;
          targetColumn = 0;
        }
        desiredColumnRef.current = targetColumn;
        break;
      case 'up':
        if (targetLine > 0) {
          targetLine--;
          targetColumn = Math.min(desiredColumn, lines[targetLine].length);
        }
        break;
      case 'down':
        if (targetLine < lines.length - 1) {
          targetLine++;
          targetColumn = Math.min(desiredColumn, lines[targetLine].length);
        }
        break;
    }

    if (targetLine === current.line && targetColumn === current.column) {
      return;
    }

    const isInWindow = targetLine >= effectiveWindowStart && targetLine < windowEnd;
    if (isInWindow) {
      const targetWindowLines = lines.slice(effectiveWindowStart, windowEnd);
      let index = 0;
      for (let i = 0; i < targetLine - effectiveWindowStart; i++) {
        index += targetWindowLines[i].length + 1;
      }
      const targetLineText = targetWindowLines[targetLine - effectiveWindowStart] ?? '';
      index += Math.min(targetColumn, targetLineText.length);
      if (textAreaRef.current) {
        textAreaRef.current.selectionStart = index;
        textAreaRef.current.selectionEnd = index;
      }
      setCursorPosition({ line: targetLine, column: targetColumn });
    } else {
      pendingDpadTargetRef.current = { line: targetLine, column: targetColumn };
      const maxStart = Math.max(0, lines.length - WINDOW_LINES);
      const newStart = Math.max(0, Math.min(targetLine - OVERSCAN_LINES, maxStart));
      setWindowStart(newStart);
      if (scrollContainerRef.current) {
        scrollContainerRef.current.scrollTop = targetLine * lineHeight;
      }
    }
  }

  // D-pad and wheel helpers for the overlay editor. The d-pad scrolls the
  // virtualized container vertically and the textarea/overlay horizontally.
  // Ctrl+wheel is remapped to horizontal scroll on the textarea.
  function handleDpadScroll(direction: DpadDirection) {
    if (direction === 'up' || direction === 'down') {
      if (!scrollContainerRef.current) return;
      const delta = direction === 'up' ? -lineHeight : lineHeight;
      scrollContainerRef.current.scrollTop += delta;
    } else {
      if (!textAreaRef.current) return;
      const delta = direction === 'left' ? -charWidth : charWidth;
      textAreaRef.current.scrollLeft += delta;
      if (overlayRef.current) {
        overlayRef.current.scrollLeft = textAreaRef.current.scrollLeft;
      }
    }
  }

  function handleWheel(event: React.WheelEvent<HTMLDivElement>) {
    if (event.ctrlKey || event.metaKey) {
      event.preventDefault();
      if (!textAreaRef.current) return;
      textAreaRef.current.scrollLeft += event.deltaY;
      if (overlayRef.current) {
        overlayRef.current.scrollLeft = textAreaRef.current.scrollLeft;
      }
    }
  }

  function handleTextAreaScroll() {
    if (overlayRef.current && textAreaRef.current) {
      overlayRef.current.scrollLeft = textAreaRef.current.scrollLeft;
    }
  }

  // While in placement mode (a table/chart has been chosen from
  // InsertToolbar but not yet placed), a click in the document inserts the
  // pending lines at the clicked line instead of just moving the cursor.
  function handleTextAreaClick(event: React.MouseEvent<HTMLTextAreaElement>) {
    if (pendingInsertLines) {
      const positionInWindow = getCursorPosition(windowLines, event.currentTarget.selectionStart);
      const targetLine = effectiveWindowStart + positionInWindow.line;
      const nextLines = [...lines.slice(0, targetLine), ...pendingInsertLines, ...lines.slice(targetLine)];
      setPendingInsertLines(null);
      setLines(nextLines, targetLine);
      return;
    }
    handleCursorMove(event);
  }

  // Commits the popover's edited chart source back into the document when
  // it closes (Close button, backdrop click, or Escape all funnel here via
  // ChartEditorPopover's onClose), replacing the fence's full line range
  // (opening/closing fences + inner source) with a regenerated block using
  // the same language tag. A no-op close (source unchanged) skips setLines
  // entirely so it doesn't create a spurious undo entry.
  function handleClosePopover(newSource: string) {
    if (!chartPopoverFence) return;
    const fence = chartPopoverFence;
    if (newSource === fence.source) {
      setChartPopoverFence(null);
      return;
    }
    const newFenceLines = [`\`\`\`${fence.lang}`, ...newSource.split('\n'), '```'];
    const nextLines = [...lines.slice(0, fence.startLine), ...newFenceLines, ...lines.slice(fence.endLine + 1)];
    setChartPopoverFence(null);
    setLines(nextLines, fence.startLine);
  }

  // Track cursor position via the document-level 'selectionchange' event.
  // On mobile, onFocus/onClick fire before the browser has updated
  // selectionStart to the tapped position, causing the active line to be
  // off by one. selectionchange fires after the selection is actually
  // updated, giving us the correct position. We no longer gate on
  // activeElement === ta because the event can fire during the focus
  // transition before the textarea is reported as the active element.
  const selectionHandlerRef = useRef<() => void>(() => {});
  selectionHandlerRef.current = () => {
    const ta = textAreaRef.current;
    if (ta) {
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

  // Builds the overlay's row elements, replacing every line inside a chart
  // fence's range with a single ChartThumbnail block instead of per-line
  // text spans (see ChartBlockRow above for why this can't desync the
  // caret grid). Known limitation: if a fence straddles the current
  // window's top boundary (fence.startLine falls outside the window but
  // fence.endLine is inside it), those in-window lines are skipped rather
  // than mis-rendered as raw text — same category of accepted trade-off as
  // the existing soft-wrap windowing limitation noted above.
  const overlayRows: React.ReactNode[] = [];
  for (let i = 0; i < windowLines.length; i++) {
    const globalIndex = effectiveWindowStart + i;
    const fence = chartFences.find((f) => f.startLine === globalIndex);
    if (fence) {
      const fenceLineCount = fence.endLine - fence.startLine + 1;
      // Pure height-reserving spacer — the actual clickable/visible chart
      // is rendered separately in ChartOverlayLayer (after the textarea in
      // the DOM, see below) so it can actually receive clicks and occlude
      // the real textarea's native caret/spellcheck decorations.
      overlayRows.push(<ChartBlockRow key={`chart-${globalIndex}`} $height={fenceLineCount * lineHeight} />);
      i += fenceLineCount - 1;
      continue;
    }
    const insideFenceRange = chartFences.some((f) => globalIndex > f.startLine && globalIndex <= f.endLine);
    if (insideFenceRange) continue;

    const line = windowLines[i];
    const segments = allLineSegments[globalIndex] ?? [{ text: line, className: '' }];
    const isActiveLine = globalIndex === activeLine;
    overlayRows.push(
      <OverlayLine key={globalIndex} data-testid="overlay-line" data-line={globalIndex}>
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
      </OverlayLine>,
    );
  }

  // Chart fences visible (even partially) in the current window, with the
  // absolute top/height (in px, relative to EditorContainer) at which each
  // should be drawn in ChartOverlayLayer. Clamped to the window's bounds so
  // a fence straddling a window edge still gets a (partial) clickable box
  // rather than nothing.
  const visibleChartBlocks = chartFences
    .filter((f) => f.endLine >= effectiveWindowStart && f.startLine < windowEnd)
    .map((f) => {
      const clampedStart = Math.max(f.startLine, effectiveWindowStart);
      const clampedEnd = Math.min(f.endLine, windowEnd - 1);
      return {
        fence: f,
        top: (clampedStart - effectiveWindowStart) * lineHeight,
        height: (clampedEnd - clampedStart + 1) * lineHeight,
      };
    });

  return (
    <>
      <VirtualScrollContainer ref={scrollContainerRef} onScroll={handleScroll} data-testid="virtual-scroll-container">
        <Sizer $height={lines.length * lineHeight} />
        <WindowRow $top={effectiveWindowStart * lineHeight} $height={windowHeight}>
          {options.text.showLineNumbers && (
            <LineNumberGutter
              aria-hidden="true"
              data-testid="markdown-overlay-gutter"
            >
              {windowLines.map((_, i) => `${effectiveWindowStart + i + 1}\n`)}
            </LineNumberGutter>
          )}
          <EditorContainer>
            <HighlightOverlay
              ref={overlayRef}
              notepadWrap={options.text.notepadWrap}
              aria-hidden="true"
              data-testid="markdown-overlay"
            >
            {overlayRows}
          </HighlightOverlay>
            <TransparentTextArea
              ref={textAreaRef}
              data-testid="markdown-overlay-textarea"
              autoFocus
              spellCheck={false}
              notepadWrap={options.text.notepadWrap}
              wrap={options.text.notepadWrap ? 'on' : 'off'}
              value={windowLines.join('\n')}
              onChange={handleChange}
              onKeyUp={handleCursorMove}
              onClick={handleTextAreaClick}
              onSelect={handleCursorMove}
              onScroll={handleTextAreaScroll}
              onTouchEnd={() => setTimeout(() => selectionHandlerRef.current(), 0)}
            />
            <ChartOverlayLayer>
              {visibleChartBlocks.map(({ fence, top, height }) => (
                <ChartThumbnail
                  key={`chart-click-${fence.startLine}`}
                  id={`${fence.startLine}`}
                  source={fence.source}
                  top={top}
                  heightPx={height}
                  onOpenEditor={() => setChartPopoverFence(fence)}
                />
              ))}
            </ChartOverlayLayer>
          </EditorContainer>
        </WindowRow>
      </VirtualScrollContainer>
      <StatusBar data-testid="markdown-overlay-status-bar">
        {cursorPosition !== null
          ? `Line ${cursorPosition.line + 1}, Col ${cursorPosition.column + 1}`
          : 'Line —, Col —'}
      </StatusBar>
      <InsertToolbar
        active={pendingInsertLines !== null}
        onPrepareInsert={setPendingInsertLines}
        onCancelPlacement={() => setPendingInsertLines(null)}
      />
      {isTouch && options.dpad?.showCaret !== false && (
        <Dpad onMove={handleDpadMove} testId="dpad-caret" style={{ right: 'auto', left: '12px' }} />
      )}
      {isTouch && options.dpad?.showScroll !== false && (containerOverflow.hasVerticalOverflow || textAreaOverflow.hasHorizontalOverflow) && (
        <Dpad
          onMove={handleDpadScroll}
          testId="dpad-scroll"
          enabled={{
            up: containerOverflow.hasVerticalOverflow,
            down: containerOverflow.hasVerticalOverflow,
            left: textAreaOverflow.hasHorizontalOverflow,
            right: textAreaOverflow.hasHorizontalOverflow,
          }}
        />
      )}
      <ChartEditorPopover fence={chartPopoverFence} onClose={handleClosePopover} />
    </>
  );
};

export default MarkdownOverlayNotepad;
