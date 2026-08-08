import { describe, it, expect } from 'vitest';
import { LinesBuffer, RopeBuffer, createTextBuffer, type TextBuffer } from './textBuffer';
import type { HistoryEntry } from './notepadTypes';

// ---------------------------------------------------------------------------
// Shared TextBuffer conformance suite
// ---------------------------------------------------------------------------
//
// This is the core "seamless transition" proof for Phase 13: every
// operation sequence below is defined once and run against *both*
// backends. If `LinesBuffer` and `RopeBuffer` ever diverge in behavior,
// one of these tables will fail regardless of which backend a future
// change touches.

type Backend = { name: string; make: (lines: string[]) => TextBuffer };

const BACKENDS: Backend[] = [
  { name: 'LinesBuffer', make: (lines) => new LinesBuffer(lines) },
  { name: 'RopeBuffer', make: (lines) => new RopeBuffer(lines) },
];

describe.each(BACKENDS)('TextBuffer conformance — $name', ({ make }) => {
  it('getLines() returns the original lines unchanged', () => {
    const buffer = make(['a', 'b', 'c']);
    expect(buffer.getLines()).toEqual(['a', 'b', 'c']);
  });

  it('computeDelta finds the minimal changed range for a middle edit', () => {
    const buffer = make(['a', 'b', 'c', 'd']);
    const delta = buffer.computeDelta(['a', 'X', 'Y', 'd'], 1, 2);
    expect(delta).toEqual({
      fromLine: 1,
      oldLines: ['b', 'c'],
      newLines: ['X', 'Y'],
      fromCursorLine: 1,
      toCursorLine: 2,
    });
  });

  it('computeDelta reports an empty range when nothing changed', () => {
    const buffer = make(['a', 'b', 'c']);
    const delta = buffer.computeDelta(['a', 'b', 'c'], 0, 0);
    expect(delta.oldLines).toEqual([]);
    expect(delta.newLines).toEqual([]);
  });

  it('applyDelta reproduces the edited document and returns a new buffer', () => {
    const buffer = make(['a', 'b', 'c']);
    const delta: HistoryEntry = {
      fromLine: 1,
      oldLines: ['b'],
      newLines: ['x', 'y'],
      fromCursorLine: 1,
      toCursorLine: 2,
    };
    const next = buffer.applyDelta(delta);
    expect(next.getLines()).toEqual(['a', 'x', 'y', 'c']);
    expect(buffer.getLines()).toEqual(['a', 'b', 'c']); // original untouched
  });

  it('revertDelta undoes an applyDelta exactly', () => {
    const buffer = make(['a', 'b', 'c']);
    const delta: HistoryEntry = {
      fromLine: 1,
      oldLines: ['b'],
      newLines: ['x', 'y'],
      fromCursorLine: 1,
      toCursorLine: 2,
    };
    const applied = buffer.applyDelta(delta);
    const reverted = applied.revertDelta(delta);
    expect(reverted.getLines()).toEqual(['a', 'b', 'c']);
  });

  it('handles a pure insertion delta (oldLines empty)', () => {
    const buffer = make(['a', 'b']);
    const delta: HistoryEntry = {
      fromLine: 1,
      oldLines: [],
      newLines: ['NEW'],
      fromCursorLine: 0,
      toCursorLine: 1,
    };
    expect(buffer.applyDelta(delta).getLines()).toEqual(['a', 'NEW', 'b']);
  });

  it('handles a pure deletion delta (newLines empty)', () => {
    const buffer = make(['a', 'b', 'c']);
    const delta: HistoryEntry = {
      fromLine: 1,
      oldLines: ['b'],
      newLines: [],
      fromCursorLine: 1,
      toCursorLine: 1,
    };
    expect(buffer.applyDelta(delta).getLines()).toEqual(['a', 'c']);
  });

  it('handles a delta at the very start of the document', () => {
    const buffer = make(['a', 'b', 'c']);
    const delta: HistoryEntry = {
      fromLine: 0,
      oldLines: ['a'],
      newLines: ['A', 'A2'],
      fromCursorLine: 0,
      toCursorLine: 1,
    };
    expect(buffer.applyDelta(delta).getLines()).toEqual(['A', 'A2', 'b', 'c']);
  });

  it('handles a delta at the very end of the document', () => {
    const buffer = make(['a', 'b', 'c']);
    const delta: HistoryEntry = {
      fromLine: 2,
      oldLines: ['c'],
      newLines: ['z'],
      fromCursorLine: 2,
      toCursorLine: 2,
    };
    expect(buffer.applyDelta(delta).getLines()).toEqual(['a', 'b', 'z']);
  });

  it('handles replacing the entire document', () => {
    const buffer = make(['a', 'b', 'c']);
    const delta: HistoryEntry = {
      fromLine: 0,
      oldLines: ['a', 'b', 'c'],
      newLines: [''],
      fromCursorLine: 0,
      toCursorLine: 0,
    };
    expect(buffer.applyDelta(delta).getLines()).toEqual(['']);
  });

  it('chains multiple sequential edits (simulated undo/redo history) identically', () => {
    let buffer = make(['line1']);
    const deltas: HistoryEntry[] = [];

    let next = buffer.applyDelta({
      fromLine: 0,
      oldLines: ['line1'],
      newLines: ['line1', 'line2'],
      fromCursorLine: 0,
      toCursorLine: 1,
    });
    deltas.push({
      fromLine: 0,
      oldLines: ['line1'],
      newLines: ['line1', 'line2'],
      fromCursorLine: 0,
      toCursorLine: 1,
    });
    buffer = next;

    next = buffer.applyDelta({
      fromLine: 1,
      oldLines: ['line2'],
      newLines: ['line2', 'line3'],
      fromCursorLine: 1,
      toCursorLine: 2,
    });
    deltas.push({
      fromLine: 1,
      oldLines: ['line2'],
      newLines: ['line2', 'line3'],
      fromCursorLine: 1,
      toCursorLine: 2,
    });
    buffer = next;

    expect(buffer.getLines()).toEqual(['line1', 'line2', 'line3']);

    // Undo both edits, in reverse order.
    buffer = buffer.revertDelta(deltas[1]);
    expect(buffer.getLines()).toEqual(['line1', 'line2']);
    buffer = buffer.revertDelta(deltas[0]);
    expect(buffer.getLines()).toEqual(['line1']);

    // Redo both.
    buffer = buffer.applyDelta(deltas[0]);
    buffer = buffer.applyDelta(deltas[1]);
    expect(buffer.getLines()).toEqual(['line1', 'line2', 'line3']);
  });

  it('round-trips a document containing blank lines', () => {
    const buffer = make(['a', '', 'b', '']);
    expect(buffer.getLines()).toEqual(['a', '', 'b', '']);
  });
});

