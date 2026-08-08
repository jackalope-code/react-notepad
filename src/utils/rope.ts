// ---------------------------------------------------------------------------
// Rope data structure
// ---------------------------------------------------------------------------
//
// A persistent (immutable) rope: a balanced binary tree of string leaves.
// Every mutating operation (`insert`/`delete`/`replaceLines`) returns a new
// `Rope` instance rather than mutating in place, matching the rest of this
// codebase's functional style around `lines: string[]` (see
// `computeDelta`/`applyDelta`/`revertDelta` in `notepadTypes.ts`).
//
// Motivation (see `UPGRADE_README.md` and the plan's Phase 0/Phase 13):
// a plain string (or a `lines: string[]` array treated as one) requires
// O(n) work to insert/delete text in the middle, because everything after
// the edit point has to be copied. A rope keeps text as a tree of chunks so
// edits/inserts are O(log n) — only the path from the root to the edited
// leaf needs to change.
//
// Each node additionally tracks a `lineCount` (number of '\n' characters in
// its subtree). This lets `lineStartOffset()` — "what character offset does
// line N start at?" — resolve in O(log n) as well, which is what makes
// `RopeBuffer` (see `textBuffer.ts`) able to apply a line-range delta
// without ever converting the whole document to a flat string.

/** Leaves are split/rebuilt at this size; keeps `nodeToString`/`nodeSlice`
 * work on any single leaf bounded, and gives `insert`/`delete` a concrete
 * chunk size to reason about. */
const LEAF_SPLIT_THRESHOLD = 1024;

/** After an edit, if a subtree's depth exceeds the "ideal" balanced depth
 * (~log2(length)) by more than this many levels, it's rebuilt from a flat
 * string. Keeps repeated small edits from degenerating into a long chain. */
const REBALANCE_DEPTH_SLACK = 8;

type RopeNode =
  | { kind: 'leaf'; value: string; length: number; lineCount: number }
  | {
      kind: 'concat';
      left: RopeNode;
      right: RopeNode;
      length: number;
      lineCount: number;
      depth: number;
    };

function countNewlines(str: string): number {
  let count = 0;
  for (let i = 0; i < str.length; i++) {
    if (str.charCodeAt(i) === 10 /* '\n' */) count++;
  }
  return count;
}

function makeLeaf(value: string): RopeNode {
  return { kind: 'leaf', value, length: value.length, lineCount: countNewlines(value) };
}

function nodeDepth(node: RopeNode): number {
  return node.kind === 'leaf' ? 0 : node.depth;
}

/** Joins two nodes, dropping empty ones so ropes never accumulate
 * meaningless empty-leaf clutter after a delete. */
function concatNodes(left: RopeNode, right: RopeNode): RopeNode {
  if (left.length === 0) return right;
  if (right.length === 0) return left;
  return {
    kind: 'concat',
    left,
    right,
    length: left.length + right.length,
    lineCount: left.lineCount + right.lineCount,
    depth: 1 + Math.max(nodeDepth(left), nodeDepth(right)),
  };
}

/** Builds a balanced tree from a flat string, splitting into
 * `LEAF_SPLIT_THRESHOLD`-sized leaves. Used both for initial construction
 * and for rebalancing an over-deep subtree. */
function buildBalanced(str: string): RopeNode {
  if (str.length <= LEAF_SPLIT_THRESHOLD) return makeLeaf(str);
  const mid = Math.floor(str.length / 2);
  return concatNodes(buildBalanced(str.slice(0, mid)), buildBalanced(str.slice(mid)));
}

function nodeToString(node: RopeNode): string {
  return node.kind === 'leaf' ? node.value : nodeToString(node.left) + nodeToString(node.right);
}

function nodeCharAt(node: RopeNode, index: number): string {
  if (node.kind === 'leaf') return node.value.charAt(index);
  return index < node.left.length
    ? nodeCharAt(node.left, index)
    : nodeCharAt(node.right, index - node.left.length);
}

function nodeSlice(node: RopeNode, start: number, end: number): string {
  const clampedStart = Math.max(0, start);
  const clampedEnd = Math.min(node.length, end);
  if (clampedStart >= clampedEnd) return '';
  if (node.kind === 'leaf') return node.value.slice(clampedStart, clampedEnd);

  const leftLen = node.left.length;
  if (clampedEnd <= leftLen) return nodeSlice(node.left, clampedStart, clampedEnd);
  if (clampedStart >= leftLen) return nodeSlice(node.right, clampedStart - leftLen, clampedEnd - leftLen);
  return nodeSlice(node.left, clampedStart, leftLen) + nodeSlice(node.right, 0, clampedEnd - leftLen);
}

function nodeInsert(node: RopeNode, index: number, text: string): RopeNode {
  if (text.length === 0) return node;
  if (node.kind === 'leaf') {
    return buildBalanced(node.value.slice(0, index) + text + node.value.slice(index));
  }
  const leftLen = node.left.length;
  return index <= leftLen
    ? concatNodes(nodeInsert(node.left, index, text), node.right)
    : concatNodes(node.left, nodeInsert(node.right, index - leftLen, text));
}

