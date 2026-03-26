import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useNotepad } from './Notepad';

beforeEach(() => {
  localStorage.clear();
});

describe('useNotepad', () => {
  it('initial state: lines is [""] and history is empty', () => {
    const { result } = renderHook(() => useNotepad());
    expect(result.current.lines).toEqual(['']);
    expect(result.current.stateHistory).toEqual([]);
    expect(result.current.stateIndex).toBe(-1);
  });

  it('setLines updates lines state', () => {
    const { result } = renderHook(() => useNotepad());
    act(() => result.current.setLines(['hello'], 0));
    expect(result.current.lines).toEqual(['hello']);
  });

  it('setLines persists to localStorage as v2 JSON', () => {
    const { result } = renderHook(() => useNotepad());
    act(() => result.current.setLines(['hello', 'world'], 1));
    const stored = JSON.parse(localStorage.getItem('react-notepad-text')!);
    expect(stored.version).toBe(2);
    expect(stored.lines).toEqual(['hello', 'world']);
  });

  it('setLines records a history entry', () => {
    const { result } = renderHook(() => useNotepad());
    act(() => result.current.setLines(['first'], 0));
    expect(result.current.stateHistory).toHaveLength(1);
    expect(result.current.stateIndex).toBe(0);
  });

  it('undo reverts to previous lines', () => {
    const { result } = renderHook(() => useNotepad());
    act(() => result.current.setLines(['step1'], 0));
    act(() => result.current.setLines(['step2'], 0));
    act(() => { result.current.undo(); });
    expect(result.current.lines).toEqual(['step1']);
  });

  it('redo re-applies lines after undo', () => {
    const { result } = renderHook(() => useNotepad());
    act(() => result.current.setLines(['step1'], 0));
    act(() => result.current.setLines(['step2'], 0));
    act(() => { result.current.undo(); });
    act(() => { result.current.redo(); });
    expect(result.current.lines).toEqual(['step2']);
  });

  it('undo at the beginning returns null and leaves lines unchanged', () => {
    const { result } = renderHook(() => useNotepad());
    act(() => result.current.setLines(['only'], 0));
    act(() => { result.current.undo(); }); // brings back to ['']
    let undoResult: number | null = -99;
    act(() => { undoResult = result.current.undo(); }); // nothing to undo
    expect(undoResult).toBeNull();
    expect(result.current.lines).toEqual(['']);
  });

  it('redo at the end of history returns null', () => {
    const { result } = renderHook(() => useNotepad());
    act(() => result.current.setLines(['a'], 0));
    let redoResult: number | null = -99;
    act(() => { redoResult = result.current.redo(); });
    expect(redoResult).toBeNull();
  });

  it('new edit after undo truncates the redo branch', () => {
    const { result } = renderHook(() => useNotepad());
    act(() => result.current.setLines(['a'], 0));
    act(() => result.current.setLines(['b'], 0));
    act(() => { result.current.undo(); });                    // back to ['a']
    act(() => result.current.setLines(['c'], 0));             // new branch
    expect(result.current.stateHistory).toHaveLength(2);    // ['']→['a'] and ['a']→['c']
    expect(result.current.stateIndex).toBe(1);
    act(() => { result.current.redo(); });                    // should be no-op
    expect(result.current.lines).toEqual(['c']);
  });

  it('loads v1 plain-text value from localStorage on mount', () => {
    localStorage.setItem('react-notepad-text', 'hello\nworld');
    const { result } = renderHook(() => useNotepad());
    expect(result.current.lines).toEqual(['hello', 'world']);
  });

  it('loads v2 JSON value from localStorage on mount', () => {
    localStorage.setItem(
      'react-notepad-text',
      JSON.stringify({ version: 2, lines: ['foo', 'bar'] }),
    );
    const { result } = renderHook(() => useNotepad());
    expect(result.current.lines).toEqual(['foo', 'bar']);
  });

  it('title default is "Title"', () => {
    const { result } = renderHook(() => useNotepad());
    expect(result.current.title).toBe('Title');
  });

  it('setTitle persists as v2 JSON', () => {
    const { result } = renderHook(() => useNotepad());
    act(() => result.current.setTitle('My Note'));
    const stored = JSON.parse(localStorage.getItem('react-notepad-title')!);
    expect(stored.version).toBe(2);
    expect(stored.title).toBe('My Note');
  });

  it('options default has notepadWrap: true', () => {
    const { result } = renderHook(() => useNotepad());
    expect(result.current.options.text.notepadWrap).toBe(true);
  });

  it('loads v1 options JSON on mount', () => {
    localStorage.setItem(
      'react-notepad-options',
      JSON.stringify({ text: { notepadWrap: false } }),
    );
    const { result } = renderHook(() => useNotepad());
    expect(result.current.options.text.notepadWrap).toBe(false);
  });
});
