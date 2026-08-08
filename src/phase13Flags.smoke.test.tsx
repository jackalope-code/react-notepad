import { describe, it, expect, vi, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { renderHook, act, waitFor, render, fireEvent, screen } from '@testing-library/react';
import type { NotepadOptions } from './Notepad';

// ---------------------------------------------------------------------------
// Phase 13 — flag-flip round-trip safety + flag-combination smoke matrix
// ---------------------------------------------------------------------------
//
// `USE_ROPE_MODEL`/`USE_VIRTUALIZED_EDITOR` are plain module-level constants
// (see `utils/featureFlags.ts`), so exercising every value combination
// means re-importing the modules that read them under a mocked flags
// module, via `vi.doMock` + `vi.resetModules()` + dynamic `import()`.

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  localStorage.clear();
  vi.resetModules();
});

describe('flag-flip round-trip safety', () => {
  it('produces byte-identical lines output across a sequence of edits regardless of USE_ROPE_MODEL', async () => {
    const initialLines = ['alpha', 'beta', 'gamma', 'delta'];
    const resultsByFlag: Record<string, string[]> = {};

    for (const useRope of [true, false]) {
      vi.resetModules();
      vi.doMock('./utils/featureFlags', () => ({
        USE_ROPE_MODEL: useRope,
        USE_VIRTUALIZED_EDITOR: true,
      }));
      const { createTextBuffer } = await import('./utils/textBuffer');

      let buffer = createTextBuffer(initialLines);
      const delta1 = buffer.computeDelta(['alpha', 'BETA', 'gamma', 'delta'], 1, 1);
      buffer = buffer.applyDelta(delta1);

      const delta2 = buffer.computeDelta(['alpha', 'BETA', 'gamma', 'delta', 'epsilon'], 3, 4);
      buffer = buffer.applyDelta(delta2);
      buffer = buffer.revertDelta(delta2);

      const delta3 = buffer.computeDelta(['alpha', 'BETA'], 0, 0);
      buffer = buffer.applyDelta(delta3);
      buffer = buffer.revertDelta(delta3);

      resultsByFlag[String(useRope)] = buffer.getLines();
    }

    expect(resultsByFlag['true']).toEqual(resultsByFlag['false']);
  });

  it('a document persisted as lines: string[] loads correctly into a RopeBuffer and serializes back unchanged', async () => {
    vi.doMock('./utils/featureFlags', () => ({ USE_ROPE_MODEL: true, USE_VIRTUALIZED_EDITOR: true }));
    const { createTextBuffer } = await import('./utils/textBuffer');

    const persistedLines = ['line one', '', 'line three', 'line four'];
    const buffer = createTextBuffer(persistedLines);
    expect(buffer.getLines()).toEqual(persistedLines);
  });
});

describe('Phase 13 flag-combination smoke matrix', () => {
  const combos: Array<[boolean, boolean]> = [
    [true, true],
    [true, false],
    [false, true],
    [false, false],
  ];

  for (const [useRope, useVirtualized] of combos) {
    it(`mounts and accepts a basic edit without throwing (USE_ROPE_MODEL=${useRope}, USE_VIRTUALIZED_EDITOR=${useVirtualized})`, async () => {
      vi.doMock('./utils/featureFlags', () => ({
        USE_ROPE_MODEL: useRope,
        USE_VIRTUALIZED_EDITOR: useVirtualized,
      }));

      const { useWorkspace } = await import('./useWorkspace');
      const Notepad = (await import('./Notepad')).default;
      const VirtualizedNotepad = (await import('./VirtualizedNotepad')).default;
      const Editor = useVirtualized ? VirtualizedNotepad : Notepad;

      const hook = renderHook(() => useWorkspace());
      await waitFor(() => expect(hook.result.current.loading).toBe(false));

      const docId = hook.result.current.activeDocumentId;

      function Wrapper() {
        const doc = hook.result.current.documents.find((d) => d.id === docId);
        if (!doc) return null;
        return (
          <Editor
            lines={doc.lines}
            setLines={(lines: string[], cursorLine: number) => hook.result.current.setLines(docId, lines, cursorLine)}
            options={doc.options as NotepadOptions}
          />
        );
      }

      expect(() => render(<Wrapper />)).not.toThrow();

      const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
      expect(() => {
        fireEvent.change(textarea, { target: { value: 'hello\nworld', selectionStart: 5 } });
      }).not.toThrow();

      await act(async () => {
        hook.result.current.undo(docId);
      });
      await act(async () => {
        hook.result.current.redo(docId);
      });

      expect(hook.result.current.documents.find((d) => d.id === docId)?.lines).toEqual(['hello', 'world']);
    }, 15000);
  }
});
