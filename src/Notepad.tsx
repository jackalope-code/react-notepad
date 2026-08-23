import styled from 'styled-components';
import Dpad, { type DpadDirection } from './Dpad';
import { useIsTouchDevice } from './useIsTouchDevice';
import { useOverflow } from './useOverflow';
import { useMeasuredCharWidth } from './useMeasuredCharWidth';
import { useMeasuredLineHeight } from './useMeasuredLineHeight';
import useLocalStorage from './utils/useLocalStorage';
import { useRef, useState } from 'react';
import {
  computeDelta,
  applyDelta,
  revertDelta,
  parseTextLines,
  parseTitle,
  parseOptions,
  serializeTextV2,
  serializeTitleV2,
  serializeOptionsV2,
  type HistoryEntry,
} from './utils/notepadTypes';

// ---------------------------------------------------------------------------
// Styled component
// ---------------------------------------------------------------------------

type TextAreaProps = NotepadOptions['text'];

const StyledTextArea = styled.textarea.withConfig({
  shouldForwardProp: (prop) => prop !== 'notepadWrap',
})<TextAreaProps>`
    width: 100%;
    min-width: 0;
    height: 100%;
    overflow-y: scroll;
    overflow-x: ${(props) => (props.notepadWrap ? 'hidden' : 'scroll')};
    resize: none;
    padding: 0;
`

// ---------------------------------------------------------------------------
// Exported types
// ---------------------------------------------------------------------------

export interface NotepadOptions {
  text: {
    notepadWrap: boolean;
    showLineNumbers?: boolean;
  };
  dpad?: {
    showCaret: boolean;
    showScroll: boolean;
  };
}

const DEFAULT_OPTIONS: NotepadOptions = { text: { notepadWrap: true, showLineNumbers: false }, dpad: { showCaret: true, showScroll: true } };

// ---------------------------------------------------------------------------
// getCursorLine helper (exported for testing)
// ---------------------------------------------------------------------------

/**
 * Given a lines array and a raw textarea selectionStart offset,
 * returns the 0-based line index the cursor is on.
 */
export function getCursorLine(lines: string[], cursorPos: number): number {
  let pos = 0;
  for (let i = 0; i < lines.length; i++) {
    pos += lines[i].length + 1; // +1 for the '\n' after each line
    if (cursorPos < pos) return i;
  }
  return lines.length - 1;
}

export interface CursorPosition {
  line: number;
  column: number;
}

/**
 * Given a lines array and a raw textarea selectionStart offset, returns the
 * 0-based { line, column } the cursor is on in a single pass over `lines`
 * (rather than a separate getCursorLine call plus a second column scan).
 */
export function getCursorPosition(lines: string[], cursorPos: number): CursorPosition {
  let pos = 0;
  for (let i = 0; i < lines.length; i++) {
    const lineLength = lines[i].length;
    if (cursorPos <= pos + lineLength) {
      return { line: i, column: cursorPos - pos };
    }
    pos += lineLength + 1; // +1 for the '\n' after each line
  }
  const lastLine = lines.length - 1;
  return { line: lastLine, column: lines[lastLine]?.length ?? 0 };
}

// ---------------------------------------------------------------------------
// useNotepad hook
// ---------------------------------------------------------------------------

export const useNotepad = () => {
  const [lines, setLines] = useLocalStorage<string[]>(
    'react-notepad-text',
    [''],
    serializeTextV2,
    parseTextLines,
  );

  const [title, setTitle] = useLocalStorage<string>(
    'react-notepad-title',
    'Title',
    serializeTitleV2,
    parseTitle,
  );

  const [options, setOptions] = useLocalStorage<NotepadOptions>(
    'react-notepad-options',
    DEFAULT_OPTIONS,
    serializeOptionsV2,
    parseOptions,
  );

  const [stateHistory, setStateHistory] = useState<HistoryEntry[]>([]);
  const [stateIndex, setStateIndex] = useState(-1);

  // Ref so historyAwareSetLines always reads the latest lines without stale closure
  const linesRef = useRef(lines);
  linesRef.current = lines;

  function historyAwareSetLines(newLines: string[], toCursorLine: number) {
    const prevCursorLine = getCursorLine(linesRef.current, 0);
    const delta = computeDelta(linesRef.current, newLines, prevCursorLine, toCursorLine);
    setLines(newLines);

    const trimmedHistory = stateHistory.slice(0, stateIndex + 1);
    trimmedHistory.push(delta);
    setStateHistory(trimmedHistory);
    setStateIndex(trimmedHistory.length - 1);
  }

  function undo(): number | null {
    if (stateIndex < 0) return null;
    const entry = stateHistory[stateIndex];
    const reverted = revertDelta(linesRef.current, entry);
    setLines(reverted);
    setStateIndex(stateIndex - 1);
    return entry.fromCursorLine;
  }

  function redo(): number | null {
    if (stateIndex >= stateHistory.length - 1) return null;
    const entry = stateHistory[stateIndex + 1];
    const applied = applyDelta(linesRef.current, entry);
    setLines(applied);
    setStateIndex(stateIndex + 1);
    return entry.toCursorLine;
  }

  return {
    lines,
    setLines: historyAwareSetLines,
    title,
    setTitle,
    options,
    setOptions,
    stateHistory,
    stateIndex,
    undo,
    redo,
  };
};

// ---------------------------------------------------------------------------
// Notepad component
// ---------------------------------------------------------------------------

interface NotepadProps {
  lines: string[];
  setLines: (lines: string[], cursorLine: number) => void;
  options: NotepadOptions;
}

