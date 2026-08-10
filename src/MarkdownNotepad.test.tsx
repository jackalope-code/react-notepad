import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import MarkdownNotepad from './MarkdownNotepad';

const defaultOptions = { text: { notepadWrap: true, showLineNumbers: false } };

function makeSetLines(): (lines: string[], cursorLine: number) => void {
  return vi.fn();
}

describe('MarkdownNotepad component', () => {
  it('renders a TipTap contenteditable, not a textarea', async () => {
    render(
      <MarkdownNotepad lines={['hello']} setLines={makeSetLines()} options={defaultOptions} />,
    );
    await waitFor(() => expect(document.querySelector('.tiptap')).toBeInTheDocument());
    expect(document.querySelector('textarea')).not.toBeInTheDocument();
  });

  it('initializes the editor content from the lines prop', async () => {
    render(
      <MarkdownNotepad lines={['hello world']} setLines={makeSetLines()} options={defaultOptions} />,
    );
    await waitFor(() => expect(screen.getByText('hello world')).toBeInTheDocument());
  });

  it('shows "Line —, Col —" before any cursor interaction', () => {
    render(
      <MarkdownNotepad lines={['hello']} setLines={makeSetLines()} options={defaultOptions} />,
    );
    expect(screen.getByText('Line —, Col —')).toBeInTheDocument();
  });

  it('renders markdown emphasis syntax as live-rendered bold text', async () => {
    render(
      <MarkdownNotepad lines={['**bold**']} setLines={makeSetLines()} options={defaultOptions} />,
    );
    await waitFor(() => {
      const strong = document.querySelector('.tiptap strong');
      expect(strong).toBeInTheDocument();
      expect(strong?.textContent).toBe('bold');
    });
  });

  it('re-syncs editor content when lines change externally (e.g. undo/redo or tab switch)', async () => {
    const { rerender } = render(
      <MarkdownNotepad lines={['first']} setLines={makeSetLines()} options={defaultOptions} />,
    );
    await waitFor(() => expect(screen.getByText('first')).toBeInTheDocument());

    rerender(
      <MarkdownNotepad lines={['second']} setLines={makeSetLines()} options={defaultOptions} />,
    );
    await waitFor(() => expect(screen.getByText('second')).toBeInTheDocument());
  });

  it('re-syncing content externally (undo/redo, tab switch) never leaks HTML tags through to setLines', async () => {
    const setLines = vi.fn<(lines: string[], cursorLine: number) => void>();
    const { rerender } = render(
      <MarkdownNotepad lines={['# Heading']} setLines={setLines} options={defaultOptions} />,
    );
    await waitFor(() => expect(screen.getByText('Heading')).toBeInTheDocument());

    rerender(
      <MarkdownNotepad lines={['# Heading', '- item one']} setLines={setLines} options={defaultOptions} />,
    );
    await waitFor(() => expect(screen.getByText('item one')).toBeInTheDocument());

    for (const [emittedLines] of setLines.mock.calls) {
      expect(emittedLines.join('\n')).not.toMatch(/<[^>]+>/);
    }
  });

  it('pasting raw HTML is sanitized to markdown text (no HTML tags leak into the stored lines)', async () => {
    const setLines = vi.fn<(lines: string[], cursorLine: number) => void>();
    render(<MarkdownNotepad lines={['']} setLines={setLines} options={defaultOptions} />);
    await waitFor(() => expect(document.querySelector('.tiptap')).toBeInTheDocument());
    const tiptap = document.querySelector('.tiptap') as HTMLElement;

    const clipboardData = {
      getData: (type: string) => {
        if (type === 'text/html') return '<p><strong>bold html</strong></p>';
        if (type === 'text/plain') return 'bold html';
        return '';
      },
      types: ['text/html', 'text/plain'],
    };
    const pasteEvent = new Event('paste', { bubbles: true, cancelable: true }) as ClipboardEvent;
    Object.defineProperty(pasteEvent, 'clipboardData', { value: clipboardData });

    await act(async () => {
      tiptap.dispatchEvent(pasteEvent);
    });

    await waitFor(() => expect(setLines).toHaveBeenCalled());
    const [emittedLines] = setLines.mock.calls[setLines.mock.calls.length - 1];
    const joined = emittedLines.join('\n');
    expect(joined).not.toMatch(/<[^>]+>/);
    expect(joined).toContain('bold html');
  });

  it('applies pre-wrap white-space when notepadWrap is true and pre when false', () => {
    const { rerender } = render(
      <MarkdownNotepad lines={['hello']} setLines={makeSetLines()} options={{ text: { notepadWrap: true } }} />,
    );
    const tiptap = document.querySelector('.tiptap') as HTMLElement;
    expect(getComputedStyle(tiptap).whiteSpace).toBe('pre-wrap');

    rerender(
      <MarkdownNotepad lines={['hello']} setLines={makeSetLines()} options={{ text: { notepadWrap: false } }} />,
    );
    expect(getComputedStyle(tiptap).whiteSpace).toBe('pre');
  });
});
