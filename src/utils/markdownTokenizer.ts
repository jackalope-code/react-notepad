import { marked, type Token, type Tokens } from 'marked';
import { logError } from '../diagnostics';

// ---------------------------------------------------------------------------
// Markdown offset-recovery tokenizer (Phase 8.5 Part B)
// ---------------------------------------------------------------------------
//
// `marked`'s Lexer is designed to emit HTML, not source character ranges.
// This module walks its token tree against the raw source text to recover
// `{start, end}` character offsets for each styled span, so a plain
// `<textarea>` value can be overlaid with a styled `<div>` showing the same
// text with markdown syntax highlighted (see `MarkdownOverlayNotepad.tsx`).
//
// Two different recovery strategies are used, matched to what's actually
// exact about marked's internal consumption model:
//   - Top-level block tokens, and inline tokens within a single container's
//     `.tokens` array, are lexed by *sequentially consuming* the input from
//     the front (`src = src.substring(token.raw.length)` internally) — so
//     summing `raw.length` as a running cursor is exact, not a guess.
//   - The one seam that isn't exact is a container token whose nested
//     tokens are lexed from a *transformed* substring (e.g. a heading's
//     `text` has the leading `#`s stripped; a link's `text` is just the
//     bracketed portion). For those, `container.raw.indexOf(container.text)`
//     locates where the nested/inner content begins within the container's
//     raw text — a single indexOf per container, not per token.
// If either indexOf lookup ever fails (e.g. unusual escaping), the token is
// left unstyled rather than guessing — a highlighting bug must never hide
// or corrupt real content.

export interface Segment {
  text: string;
  className: string;
}

/** Additively combines two space-separated className strings. */
function addClass(classes: (string | null)[], start: number, end: number, className: string): void {
  const s = Math.max(0, start);
  const e = Math.min(classes.length, end);
  for (let i = s; i < e; i++) {
    classes[i] = classes[i] ? `${classes[i]} ${className}` : className;
  }
}

/**
 * Locates where `container.text` begins inside `container.raw`. Returns
 * `null` (rather than throwing or guessing) if it can't be found verbatim —
 * the caller should skip fine-grained styling for that token in that case.
 */
function findContentOffset(raw: string, text: string): number | null {
  const idx = raw.indexOf(text);
  return idx === -1 ? null : idx;
}

/** Marks a leading markdown marker (bullet, blockquote `>`, heading `#`s)
 * at the start of `raw` as `md-marker`, up to the recovered content offset. */
function markLeadingMarker(classes: (string | null)[], start: number, contentOffset: number): void {
  if (contentOffset > 0) addClass(classes, start, start + contentOffset, 'md-marker');
}

// ---------------------------------------------------------------------------
// Inline token walking
// ---------------------------------------------------------------------------

/** Applies delimiter/content styling for a token with symmetric delimiters
 * (bold `**`/`__`, italic `*`/`_`, strikethrough `~~`) around `token.text`,
 * recursing into any nested inline tokens within the content region. */
function applyDelimitedInline(
  token: Tokens.Strong | Tokens.Em | Tokens.Del,
  start: number,
  end: number,
  contentClassName: string,
  classes: (string | null)[],
): void {
  const contentOffset = findContentOffset(token.raw, token.text);
  if (contentOffset === null) {
    // Can't tell delimiters from content — style the whole span uniformly
    // rather than leaving it completely unstyled.
    addClass(classes, start, end, contentClassName);
    return;
  }
  const contentStart = start + contentOffset;
  const contentEnd = contentStart + token.text.length;
  addClass(classes, start, contentStart, 'md-marker');
  addClass(classes, contentEnd, end, 'md-marker');
  addClass(classes, contentStart, contentEnd, contentClassName);
  walkInlineTokens(token.tokens ?? [], token.text, contentStart, classes);
}

function applyCodespan(token: Tokens.Codespan, start: number, end: number, classes: (string | null)[]): void {
  const contentOffset = findContentOffset(token.raw, token.text);
  if (contentOffset === null) {
    addClass(classes, start, end, 'md-code');
    return;
  }
  const contentStart = start + contentOffset;
  const contentEnd = contentStart + token.text.length;
  addClass(classes, start, contentStart, 'md-marker');
  addClass(classes, contentEnd, end, 'md-marker');
  addClass(classes, contentStart, contentEnd, 'md-code');
}

