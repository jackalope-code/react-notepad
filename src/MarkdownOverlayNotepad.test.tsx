import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/react';
import MarkdownOverlayNotepad from './MarkdownOverlayNotepad';
import { WINDOW_LINES } from './VirtualizedNotepad';
import type { NotepadOptions } from './Notepad';

const defaultOptions: NotepadOptions = { text: { notepadWrap: false } };

function makeLines(count: number): string[] {
  return Array.from({ length: count }, (_, i) => `line-${i}`);
}

/** Reads the overlay's rendered text, joined by '\n' the same way the
 * underlying document's lines are — a regression guard that the overlay
 * never mutates or drops what's displayed relative to the real textarea. */
function overlayText(): string {
  const overlay = screen.getByTestId('markdown-overlay');
  return Array.from(overlay.children)
    .map((line) => line.textContent ?? '')
    .join('\n');
}

describe('MarkdownOverlayNotepad', () => {
  it('renders a textarea whose value matches the full document when it fits in a single window', () => {
    const lines = makeLines(10);
    render(<MarkdownOverlayNotepad lines={lines} setLines={vi.fn()} options={defaultOptions} />);
    const textarea = screen.getByTestId('markdown-overlay-textarea') as HTMLTextAreaElement;
    expect(textarea.value).toBe(lines.join('\n'));
  });

  it('renders both the textarea and the highlight overlay', () => {
    render(<MarkdownOverlayNotepad lines={makeLines(3)} setLines={vi.fn()} options={defaultOptions} />);
    expect(screen.getByTestId('markdown-overlay-textarea')).toBeInTheDocument();
    expect(screen.getByTestId('markdown-overlay')).toBeInTheDocument();
  });

  it('the overlay text matches the raw lines.join("\\n") exactly, character-for-character', () => {
    const lines = ['# Heading', 'Some **bold** and *italic* text.', '', '- a list item'];
    render(<MarkdownOverlayNotepad lines={lines} setLines={vi.fn()} options={defaultOptions} />);
    expect(overlayText()).toBe(lines.join('\n'));
  });

  it('shows the initial cursor placeholder before any interaction', () => {
    render(<MarkdownOverlayNotepad lines={makeLines(3)} setLines={vi.fn()} options={defaultOptions} />);
    expect(screen.getByText('Line —, Col —')).toBeInTheDocument();
  });

  it('updates the cursor status bar on click, matching exact line/column (no TipTap-style approximation)', () => {
    const lines = ['hello world', 'second line'];
    render(<MarkdownOverlayNotepad lines={lines} setLines={vi.fn()} options={defaultOptions} />);
    const textarea = screen.getByTestId('markdown-overlay-textarea') as HTMLTextAreaElement;

    Object.defineProperty(textarea, 'selectionStart', { value: 12 + 3, configurable: true });
    fireEvent.click(textarea);

    expect(screen.getByText('Line 2, Col 4')).toBeInTheDocument();
  });

  it('applies the expected className to a bold span in the overlay when the source contains bold syntax', () => {
    render(
      <MarkdownOverlayNotepad lines={['plain **bold** text']} setLines={vi.fn()} options={defaultOptions} />,
    );
    const overlay = screen.getByTestId('markdown-overlay');
    const boldSpan = Array.from(overlay.querySelectorAll('span')).find((s) => s.textContent === 'bold');
    expect(boldSpan).toBeDefined();
    expect(boldSpan?.className).toContain('md-strong');
  });

  it('applies md-marker styling to the raw ** delimiters, visually distinct from the bold content', () => {
    render(<MarkdownOverlayNotepad lines={['**bold**']} setLines={vi.fn()} options={defaultOptions} />);
    const overlay = screen.getByTestId('markdown-overlay');
    const markerSpans = Array.from(overlay.querySelectorAll('span')).filter((s) => s.textContent === '**');
    expect(markerSpans.length).toBeGreaterThan(0);
    markerSpans.forEach((span) => expect(span.className).toContain('md-marker'));
  });

  it('hides markers (md-marker-hidden) by default, before any cursor interaction', () => {
    render(<MarkdownOverlayNotepad lines={['## Heading']} setLines={vi.fn()} options={defaultOptions} />);
    const overlay = screen.getByTestId('markdown-overlay');
    const markerSpan = Array.from(overlay.querySelectorAll('span')).find((s) => s.textContent === '## ');
    expect(markerSpan?.className).toContain('md-marker');
    expect(markerSpan?.className).toContain('md-marker-hidden');
  });

  it('reveals markers on the line the cursor is currently on, and hides markers on other lines', () => {
    const lines = ['## Heading one', '## Heading two'];
    render(<MarkdownOverlayNotepad lines={lines} setLines={vi.fn()} options={defaultOptions} />);
    const textarea = screen.getByTestId('markdown-overlay-textarea') as HTMLTextAreaElement;

    // Place the cursor on line 1 (index 0).
    Object.defineProperty(textarea, 'selectionStart', { value: 3, configurable: true });
    fireEvent.click(textarea);

    const overlay = screen.getByTestId('markdown-overlay');
    const markerSpans = Array.from(overlay.querySelectorAll('span')).filter((s) => s.textContent === '## ');
    expect(markerSpans).toHaveLength(2);
    // Line 1's marker is revealed (no hidden class).
    expect(markerSpans[0].className).not.toContain('md-marker-hidden');
    // Line 2's marker stays hidden.
    expect(markerSpans[1].className).toContain('md-marker-hidden');
  });

  it('does not change the character content when hiding a marker (alignment-safe: text stays, only color changes)', () => {
    render(<MarkdownOverlayNotepad lines={['**bold**']} setLines={vi.fn()} options={defaultOptions} />);
    const overlay = screen.getByTestId('markdown-overlay');
    expect(overlay.textContent).toBe('**bold**');
  });

  it('scales heading content (md-heading-scaled) on an inactive line but not on the active line', () => {
    const lines = ['# Heading one', '# Heading two'];
    render(<MarkdownOverlayNotepad lines={lines} setLines={vi.fn()} options={defaultOptions} />);
    const textarea = screen.getByTestId('markdown-overlay-textarea') as HTMLTextAreaElement;

    // Cursor lands on line 1 (index 0).
    Object.defineProperty(textarea, 'selectionStart', { value: 5, configurable: true });
    fireEvent.click(textarea);

    const overlay = screen.getByTestId('markdown-overlay');
    const headingSpans = Array.from(overlay.querySelectorAll('span')).filter((s) => s.textContent === 'Heading one' || s.textContent === 'Heading two');
    expect(headingSpans).toHaveLength(2);
    const activeSpan = headingSpans.find((s) => s.textContent === 'Heading one');
    const inactiveSpan = headingSpans.find((s) => s.textContent === 'Heading two');
    expect(activeSpan?.className).not.toContain('md-heading-scaled');
    expect(inactiveSpan?.className).toContain('md-heading-scaled');
  });

  it('never applies md-heading-scaled to the "#" marker itself, only to the heading content', () => {
    render(<MarkdownOverlayNotepad lines={['# Heading']} setLines={vi.fn()} options={defaultOptions} />);
    const overlay = screen.getByTestId('markdown-overlay');
    const markerSpan = Array.from(overlay.querySelectorAll('span')).find((s) => s.textContent === '# ');
    expect(markerSpan?.className).not.toContain('md-heading-scaled');
  });

  it('substitutes a real bullet glyph (md-bullet-glyph) for an unordered list marker on an inactive line', () => {
    render(<MarkdownOverlayNotepad lines={['* Item 1']} setLines={vi.fn()} options={defaultOptions} />);
    const overlay = screen.getByTestId('markdown-overlay');
    const markerSpan = Array.from(overlay.querySelectorAll('span')).find((s) => s.textContent === '* ');
    expect(markerSpan?.className).toContain('md-bullet-glyph');
  });

  it('does not substitute a bullet glyph for an ordered list marker (the number is meaningful content)', () => {
    render(<MarkdownOverlayNotepad lines={['1. Item 1']} setLines={vi.fn()} options={defaultOptions} />);
    const overlay = screen.getByTestId('markdown-overlay');
    const markerSpan = Array.from(overlay.querySelectorAll('span')).find((s) => s.textContent === '1. ');
    expect(markerSpan?.className).not.toContain('md-bullet-glyph');
  });

  it('shows the raw bullet marker (no glyph substitution) on the active line, for accurate editing', () => {
    render(<MarkdownOverlayNotepad lines={['* Item 1']} setLines={vi.fn()} options={defaultOptions} />);
    const textarea = screen.getByTestId('markdown-overlay-textarea') as HTMLTextAreaElement;

    Object.defineProperty(textarea, 'selectionStart', { value: 0, configurable: true });
    fireEvent.click(textarea);

    const overlay = screen.getByTestId('markdown-overlay');
    const markerSpan = Array.from(overlay.querySelectorAll('span')).find((s) => s.textContent === '* ');
    expect(markerSpan?.className).not.toContain('md-bullet-glyph');
  });

  it('re-highlights on every edit — typing new markdown syntax updates the overlay classes', () => {
    const lines = ['plain text'];
    const setLines = vi.fn();
    const { rerender } = render(
      <MarkdownOverlayNotepad lines={lines} setLines={setLines} options={defaultOptions} />,
    );

    rerender(<MarkdownOverlayNotepad lines={['# Now a heading']} setLines={setLines} options={defaultOptions} />);

    const overlay = screen.getByTestId('markdown-overlay');
    const headingSpan = Array.from(overlay.querySelectorAll('span')).find((s) => s.textContent === '# ');
    expect(headingSpan?.className).toContain('md-marker');
  });

  it('typing plain text calls setLines with the unmodified split lines (no transformation/serialization step)', () => {
    const lines = ['hello'];
    const setLines = vi.fn();
    render(<MarkdownOverlayNotepad lines={lines} setLines={setLines} options={defaultOptions} />);
    const textarea = screen.getByTestId('markdown-overlay-textarea') as HTMLTextAreaElement;

    fireEvent.change(textarea, { target: { value: 'hello world', selectionStart: 11 } });

    expect(setLines).toHaveBeenCalledTimes(1);
    const [nextLines, cursorLine] = setLines.mock.calls[0];
    expect(nextLines).toEqual(['hello world']);
    expect(cursorLine).toBe(0);
  });

  it('preserves markdown syntax verbatim through an edit — no HTML/markup leaks into the stored lines', () => {
    const setLines = vi.fn();
    render(<MarkdownOverlayNotepad lines={['**bold**']} setLines={setLines} options={defaultOptions} />);
    const textarea = screen.getByTestId('markdown-overlay-textarea') as HTMLTextAreaElement;

    fireEvent.change(textarea, {
      target: { value: '**bold** and *italic*', selectionStart: '**bold** and *italic*'.length },
    });

    const [nextLines] = setLines.mock.calls[0];
    expect(nextLines).toEqual(['**bold** and *italic*']);
  });

  describe('windowed rendering for large documents', () => {
    const LINE_HEIGHT = 20;

    function renderLargeDoc(totalLines: number) {
      const lines = makeLines(totalLines);
      const setLines = vi.fn();
      render(<MarkdownOverlayNotepad lines={lines} setLines={setLines} options={defaultOptions} />);
      const container = screen.getByTestId('virtual-scroll-container');
      Object.defineProperty(container, 'clientHeight', { value: 400, configurable: true });
      return { lines, setLines, container };
    }

    it('renders only a window of lines for a document much larger than WINDOW_LINES, not the whole document', () => {
      const totalLines = WINDOW_LINES * 3;
      const { lines } = renderLargeDoc(totalLines);
      const textarea = screen.getByTestId('markdown-overlay-textarea') as HTMLTextAreaElement;
      expect(textarea.value.split('\n').length).toBeLessThan(lines.length);
      expect(textarea.value.split('\n').length).toBeLessThanOrEqual(WINDOW_LINES);
    });

    it('the overlay renders the same number of lines as the windowed textarea', () => {
      const totalLines = WINDOW_LINES * 3;
      renderLargeDoc(totalLines);
      const textarea = screen.getByTestId('markdown-overlay-textarea') as HTMLTextAreaElement;
      const overlay = screen.getByTestId('markdown-overlay');
      expect(overlay.children.length).toBe(textarea.value.split('\n').length);
    });

    it('recalculates the visible window when scrolled far past the initially-loaded range', () => {
      const totalLines = WINDOW_LINES * 3;
      const { container } = renderLargeDoc(totalLines);

      const scrollTop = totalLines * LINE_HEIGHT * 0.66;
      fireEvent.scroll(container, { target: { scrollTop } });

      const textarea = screen.getByTestId('markdown-overlay-textarea') as HTMLTextAreaElement;
      const firstVisibleLineLabel = textarea.value.split('\n')[0];
      const firstVisibleLineIndex = Number(firstVisibleLineLabel.replace('line-', ''));

      const expectedApproxLine = Math.floor(scrollTop / LINE_HEIGHT);
      expect(firstVisibleLineIndex).toBeGreaterThan(0);
      expect(Math.abs(firstVisibleLineIndex - expectedApproxLine)).toBeLessThanOrEqual(WINDOW_LINES);
    });

    it('editing after scrolling updates the correct absolute lines in the full document (no data loss)', () => {
      const totalLines = WINDOW_LINES * 3;
      const { lines, setLines, container } = renderLargeDoc(totalLines);

      const scrollTop = totalLines * LINE_HEIGHT * 0.5;
      fireEvent.scroll(container, { target: { scrollTop } });

      const textarea = screen.getByTestId('markdown-overlay-textarea') as HTMLTextAreaElement;
      const windowLines = textarea.value.split('\n');
      const edited = [...windowLines];
      edited[0] = 'EDITED-FIRST-VISIBLE-LINE';
      const newValue = edited.join('\n');

      fireEvent.change(textarea, { target: { value: newValue, selectionStart: 0 } });

      expect(setLines).toHaveBeenCalledTimes(1);
      const [nextLines] = setLines.mock.calls[0];
      expect(nextLines.length).toBe(lines.length);
      expect(nextLines).toContain('EDITED-FIRST-VISIBLE-LINE');
      expect(nextLines[0]).toBe(lines[0]);
      expect(nextLines[nextLines.length - 1]).toBe(lines[lines.length - 1]);
    });
  });
});
