import styled from 'styled-components';
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
    height: 100dvh;
    overflow-y: scroll;
    overflow-x: ${(props) => (props.notepadWrap ? 'none;' : 'scroll;')};
    highlight-on-focus: true;
    highlight-color: lightgray;
    resize: none;
`;

// ---------------------------------------------------------------------------
// Exported types
// ---------------------------------------------------------------------------

export interface NotepadOptions {
  text: {
    notepadWrap: boolean;
  };
}

const DEFAULT_OPTIONS: NotepadOptions = { text: { notepadWrap: true } };

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

const Notepad = ({ lines, setLines, options }: NotepadProps) => {
  const textAreaRef = useRef<HTMLTextAreaElement>(null);
  const [activeLine, setActiveLine] = useState<number | null>(null);

  function handleTextChange(event: React.ChangeEvent<HTMLTextAreaElement>) {
    const newLines = event.target.value.split('\n');
    const cursorLine = getCursorLine(newLines, event.target.selectionStart);
    setActiveLine(cursorLine);
    setLines(newLines, cursorLine);
  }

  function handleCursorMove(
    event:
      | React.KeyboardEvent<HTMLTextAreaElement>
      | React.MouseEvent<HTMLTextAreaElement>,
  ) {
    const cursorLine = getCursorLine(lines, event.currentTarget.selectionStart);
    setActiveLine(cursorLine);
  }

  return (
    <>
      <div>Line {activeLine !== null ? activeLine + 1 : '—'}</div>
      <StyledTextArea
        ref={textAreaRef}
        onKeyDown={handleCursorMove}
        onMouseDown={handleCursorMove}
        wrap={options.text.notepadWrap ? 'on' : 'off'}
        notepadWrap={options.text.notepadWrap}
        value={lines.join('\n')}
        onChange={handleTextChange}
      />
    </>
  );
};

export default Notepad;