import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import Notepad, { getCursorLine, getCursorPosition } from './Notepad';

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

  it('handles a multi-line paste landing the cursor mid-paste', () => {
    // Simulates pasting 'one\ntwo\nthree' then placing the cursor on 'two'
    const lines = ['one', 'two', 'three'];
    // 'one\ntwo\nthree' — position 5 is 'w' on line 1
    expect(getCursorLine(lines, 5)).toBe(1);
  });

  it('handles an empty document (single empty line)', () => {
    expect(getCursorLine([''], 0)).toBe(0);
  });

  it('handles content ending in a trailing newline (trailing empty line)', () => {
    // 'foo\n' split on '\n' produces ['foo', ''] — cursor at the very end
    // (position 4, right after the trailing newline) should land on the
    // trailing empty line, index 1.
    const lines = ['foo', ''];
    expect(getCursorLine(lines, 4)).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// getCursorPosition unit tests (pure function)
// ---------------------------------------------------------------------------

describe('getCursorPosition', () => {
  it('returns { line: 0, column: 0 } for cursor at start of single line', () => {
    expect(getCursorPosition(['hello'], 0)).toEqual({ line: 0, column: 0 });
  });

  it('returns the correct column at end of single line', () => {
    expect(getCursorPosition(['hello'], 5)).toEqual({ line: 0, column: 5 });
  });

  it('returns line 1, column 0 for cursor right after a newline', () => {
    // 'hello\nworld' — position 6 is 'w' on line 1
    expect(getCursorPosition(['hello', 'world'], 6)).toEqual({ line: 1, column: 0 });
  });

  it('returns the correct column mid-line', () => {
    // 'hello\nworld' — position 8 is 'r' on line 1, column 2
    expect(getCursorPosition(['hello', 'world'], 8)).toEqual({ line: 1, column: 2 });
  });

  it('agrees with getCursorLine on the line index across a 3-line document', () => {
    const lines = ['aaa', 'bbb', 'ccc'];
    for (const pos of [0, 3, 4, 7, 8, 11]) {
      expect(getCursorPosition(lines, pos).line).toBe(getCursorLine(lines, pos));
    }
  });

  it('clamps to the last line/column when cursorPos is beyond all content', () => {
    expect(getCursorPosition(['aaa', 'bbb'], 999)).toEqual({ line: 1, column: 3 });
  });

  it('handles an empty document (single empty line)', () => {
    expect(getCursorPosition([''], 0)).toEqual({ line: 0, column: 0 });
  });

  it('handles a trailing empty line', () => {
    const lines = ['foo', ''];
    expect(getCursorPosition(lines, 4)).toEqual({ line: 1, column: 0 });
  });
});

// ---------------------------------------------------------------------------
// Notepad component rendering tests
// ---------------------------------------------------------------------------

function makeSetLines(): (lines: string[], cursorLine: number) => void {
  return vi.fn();
}

describe('Notepad component', () => {
  const defaultOptions = { text: { notepadWrap: true, showLineNumbers: false } };

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

  it('shows the cursor position on mount because the textarea auto-focuses', () => {
    render(
      <Notepad lines={['hello']} setLines={makeSetLines()} options={defaultOptions} />,
    );
    expect(screen.getByText('Line 1, Col 1')).toBeInTheDocument();
  });

  it('shows 1-based line and column in the status bar after a change event', () => {
    render(
      <Notepad lines={['hello']} setLines={makeSetLines()} options={defaultOptions} />,
    );
    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: 'hello\nworld', selectionStart: 6 },
    });
    // cursor is on line index 1, column 0 → display "Line 2, Col 1"
    expect(screen.getByText('Line 2, Col 1')).toBeInTheDocument();
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

  it('updates the cursor position on keyboard-driven cursor movement (keyUp)', () => {
    render(
      <Notepad lines={['hello', 'world']} setLines={makeSetLines()} options={defaultOptions} />,
    );
    const ta = screen.getByRole('textbox') as HTMLTextAreaElement;
    Object.defineProperty(ta, 'selectionStart', { value: 6, configurable: true });
    fireEvent.keyUp(ta, { key: 'ArrowDown' });
    expect(screen.getByText('Line 2, Col 1')).toBeInTheDocument();
  });

  it('regression: a single click updates the cursor position immediately (no second click required)', () => {
    render(
      <Notepad lines={['hello', 'world']} setLines={makeSetLines()} options={defaultOptions} />,
    );
    const ta = screen.getByRole('textbox') as HTMLTextAreaElement;
    Object.defineProperty(ta, 'selectionStart', { value: 8, configurable: true });
    fireEvent.click(ta);
    // A single click already landed the cursor at position 8 (line 1, col 2)
    // and must be reflected without requiring a second click.
    expect(screen.getByText('Line 2, Col 3')).toBeInTheDocument();
  });

  it('updates the cursor position on select (covers drag-selection and programmatic selection changes)', async () => {
    render(
      <Notepad lines={['hello', 'world']} setLines={makeSetLines()} options={defaultOptions} />,
    );
    const ta = screen.getByRole('textbox') as HTMLTextAreaElement;
    Object.defineProperty(ta, 'selectionStart', { value: 6, configurable: true });
    await act(async () => {
      fireEvent.select(ta);
    });
    expect(screen.getByText('Line 2, Col 1')).toBeInTheDocument();
  });

  it('updates the cursor position on focus', () => {
    render(
      <Notepad lines={['hello', 'world']} setLines={makeSetLines()} options={defaultOptions} />,
    );
    const ta = screen.getByRole('textbox') as HTMLTextAreaElement;
    Object.defineProperty(ta, 'selectionStart', { value: 6, configurable: true });
    fireEvent.focus(ta);
    expect(screen.getByText('Line 2, Col 1')).toBeInTheDocument();
  });

  it('applies overflow-x: hidden via computed CSS when notepadWrap is true', () => {
    render(
      <Notepad lines={['']} setLines={makeSetLines()} options={{ text: { notepadWrap: true } }} />,
    );
    const ta = screen.getByRole('textbox');
    expect(getComputedStyle(ta).overflowX).toBe('hidden');
  });

  it('applies overflow-x: scroll via computed CSS when notepadWrap is false', () => {
    render(
      <Notepad lines={['']} setLines={makeSetLines()} options={{ text: { notepadWrap: false } }} />,
    );
    const ta = screen.getByRole('textbox');
    expect(getComputedStyle(ta).overflowX).toBe('scroll');
  });

  it('does not render the line-number gutter when showLineNumbers is false', () => {
    render(
      <Notepad lines={['a', 'b']} setLines={makeSetLines()} options={{ text: { notepadWrap: true, showLineNumbers: false } }} />,
    );
    expect(screen.queryByTestId('line-number-gutter')).not.toBeInTheDocument();
  });

  it('renders the line-number gutter with one number per line when showLineNumbers is true', () => {
    render(
      <Notepad lines={['a', 'b', 'c']} setLines={makeSetLines()} options={{ text: { notepadWrap: true, showLineNumbers: true } }} />,
    );
    const gutter = screen.getByTestId('line-number-gutter');
    expect(gutter.textContent).toBe('1\n2\n3\n');
    expect(gutter).toHaveAttribute('aria-hidden', 'true');
  });

  it('the gutter is not selectable and updates as lines are added', () => {
    const { rerender } = render(
      <Notepad lines={['a']} setLines={makeSetLines()} options={{ text: { notepadWrap: true, showLineNumbers: true } }} />,
    );
    let gutter = screen.getByTestId('line-number-gutter');
    expect(getComputedStyle(gutter).userSelect).toBe('none');
    expect(gutter.textContent).toBe('1\n');

    rerender(
      <Notepad lines={['a', 'b']} setLines={makeSetLines()} options={{ text: { notepadWrap: true, showLineNumbers: true } }} />,
    );
    gutter = screen.getByTestId('line-number-gutter');
    expect(gutter.textContent).toBe('1\n2\n');
  });

  it('syncs the gutter scrollTop with the textarea on scroll', () => {
    render(
      <Notepad lines={['a', 'b']} setLines={makeSetLines()} options={{ text: { notepadWrap: true, showLineNumbers: true } }} />,
    );
    const ta = screen.getByRole('textbox') as HTMLTextAreaElement;
    const gutter = screen.getByTestId('line-number-gutter');
    Object.defineProperty(ta, 'scrollTop', { value: 42, configurable: true });
    fireEvent.scroll(ta);
    expect(gutter.scrollTop).toBe(42);
  });
});
