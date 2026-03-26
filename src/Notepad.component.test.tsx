import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import Notepad, { getCursorLine } from './Notepad';

// ---------------------------------------------------------------------------
// getCursorLine unit tests (pure function)
// ---------------------------------------------------------------------------

describe('getCursorLine', () => {
  it('returns 0 for cursor at start of single line', () => {
    expect(getCursorLine(['hello'], 0)).toBe(0);
  });

  it('returns 0 for cursor at end of single line', () => {
    expect(getCursorLine(['hello'], 5)).toBe(0);
  });

  it('returns 0 for cursor before the newline on first line', () => {
    // 'hello\nworld' — positions 0-5 are on line 0
    expect(getCursorLine(['hello', 'world'], 4)).toBe(0);
  });

  it('returns 1 for cursor on second line', () => {
    // 'hello\nworld' — position 6 is 'w' on line 1
    expect(getCursorLine(['hello', 'world'], 6)).toBe(1);
  });

  it('returns 1 for cursor at end of second line', () => {
    // 'hello\nworld' — position 11 is after 'd'
    expect(getCursorLine(['hello', 'world'], 11)).toBe(1);
  });

  it('returns correct line for cursor in 3-line text', () => {
    const lines = ['aaa', 'bbb', 'ccc'];
    // 'aaa\nbbb\nccc'
    //  0123 4567 8901
    expect(getCursorLine(lines, 0)).toBe(0);  // 'a'
    expect(getCursorLine(lines, 3)).toBe(0);  // last 'a'
    expect(getCursorLine(lines, 4)).toBe(1);  // 'b'
    expect(getCursorLine(lines, 7)).toBe(1);  // last 'b'
    expect(getCursorLine(lines, 8)).toBe(2);  // 'c'
    expect(getCursorLine(lines, 11)).toBe(2); // last 'c'
  });

  it('returns last line index when cursorPos is beyond all content', () => {
    expect(getCursorLine(['aaa', 'bbb'], 999)).toBe(1);
  });

  it('returns 0 for empty lines array (edge case)', () => {
    expect(getCursorLine([''], 0)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Notepad component rendering tests
// ---------------------------------------------------------------------------

function makeSetLines(): (lines: string[], cursorLine: number) => void {
  return vi.fn();
}

describe('Notepad component', () => {
  const defaultOptions = { text: { notepadWrap: true } };

  beforeEach(() => {
    localStorage.clear();
  });

  it('renders a textarea with value equal to lines.join("\\n")', () => {
    const lines = ['hello', 'world'];
    render(
      <Notepad lines={lines} setLines={makeSetLines()} options={defaultOptions} />,
    );
    const ta = screen.getByRole('textbox') as HTMLTextAreaElement;
    expect(ta.value).toBe('hello\nworld');
  });

  it('renders single-line content correctly', () => {
    render(
      <Notepad lines={['only line']} setLines={makeSetLines()} options={defaultOptions} />,
    );
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('only line');
  });

  it('calls setLines with split array on change', () => {
    const setLines = vi.fn<(lines: string[], cursorLine: number) => void>();
    render(
      <Notepad lines={['hello']} setLines={setLines} options={defaultOptions} />,
    );
    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: 'hello\nworld', selectionStart: 11 },
    });
    expect(setLines).toHaveBeenCalledOnce();
    const [calledLines] = setLines.mock.calls[0];
    expect(calledLines).toEqual(['hello', 'world']);
  });

  it('passes correct cursorLine to setLines', () => {
    const setLines = vi.fn<(lines: string[], cursorLine: number) => void>();
    render(
      <Notepad lines={['hello']} setLines={setLines} options={defaultOptions} />,
    );
    // Cursor at position 6 in 'hello\nworld' is on line 1
    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: 'hello\nworld', selectionStart: 6 },
    });
    const [, cursorLine] = setLines.mock.calls[0];
    expect(cursorLine).toBe(1);
  });

  it('shows "Line —" when no cursor interaction has occurred', () => {
    render(
      <Notepad lines={['hello']} setLines={makeSetLines()} options={defaultOptions} />,
    );
    expect(screen.getByText(/Line —/)).toBeInTheDocument();
  });

  it('shows 1-based line number after change event', () => {
    render(
      <Notepad lines={['hello']} setLines={makeSetLines()} options={defaultOptions} />,
    );
    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: 'hello\nworld', selectionStart: 6 },
    });
    // cursor is on line index 1 → display "Line 2"
    expect(screen.getByText('Line 2')).toBeInTheDocument();
  });

  it('renders with wrap="on" when notepadWrap is true', () => {
    render(
      <Notepad lines={['']} setLines={makeSetLines()} options={{ text: { notepadWrap: true } }} />,
    );
    expect(screen.getByRole('textbox')).toHaveAttribute('wrap', 'on');
  });

  it('renders with wrap="off" when notepadWrap is false', () => {
    render(
      <Notepad lines={['']} setLines={makeSetLines()} options={{ text: { notepadWrap: false } }} />,
    );
    expect(screen.getByRole('textbox')).toHaveAttribute('wrap', 'off');
  });
});