function applyLinkOrImage(
  token: Tokens.Link | Tokens.Image,
  start: number,
  end: number,
  classes: (string | null)[],
): void {
  const contentOffset = findContentOffset(token.raw, token.text);
  if (contentOffset === null) {
    addClass(classes, start, end, 'md-link');
    return;
  }
  const contentStart = start + contentOffset;
  const contentEnd = contentStart + token.text.length;
  addClass(classes, start, contentStart, 'md-marker');
  addClass(classes, contentEnd, end, 'md-marker');
  addClass(classes, contentStart, contentEnd, 'md-link-text');
  walkInlineTokens(token.tokens ?? [], token.text, contentStart, classes);
}

/**
 * Walks an inline token array whose cumulative `raw.length` consumption is
 * exact relative to `base` (true for any single container's `.tokens`,
 * since marked's inline lexer consumes `containerText` sequentially from
 * the front, matching how `blockTokens` does for block-level content).
 */
function walkInlineTokens(
  tokens: Token[],
  _containerText: string,
  base: number,
  classes: (string | null)[],
): void {
  let cursor = base;
  for (const token of tokens) {
    const start = cursor;
    const end = cursor + token.raw.length;
    switch (token.type) {
      case 'strong':
        applyDelimitedInline(token as Tokens.Strong, start, end, 'md-strong', classes);
        break;
      case 'em':
        applyDelimitedInline(token as Tokens.Em, start, end, 'md-em', classes);
        break;
      case 'del':
        applyDelimitedInline(token as Tokens.Del, start, end, 'md-del', classes);
        break;
      case 'codespan':
        applyCodespan(token as Tokens.Codespan, start, end, classes);
        break;
      case 'link':
      case 'image':
        applyLinkOrImage(token as Tokens.Link | Tokens.Image, start, end, classes);
        break;
      case 'text': {
        // A 'text' token can itself wrap nested inline tokens (e.g. a
        // tight list item's content is lexed as a single Text container
        // rather than a flat inline token array) — recurse into it if so.
        const textToken = token as Tokens.Text;
        if (textToken.tokens && textToken.tokens.length > 0) {
          const contentOffset = findContentOffset(textToken.raw, textToken.text) ?? 0;
          walkInlineTokens(textToken.tokens, textToken.text, start + contentOffset, classes);
        }
        break;
      }
      // 'escape', 'br', 'html' and anything unrecognized: no styling —
      // rendered as plain text, matching the scoped feature set.
      default:
        break;
    }
    cursor = end;
  }
}

// ---------------------------------------------------------------------------
// Block token walking
// ---------------------------------------------------------------------------

const LIST_MARKER_RE = /^(\s*)([-*+]|\d+[.)])(\s+)/;
const BLOCKQUOTE_MARKER_RE = /^ {0,3}>\s?/;

/** Marks each line's leading blockquote `>` (and following optional space)
 * within `[start, end)` of `text` as `md-marker`. */
function markBlockquoteMarkers(text: string, start: number, end: number, classes: (string | null)[]): void {
  let lineStart = start;
  while (lineStart < end) {
    let lineEnd = text.indexOf('\n', lineStart);
    if (lineEnd === -1 || lineEnd > end) lineEnd = end;
    const line = text.slice(lineStart, lineEnd);
    const match = line.match(BLOCKQUOTE_MARKER_RE);
    if (match) addClass(classes, lineStart, lineStart + match[0].length, 'md-marker');
    lineStart = lineEnd + 1;
  }
}

/** Marks the fence lines (```` ``` ```` opening/closing, with optional
 * language) of a fenced code block as `md-marker`, and everything else in
 * the block as `md-code-block`. */
function applyFencedCodeBlock(raw: string, start: number, end: number, classes: (string | null)[]): void {
  addClass(classes, start, end, 'md-code-block');
  const firstNewline = raw.indexOf('\n');
  if (firstNewline !== -1) addClass(classes, start, start + firstNewline, 'md-marker');
  const lastNewline = raw.lastIndexOf('\n');
  if (lastNewline !== -1 && lastNewline > firstNewline) {
    const closingFenceStart = raw.slice(0, -1).lastIndexOf('\n');
    if (closingFenceStart !== -1) {
      addClass(classes, start + closingFenceStart + 1, end, 'md-marker');
    }
  }
}

/** Fence languages that render as an inline chart thumbnail instead of a
 * plain code block (see `ChartThumbnail` in `MarkdownOverlayNotepad.tsx`). */
export const CHART_FENCE_LANGUAGES = new Set(['mermaid']);

/** Marks a fenced code block whose info-string language is chart-enabled
 * (currently just `mermaid`) as `md-chart-block` instead of `md-code-block`,
 * still marking its opening/closing fence lines as `md-marker` so they can
 * be dimmed/hidden the same way as any other marker. */
