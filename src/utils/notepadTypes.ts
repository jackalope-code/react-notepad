import type { NotepadOptions } from '../Notepad';

// ---------------------------------------------------------------------------
// Stored formats
// ---------------------------------------------------------------------------

export interface StoredTextV2 {
  version: 2;
  lines: string[];
}

export interface StoredTitleV2 {
  version: 2;
  title: string;
}

export interface StoredOptionsV2 {
  version: 2;
  options: NotepadOptions;
}

// ---------------------------------------------------------------------------
// Delta-based history entry (range-replacement model)
// ---------------------------------------------------------------------------

export interface HistoryEntry {
  /** First changed line index in the pre-edit array. */
  fromLine: number;
  /** Original lines in the changed range. */
  oldLines: string[];
  /** Replacement lines. */
  newLines: string[];
  /** Cursor line index (0-based) before the edit. */
  fromCursorLine: number;
  /** Cursor line index (0-based) after the edit. */
  toCursorLine: number;
}

/**
 * Compute a minimal range-replacement delta between two line arrays.
 * Walks from both ends to find the smallest changed range.
 */
export function computeDelta(
  oldLines: string[],
  newLines: string[],
  fromCursorLine: number,
  toCursorLine: number,
): HistoryEntry {
  let start = 0;
  const minLen = Math.min(oldLines.length, newLines.length);

  while (start < minLen && oldLines[start] === newLines[start]) {
    start++;
  }

  let oldEnd = oldLines.length;
  let newEnd = newLines.length;
  while (
    oldEnd > start &&
    newEnd > start &&
    oldLines[oldEnd - 1] === newLines[newEnd - 1]
  ) {
    oldEnd--;
    newEnd--;
  }

  return {
    fromLine: start,
    oldLines: oldLines.slice(start, oldEnd),
    newLines: newLines.slice(start, newEnd),
    fromCursorLine,
    toCursorLine,
  };
}

/**
 * Apply a delta forward (redo direction) — splices newLines into the array.
 */
export function applyDelta(lines: string[], entry: HistoryEntry): string[] {
  return [
    ...lines.slice(0, entry.fromLine),
    ...entry.newLines,
    ...lines.slice(entry.fromLine + entry.oldLines.length),
  ];
}

/**
 * Apply a delta backward (undo direction) — splices oldLines back in.
 */
export function revertDelta(lines: string[], entry: HistoryEntry): string[] {
  return [
    ...lines.slice(0, entry.fromLine),
    ...entry.oldLines,
    ...lines.slice(entry.fromLine + entry.newLines.length),
  ];
}

// ---------------------------------------------------------------------------
// Parsers (handle v1 → v2 migration)
// ---------------------------------------------------------------------------

const DEFAULT_OPTIONS: NotepadOptions = { text: { notepadWrap: true } };

export function parseTextLines(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw);
    if (parsed?.version === 2 && Array.isArray(parsed.lines)) {
      return parsed.lines as string[];
    }
  } catch {
    // fall through to v1 handling
  }
  // V1: plain string (may be empty)
  return raw === '' ? [''] : raw.split('\n');
}

export function parseTitle(raw: string): string {
  try {
    const parsed = JSON.parse(raw);
    if (parsed?.version === 2 && typeof parsed.title === 'string') {
      return parsed.title;
    }
  } catch {
    // fall through
  }
  // V1: raw string is the title
  return raw;
}

export function parseOptions(raw: string): NotepadOptions {
  try {
    const parsed = JSON.parse(raw);
    if (parsed?.version === 2 && parsed.options) {
      return parsed.options as NotepadOptions;
    }
    // V1: JSON object directly (no version field)
    if (typeof parsed?.text?.notepadWrap === 'boolean') {
      return parsed as NotepadOptions;
    }
  } catch {
    // fall through
  }
  return DEFAULT_OPTIONS;
}

// ---------------------------------------------------------------------------
// Serializers
// ---------------------------------------------------------------------------

export function serializeTextV2(lines: string[]): string {
  return JSON.stringify({ version: 2, lines } satisfies StoredTextV2);
}

export function serializeTitleV2(title: string): string {
  return JSON.stringify({ version: 2, title } satisfies StoredTitleV2);
}

export function serializeOptionsV2(options: NotepadOptions): string {
  return JSON.stringify({ version: 2, options } satisfies StoredOptionsV2);
}
