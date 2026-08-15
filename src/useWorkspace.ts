import { useCallback, useEffect, useRef, useState } from 'react';
import { getWorkspace, putWorkspace } from './utils/indexedDbStore';
import { getFallbackWorkspace, putFallbackWorkspace } from './utils/localStorageWorkspaceStore';
import {
  loadWorkspace,
  type StoredWorkspaceV3,
  type StoredDocumentV3,
  type HistoryEntry,
  type LegacyLocalStorageSnapshot,
} from './utils/notepadTypes';
import { createTextBuffer } from './utils/textBuffer';
import { getCursorLine, type NotepadOptions } from './Notepad';
import { debounce } from './utils/functions';

const LEGACY_TEXT_KEY = 'react-notepad-text';
const LEGACY_TITLE_KEY = 'react-notepad-title';
const LEGACY_OPTIONS_KEY = 'react-notepad-options';

const DEFAULT_OPTIONS: NotepadOptions = { text: { notepadWrap: true } };

const PERSIST_DEBOUNCE_MS = 300;

interface DocHistory {
  stateHistory: HistoryEntry[];
  stateIndex: number;
}

const EMPTY_HISTORY: DocHistory = { stateHistory: [], stateIndex: -1 };

function readLegacySnapshot(): LegacyLocalStorageSnapshot {
  return {
    textRaw: localStorage.getItem(LEGACY_TEXT_KEY),
    titleRaw: localStorage.getItem(LEGACY_TITLE_KEY),
    optionsRaw: localStorage.getItem(LEGACY_OPTIONS_KEY),
  };
}

function createDocument(title: string, markdownEnabled: boolean): StoredDocumentV3 {
  return {
    id: crypto.randomUUID(),
    title,
    lines: [''],
    options: DEFAULT_OPTIONS,
    markdownEnabled,
  };
}

function createBlankWorkspace(): StoredWorkspaceV3 {
  const doc = createDocument('Title', true);
  return { version: 3, documents: [doc], activeDocumentId: doc.id };
}

/**
 * Replaces useNotepad(). Loads a multi-document workspace from IndexedDB,
 * running the v1 -> v2 -> v3 migration chain from localStorage the first
 * time (when no IndexedDB record exists yet). Per-document undo/redo
 * history lives only in React state, matching the previous behavior.
 *
 * Internally, `documentsRef`/`activeDocumentIdRef`/`historyRef` are the
 * canonical source of truth and are mutated *synchronously* before each
 * React state update. This matters because React 18 batches state updates:
 * if multiple mutating calls (e.g. setTitle + setOptions + setLines) happen
 * within the same event handler/act() block, reading from `documents`
 * state (or waiting for a re-render to refresh a ref) would see stale data
 * for every call after the first, silently dropping earlier updates.
 */
