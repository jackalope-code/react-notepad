import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/react';
import VirtualizedNotepad, { WINDOW_LINES } from './VirtualizedNotepad';
import type { NotepadOptions } from './Notepad';

const defaultOptions: NotepadOptions = { text: { notepadWrap: false, showLineNumbers: false } };

function makeLines(count: number): string[] {
  return Array.from({ length: count }, (_, i) => `line-${i}`);
}

describe('VirtualizedNotepad', () => {
  it('renders a textarea whose value matches the full document when it fits in a single window', () => {
    const lines = makeLines(10);
    render(<VirtualizedNotepad lines={lines} setLines={vi.fn()} options={defaultOptions} />);
    const textarea = screen.getByTestId('virtualized-textarea') as HTMLTextAreaElement;
    expect(textarea.value).toBe(lines.join('\n'));
  });

  it('shows the initial cursor placeholder before any interaction', () => {
    render(<VirtualizedNotepad lines={makeLines(3)} setLines={vi.fn()} options={defaultOptions} />);
    expect(screen.getByText('Line —, Col —')).toBeInTheDocument();
  });

  it('renders the optional line-number gutter with correct numbering for the current window', () => {
    const lines = makeLines(5);
    render(
      <VirtualizedNotepad
        lines={lines}
        setLines={vi.fn()}
        options={{ text: { notepadWrap: false, showLineNumbers: true } }}
      />,
    );
    const gutter = screen.getByTestId('line-number-gutter');
    expect(gutter.textContent).toBe('1\n2\n3\n4\n5\n');
  });

  it('does not render the gutter when showLineNumbers is false', () => {
    render(<VirtualizedNotepad lines={makeLines(3)} setLines={vi.fn()} options={defaultOptions} />);
    expect(screen.queryByTestId('line-number-gutter')).not.toBeInTheDocument();
  });

  it('edits within the visible window call setLines with the full, correctly-spliced document (no data loss)', () => {
    const lines = makeLines(10);
    const setLines = vi.fn();
    render(<VirtualizedNotepad lines={lines} setLines={setLines} options={defaultOptions} />);
    const textarea = screen.getByTestId('virtualized-textarea') as HTMLTextAreaElement;

    const newValue = lines.slice(0, 3).join('\n') + '\nNEW LINE\n' + lines.slice(3).join('\n');
    fireEvent.change(textarea, { target: { value: newValue, selectionStart: 0 } });

    expect(setLines).toHaveBeenCalledTimes(1);
    const [nextLines] = setLines.mock.calls[0];
    expect(nextLines).toEqual(newValue.split('\n'));
    expect(nextLines.length).toBe(11); // one line added, nothing lost
  });

  describe('windowed rendering for large documents', () => {
    // jsdom doesn't perform real layout, so `clientHeight`/`scrollTop` are
    // stubbed directly on the scroll container to drive the visible-range
    // calculation deterministically (the fallback line height used in this
    // environment is DEFAULT_LINE_HEIGHT = 20px, since the measuring probe
    // always reports 0 height under jsdom).
    const LINE_HEIGHT = 20;

    function renderLargeDoc(totalLines: number) {
      const lines = makeLines(totalLines);
      const setLines = vi.fn();
      render(<VirtualizedNotepad lines={lines} setLines={setLines} options={defaultOptions} />);
      const container = screen.getByTestId('virtual-scroll-container');
      Object.defineProperty(container, 'clientHeight', { value: 400, configurable: true });
      return { lines, setLines, container };
    }

    it('renders only a window of lines for a document much larger than WINDOW_LINES, not the whole document', () => {
      const totalLines = WINDOW_LINES * 3;
      const { lines } = renderLargeDoc(totalLines);
      const textarea = screen.getByTestId('virtualized-textarea') as HTMLTextAreaElement;
      expect(textarea.value.split('\n').length).toBeLessThan(lines.length);
      expect(textarea.value.split('\n').length).toBeLessThanOrEqual(WINDOW_LINES);
    });

    it('recalculates the visible window when scrolled far past the initially-loaded range', () => {
      const totalLines = WINDOW_LINES * 3;
      const { container } = renderLargeDoc(totalLines);

      const scrollTop = totalLines * LINE_HEIGHT * 0.66; // scroll ~2/3 through the doc
      fireEvent.scroll(container, { target: { scrollTop } });

      const textarea = screen.getByTestId('virtualized-textarea') as HTMLTextAreaElement;
      const firstVisibleLineLabel = textarea.value.split('\n')[0];
      const firstVisibleLineIndex = Number(firstVisibleLineLabel.replace('line-', ''));

      // The window should now start somewhere near the scrolled-to
      // position, not at the very top of the document anymore.
      const expectedApproxLine = Math.floor(scrollTop / LINE_HEIGHT);
      expect(firstVisibleLineIndex).toBeGreaterThan(0);
      expect(Math.abs(firstVisibleLineIndex - expectedApproxLine)).toBeLessThanOrEqual(WINDOW_LINES);
    });

    it('editing after scrolling updates the correct absolute lines in the full document (no data loss)', () => {
      const totalLines = WINDOW_LINES * 3;
      const { lines, setLines, container } = renderLargeDoc(totalLines);

      const scrollTop = totalLines * LINE_HEIGHT * 0.5;
      fireEvent.scroll(container, { target: { scrollTop } });

      const textarea = screen.getByTestId('virtualized-textarea') as HTMLTextAreaElement;
      const windowLines = textarea.value.split('\n');
      const edited = [...windowLines];
      edited[0] = 'EDITED-FIRST-VISIBLE-LINE';
      const newValue = edited.join('\n');

      fireEvent.change(textarea, { target: { value: newValue, selectionStart: 0 } });

      expect(setLines).toHaveBeenCalledTimes(1);
      const [nextLines] = setLines.mock.calls[0];
      // Total line count is preserved — nothing outside the window was
      // dropped or duplicated.
      expect(nextLines.length).toBe(lines.length);
      expect(nextLines).toContain('EDITED-FIRST-VISIBLE-LINE');
      // Lines well before/after the edited window are untouched.
      expect(nextLines[0]).toBe(lines[0]);
      expect(nextLines[nextLines.length - 1]).toBe(lines[lines.length - 1]);
    });
  });
});
