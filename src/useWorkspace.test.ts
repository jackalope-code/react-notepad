import { describe, it, expect, beforeEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useWorkspace } from './useWorkspace';
import { getWorkspace, putWorkspace } from './utils/indexedDbStore';
import type { StoredWorkspaceV3 } from './utils/notepadTypes';

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  localStorage.clear();
});

async function renderLoadedWorkspace() {
  const hook = renderHook(() => useWorkspace());
  await waitFor(() => expect(hook.result.current.loading).toBe(false));
  return hook;
}

describe('useWorkspace — initial load', () => {
  it('starts in a loading state', () => {
    const { result } = renderHook(() => useWorkspace());
    expect(result.current.loading).toBe(true);
  });

  it('creates a single blank document when IndexedDB and localStorage are both empty', async () => {
    const { result } = await renderLoadedWorkspace();
    expect(result.current.documents).toHaveLength(1);
    expect(result.current.documents[0].lines).toEqual(['']);
    expect(result.current.documents[0].title).toBe('Title');
    expect(result.current.activeDocumentId).toBe(result.current.documents[0].id);
  });

  it('migrates legacy localStorage content on first load and persists it to IndexedDB', async () => {
    localStorage.setItem('react-notepad-text', 'hello\nworld');
    localStorage.setItem('react-notepad-title', 'Legacy Note');
    const { result } = await renderLoadedWorkspace();

    expect(result.current.documents[0]).toMatchObject({
      title: 'Legacy Note',
      lines: ['hello', 'world'],
    });

    const persisted = await getWorkspace();
    expect(persisted?.documents[0]).toMatchObject({ title: 'Legacy Note', lines: ['hello', 'world'] });
  });

  it('loads an existing IndexedDB workspace directly, ignoring localStorage', async () => {
    const existing: StoredWorkspaceV3 = {
      version: 3,
      documents: [
        { id: 'doc-1', title: 'From IDB', lines: ['idb'], options: { text: { notepadWrap: true } }, markdownEnabled: true },
      ],
      activeDocumentId: 'doc-1',
    };
    await putWorkspace(existing);
    localStorage.setItem('react-notepad-text', 'should be ignored');

    const { result } = await renderLoadedWorkspace();
    expect(result.current.documents).toEqual(existing.documents);
    expect(result.current.activeDocumentId).toBe('doc-1');
  });

  it('falls back to an in-memory blank workspace when IndexedDB is unavailable', async () => {
    // @ts-expect-error simulate an environment without IndexedDB support
    delete globalThis.indexedDB;
    const { result } = await renderLoadedWorkspace();
    expect(result.current.persistenceAvailable).toBe(false);
    expect(result.current.documents).toHaveLength(1);
    globalThis.indexedDB = new IDBFactory();
  });
});

describe('useWorkspace — document management', () => {
  it('addDocument appends a new document and makes it active', async () => {
    const { result } = await renderLoadedWorkspace();
    const firstId = result.current.documents[0].id;

    let newId = '';
    act(() => {
      newId = result.current.addDocument('Second Doc');
    });

    expect(result.current.documents).toHaveLength(2);
    expect(result.current.documents[1]).toMatchObject({ title: 'Second Doc', markdownEnabled: true });
    expect(result.current.activeDocumentId).toBe(newId);
    expect(result.current.documents[0].id).toBe(firstId);
  });

  it('closeDocument removes the document and reassigns activeDocumentId if it was active', async () => {
    const { result } = await renderLoadedWorkspace();
    let secondId = '';
    act(() => {
      secondId = result.current.addDocument('Second');
    });
    expect(result.current.activeDocumentId).toBe(secondId);

    act(() => {
      result.current.closeDocument(secondId);
    });
    expect(result.current.documents).toHaveLength(1);
    expect(result.current.activeDocumentId).toBe(result.current.documents[0].id);
  });

  it('closeDocument never allows zero open documents', async () => {
    const { result } = await renderLoadedWorkspace();
    const onlyId = result.current.documents[0].id;
    act(() => {
      result.current.closeDocument(onlyId);
    });
    expect(result.current.documents).toHaveLength(1);
  });

  it('setActiveDocumentId switches the active tab', async () => {
    const { result } = await renderLoadedWorkspace();
    const firstId = result.current.documents[0].id;
    let secondId = '';
    act(() => {
      secondId = result.current.addDocument('Second');
    });
    act(() => {
      result.current.setActiveDocumentId(firstId);
    });
    expect(result.current.activeDocumentId).toBe(firstId);
    expect(secondId).not.toBe(firstId);
  });
});

