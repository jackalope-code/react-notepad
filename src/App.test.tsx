import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { beforeEach, describe, it, expect, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import App from './App';

beforeEach(() => {
  localStorage.clear();
  globalThis.indexedDB = new IDBFactory();
  window.location.hash = '';
});

async function renderApp() {
  const utils = render(<App />);
  await waitFor(() => expect(screen.queryByText('Loading…')).not.toBeInTheDocument());
  return utils;
}

describe('App', () => {
  it('title input updates value and calls setTitle', async () => {
    await renderApp();
    const titleInput = screen.getByDisplayValue('Title') as HTMLInputElement;
    fireEvent.change(titleInput, { target: { value: 'My New Title' } });
    expect(titleInput.value).toBe('My New Title');
  });

  it('wrap checkbox toggles options.text.notepadWrap', async () => {
    await renderApp();
    const wrapCheckbox = screen.getByLabelText('Wrap text') as HTMLInputElement;
    const initialChecked = wrapCheckbox.checked;
    fireEvent.click(wrapCheckbox);
    expect(wrapCheckbox.checked).toBe(!initialChecked);
  });

  it('line numbers checkbox toggles the gutter on and off', async () => {
    await renderApp();
    expect(screen.queryByTestId('line-number-gutter')).not.toBeInTheDocument();

    const lineNumbersCheckbox = screen.getByLabelText('Line numbers') as HTMLInputElement;
    fireEvent.click(lineNumbersCheckbox);
    expect(lineNumbersCheckbox.checked).toBe(true);
    expect(screen.getByTestId('line-number-gutter')).toBeInTheDocument();

    fireEvent.click(lineNumbersCheckbox);
    expect(screen.queryByTestId('line-number-gutter')).not.toBeInTheDocument();
  });

  it('Undo button is disabled with no history and calls undo() once enabled', async () => {
    await renderApp();
    const undoButton = screen.getByRole('button', { name: 'Undo' });
    expect(undoButton).toBeDisabled();

    const textarea = document.querySelector('textarea') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'hello' } });

    expect(undoButton).not.toBeDisabled();
    fireEvent.click(undoButton);
    expect((document.querySelector('textarea') as HTMLTextAreaElement).value).toBe('');
  });

  it('Redo button is disabled with nothing to redo and calls redo() after an undo', async () => {
    await renderApp();
    const redoButton = screen.getByRole('button', { name: 'Redo' });
    expect(redoButton).toBeDisabled();

    const textarea = document.querySelector('textarea') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'hello' } });

    const undoButton = screen.getByRole('button', { name: 'Undo' });
    fireEvent.click(undoButton);
    expect(redoButton).not.toBeDisabled();

    fireEvent.click(redoButton);
    expect((document.querySelector('textarea') as HTMLTextAreaElement).value).toBe('hello');
  });

  it('end-to-end: type, remount, content persists via IndexedDB', async () => {
    const { unmount } = await renderApp();
    const textarea = document.querySelector('textarea') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'persisted content' } });

    // Debounced IndexedDB write; wait long enough for it to flush.
    await new Promise((resolve) => setTimeout(resolve, 400));
    unmount();

    await act(async () => {
      render(<App />);
    });
    await waitFor(() => expect(screen.queryByText('Loading…')).not.toBeInTheDocument());
    const textareaAfterRemount = document.querySelector('textarea') as HTMLTextAreaElement;
    expect(textareaAfterRemount.value).toBe('persisted content');
  });

  it('renders a TabBar with a single tab for the initial document', async () => {
    await renderApp();
    expect(screen.getByRole('tablist')).toBeInTheDocument();
    expect(screen.getAllByRole('tab')).toHaveLength(1);
  });

  it('clicking + opens the New Document dialog and creates a new tab', async () => {
    await renderApp();
    fireEvent.click(screen.getByRole('button', { name: 'New document' }));
    const titleField = await screen.findByLabelText('Title');
    fireEvent.change(titleField, { target: { value: 'Second Doc' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => expect(screen.getAllByRole('tab')).toHaveLength(2));
    expect(screen.getByText('Second Doc')).toBeInTheDocument();
  });

  it('switching tabs shows the other document\'s content', async () => {
    await renderApp();
    const textarea = document.querySelector('textarea') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'first doc content' } });

    fireEvent.click(screen.getByRole('button', { name: 'New document' }));
    const titleField = await screen.findByLabelText('Title');
    fireEvent.change(titleField, { target: { value: 'Second Doc' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    await waitFor(() => expect(screen.getAllByRole('tab')).toHaveLength(2));

    // 'Second Doc' has no .md/.markdown extension, so it defaults to
    // markdownEnabled: false and renders the plain-text VirtualizedNotepad,
    // same as the initial 'Title' document below.
    expect(document.querySelector('[data-testid="markdown-overlay-textarea"]')).not.toBeInTheDocument();
    expect(document.querySelector('[data-testid="virtualized-textarea"]')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Title'));
    expect((document.querySelector('[data-testid="virtualized-textarea"]') as HTMLTextAreaElement).value).toBe('first doc content');
    expect(document.querySelector('[data-testid="markdown-overlay-textarea"]')).not.toBeInTheDocument();
  });

  it('a new document titled with a .md extension defaults to markdownEnabled and renders MarkdownOverlayNotepad', async () => {
    await renderApp();
    fireEvent.click(screen.getByRole('button', { name: 'New document' }));
    const titleField = await screen.findByLabelText('Title');
    fireEvent.change(titleField, { target: { value: 'notes.md' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => expect(screen.getAllByRole('tab')).toHaveLength(2));
    expect(document.querySelector('[data-testid="markdown-overlay-textarea"]')).toBeInTheDocument();
    expect(document.querySelector('[data-testid="virtualized-textarea"]')).not.toBeInTheDocument();
  });

  it('closing a tab removes it and cannot remove the last remaining tab', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await renderApp();
    fireEvent.click(screen.getByRole('button', { name: 'New document' }));
    const titleField = await screen.findByLabelText('Title');
    fireEvent.change(titleField, { target: { value: 'Second Doc' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    await waitFor(() => expect(screen.getAllByRole('tab')).toHaveLength(2));

    fireEvent.click(screen.getByRole('button', { name: 'Close Second Doc' }));
    await waitFor(() => expect(screen.getAllByRole('tab')).toHaveLength(1));

    // With only one tab left, there should be no close button rendered.
    expect(screen.queryByRole('button', { name: /Close/ })).not.toBeInTheDocument();
  });

  it('closes the New Document dialog via Cancel without creating a tab', async () => {
    await renderApp();
    fireEvent.click(screen.getByRole('button', { name: 'New document' }));
    expect(await screen.findByText('New Document')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByText('New Document')).not.toBeInTheDocument());
    expect(screen.getAllByRole('tab')).toHaveLength(1);
  });

  it('closes the Export dialog via Cancel without exporting', async () => {
    await renderApp();
    fireEvent.click(screen.getByRole('button', { name: 'Save as file' }));
    expect(await screen.findByText('Export Document')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByText('Export Document')).not.toBeInTheDocument());
  });

  it('opens the Export dialog and triggers a download', async () => {
    await renderApp();
    const clickSpy = vi.fn();
    const originalCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = originalCreateElement(tag);
      if (tag === 'a') el.click = clickSpy;
      return el;
    });
    URL.createObjectURL = vi.fn(() => 'blob:mock');
    URL.revokeObjectURL = vi.fn();

    fireEvent.click(screen.getByRole('button', { name: 'Save as file' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Export' }));

    expect(clickSpy).toHaveBeenCalled();
    vi.restoreAllMocks();
  });

  it('clicking the settings gear on the active tab navigates to its settings page', async () => {
    await renderApp();
    fireEvent.click(screen.getByRole('button', { name: 'Settings for Title' }));
    expect(await screen.findByText('Live Markdown Rendering')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Settings for "Title"' })).toBeInTheDocument();
  });

  it('Back on the settings page returns to the main view without persisting the toggle', async () => {
    await renderApp();
    fireEvent.click(screen.getByRole('button', { name: 'Settings for Title' }));
    const checkbox = await screen.findByLabelText('Live Markdown Rendering') as HTMLInputElement;
    expect(checkbox.checked).toBe(false);
    fireEvent.click(checkbox);

    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    await waitFor(() => expect(screen.getByRole('tablist')).toBeInTheDocument());
    // Discarded — the document should still be the plain-textarea editor.
    expect(document.querySelector('[data-testid="virtualized-textarea"]')).toBeInTheDocument();
    expect(document.querySelector('[data-testid="markdown-overlay-textarea"]')).not.toBeInTheDocument();
  });

  it('Save on the settings page persists the Live Markdown Rendering toggle and swaps the editor', async () => {
    await renderApp();
    expect(document.querySelector('textarea')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Settings for Title' }));
    const checkbox = await screen.findByLabelText('Live Markdown Rendering') as HTMLInputElement;
    fireEvent.click(checkbox);
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(screen.getByRole('tablist')).toBeInTheDocument());
    expect(document.querySelector('[data-testid="virtualized-textarea"]')).not.toBeInTheDocument();
    expect(document.querySelector('[data-testid="markdown-overlay-textarea"]')).toBeInTheDocument();
  });

  it('navigating to a settings route for an unknown document id redirects to the main view', async () => {
    await renderApp();
    act(() => {
      window.location.hash = '#/settings/does-not-exist';
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    await waitFor(() => expect(screen.getByRole('tablist')).toBeInTheDocument());
    expect(screen.queryByText('Live Markdown Rendering')).not.toBeInTheDocument();
  });
});
