import { describe, it, expect } from 'vitest';
import { Rope } from './rope';

describe('Rope', () => {
  describe('construction & basic reads', () => {
    it('empty rope has length 0 and toLines() returns [""]', () => {
      const rope = Rope.from('');
      expect(rope.length).toBe(0);
      expect(rope.toString()).toBe('');
      expect(rope.toLines()).toEqual(['']);
      expect(rope.lineCount).toBe(1);
    });

    it('single character', () => {
      const rope = Rope.from('a');
      expect(rope.length).toBe(1);
      expect(rope.charAt(0)).toBe('a');
      expect(rope.charAt(1)).toBe('');
      expect(rope.charAt(-1)).toBe('');
    });

    it('multi-line string round-trips through toString/toLines', () => {
      const text = 'line one\nline two\nline three';
      const rope = Rope.from(text);
      expect(rope.toString()).toBe(text);
      expect(rope.toLines()).toEqual(['line one', 'line two', 'line three']);
      expect(rope.lineCount).toBe(3);
    });

    it('fromLines/toLines round-trips exactly, including a trailing blank line', () => {
      const lines = ['a', 'b', '', 'c'];
      const rope = Rope.fromLines(lines);
      expect(rope.toLines()).toEqual(lines);
    });

    it('slice defaults end to the full length', () => {
      const rope = Rope.from('hello world');
      expect(rope.slice(6)).toBe('world');
      expect(rope.slice(0, 5)).toBe('hello');
      expect(rope.slice(0)).toBe('hello world');
    });

    it('slice clamps out-of-range bounds instead of throwing', () => {
      const rope = Rope.from('abc');
      expect(rope.slice(-10, 100)).toBe('abc');
      expect(rope.slice(5, 10)).toBe('');
      expect(rope.slice(2, 1)).toBe('');
    });
  });

  describe('insert', () => {
    it('inserts at the start, middle, and end', () => {
      const rope = Rope.from('bcd');
      expect(rope.insert(0, 'a').toString()).toBe('abcd');
      expect(rope.insert(1, 'X').toString()).toBe('bXcd');
      expect(rope.insert(3, 'e').toString()).toBe('bcde');
    });

    it('inserting empty text is a no-op (identity)', () => {
      const rope = Rope.from('abc');
      expect(rope.insert(1, '')).toBe(rope);
    });

    it('clamps an out-of-range index rather than throwing', () => {
      const rope = Rope.from('abc');
      expect(rope.insert(-5, 'X').toString()).toBe('Xabc');
      expect(rope.insert(999, 'X').toString()).toBe('abcX');
    });

    it('insert into an empty rope', () => {
      expect(Rope.from('').insert(0, 'hello').toString()).toBe('hello');
    });

    it('is immutable — the original rope is unaffected by insert', () => {
      const rope = Rope.from('abc');
      const inserted = rope.insert(1, 'X');
      expect(rope.toString()).toBe('abc');
      expect(inserted.toString()).toBe('aXbc');
    });

    it('correctly grows and splits leaves across the split threshold', () => {
      let rope = Rope.from('');
      let expected = '';
      for (let i = 0; i < 3000; i++) {
        const ch = String(i % 10);
        rope = rope.insert(rope.length, ch);
        expected += ch;
      }
      expect(rope.toString()).toBe(expected);
      expect(rope.length).toBe(3000);
    });
  });

  describe('delete', () => {
    it('deletes from the start, middle, and end', () => {
      const rope = Rope.from('abcdef');
      expect(rope.delete(0, 2).toString()).toBe('cdef');
      expect(rope.delete(2, 4).toString()).toBe('abef');
      expect(rope.delete(4, 6).toString()).toBe('abcd');
    });

    it('start >= end is a no-op (identity)', () => {
      const rope = Rope.from('abc');
      expect(rope.delete(2, 2)).toBe(rope);
      expect(rope.delete(2, 1)).toBe(rope);
    });

    it('clamps an out-of-range range rather than throwing', () => {
      const rope = Rope.from('abc');
      expect(rope.delete(-10, 1).toString()).toBe('bc');
      expect(rope.delete(1, 1000).toString()).toBe('a');
    });

    it('deleting the entire rope yields an empty rope', () => {
      const rope = Rope.from('abc');
      const deleted = rope.delete(0, 3);
      expect(deleted.length).toBe(0);
      expect(deleted.toString()).toBe('');
    });

    it('is immutable — the original rope is unaffected by delete', () => {
      const rope = Rope.from('abcdef');
      const deleted = rope.delete(1, 3);
      expect(rope.toString()).toBe('abcdef');
      expect(deleted.toString()).toBe('adef');
    });
  });

  describe('unicode / surrogate pairs', () => {
    it('preserves multi-byte / astral characters through insert and delete', () => {
      // U+1F600 (😀) is a surrogate pair in UTF-16 (two JS "characters").
      const emoji = '😀';
      const rope = Rope.from('a' + emoji + 'b');
      expect(rope.length).toBe(1 + emoji.length + 1);
      expect(rope.toString()).toBe('a😀b');

      const inserted = rope.insert(1, emoji);
      expect(inserted.toString()).toBe('a😀😀b');

      // Deleting exactly the surrogate pair's code units removes it cleanly.
      const deleted = rope.delete(1, 1 + emoji.length);
      expect(deleted.toString()).toBe('ab');
    });
  });

  describe('lineStartOffset', () => {
    it('resolves the offset of each line in a multi-line rope', () => {
      const rope = Rope.from('aa\nbbb\nc\ndddd');
      // 'aa\n' -> 0..3, 'bbb\n' -> 3..7, 'c\n' -> 7..9, 'dddd' -> 9..13
      expect(rope.lineStartOffset(0)).toBe(0);
      expect(rope.lineStartOffset(1)).toBe(3);
      expect(rope.lineStartOffset(2)).toBe(7);
      expect(rope.lineStartOffset(3)).toBe(9);
    });

    it('clamps a negative line index to 0', () => {
      const rope = Rope.from('a\nb');
      expect(rope.lineStartOffset(-1)).toBe(0);
    });
  });

  describe('replaceLines', () => {
    it('replaces a middle line, matching array-splice semantics', () => {
      const rope = Rope.fromLines(['a', 'b', 'c']);
      const replaced = rope.replaceLines(1, 1, ['x', 'y']);
      expect(replaced.toLines()).toEqual(['a', 'x', 'y', 'c']);
    });

    it('replaces the last line with no trailing-newline bug', () => {
      const rope = Rope.fromLines(['a', 'b', 'c']);
      const replaced = rope.replaceLines(2, 1, ['z']);
      expect(replaced.toLines()).toEqual(['a', 'b', 'z']);
    });

    it('handles a pure insert (lineCount = 0) without removing anything', () => {
      const rope = Rope.fromLines(['a', 'b', 'c']);
      const replaced = rope.replaceLines(1, 0, ['NEW']);
      expect(replaced.toLines()).toEqual(['a', 'NEW', 'b', 'c']);
    });

    it('replaces the entire document', () => {
      const rope = Rope.fromLines(['a', 'b', 'c']);
      const replaced = rope.replaceLines(0, 3, ['']);
      expect(replaced.toLines()).toEqual(['']);
    });

    it('replaces a range at the very start', () => {
      const rope = Rope.fromLines(['a', 'b', 'c', 'd']);
      const replaced = rope.replaceLines(0, 2, ['x']);
      expect(replaced.toLines()).toEqual(['x', 'c', 'd']);
    });

    it('deletes a middle line with no replacement, leaving no blank line behind', () => {
      const rope = Rope.fromLines(['a', 'b', 'c']);
      const replaced = rope.replaceLines(1, 1, []);
      expect(replaced.toLines()).toEqual(['a', 'c']);
    });

    it('deletes the last line with no replacement, leaving no dangling trailing blank line', () => {
      const rope = Rope.fromLines(['a', 'b', 'c']);
      const replaced = rope.replaceLines(2, 1, []);
      expect(replaced.toLines()).toEqual(['a', 'b']);
    });

    it('deletes several trailing lines with no replacement', () => {
      const rope = Rope.fromLines(['a', 'b', 'c', 'd', 'e']);
      const replaced = rope.replaceLines(2, 3, []);
      expect(replaced.toLines()).toEqual(['a', 'b']);
    });

    it('appends new lines exactly at the end of the document (pure insert past the last line)', () => {
      const rope = Rope.fromLines(['a', 'b']);
      const replaced = rope.replaceLines(2, 0, ['c']);
      expect(replaced.toLines()).toEqual(['a', 'b', 'c']);
    });

    it('appends multiple new lines exactly at the end of the document', () => {
      const rope = Rope.fromLines(['a', 'b']);
      const replaced = rope.replaceLines(2, 0, ['c', 'd']);
      expect(replaced.toLines()).toEqual(['a', 'b', 'c', 'd']);
    });
  });

  describe('rebalancing after many small sequential edits', () => {
    it('stays correct (and doesn\'t blow the call stack) after thousands of scattered inserts/deletes', () => {
      let rope = Rope.from('0'.repeat(500));
      let reference = '0'.repeat(500);

      for (let i = 0; i < 2000; i++) {
        const insertAt = i % (reference.length + 1);
        const text = String(i % 10);
        rope = rope.insert(insertAt, text);
        reference = reference.slice(0, insertAt) + text + reference.slice(insertAt);

        if (i % 3 === 0 && reference.length > 10) {
          const delStart = (i * 7) % (reference.length - 5);
          rope = rope.delete(delStart, delStart + 5);
          reference = reference.slice(0, delStart) + reference.slice(delStart + 5);
        }
      }

      expect(rope.toString()).toBe(reference);
      expect(rope.length).toBe(reference.length);
    });
  });

  describe('differential/fuzz testing against a naive reference string', () => {
    // Simple deterministic PRNG (mulberry32) so failures are reproducible
    // without relying on Math.random() and without a new test dependency.
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

    it('matches a naive string reference across many randomized insert/delete sequences (multiple seeds)', () => {
      const alphabet = 'abc \n';

      for (let seed = 1; seed <= 5; seed++) {
        const rng = makeRng(seed);
        let rope = Rope.from('');
        let reference = '';

        for (let step = 0; step < 500; step++) {
          const doInsert = reference.length === 0 || rng() < 0.7;
          if (doInsert) {
            const index = Math.floor(rng() * (reference.length + 1));
            const len = 1 + Math.floor(rng() * 5);
            let text = '';
            for (let i = 0; i < len; i++) {
              text += alphabet[Math.floor(rng() * alphabet.length)];
            }
            rope = rope.insert(index, text);
            reference = reference.slice(0, index) + text + reference.slice(index);
          } else {
            const start = Math.floor(rng() * reference.length);
            const len = 1 + Math.floor(rng() * 5);
            const end = Math.min(reference.length, start + len);
            rope = rope.delete(start, end);
            reference = reference.slice(0, start) + reference.slice(end);
          }

          // Assert equivalence after every single step, not just at the
          // end, so a divergence is caught at the exact operation that
          // caused it.
          expect(rope.toString()).toBe(reference);
          expect(rope.length).toBe(reference.length);
        }
      }
    });
  });

  describe('replaceLines — differential fuzz vs array splice', () => {
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

    it('matches Array.prototype.splice semantics across randomized replaceLines calls, including empty ranges/replacements', () => {
      for (let seed = 1; seed <= 5; seed++) {
        const rng = makeRng(seed * 1000);
        let lines: string[] = ['seed'];
        let rope = Rope.fromLines(lines);

        for (let step = 0; step < 200; step++) {
          const startLine = Math.floor(rng() * (lines.length + 1)); // may equal lines.length (append)
          const maxDeletable = Math.max(0, lines.length - startLine);
          const deleteCount = Math.floor(rng() * (maxDeletable + 1));
          const insertCount = Math.floor(rng() * 3); // 0, 1, or 2 new lines
          const newLines = Array.from({ length: insertCount }, (_, i) => `s${seed}-${step}-${i}`);

          const expected = [...lines];
          expected.splice(startLine, deleteCount, ...newLines);
          // A rope always has at least one line (an empty rope's toLines()
          // is [''], matching the rest of the codebase's convention that a
          // document is never truly "zero lines" — see `createDocument`).
          if (expected.length === 0) expected.push('');

          rope = rope.replaceLines(startLine, deleteCount, newLines);
          expect(rope.toLines()).toEqual(expected);

          lines = expected;
        }
      }
    });
  });

  describe('large strings', () => {
    it('handles a large (multi-hundred-KB) document correctly', () => {
      const line = 'the quick brown fox jumps over the lazy dog';
      const lines = Array.from({ length: 5000 }, (_, i) => `${line} ${i}`);
      const rope = Rope.fromLines(lines);

      expect(rope.lineCount).toBe(5000);
      expect(rope.toLines()).toEqual(lines);

      const replaced = rope.replaceLines(2500, 1, ['REPLACED']);
      const expectedLines = [...lines];
      expectedLines[2500] = 'REPLACED';
      expect(replaced.toLines()).toEqual(expectedLines);
    });
  });
});