describe('useWorkspace — per-document editing and undo/redo', () => {
  it('setLines updates only the targeted document', async () => {
    const { result } = await renderLoadedWorkspace();
    const firstId = result.current.documents[0].id;
    let secondId = '';
    act(() => {
      secondId = result.current.addDocument('Second');
    });

    act(() => {
      result.current.setLines(firstId, ['edited'], 0);
    });

    expect(result.current.documents.find((d) => d.id === firstId)?.lines).toEqual(['edited']);
    expect(result.current.documents.find((d) => d.id === secondId)?.lines).toEqual(['']);
  });

  it('undo/redo are tracked independently per document', async () => {
    const { result } = await renderLoadedWorkspace();
    const firstId = result.current.documents[0].id;
    let secondId = '';
    act(() => {
      secondId = result.current.addDocument('Second');
    });

    act(() => {
      result.current.setLines(firstId, ['doc1 edit'], 0);
      result.current.setLines(secondId, ['doc2 edit'], 0);
    });

    act(() => {
      result.current.undo(firstId);
    });

    expect(result.current.documents.find((d) => d.id === firstId)?.lines).toEqual(['']);
    expect(result.current.documents.find((d) => d.id === secondId)?.lines).toEqual(['doc2 edit']);

    act(() => {
      result.current.redo(firstId);
    });
    expect(result.current.documents.find((d) => d.id === firstId)?.lines).toEqual(['doc1 edit']);
  });

  it('undo returns null when there is nothing to undo for that document', async () => {
    const { result } = await renderLoadedWorkspace();
    const firstId = result.current.documents[0].id;
    let undoResult: number | null = 0;
    act(() => {
      undoResult = result.current.undo(firstId);
    });
    expect(undoResult).toBeNull();
  });

  it('redo returns null when there is nothing to redo for that document', async () => {
    const { result } = await renderLoadedWorkspace();
    const firstId = result.current.documents[0].id;
    let redoResult: number | null = 0;
    act(() => {
      redoResult = result.current.redo(firstId);
    });
    expect(redoResult).toBeNull();
  });

  it('getHistory reflects stateHistory/stateIndex for a document, and is empty for unknown ids', async () => {
    const { result } = await renderLoadedWorkspace();
    const firstId = result.current.documents[0].id;
    expect(result.current.getHistory(firstId)).toEqual({ stateHistory: [], stateIndex: -1 });
    expect(result.current.getHistory('nonexistent')).toEqual({ stateHistory: [], stateIndex: -1 });

    act(() => {
      result.current.setLines(firstId, ['edited'], 0);
    });
    const hist = result.current.getHistory(firstId);
    expect(hist.stateHistory).toHaveLength(1);
    expect(hist.stateIndex).toBe(0);
  });

  it('setTitle, setOptions, and setMarkdownEnabled update only the targeted document', async () => {
    const { result } = await renderLoadedWorkspace();
    const firstId = result.current.documents[0].id;
    let secondId = '';
    act(() => {
      secondId = result.current.addDocument('Second');
    });

    act(() => {
      result.current.setTitle(firstId, 'Renamed');
      result.current.setOptions(firstId, { text: { notepadWrap: false } });
      result.current.setMarkdownEnabled(firstId, true);
    });

    const doc1 = result.current.documents.find((d) => d.id === firstId);
    const doc2 = result.current.documents.find((d) => d.id === secondId);
    expect(doc1).toMatchObject({
      title: 'Renamed',
      options: { text: { notepadWrap: false } },
      markdownEnabled: true,
    });
    expect(doc2?.title).toBe('Second');
  });
});

describe('useWorkspace — persistence', () => {
  it('debounces writes to IndexedDB after edits', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { result } = await renderLoadedWorkspace();
    const firstId = result.current.documents[0].id;

    act(() => {
      result.current.setLines(firstId, ['a'], 0);
      result.current.setLines(firstId, ['ab'], 0);
      result.current.setLines(firstId, ['abc'], 0);
    });

    await act(async () => {
      vi.advanceTimersByTime(500);
    });

    const persisted = await getWorkspace();
    expect(persisted?.documents.find((d) => d.id === firstId)?.lines).toEqual(['abc']);
    vi.useRealTimers();
  });

  it('persists edits across a full unmount/remount cycle (reload simulation)', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const hook1 = await renderLoadedWorkspace();
    const firstId = hook1.result.current.documents[0].id;

    act(() => {
      hook1.result.current.setLines(firstId, ['persisted via hook'], 0);
    });
    await act(async () => {
      vi.advanceTimersByTime(500);
    });
    hook1.unmount();
    vi.useRealTimers();

    const hook2 = await renderLoadedWorkspace();
    expect(hook2.result.current.documents[0].lines).toEqual(['persisted via hook']);
  });

  it('closing a tab persists the removal — remounting does not resurrect the closed document', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const hook1 = await renderLoadedWorkspace();
    const firstId = hook1.result.current.documents[0].id;
    let secondId = '';
    act(() => {
      secondId = hook1.result.current.addDocument('Second');
    });
    await act(async () => {
      vi.advanceTimersByTime(500);
    });

    act(() => {
      hook1.result.current.closeDocument(secondId);
    });
    await act(async () => {
      vi.advanceTimersByTime(500);
    });
    hook1.unmount();
    vi.useRealTimers();

    const hook2 = await renderLoadedWorkspace();
    expect(hook2.result.current.documents.map((d) => d.id)).toEqual([firstId]);
  });

  it('sets persistenceAvailable to false when a debounced write fails', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { result } = await renderLoadedWorkspace();
    const firstId = result.current.documents[0].id;

    const putWorkspaceSpy = vi
      .spyOn(await import('./utils/indexedDbStore'), 'putWorkspace')
      .mockRejectedValueOnce(new Error('write failed'));

    act(() => {
      result.current.setLines(firstId, ['fails'], 0);
    });

    await act(async () => {
      vi.advanceTimersByTime(500);
    });

    await waitFor(() => expect(result.current.persistenceAvailable).toBe(false));
    putWorkspaceSpy.mockRestore();
    vi.useRealTimers();
  });
});