const EditorRow = styled.div`
  display: flex;
  align-items: stretch;
  width: 100%;
  min-width: 0;
  flex: 1 1 auto;
  min-height: 0;
  overflow: hidden;
`;

const LineNumberGutter = styled.div`
  flex: 0 0 auto;
  padding: 0 8px;
  overflow-y: hidden;
  height: 100%;
  text-align: right;
  color: gray;
  background-color: #f5f5f5;
  border-right: 1px solid lightgray;
  font-family: monospace;
  white-space: pre;
  user-select: none;
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

const Notepad = ({ lines, setLines, options }: NotepadProps) => {
  const textAreaRef = useRef<HTMLTextAreaElement>(null);
  const gutterRef = useRef<HTMLDivElement>(null);
  const desiredColumnRef = useRef<number | null>(null);
  const [cursorPosition, setCursorPosition] = useState<{ line: number; column: number } | null>(null);
  const isTouch = useIsTouchDevice();
  const textAreaOverflow = useOverflow(textAreaRef, [lines]);
  const charWidth = useMeasuredCharWidth(textAreaRef);
  const lineHeight = useMeasuredLineHeight(textAreaRef);

  function handleTextChange(event: React.ChangeEvent<HTMLTextAreaElement>) {
    const newLines = event.target.value.split('\n');
    const newPosition = getCursorPosition(newLines, event.target.selectionStart);
    setCursorPosition(newPosition);
    desiredColumnRef.current = newPosition.column;
    setLines(newLines, newPosition.line);
  }

  // Reads the cursor position from currentTarget.selectionStart. Bound to
  // click/select/keyup/focus rather than mousedown: mousedown fires *before*
  // the browser updates selectionStart for the new click location, which
  // caused the known bug where a single click didn't update the displayed
  // cursor position (it took a second click to "catch up").
  function handleCursorMove(
    event:
      | React.KeyboardEvent<HTMLTextAreaElement>
      | React.MouseEvent<HTMLTextAreaElement>
      | React.SyntheticEvent<HTMLTextAreaElement>,
  ) {
    const newPosition = getCursorPosition(lines, event.currentTarget.selectionStart);
    setCursorPosition(newPosition);
    desiredColumnRef.current = newPosition.column;
  }

  function handleScroll(event: React.UIEvent<HTMLTextAreaElement>) {
    if (gutterRef.current) {
      gutterRef.current.scrollTop = event.currentTarget.scrollTop;
    }
  }

  function handleDpadScroll(direction: DpadDirection) {
    if (!textAreaRef.current) return;
    if (direction === 'up' || direction === 'down') {
      const delta = direction === 'up' ? -lineHeight : lineHeight;
      textAreaRef.current.scrollTop += delta;
    } else {
      const delta = direction === 'left' ? -charWidth : charWidth;
      textAreaRef.current.scrollLeft += delta;
    }
  }

  function handleDpadMove(direction: DpadDirection) {
    const current = cursorPosition ?? { line: 0, column: 0 };
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

    let pos = 0;
    for (let i = 0; i < targetLine; i++) pos += lines[i].length + 1;
    pos += Math.min(targetColumn, lines[targetLine]?.length ?? 0);

    if (textAreaRef.current) {
      textAreaRef.current.setSelectionRange(pos, pos);
      textAreaRef.current.focus();
    }
    setCursorPosition({ line: targetLine, column: targetColumn });
  }

  function handleWheel(event: React.WheelEvent<HTMLTextAreaElement>) {
    // Shift+scroll (not Ctrl+scroll) is used for horizontal scroll here
    // because Ctrl+scroll is already reserved by the browser for page zoom.
    if (event.shiftKey) {
      event.preventDefault();
      if (!textAreaRef.current) return;
      textAreaRef.current.scrollLeft += event.deltaY;
    }
  }

  return (
    <>
      <EditorRow>
        {options.text.showLineNumbers && (
          <LineNumberGutter ref={gutterRef} aria-hidden="true" data-testid="line-number-gutter">
            {lines.map((_, i) => `${i + 1}\n`)}
          </LineNumberGutter>
        )}
        <StyledTextArea
          ref={textAreaRef}
          autoFocus
          onKeyUp={handleCursorMove}
          onClick={handleCursorMove}
          onSelect={handleCursorMove}
          onFocus={handleCursorMove}
          onScroll={handleScroll}
          onWheel={handleWheel}
          wrap={options.text.notepadWrap ? 'on' : 'off'}
          notepadWrap={options.text.notepadWrap}
          value={lines.join('\n')}
          onChange={handleTextChange}
        />
      </EditorRow>
      <StatusBar>
        {cursorPosition !== null
          ? `Line ${cursorPosition.line + 1}, Col ${cursorPosition.column + 1}`
          : 'Line —, Col —'}
      </StatusBar>
      {isTouch && options.dpad?.showCaret !== false && (
        <Dpad onMove={handleDpadMove} testId="dpad-caret" style={{ bottom: '202px' }} />
      )}
      {isTouch && options.dpad?.showScroll !== false && (textAreaOverflow.hasVerticalOverflow || textAreaOverflow.hasHorizontalOverflow) && (
        <Dpad
          onMove={handleDpadScroll}
          testId="dpad-scroll"
          enabled={{
            up: textAreaOverflow.hasVerticalOverflow,
            down: textAreaOverflow.hasVerticalOverflow,
            left: textAreaOverflow.hasHorizontalOverflow,
            right: textAreaOverflow.hasHorizontalOverflow,
          }}
        />
      )}
    </>
  );
};

export default Notepad;