function nodeDelete(node: RopeNode, start: number, end: number): RopeNode {
  const clampedStart = Math.max(0, start);
  const clampedEnd = Math.min(node.length, end);
  if (clampedStart >= clampedEnd) return node;
  if (node.kind === 'leaf') {
    return makeLeaf(node.value.slice(0, clampedStart) + node.value.slice(clampedEnd));
  }
  const leftLen = node.left.length;
  if (clampedEnd <= leftLen) {
    return concatNodes(nodeDelete(node.left, clampedStart, clampedEnd), node.right);
  }
  if (clampedStart >= leftLen) {
    return concatNodes(node.left, nodeDelete(node.right, clampedStart - leftLen, clampedEnd - leftLen));
  }
  return concatNodes(
    nodeDelete(node.left, clampedStart, leftLen),
    nodeDelete(node.right, 0, clampedEnd - leftLen),
  );
}

/** Returns the character offset at which 0-based `lineIndex` starts.
 * `lineIndex` must be in `[0, node's line count]` (the line count itself is
 * a valid index — it's the position one past the last '\n', i.e. the start
 * of the final, newline-less line). */
function nodeLineStartOffset(node: RopeNode, lineIndex: number): number {
  if (lineIndex <= 0) return 0;
  if (node.kind === 'leaf') {
    let seen = 0;
    for (let i = 0; i < node.value.length; i++) {
      if (node.value.charCodeAt(i) === 10) {
        seen++;
        if (seen === lineIndex) return i + 1;
      }
    }
    return node.value.length;
  }
  if (lineIndex <= node.left.lineCount) {
    return nodeLineStartOffset(node.left, lineIndex);
  }
  return node.left.length + nodeLineStartOffset(node.right, lineIndex - node.left.lineCount);
}

const EMPTY_LEAF = makeLeaf('');

export class Rope {
  private readonly root: RopeNode;

  private constructor(root: RopeNode) {
    this.root = root;
  }

  static from(str: string): Rope {
    return new Rope(buildBalanced(str));
  }

  static fromLines(lines: string[]): Rope {
    return Rope.from(lines.join('\n'));
  }

  get length(): number {
    return this.root.length;
  }

  /** Number of lines, i.e. `lineCount('\n') + 1` — matches `lines.length`
   * semantics for a `lines.join('\n')`-flattened string. */
  get lineCount(): number {
    return this.root.lineCount + 1;
  }

  toString(): string {
    return nodeToString(this.root);
  }

  toLines(): string[] {
    return this.toString().split('\n');
  }

  charAt(index: number): string {
    if (index < 0 || index >= this.root.length) return '';
    return nodeCharAt(this.root, index);
  }

  slice(start: number, end: number = this.root.length): string {
    return nodeSlice(this.root, start, end);
  }

  /** Character offset at which 0-based `lineIndex` starts. `lineIndex` may
   * equal `this.lineCount - 1` (start of the last line) but not beyond. */
  lineStartOffset(lineIndex: number): number {
    return nodeLineStartOffset(this.root, Math.max(0, lineIndex));
  }

  insert(index: number, text: string): Rope {
    if (text.length === 0) return this;
    const clampedIndex = Math.max(0, Math.min(index, this.root.length));
    return new Rope(this.maybeRebalance(nodeInsert(this.root, clampedIndex, text)));
  }

  delete(start: number, end: number): Rope {
    if (start >= end) return this;
    return new Rope(this.maybeRebalance(nodeDelete(this.root, start, end)));
  }

  /**
   * Replaces the `lineCount` lines starting at 0-based `startLine` with
   * `newLines`, mirroring the same "range replacement" semantics as
   * `applyDelta`/`revertDelta` operate on for a plain `lines: string[]`
   * array — but done as a single O(log n) delete + insert against the
   * rope's character-offset representation instead of an O(n) array splice.
   */
  replaceLines(startLine: number, lineCount: number, newLines: string[]): Rope {
    const totalLines = this.lineCount;
    const endLineIndex = startLine + lineCount;
    const hasTrailingLineAfter = endLineIndex < totalLines;
    const charEnd = hasTrailingLineAfter ? this.lineStartOffset(endLineIndex) : this.length;

    // Normally the char range [charStart, charEnd) captures the old lines
    // plus the separator connecting them to whatever follows (either the
    // next surviving line, if any, or nothing). But if we're deleting all
    // the way to the end of the document *and* replacing with nothing
    // (`newLines` empty), there's no "next content" for that separator to
    // connect to — so instead it needs to be swallowed from the *front* of
    // the deleted range (the separator that connected the old lines back
    // to whatever precedes them), otherwise a dangling trailing blank line
    // would be left behind.
    const isTrailingWholeDeletion =
      !hasTrailingLineAfter && newLines.length === 0 && lineCount > 0 && startLine > 0;
    const charStart = isTrailingWholeDeletion
      ? this.lineStartOffset(startLine) - 1
      : this.lineStartOffset(startLine);

    // Symmetric case: appending brand-new lines exactly at the end of the
    // document (`startLine === totalLines`, i.e. no old line actually sits
    // there — this is a pure insertion past the last line). The untouched
    // prefix's last line has no trailing separator to rely on here, so one
    // has to be added in front of the replacement text instead.
    const needsLeadingSeparator = startLine >= totalLines && startLine > 0 && newLines.length > 0;

    const replacementText =
      (needsLeadingSeparator ? '\n' : '') +
      newLines.join('\n') +
      (newLines.length > 0 && hasTrailingLineAfter ? '\n' : '');

    return this.delete(charStart, charEnd).insert(charStart, replacementText);
  }

  private maybeRebalance(node: RopeNode): RopeNode {
    if (node.length === 0) return EMPTY_LEAF;
    const idealDepth = Math.ceil(Math.log2(node.length + 1));
    if (nodeDepth(node) > idealDepth + REBALANCE_DEPTH_SLACK) {
      return buildBalanced(nodeToString(node));
    }
    return node;
  }
}
