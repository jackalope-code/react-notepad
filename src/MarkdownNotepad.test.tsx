import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
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
