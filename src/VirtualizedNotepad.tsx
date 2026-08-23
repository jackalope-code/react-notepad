import styled from 'styled-components';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { getCursorPosition, type NotepadOptions } from './Notepad';
import Dpad, { type DpadDirection } from './Dpad';
import { useIsTouchDevice } from './useIsTouchDevice';
import { useOverflow } from './useOverflow';
import { useMeasuredCharWidth } from './useMeasuredCharWidth';

// ---------------------------------------------------------------------------
// VirtualizedNotepad (Phase 13)
// ---------------------------------------------------------------------------
//
// Rendered instead of `Notepad` when `USE_VIRTUALIZED_EDITOR` is true (see
// `MainView.tsx` / `utils/featureFlags.ts`). Same props contract as
// `Notepad` — it's a drop-in swap, and the *persisted* document is always
// still `lines: string[]` (this component never changes that).
//
// A native `<textarea>` fundamentally needs its full text as `value`, so a
// truly virtualized *editable* text editor can't just "not render" most of
// a giant textarea the way a virtualized *list* can skip off-screen rows.
// The technique used here instead: keep a single real `<textarea>` (so
// typing/selection/IME continue to work exactly like the browser's native
// behavior — no ProseMirror-style custom selection model needed), but only
// ever give it a *window* of `WINDOW_LINES` lines around the scroll
// position as its `value`, absolutely positioned inside a scrollable
// container next to an invisible "sizer" element that gives the container
// the correct total scrollable height. Scrolling the container recomputes
// which window of lines is loaded into the textarea; the full `lines`
// array (via `setLines`) remains the single source of truth throughout.
//
// Known rough edge (documented, not fixed in this phase): arrow-key
// navigation that tries to cross a window boundary (e.g. pressing ArrowDown
// while sitting on the last rendered line of the window) won't auto-scroll
// past it the way it would in a non-virtualized textarea — the browser has
// nothing to move the cursor into within that same textarea's value. Mouse
// wheel / trackpad / touch scrolling and normal typing within the visible
// window are unaffected. `WINDOW_LINES` is set generously so this is rare
// in practice; a fuller fix would need to intercept arrow keys at the
// window edges and reposition, which is out of scope for this phase.

const WINDOW_LINES = 200;
const OVERSCAN_LINES = 30;
const DEFAULT_LINE_HEIGHT = 20;

function useMeasuredLineHeight(): number {
  const [lineHeight, setLineHeight] = useState(DEFAULT_LINE_HEIGHT);

  useEffect(() => {
    const probe = document.createElement('span');
    probe.textContent = 'M';
    probe.style.position = 'absolute';
    probe.style.visibility = 'hidden';
    probe.style.whiteSpace = 'pre';
    probe.style.fontFamily = 'monospace';
    probe.style.fontSize = '1rem';
    document.body.appendChild(probe);
    const measured = probe.getBoundingClientRect().height;
    document.body.removeChild(probe);
    // jsdom (used in tests) always measures 0 — fall back to the default
    // rather than collapsing every line to zero height.
    if (measured > 0) setLineHeight(measured);
  }, []);

  return lineHeight;
}

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

const WindowRow = styled.div<{ $top: number }>`
  position: absolute;
  top: ${(p) => p.$top}px;
  left: 0;
  width: 100%;
  display: flex;
  align-items: stretch;
`;

const LineNumberGutter = styled.div<{ $height: number }>`
  flex: 0 0 auto;
  padding: 0 8px;
  height: ${(p) => p.$height}px;
  text-align: right;
  color: gray;
  background-color: #f5f5f5;
  border-right: 1px solid lightgray;
  font-family: monospace;
  white-space: pre;
  user-select: none;
`;

type OverlayTextAreaProps = { notepadWrap: boolean; $height: number };

