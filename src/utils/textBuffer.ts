import { Rope } from './rope';
import { computeDelta, applyDelta, revertDelta, type HistoryEntry } from './notepadTypes';
import { USE_ROPE_MODEL } from './featureFlags';

// ---------------------------------------------------------------------------
// TextBuffer abstraction (Phase 13)
// ---------------------------------------------------------------------------
//
// `computeDelta`/`applyDelta`/`revertDelta` (in `notepadTypes.ts`) are the
// undo/redo primitives `useWorkspace()` builds on. Historically they took
// and returned a plain `lines: string[]` array directly. `TextBuffer` is a
// thin seam in front of that model so the *in-memory* representation used
// while computing/applying a delta can be swapped independently of the
// *persisted* representation, which always stays `lines: string[]`
// (IndexedDB, export, etc. never see a `Rope`).
//
// Two implementations, selected by `USE_ROPE_MODEL`:
//   - `LinesBuffer`: a direct pass-through to the original array-based
//     functions — byte-for-byte identical to pre-Phase-13 behavior.
//   - `RopeBuffer`: same observable behavior (same `HistoryEntry` values,
//     same resulting `lines`), but `applyDelta`/`revertDelta` are done as
//     an O(log n) `Rope.replaceLines()` instead of an O(n) array splice.
//
// Both are immutable/persistent, like `Rope` itself: `applyDelta`/
// `revertDelta` return a *new* `TextBuffer` rather than mutating in place.
//
// See `textBuffer.test.ts` for the shared conformance suite that runs the
// same operation sequences against both backends and asserts identical
// results — that's what makes the swap "seamless".
export interface TextBuffer {
  getLines(): string[];
  computeDelta(newLines: string[], fromCursorLine: number, toCursorLine: number): HistoryEntry;
  applyDelta(entry: HistoryEntry): TextBuffer;
  revertDelta(entry: HistoryEntry): TextBuffer;
}

export class LinesBuffer implements TextBuffer {
  private readonly lines: string[];

  constructor(lines: string[]) {
    this.lines = lines;
  }

  getLines(): string[] {
    return this.lines;
  }

  computeDelta(newLines: string[], fromCursorLine: number, toCursorLine: number): HistoryEntry {
    return computeDelta(this.lines, newLines, fromCursorLine, toCursorLine);
  }

  applyDelta(entry: HistoryEntry): TextBuffer {
    return new LinesBuffer(applyDelta(this.lines, entry));
  }

  revertDelta(entry: HistoryEntry): TextBuffer {
    return new LinesBuffer(revertDelta(this.lines, entry));
  }
}

export class RopeBuffer implements TextBuffer {
  private readonly rope: Rope;

  constructor(source: string[] | Rope) {
    this.rope = source instanceof Rope ? source : Rope.fromLines(source);
  }

  getLines(): string[] {
    return this.rope.toLines();
  }

  computeDelta(newLines: string[], fromCursorLine: number, toCursorLine: number): HistoryEntry {
    // Computing the minimal changed range still requires comparing the two
    // full line arrays (there's no way around at least an O(n) scan when
    // you don't already know where the edit happened) — that part is
    // backend-independent, so it's reused as-is from `notepadTypes.ts`.
    return computeDelta(this.getLines(), newLines, fromCursorLine, toCursorLine);
  }

  applyDelta(entry: HistoryEntry): TextBuffer {
    return new RopeBuffer(this.rope.replaceLines(entry.fromLine, entry.oldLines.length, entry.newLines));
  }

  revertDelta(entry: HistoryEntry): TextBuffer {
    return new RopeBuffer(this.rope.replaceLines(entry.fromLine, entry.newLines.length, entry.oldLines));
  }
}

/**
 * Builds the `TextBuffer` implementation selected by `USE_ROPE_MODEL` from
 * a `lines: string[]` snapshot — the boundary between the persisted
 * document model and whichever in-memory representation is active.
 */
export function createTextBuffer(lines: string[]): TextBuffer {
  return USE_ROPE_MODEL ? new RopeBuffer(lines) : new LinesBuffer(lines);
}
