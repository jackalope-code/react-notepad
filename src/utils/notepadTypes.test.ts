import { describe, it, expect } from 'vitest';
import {
  computeDelta,
  applyDelta,
  revertDelta,
  parseTextLines,
  parseTitle,
  parseOptions,
  serializeTextV2,
  serializeTitleV2,
  serializeOptionsV2,
} from './notepadTypes';
import type { NotepadOptions } from '../Notepad';

// ---------------------------------------------------------------------------
// computeDelta
// ---------------------------------------------------------------------------

describe('computeDelta', () => {
  it('detects a single-char insert on one line', () => {
    const delta = computeDelta(['hello'], ['hellox'], 0, 0);
    expect(delta.fromLine).toBe(0);
    expect(delta.oldLines).toEqual(['hello']);
    expect(delta.newLines).toEqual(['hellox']);
  });

  it('detects a single-char delete on one line', () => {
    const delta = computeDelta(['hello'], ['hell'], 0, 0);
    expect(delta.fromLine).toBe(0);
    expect(delta.oldLines).toEqual(['hello']);
    expect(delta.newLines).toEqual(['hell']);
  });

  it('detects Enter at mid-line (1 line → 2 lines)', () => {
    const delta = computeDelta(['hello world'], ['hello', 'world'], 0, 1);
    expect(delta.fromLine).toBe(0);
    expect(delta.oldLines).toEqual(['hello world']);
    expect(delta.newLines).toEqual(['hello', 'world']);
    expect(delta.fromCursorLine).toBe(0);
    expect(delta.toCursorLine).toBe(1);
  });

  it('detects Backspace at line start (2 lines → 1 merged)', () => {
    const delta = computeDelta(['hello', 'world'], ['hello world'], 1, 0);
    expect(delta.fromLine).toBe(0);
    expect(delta.oldLines).toEqual(['hello', 'world']);
    expect(delta.newLines).toEqual(['hello world']);
  });

  it('detects multi-line paste (1 → 3 lines)', () => {
    const delta = computeDelta(['original'], ['line1', 'line2', 'line3'], 0, 2);
    expect(delta.fromLine).toBe(0);
    expect(delta.oldLines).toEqual(['original']);
    expect(delta.newLines).toEqual(['line1', 'line2', 'line3']);
  });

  it('detects change in middle line, leaving surrounding lines untouched', () => {
    const delta = computeDelta(
      ['aaa', 'bbb', 'ccc'],
      ['aaa', 'BBB', 'ccc'],
      1, 1,
    );
    expect(delta.fromLine).toBe(1);
    expect(delta.oldLines).toEqual(['bbb']);
    expect(delta.newLines).toEqual(['BBB']);
  });

  it('produces empty delta for identical arrays (no-op)', () => {
    const lines = ['aaa', 'bbb'];
    const delta = computeDelta(lines, lines, 0, 0);
    expect(delta.oldLines).toEqual([]);
    expect(delta.newLines).toEqual([]);
  });

  it('stores cursor positions', () => {
    const delta = computeDelta(['a'], ['b'], 3, 5);
    expect(delta.fromCursorLine).toBe(3);
    expect(delta.toCursorLine).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// applyDelta / revertDelta round-trips
// ---------------------------------------------------------------------------

describe('applyDelta / revertDelta', () => {
  const cases: Array<{ label: string; before: string[]; after: string[] }> = [
    { label: 'single-char insert', before: ['hello'], after: ['hellox'] },
    { label: 'single-char delete', before: ['hello'], after: ['hell'] },
    { label: 'Enter (1→2)', before: ['hello world'], after: ['hello', 'world'] },
    { label: 'Backspace at start (2→1)', before: ['hello', 'world'], after: ['hello world'] },
    { label: 'multi-line paste', before: ['orig'], after: ['a', 'b', 'c'] },
    { label: 'middle-line change', before: ['a', 'b', 'c'], after: ['a', 'B', 'c'] },
  ];

  for (const { label, before, after } of cases) {
    it(`applyDelta produces "after" state — ${label}`, () => {
      const delta = computeDelta(before, after, 0, 0);
      expect(applyDelta(before, delta)).toEqual(after);
    });

    it(`revertDelta produces "before" state — ${label}`, () => {
      const delta = computeDelta(before, after, 0, 0);
      expect(revertDelta(after, delta)).toEqual(before);
    });

    it(`round-trip: revertDelta(applyDelta(before, δ), δ) === before — ${label}`, () => {
      const delta = computeDelta(before, after, 0, 0);
      expect(revertDelta(applyDelta(before, delta), delta)).toEqual(before);
    });
  }

  it('no-op delta leaves array unchanged', () => {
    const lines = ['aaa', 'bbb'];
    const delta = computeDelta(lines, lines, 0, 0);
    expect(applyDelta(lines, delta)).toEqual(lines);
    expect(revertDelta(lines, delta)).toEqual(lines);
  });
});

// ---------------------------------------------------------------------------
// parseTextLines
// ---------------------------------------------------------------------------

describe('parseTextLines', () => {
  it('parses v2 JSON correctly', () => {
    const raw = JSON.stringify({ version: 2, lines: ['hello', 'world'] });
    expect(parseTextLines(raw)).toEqual(['hello', 'world']);
  });

  it('handles v2 with empty lines array', () => {
    const raw = JSON.stringify({ version: 2, lines: [''] });
    expect(parseTextLines(raw)).toEqual(['']);
  });

  it('migrates v1 plain text by splitting on newlines', () => {
    expect(parseTextLines('hello\nworld')).toEqual(['hello', 'world']);
  });

  it('migrates v1 single-line string', () => {
    expect(parseTextLines('hello')).toEqual(['hello']);
  });

  it('returns [""] for empty v1 string', () => {
    expect(parseTextLines('')).toEqual(['']);
  });

  it('falls back gracefully on malformed JSON (not v2)', () => {
    // Valid JSON but wrong shape — treat as v1 string
    const raw = JSON.stringify({ version: 1, data: 'hello' });
    // Will be treated as v1 plain string (no \n), so single element
    expect(parseTextLines(raw)).toEqual([raw]);
  });
});

// ---------------------------------------------------------------------------
// parseTitle
// ---------------------------------------------------------------------------

describe('parseTitle', () => {
  it('parses v2 JSON', () => {
    expect(parseTitle(JSON.stringify({ version: 2, title: 'My Note' }))).toBe('My Note');
  });

  it('migrates v1 plain string', () => {
    expect(parseTitle('My Note')).toBe('My Note');
  });

  it('handles empty v1 string', () => {
    expect(parseTitle('')).toBe('');
  });
});

// ---------------------------------------------------------------------------
// parseOptions
// ---------------------------------------------------------------------------

describe('parseOptions', () => {
  const defaultOpts: NotepadOptions = { text: { notepadWrap: true } };

  it('parses v2 JSON', () => {
    const opts: NotepadOptions = { text: { notepadWrap: false } };
    const raw = JSON.stringify({ version: 2, options: opts });
    expect(parseOptions(raw)).toEqual(opts);
  });

  it('migrates v1 JSON object (no version field)', () => {
    const raw = JSON.stringify({ text: { notepadWrap: true } });
    expect(parseOptions(raw)).toEqual({ text: { notepadWrap: true } });
  });

  it('migrates v1 notepadWrap: false', () => {
    const raw = JSON.stringify({ text: { notepadWrap: false } });
    expect(parseOptions(raw)).toEqual({ text: { notepadWrap: false } });
  });

  it('returns default options for malformed input', () => {
    expect(parseOptions('not json at all')).toEqual(defaultOpts);
  });

  it('returns default options for empty string', () => {
    expect(parseOptions('')).toEqual(defaultOpts);
  });
});

// ---------------------------------------------------------------------------
// Serializer round-trips
// ---------------------------------------------------------------------------

describe('serializer round-trips', () => {
  it('serializeTextV2 / parseTextLines round-trips', () => {
    const lines = ['hello', 'world', ''];
    expect(parseTextLines(serializeTextV2(lines))).toEqual(lines);
  });

  it('serializeTitleV2 / parseTitle round-trips', () => {
    expect(parseTitle(serializeTitleV2('My Title'))).toBe('My Title');
  });

  it('serializeOptionsV2 / parseOptions round-trips', () => {
    const opts: NotepadOptions = { text: { notepadWrap: false } };
    expect(parseOptions(serializeOptionsV2(opts))).toEqual(opts);
  });

  it('serializeTextV2 output contains version: 2', () => {
    const parsed = JSON.parse(serializeTextV2(['a']));
    expect(parsed.version).toBe(2);
  });

  it('serializeTitleV2 output contains version: 2', () => {
    const parsed = JSON.parse(serializeTitleV2('x'));
    expect(parsed.version).toBe(2);
  });

  it('serializeOptionsV2 output contains version: 2', () => {
    const parsed = JSON.parse(serializeOptionsV2({ text: { notepadWrap: true } }));
    expect(parsed.version).toBe(2);
  });
});
