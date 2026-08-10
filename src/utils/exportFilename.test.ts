import { describe, it, expect } from 'vitest';
import { sanitizeFilenameTitle, buildExportFilename } from './exportFilename';

describe('sanitizeFilenameTitle', () => {
  it('leaves an already-safe title unchanged', () => {
    expect(sanitizeFilenameTitle('My Document')).toBe('My Document');
  });

  it('replaces filesystem-unsafe characters with underscores', () => {
    expect(sanitizeFilenameTitle('a/b\\c:d*e?f"g<h>i|j')).toBe('a_b_c_d_e_f_g_h_i_j');
  });

  it('trims surrounding whitespace', () => {
    expect(sanitizeFilenameTitle('  Padded Title  ')).toBe('Padded Title');
  });

  it('falls back to "Untitled" for an empty title', () => {
    expect(sanitizeFilenameTitle('')).toBe('Untitled');
  });

  it('falls back to "Untitled" for a whitespace-only title', () => {
    expect(sanitizeFilenameTitle('   ')).toBe('Untitled');
  });

  it('preserves unicode characters', () => {
    expect(sanitizeFilenameTitle('日本語 título café')).toBe('日本語 título café');
  });
});

describe('buildExportFilename', () => {
  it('combines the sanitized title and extension', () => {
    expect(buildExportFilename('My Note', 'txt')).toBe('My Note.txt');
  });

  it('sanitizes unsafe characters before appending the extension', () => {
    expect(buildExportFilename('a/b', 'md')).toBe('a_b.md');
  });

  it('uses "Untitled" as the base name for an empty title', () => {
    expect(buildExportFilename('', 'json')).toBe('Untitled.json');
  });

  it('exporting the same document twice with different chosen extensions produces different filenames without mutating the title', () => {
    const title = 'Report';
    const first = buildExportFilename(title, 'txt');
    const second = buildExportFilename(title, 'md');
    expect(first).toBe('Report.txt');
    expect(second).toBe('Report.md');
    expect(first).not.toBe(second);
    // The source title is never mutated by either call.
    expect(title).toBe('Report');
  });

  it('two documents with identical titles exporting with the same extension produce equal (non-corrupted) filenames without crashing', () => {
    const filenameA = buildExportFilename('Duplicate Title', 'txt');
    const filenameB = buildExportFilename('Duplicate Title', 'txt');
    expect(filenameA).toBe('Duplicate Title.txt');
    expect(filenameB).toBe('Duplicate Title.txt');
    expect(filenameA).toBe(filenameB);
  });
});