const OverlayTextArea = styled.textarea.withConfig({
  shouldForwardProp: (prop) => prop !== 'notepadWrap' && prop !== '$height',
})<OverlayTextAreaProps>`
  flex: 1 1 auto;
  height: ${(p) => p.$height}px;
  min-height: 100dvh;
  border: none;
  resize: none;
  overflow-y: hidden;
  overflow-x: ${(p) => (p.notepadWrap ? 'hidden' : 'auto')};
  padding: 0;
  font-family: monospace;
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

interface VirtualizedNotepadProps {
  lines: string[];
  setLines: (lines: string[], cursorLine: number) => void;
  options: NotepadOptions;
}

const VirtualizedNotepad = ({ lines, setLines, options }: VirtualizedNotepadProps) => {
  const lineHeight = useMeasuredLineHeight();
  const [windowStart, setWindowStart] = useState(0);
  const [cursorPosition, setCursorPosition] = useState<{ line: number; column: number } | null>(null);
  const textAreaRef = useRef<HTMLTextAreaElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const pendingSelectionRef = useRef<number | null>(null);
  const pendingDpadTargetRef = useRef<{ line: number; column: number } | null>(null);
  const desiredColumnRef = useRef<number | null>(null);
  const isTouch = useIsTouchDevice();
  const containerOverflow = useOverflow(scrollContainerRef, [lines]);
  const textAreaOverflow = useOverflow(textAreaRef, [lines, windowStart]);
  const charWidth = useMeasuredCharWidth(textAreaRef);

  // Defensive clamp for render/edit math: if `lines` shrank (e.g. after an
  // undo) further than the last scroll-driven `windowStart`, don't let the
  // window run past the end of the document.
  const effectiveWindowStart = Math.max(0, Math.min(windowStart, Math.max(0, lines.length - 1)));
  const windowEnd = Math.min(lines.length, effectiveWindowStart + WINDOW_LINES);
  const windowLines = lines.slice(effectiveWindowStart, windowEnd);

  function handleScroll(event: React.UIEvent<HTMLDivElement>) {
    const scrollTop = event.currentTarget.scrollTop;
    const viewportHeight = event.currentTarget.clientHeight;
    const firstVisibleLine = Math.floor(scrollTop / lineHeight);
    const visibleLineCount = Math.ceil(viewportHeight / lineHeight) || 1;

    const desiredStart = Math.max(0, firstVisibleLine - OVERSCAN_LINES);
    const desiredEnd = Math.min(lines.length, firstVisibleLine + visibleLineCount + OVERSCAN_LINES);

    setWindowStart((prevStart) => {
      const prevEnd = Math.min(lines.length, prevStart + WINDOW_LINES);
      // Still fully inside the currently-loaded window — no need to swap
      // the textarea's content (which would disrupt an in-progress edit).
      if (desiredStart >= prevStart && desiredEnd <= prevEnd) return prevStart;
      const maxStart = Math.max(0, lines.length - WINDOW_LINES);
      return Math.max(0, Math.min(desiredStart, maxStart));
    });
  }

  function handleChange(event: React.ChangeEvent<HTMLTextAreaElement>) {
    const newWindowLines = event.target.value.split('\n');
    const nextLines = [
      ...lines.slice(0, effectiveWindowStart),
      ...newWindowLines,
      ...lines.slice(windowEnd),
    ];

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
        index += Math.min(column, targetWindowLines[line - effectiveWindowStart]?.length ?? 0);
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

  function handleDpadScroll(direction: DpadDirection) {
    if (direction === 'up' || direction === 'down') {
      if (!scrollContainerRef.current) return;
      const delta = direction === 'up' ? -lineHeight : lineHeight;
      scrollContainerRef.current.scrollTop += delta;
    } else {
      if (!textAreaRef.current) return;
      const delta = direction === 'left' ? -charWidth : charWidth;
      textAreaRef.current.scrollLeft += delta;
    }
  }

  function handleDpadMove(direction: DpadDirection) {
    const current = cursorPosition ?? { line: effectiveWindowStart, column: 0 };
    let targetLine = current.line;
    let targetColumn = current.column;
    desiredColumnRef.current ??= current.column;

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
          targetColumn = Math.min(desiredColumnRef.current ?? 0, lines[targetLine].length);
        }
        break;
      case 'down':
        if (targetLine < lines.length - 1) {
          targetLine++;
          targetColumn = Math.min(desiredColumnRef.current ?? 0, lines[targetLine].length);
        }
        break;
    }

    if (targetLine === current.line && targetColumn === current.column) return;

    pendingDpadTargetRef.current = { line: targetLine, column: targetColumn };

    const isInWindow = targetLine >= effectiveWindowStart && targetLine < windowEnd;
    if (!isInWindow) {
      const maxStart = Math.max(0, lines.length - WINDOW_LINES);
      const newStart = Math.max(0, Math.min(targetLine - OVERSCAN_LINES, maxStart));
      setWindowStart(newStart);
      if (scrollContainerRef.current) {
        scrollContainerRef.current.scrollTop = targetLine * lineHeight;
      }
    }
  }

  function handleWheel(event: React.WheelEvent<HTMLDivElement>) {
    if (event.ctrlKey || event.metaKey) {
      event.preventDefault();
      if (!textAreaRef.current) return;
      textAreaRef.current.scrollLeft += event.deltaY;
    }
  }

  const windowHeight = Math.max(windowLines.length, 1) * lineHeight;

  return (
    <>
      <VirtualScrollContainer ref={scrollContainerRef} onScroll={handleScroll} onWheel={handleWheel} data-testid="virtual-scroll-container">
        <Sizer $height={lines.length * lineHeight} />
        <WindowRow $top={effectiveWindowStart * lineHeight}>
          {options.text.showLineNumbers && (
            <LineNumberGutter $height={windowHeight} aria-hidden="true" data-testid="line-number-gutter">
              {windowLines.map((_, i) => `${effectiveWindowStart + i + 1}\n`)}
            </LineNumberGutter>
          )}
          <OverlayTextArea
            ref={textAreaRef}
            data-testid="virtualized-textarea"
            autoFocus
            $height={windowHeight}
            notepadWrap={options.text.notepadWrap}
            wrap={options.text.notepadWrap ? 'on' : 'off'}
            value={windowLines.join('\n')}
            onChange={handleChange}
            onKeyUp={handleCursorMove}
            onClick={handleCursorMove}
            onSelect={handleCursorMove}
            onFocus={handleCursorMove}
          />
        </WindowRow>
      </VirtualScrollContainer>
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
      <StatusBar>
        {cursorPosition !== null
          ? `Line ${cursorPosition.line + 1}, Col ${cursorPosition.column + 1}`
          : 'Line —, Col —'}
      </StatusBar>
    </>
  );
};

export { WINDOW_LINES, OVERSCAN_LINES, useMeasuredLineHeight };
export default VirtualizedNotepad;
