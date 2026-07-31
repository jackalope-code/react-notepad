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

export interface StoredDocumentV3 {
  id: string;
  title: string;
  lines: string[];
  options: NotepadOptions;
  markdownEnabled: boolean;
}

export interface StoredWorkspaceV3 {
  version: 3;
  documents: StoredDocumentV3[];
  activeDocumentId: string;
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

// ---------------------------------------------------------------------------
// Chained migration: v1 -> v2 -> v3
// ---------------------------------------------------------------------------

export interface StoredV2Bundle {
  version: 2;
  lines: string[];
  title: string;
  options: NotepadOptions;
}

/**
 * Raw snapshot of the three legacy localStorage keys. Each field is
 * independently either v1 (plain string / bare JSON object) or v2
 * ({version: 2, ...}) — they were historically migrated independently,
 * so any combination of versions across the three keys is possible.
 */
export interface LegacyLocalStorageSnapshot {
  textRaw: string | null;
  titleRaw: string | null;
  optionsRaw: string | null;
}

/**
 * Verifies that migrating `rawText` produced `lines` without silent content
 * loss. Only meaningful for the legacy v1 plain-text path — v2 JSON input is
 * already structurally validated by `JSON.parse` + `Array.isArray` in
 * `parseTextLines`, so it's trusted as-is here.
 */
function verifyTextMigrationIntegrity(rawText: string, lines: string[]): boolean {
  let isV2 = false;
  try {
    const parsed = JSON.parse(rawText);
    isV2 = parsed?.version === 2 && Array.isArray(parsed.lines);
  } catch {
    isV2 = false;
  }
  if (isV2) return true;

  if (rawText === '') {
    return lines.length === 1 && lines[0] === '';
  }

  const expectedLines = rawText.split('\n');
  if (lines.length !== expectedLines.length) return false;

  // Char count must also match exactly, since split/join on '\n' is lossless
  // for the v1 plain-text path.
  return lines.join('\n').length === rawText.length;
}

/**
 * Stage 1: migrates the three legacy localStorage keys (each independently
 * either v1 or v2) into a single v2 bundle. Wraps the existing
 * parseTextLines/parseTitle/parseOptions v1-fallback logic, which already
 * detects v1 vs v2 per-field, so any mixed-version combination across the
 * three keys is handled correctly without extra branching here.
 *
 * If the text migration fails its integrity check (line/char count doesn't
 * match the source), falls back to a blank document rather than persisting
 * corrupt data.
 */
export function migrateV1toV2(raw: LegacyLocalStorageSnapshot): StoredV2Bundle {
  const textRaw = raw.textRaw ?? '';
  const titleRaw = raw.titleRaw ?? 'Title';
  const optionsRaw = raw.optionsRaw ?? '';

  const lines = parseTextLines(textRaw);
  const title = parseTitle(titleRaw);
  const options = parseOptions(optionsRaw);

  /* v8 ignore next 6 -- unreachable via the current deterministic parseTextLines path; kept as defense-in-depth against future refactors */
  if (!verifyTextMigrationIntegrity(textRaw, lines)) {
    console.warn(
      'migrateV1toV2: text integrity check failed (line/char count mismatch); falling back to a blank document.',
    );
    return { version: 2, lines: [''], title, options };
  }

  return { version: 2, lines, title, options };
}

/**
 * Stage 2: wraps a single v2 document bundle as the first (and only) tab in
 * a v3 multi-document workspace. Migrated legacy documents default to
 * `markdownEnabled: false` so existing users see no behavior change until
 * they explicitly opt in via Document Settings.
 */
export function migrateV2toV3(v2: StoredV2Bundle): StoredWorkspaceV3 {
  const id = crypto.randomUUID();
  const document: StoredDocumentV3 = {
    id,
    title: v2.title,
    lines: v2.lines,
    options: v2.options,
    markdownEnabled: false,
  };
  return {
    version: 3,
    documents: [document],
    activeDocumentId: id,
  };
}

/**
 * Composes the full v1 -> v2 -> v3 migration chain from a legacy
 * localStorage snapshot. Does not check whether a v3 workspace already
 * exists in IndexedDB — that check is the caller's (useWorkspace's)
 * responsibility; this function always runs the migration.
 */
export function loadWorkspace(legacyKeys: LegacyLocalStorageSnapshot): StoredWorkspaceV3 {
  return migrateV2toV3(migrateV1toV2(legacyKeys));
}