describe('createTextBuffer', () => {
  it('produces a buffer whose observable behavior matches LinesBuffer regardless of flag', () => {
    // Not asserting *which* concrete class is returned (that's an
    // implementation detail governed by the USE_ROPE_MODEL flag) — only
    // that whichever one is selected behaves identically to the reference.
    const lines = ['a', 'b', 'c'];
    const flagged = createTextBuffer(lines);
    const reference = new LinesBuffer(lines);

    expect(flagged.getLines()).toEqual(reference.getLines());

    const delta = flagged.computeDelta(['a', 'X', 'c'], 1, 1);
    const refDelta = reference.computeDelta(['a', 'X', 'c'], 1, 1);
    expect(delta).toEqual(refDelta);

    expect(flagged.applyDelta(delta).getLines()).toEqual(reference.applyDelta(refDelta).getLines());
  });
});

describe('RopeBuffer vs LinesBuffer — randomized cross-backend equivalence', () => {
  function makeRng(seed: number) {
    let a = seed;
    return () => {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  it('produces identical getLines()/history results across many randomized edit sequences', () => {
    const rng = makeRng(42);
    let lines = ['start'];
    let linesBuf: TextBuffer = new LinesBuffer(lines);
    let ropeBuf: TextBuffer = new RopeBuffer(lines);

    for (let step = 0; step < 100; step++) {
      const cursor = Math.floor(rng() * lines.length);
      const insertAt = Math.floor(rng() * (lines.length + 1));
      const newLines = [...lines];
      if (rng() < 0.5) {
        newLines.splice(insertAt, 0, `new-${step}`);
      } else if (newLines.length > 1) {
        newLines.splice(Math.floor(rng() * newLines.length), 1);
      } else {
        newLines[0] = `edited-${step}`;
      }

      const deltaFromLines = linesBuf.computeDelta(newLines, cursor, cursor);
      const deltaFromRope = ropeBuf.computeDelta(newLines, cursor, cursor);
      expect(deltaFromRope).toEqual(deltaFromLines);

      linesBuf = linesBuf.applyDelta(deltaFromLines);
      ropeBuf = ropeBuf.applyDelta(deltaFromRope);
      expect(ropeBuf.getLines()).toEqual(linesBuf.getLines());

      lines = newLines;
    }
  });
});