function applyChartFenceBlock(raw: string, start: number, end: number, classes: (string | null)[]): void {
  addClass(classes, start, end, 'md-chart-block');
  const firstNewline = raw.indexOf('\n');
  if (firstNewline !== -1) addClass(classes, start, start + firstNewline, 'md-marker');
  const lastNewline = raw.lastIndexOf('\n');
  if (lastNewline !== -1 && lastNewline > firstNewline) {
    const closingFenceStart = raw.slice(0, -1).lastIndexOf('\n');
    if (closingFenceStart !== -1) {
      addClass(classes, start + closingFenceStart + 1, end, 'md-marker');
    }
  }
}

/** Marks a markdown table's `|`/`---` delimiters as `md-marker` and cell
 * content as `md-table-cell`, one row at a time (header + each body row),
 * so cell borders/shading can be applied purely via CSS without changing
 * any row's layout height. */
function walkTableToken(token: Tokens.Table, text: string, start: number, end: number, classes: (string | null)[]): void {
  addClass(classes, start, end, 'md-table');
  let lineStart = start;
  while (lineStart < end) {
    let lineEnd = text.indexOf('\n', lineStart);
    if (lineEnd === -1 || lineEnd > end) lineEnd = end;
    const line = text.slice(lineStart, lineEnd);
    // Every `|` on a table line is a cell delimiter; mark each one as a
    // dimmable marker while leaving the cell text itself styled as
    // md-table-cell so it can get border/background decoration.
    let cellStart = lineStart;
    for (let i = 0; i < line.length; i++) {
      if (line[i] === '|') {
        addClass(classes, lineStart + i, lineStart + i + 1, 'md-table-pipe');
        if (lineStart + i > cellStart) addClass(classes, cellStart, lineStart + i, 'md-table-cell');
        cellStart = lineStart + i + 1;
      }
    }
    if (lineStart + line.length > cellStart) addClass(classes, cellStart, lineStart + line.length, 'md-table-cell');
    lineStart = lineEnd + 1;
  }
  void token;
}

function walkListToken(token: Tokens.List, text: string, start: number, end: number, classes: (string | null)[]): void {
  let searchCursor = start;
  for (const item of token.items) {
    const itemStart = text.indexOf(item.raw, searchCursor);
    if (itemStart === -1 || itemStart >= end) continue;
    const itemEnd = itemStart + item.raw.length;
    addClass(classes, itemStart, itemEnd, 'md-list-item');

    const firstLineEnd = text.indexOf('\n', itemStart);
    const firstLine = text.slice(itemStart, firstLineEnd === -1 || firstLineEnd > itemEnd ? itemEnd : firstLineEnd);
    const markerMatch = firstLine.match(LIST_MARKER_RE);
    if (markerMatch) {
      addClass(classes, itemStart, itemStart + markerMatch[0].length, 'md-marker');
      // Distinguishes unordered bullets ("-"/"*"/"+") from ordered numbering
      // ("1.") so the overlay can substitute a real bullet glyph for the
      // former only — a numbered marker's actual digits are meaningful
      // content and shouldn't be replaced with a dot.
      addClass(
        classes,
        itemStart,
        itemStart + markerMatch[0].length,
        token.ordered ? 'md-list-marker-ordered' : 'md-list-marker-bullet',
      );
    }

    const contentOffset = findContentOffset(item.raw, item.text);
    if (contentOffset !== null) {
      walkInlineTokens(item.tokens ?? [], item.text, itemStart + contentOffset, classes);
    }
    searchCursor = itemEnd;
  }
}

function walkBlockTokens(tokens: Token[], text: string, blockCursor: number, classes: (string | null)[]): void {
  let cursor = blockCursor;
  for (const token of tokens) {
    const start = cursor;
    const end = cursor + token.raw.length;

    switch (token.type) {
      case 'heading': {
        const contentOffset = findContentOffset(token.raw, token.text);
        addClass(classes, start, end, `md-heading md-heading-${token.depth}`);
        if (contentOffset === null) break;
        markLeadingMarker(classes, start, contentOffset);
        const contentEnd = start + contentOffset + token.text.length;
        // ATX headings allow an optional closing sequence of '#'s (and
        // preceding whitespace) — e.g. "## Title ##" — which `token.text`
        // strips just like the leading marker. Mark it too, so it's
        // eligible for the same reveal-on-focus treatment as the opener.
        if (contentEnd < end) addClass(classes, contentEnd, end, 'md-marker');
        walkInlineTokens(token.tokens ?? [], token.text, start + contentOffset, classes);
        break;
      }
      case 'code': {
        const codeToken = token as Tokens.Code;
        if (codeToken.lang && CHART_FENCE_LANGUAGES.has(codeToken.lang.trim().toLowerCase())) {
          applyChartFenceBlock(token.raw, start, end, classes);
        } else {
          applyFencedCodeBlock(token.raw, start, end, classes);
        }
        break;
      }
      case 'blockquote':
        addClass(classes, start, end, 'md-blockquote');
        markBlockquoteMarkers(text, start, end, classes);
        break;
      case 'list':
        walkListToken(token as Tokens.List, text, start, end, classes);
        break;
      case 'table':
        walkTableToken(token as Tokens.Table, text, start, end, classes);
        break;
      case 'paragraph':
      case 'text': {
        const contentOffset = findContentOffset(token.raw, token.text) ?? 0;
        walkInlineTokens(token.tokens ?? [], token.text, start + contentOffset, classes);
        break;
      }
      // 'space', 'hr', 'def', 'html' and anything unrecognized: no styling.
      default:
        break;
    }

    cursor = end;
  }
}