export const useWorkspace = () => {
  const [documents, setDocumentsState] = useState<StoredDocumentV3[]>([]);
  const [activeDocumentId, setActiveDocumentIdInternal] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [persistenceAvailable, setPersistenceAvailable] = useState(true);
  const [usingLocalStorageFallback, setUsingLocalStorageFallback] = useState(false);
  const [historyByDoc, setHistoryByDocState] = useState<Record<string, DocHistory>>({});

  const documentsRef = useRef<StoredDocumentV3[]>(documents);
  const activeDocumentIdRef = useRef<string>(activeDocumentId);
  const historyRef = useRef<Record<string, DocHistory>>(historyByDoc);
  const persistenceAvailableRef = useRef(persistenceAvailable);
  persistenceAvailableRef.current = persistenceAvailable;
  const usingLocalStorageFallbackRef = useRef(usingLocalStorageFallback);
  usingLocalStorageFallbackRef.current = usingLocalStorageFallback;

  const commitDocuments = useCallback((nextDocs: StoredDocumentV3[]) => {
    documentsRef.current = nextDocs;
    setDocumentsState(nextDocs);
  }, []);

  const commitActiveDocumentId = useCallback((id: string) => {
    activeDocumentIdRef.current = id;
    setActiveDocumentIdInternal(id);
  }, []);

  const commitHistory = useCallback((next: Record<string, DocHistory>) => {
    historyRef.current = next;
    setHistoryByDocState(next);
  }, []);

  const debouncedPersistRef = useRef(
    debounce((workspace: StoredWorkspaceV3) => {
      putWorkspace(workspace).catch(() => {
        setUsingLocalStorageFallback(true);
        usingLocalStorageFallbackRef.current = true;
        debouncedPersistToFallbackRef.current(workspace);
      });
    }, PERSIST_DEBOUNCE_MS),
  );

  const debouncedPersistToFallbackRef = useRef(
    debounce((workspace: StoredWorkspaceV3) => {
      try {
        putFallbackWorkspace(workspace);
      } catch {
        setUsingLocalStorageFallback(false);
        setPersistenceAvailable(false);
      }
    }, PERSIST_DEBOUNCE_MS),
  );

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const existing = await getWorkspace();
        if (cancelled) return;

        if (existing) {
          commitDocuments(existing.documents);
          commitActiveDocumentId(existing.activeDocumentId);
        } else {
          const migrated = loadWorkspace(readLegacySnapshot());
          commitDocuments(migrated.documents);
          commitActiveDocumentId(migrated.activeDocumentId);
          await putWorkspace(migrated);
        }
      } catch {
        if (cancelled) return;

        if (documentsRef.current.length > 0) {
          // IndexedDB write failed after a workspace was already loaded/migrated
          // in memory — flush that workspace to localStorage and keep going.
          try {
            putFallbackWorkspace({
              version: 3,
              documents: documentsRef.current,
              activeDocumentId: activeDocumentIdRef.current,
            });
            setUsingLocalStorageFallback(true);
            usingLocalStorageFallbackRef.current = true;
          } catch {
            setPersistenceAvailable(false);
          }
        } else {
          const fallback = getFallbackWorkspace();
          if (fallback) {
            commitDocuments(fallback.documents);
            commitActiveDocumentId(fallback.activeDocumentId);
            setUsingLocalStorageFallback(true);
            usingLocalStorageFallbackRef.current = true;
          } else {
            const migrated = loadWorkspace(readLegacySnapshot());
            commitDocuments(migrated.documents);
            commitActiveDocumentId(migrated.activeDocumentId);

            try {
              putFallbackWorkspace({
                version: 3,
                documents: migrated.documents,
                activeDocumentId: migrated.activeDocumentId,
              });
              setUsingLocalStorageFallback(true);
              usingLocalStorageFallbackRef.current = true;
            } catch {
              setPersistenceAvailable(false);
              const blank = createBlankWorkspace();
              commitDocuments(blank.documents);
              commitActiveDocumentId(blank.activeDocumentId);
            }
          }
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const persist = useCallback((nextDocuments: StoredDocumentV3[], nextActiveId: string) => {
    if (!persistenceAvailableRef.current) return;

    const workspace: StoredWorkspaceV3 = {
      version: 3,
      documents: nextDocuments,
      activeDocumentId: nextActiveId,
    };

    if (usingLocalStorageFallbackRef.current) {
      debouncedPersistToFallbackRef.current(workspace);
    } else {
      debouncedPersistRef.current(workspace);
    }
  }, []);

  const setActiveDocumentId = useCallback(
    (id: string) => {
      commitActiveDocumentId(id);
      persist(documentsRef.current, id);
    },
    [commitActiveDocumentId, persist],
  );

  const addDocument = useCallback(
    (title = 'Untitled') => {
      const newDoc = createDocument(title, true);
      const nextDocs = [...documentsRef.current, newDoc];
      commitDocuments(nextDocs);
      commitActiveDocumentId(newDoc.id);
      persist(nextDocs, newDoc.id);
      return newDoc.id;
    },
    [commitActiveDocumentId, commitDocuments, persist],
  );

  const closeDocument = useCallback(
    (id: string) => {
      const currentDocs = documentsRef.current;
      if (currentDocs.length <= 1) return; // never allow zero open documents

      const closingIndex = currentDocs.findIndex((d) => d.id === id);
      const nextDocs = currentDocs.filter((d) => d.id !== id);

      let nextActiveId = activeDocumentIdRef.current;
      if (nextActiveId === id) {
        const fallbackIndex = Math.min(closingIndex, nextDocs.length - 1);
        nextActiveId = nextDocs[fallbackIndex].id;
      }

      commitDocuments(nextDocs);
      commitActiveDocumentId(nextActiveId);

      const nextHistory = { ...historyRef.current };
      delete nextHistory[id];
      commitHistory(nextHistory);

      persist(nextDocs, nextActiveId);
    },
    [commitActiveDocumentId, commitDocuments, commitHistory, persist],
  );

  const updateDocument = useCallback(
    (id: string, updater: (doc: StoredDocumentV3) => StoredDocumentV3) => {
      const nextDocs = documentsRef.current.map((d) => (d.id === id ? updater(d) : d));
      commitDocuments(nextDocs);
      persist(nextDocs, activeDocumentIdRef.current);
    },
    [commitDocuments, persist],
  );

  const setTitle = useCallback(
    (id: string, title: string) => updateDocument(id, (doc) => ({ ...doc, title })),
    [updateDocument],
  );

  const setOptions = useCallback(
    (id: string, options: NotepadOptions) => updateDocument(id, (doc) => ({ ...doc, options })),
    [updateDocument],
  );

  const setMarkdownEnabled = useCallback(
    (id: string, markdownEnabled: boolean) =>
      updateDocument(id, (doc) => ({ ...doc, markdownEnabled })),
    [updateDocument],
  );

  const setLines = useCallback(
    (id: string, newLines: string[], toCursorLine: number) => {
      const doc = documentsRef.current.find((d) => d.id === id);
      if (!doc) return;

      const prevCursorLine = getCursorLine(doc.lines, 0);
      const delta = createTextBuffer(doc.lines).computeDelta(newLines, prevCursorLine, toCursorLine);

      updateDocument(id, (d) => ({ ...d, lines: newLines }));

      const existing = historyRef.current[id] ?? EMPTY_HISTORY;
      const trimmed = existing.stateHistory.slice(0, existing.stateIndex + 1);
      trimmed.push(delta);
      commitHistory({
        ...historyRef.current,
        [id]: { stateHistory: trimmed, stateIndex: trimmed.length - 1 },
      });
    },
    [commitHistory, updateDocument],
  );

  const undo = useCallback(
    (id: string): number | null => {
      const hist = historyRef.current[id] ?? EMPTY_HISTORY;
      if (hist.stateIndex < 0) return null;

      const entry = hist.stateHistory[hist.stateIndex];
      const doc = documentsRef.current.find((d) => d.id === id);
      if (!doc) return null;

      const reverted = createTextBuffer(doc.lines).revertDelta(entry).getLines();
      updateDocument(id, (d) => ({ ...d, lines: reverted }));
      commitHistory({
        ...historyRef.current,
        [id]: { ...hist, stateIndex: hist.stateIndex - 1 },
      });
      return entry.fromCursorLine;
    },
    [commitHistory, updateDocument],
  );

  const redo = useCallback(
    (id: string): number | null => {
      const hist = historyRef.current[id] ?? EMPTY_HISTORY;
      if (hist.stateIndex >= hist.stateHistory.length - 1) return null;

      const entry = hist.stateHistory[hist.stateIndex + 1];
      const doc = documentsRef.current.find((d) => d.id === id);
      if (!doc) return null;

      const applied = createTextBuffer(doc.lines).applyDelta(entry).getLines();
      updateDocument(id, (d) => ({ ...d, lines: applied }));
      commitHistory({
        ...historyRef.current,
        [id]: { ...hist, stateIndex: hist.stateIndex + 1 },
      });
      return entry.toCursorLine;
    },
    [commitHistory, updateDocument],
  );

  const getHistory = useCallback(
    (id: string): DocHistory => historyByDoc[id] ?? EMPTY_HISTORY,
    [historyByDoc],
  );

  return {
    loading,
    persistenceAvailable,
    usingLocalStorageFallback,
    documents,
    activeDocumentId,
    setActiveDocumentId,
    addDocument,
    closeDocument,
    setLines,
    setTitle,
    setOptions,
    setMarkdownEnabled,
    undo,
    redo,
    getHistory,
  };
};
