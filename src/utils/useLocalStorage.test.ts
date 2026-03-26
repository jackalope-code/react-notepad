import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import useLocalStorage from './useLocalStorage';

const KEY = 'test-key';
const identity = (v: string) => v;
const parse = (r: string) => r;

beforeEach(() => {
  localStorage.clear();
});

describe('useLocalStorage', () => {
  it('returns default value when localStorage is empty', () => {
    const { result } = renderHook(() =>
      useLocalStorage(KEY, 'default', identity, parse),
    );
    expect(result.current[0]).toBe('default');
  });

  it('writes default to localStorage when key is absent', () => {
    renderHook(() => useLocalStorage(KEY, 'default', identity, parse));
    expect(localStorage.getItem(KEY)).toBe('default');
  });

  it('reads and parses existing value from localStorage on mount', () => {
    localStorage.setItem(KEY, 'existing');
    const { result } = renderHook(() =>
      useLocalStorage(KEY, 'default', identity, parse),
    );
    expect(result.current[0]).toBe('existing');
  });

  it('setter updates React state', () => {
    const { result } = renderHook(() =>
      useLocalStorage(KEY, 'initial', identity, parse),
    );
    act(() => result.current[1]('updated'));
    expect(result.current[0]).toBe('updated');
  });

  it('setter writes serialized value to localStorage', () => {
    const { result } = renderHook(() =>
      useLocalStorage(KEY, 'initial', identity, parse),
    );
    act(() => result.current[1]('updated'));
    expect(localStorage.getItem(KEY)).toBe('updated');
  });

  it('uses custom serialize / parse for string[] round-trip', () => {
    const serialize = (v: string[]) => JSON.stringify(v);
    const parseArr = (r: string): string[] => JSON.parse(r);
    const { result } = renderHook(() =>
      useLocalStorage<string[]>(KEY, ['a', 'b'], serialize, parseArr),
    );
    act(() => result.current[1](['x', 'y', 'z']));
    expect(result.current[0]).toEqual(['x', 'y', 'z']);
    expect(localStorage.getItem(KEY)).toBe('["x","y","z"]');
  });

  it('reads a string[] value correctly after remount', () => {
    const serialize = (v: string[]) => JSON.stringify(v);
    const parseArr = (r: string): string[] => JSON.parse(r);
    localStorage.setItem(KEY, JSON.stringify(['hello', 'world']));
    const { result } = renderHook(() =>
      useLocalStorage<string[]>(KEY, [], serialize, parseArr),
    );
    expect(result.current[0]).toEqual(['hello', 'world']);
  });
});