/**
 * Computes a per-character array of additive markdown className strings
 * (or `null` for unstyled characters) for the full document `text`.
 * Defensive by design: any lexing failure yields an all-`null` array
 * (plain text) rather than throwing or corrupting the displayed content.
 */
export function computeCharClasses(text: string): (string | null)[] {
  const classes: (string | null)[] = new Array(text.length).fill(null);
  try {
    const tokens = marked.lexer(text);
    walkBlockTokens(tokens, text, 0, classes);
  } catch (err) {
    logError(err instanceof Error ? `${err.name}: ${err.message}` : String(err));
    // Defensive fallback per plan: never let a highlighting bug hide or
    // corrupt real content — fall through to plain/unstyled text.
    return new Array(text.length).fill(null);
  }
  return classes;
}

export interface ChartFence {
  /** 0-based index of the fence's opening ```lang line. */
  startLine: number;
  /** 0-based index of the fence's closing ``` line (inclusive). */
  endLine: number;
  lang: string;
  /** Inner chart source, excluding the opening/closing fence lines. */
  source: string;
}

/**
 * Finds all top-level chart-language (currently `mermaid`) fenced code
 * blocks in `text`, returning their line ranges and inner source so the
 * overlay can render a fixed-size chart thumbnail in place of the raw
 * fence text (see `ChartThumbnail` in `MarkdownOverlayNotepad.tsx`).
 * Only top-level blocks are considered — a chart nested inside e.g. a
 * blockquote or list item is left as a plain code block.
 */
export function findChartFences(text: string): ChartFence[] {
  const result: ChartFence[] = [];
  try {
    const tokens = marked.lexer(text);
    let cursor = 0;
    for (const token of tokens) {
      if (token.type === 'code') {
        const codeToken = token as Tokens.Code;
        const lang = codeToken.lang?.trim().toLowerCase() ?? '';
        if (CHART_FENCE_LANGUAGES.has(lang)) {
          const startLine = text.slice(0, cursor).split('\n').length - 1;
          // token.raw may include a trailing '\n' separating this block from
          // the next one — strip it before counting lines, or the fence's
          // line range would be off by one past its closing ``` line.
          const lineCount = token.raw.replace(/\n$/, '').split('\n').length;
          result.push({
            startLine,
            endLine: startLine + lineCount - 1,
            lang,
            source: codeToken.text,
          });
        }
      }
      cursor += token.raw.length;
    }
  } catch (err) {
    logError(err instanceof Error ? `${err.name}: ${err.message}` : String(err));
    return [];
  }
  return result;
}

/**
 * Converts the full-document char-class array into per-line segment lists
 * (one `Segment[]` per line of `text.split('\n')`), splitting any span that
 * crosses a line boundary (e.g. a fenced code block) at each `\n`.
 */
export function computeLineSegments(text: string): Segment[][] {
  const classes = computeCharClasses(text);
  const lines = text.split('\n');
  const result: Segment[][] = [];

  let offset = 0;
  for (const line of lines) {
    const segments: Segment[] = [];
    let segStart = 0;
    for (let i = 1; i <= line.length; i++) {
      const prevClass = classes[offset + i - 1] ?? '';
      const curClass = i < line.length ? classes[offset + i] ?? '' : null;
      if (curClass === null || curClass !== prevClass) {
        segments.push({ text: line.slice(segStart, i), className: prevClass });
        segStart = i;
      }
    }
    if (line.length === 0) segments.push({ text: '', className: '' });
    result.push(segments);
    offset += line.length + 1; // +1 for the '\n' separator
  }

  return result;
}
