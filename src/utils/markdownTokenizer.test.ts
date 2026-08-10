import { describe, it, expect } from 'vitest';
import { computeCharClasses, computeLineSegments } from './markdownTokenizer';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Reconstructs the original text from computeLineSegments's output — a
 * regression guard that highlighting never mutates or drops characters. */
function reconstruct(segments: ReturnType<typeof computeLineSegments>): string {
  return segments.map((line) => line.map((s) => s.text).join('')).join('\n');
}

describe('computeLineSegments — round-trip safety', () => {
  it.each([
    'plain text, no markdown',
    '# Heading\nSome **bold** and *italic* text.',
    '```\ncode block\n```',
    '- item one\n- item two',
    '> a blockquote',
    '[a link](https://example.com)',
    '',
    '   ',
    '**unclosed bold',
    'nested **bold *and italic* inside**',
  ])('reconstructs %j exactly, character-for-character', (text) => {
    const segments = computeLineSegments(text);
    expect(reconstruct(segments)).toBe(text);
  });
});

describe('computeCharClasses — headings', () => {
  it('marks the leading "# " as md-marker and the text as md-heading', () => {
    const text = '# Title';
    const classes = computeCharClasses(text);
    expect(classes[0]).toContain('md-marker'); // '#'
    expect(classes[1]).toContain('md-marker'); // ' '
    expect(classes[2]).toContain('md-heading');
    expect(classes[2]).toContain('md-heading-1');
  });

  it('tracks heading depth for h1..h6', () => {
    for (let depth = 1; depth <= 6; depth++) {
      const text = `${'#'.repeat(depth)} Title`;
      const classes = computeCharClasses(text);
      const contentIndex = depth + 1; // after "#"*depth + " "
      expect(classes[contentIndex]).toContain(`md-heading-${depth}`);
    }
  });

  it('recurses into inline styling within heading text', () => {
    const text = '## Hello **world**';
    const classes = computeCharClasses(text);
    const boldStart = text.indexOf('world');
    expect(classes[boldStart]).toContain('md-strong');
    expect(classes[boldStart]).toContain('md-heading');
  });

  it('marks an optional ATX closing sequence ("## Title ##") as md-marker too', () => {
    const text = '## Hello world ##';
    const classes = computeCharClasses(text);
    const closingIndex = text.lastIndexOf('##');
    expect(classes[closingIndex]).toContain('md-marker');
    expect(classes[closingIndex + 1]).toContain('md-marker');
    // The space directly before the closing sequence is part of the
    // stripped closing marker too, not heading content.
    expect(classes[closingIndex - 1]).toContain('md-marker');
    // The actual content is unaffected.
    const contentIndex = text.indexOf('Hello world');
    expect(classes[contentIndex]).toContain('md-heading');
    expect(classes[contentIndex]).not.toContain('md-marker');
  });
});

describe('computeCharClasses — bold/italic/strikethrough', () => {
  it('marks ** delimiters as md-marker and inner text as md-strong', () => {
    const text = '**bold**';
    const classes = computeCharClasses(text);
    expect(classes[0]).toBe('md-marker');
    expect(classes[1]).toBe('md-marker');
    expect(classes[2]).toBe('md-strong');
    expect(classes[5]).toBe('md-strong'); // 'd' of "bold"
    expect(classes[6]).toBe('md-marker');
    expect(classes[7]).toBe('md-marker');
  });

  it('marks * delimiters as md-marker and inner text as md-em', () => {
    const text = '*italic*';
    const classes = computeCharClasses(text);
    expect(classes[0]).toBe('md-marker');
    expect(classes[1]).toBe('md-em');
    expect(classes[6]).toBe('md-em');
    expect(classes[7]).toBe('md-marker');
  });

  it('marks ~~ delimiters as md-marker and inner text as md-del', () => {
    const text = '~~gone~~';
    const classes = computeCharClasses(text);
    expect(classes[0]).toBe('md-marker');
    expect(classes[1]).toBe('md-marker');
    expect(classes[2]).toBe('md-del');
    expect(classes[5]).toBe('md-del');
  });

  it('handles bold nested inside italic (nested inline recursion)', () => {
    const text = '*italic **and bold** text*';
    const classes = computeCharClasses(text);
    const boldStart = text.indexOf('and bold');
    expect(classes[boldStart]).toContain('md-strong');
    expect(classes[boldStart]).toContain('md-em');
  });

  it('does not style unclosed/malformed bold markers as strong', () => {
    const text = '**unclosed';
    const classes = computeCharClasses(text);
    // Unclosed emphasis is treated as plain text by marked — should not
    // crash, and should not incorrectly claim to be inside md-strong.
    expect(() => computeCharClasses(text)).not.toThrow();
    expect(classes.every((c) => c === null || !c.includes('md-strong'))).toBe(true);
  });
});

describe('computeCharClasses — inline code', () => {
  it('marks backtick delimiters as md-marker and content as md-code', () => {
    const text = '`code`';
    const classes = computeCharClasses(text);
    expect(classes[0]).toBe('md-marker');
    expect(classes[1]).toBe('md-code');
    expect(classes[4]).toBe('md-code');
    expect(classes[5]).toBe('md-marker');
  });

  it('does not recurse into markdown syntax inside inline code (literal content)', () => {
    const text = '`**not bold**`';
    const classes = computeCharClasses(text);
    const innerIndex = text.indexOf('**not bold**');
    expect(classes[innerIndex]).toBe('md-code');
    expect(classes[innerIndex]).not.toContain('md-strong');
  });
});

describe('computeCharClasses — fenced code blocks', () => {
  it('marks the opening and closing fence lines as md-marker and interior as md-code-block', () => {
    const text = '```\nconst x = 1;\n```';
    const classes = computeCharClasses(text);
    expect(classes[0]).toContain('md-marker'); // opening ```
    const interiorIndex = text.indexOf('const');
    expect(classes[interiorIndex]).toBe('md-code-block');
    const closingFenceIndex = text.lastIndexOf('```');
    expect(classes[closingFenceIndex]).toContain('md-marker');
  });

  it('marks a fence with a language annotation as part of the marker line', () => {
    const text = '```js\nconst x = 1;\n```';
    const classes = computeCharClasses(text);
    expect(classes[0]).toContain('md-marker');
    expect(classes[4]).toContain('md-marker'); // 'js'
  });

  it('does not style markdown syntax inside a fenced code block', () => {
    const text = '```\n**not bold**\n```';
    const classes = computeCharClasses(text);
    const innerIndex = text.indexOf('**not bold**');
    expect(classes[innerIndex]).toBe('md-code-block');
  });
});

describe('computeCharClasses — links', () => {
  it('marks brackets/parens as md-marker and link text as md-link-text', () => {
    const text = '[click here](https://example.com)';
    const classes = computeCharClasses(text);
    expect(classes[0]).toBe('md-marker'); // '['
    const textIndex = text.indexOf('click here');
    expect(classes[textIndex]).toBe('md-link-text');
    const urlIndex = text.indexOf('https');
    expect(classes[urlIndex]).toBe('md-marker');
  });

  it('recurses into inline styling within link text', () => {
    const text = '[**bold link**](https://example.com)';
    const classes = computeCharClasses(text);
    const boldIndex = text.indexOf('bold link');
    expect(classes[boldIndex]).toContain('md-strong');
    expect(classes[boldIndex]).toContain('md-link-text');
  });
});

describe('computeCharClasses — lists', () => {
  it('marks the bullet marker and styles the item', () => {
    const text = '- first item\n- second item';
    const classes = computeCharClasses(text);
    expect(classes[0]).toContain('md-marker'); // '-'
    const contentIndex = text.indexOf('first');
    expect(classes[contentIndex]).toContain('md-list-item');
  });

  it('marks ordered list numbering as md-marker', () => {
    const text = '1. first\n2. second';
    const classes = computeCharClasses(text);
    expect(classes[0]).toContain('md-marker'); // '1'
    expect(classes[1]).toContain('md-marker'); // '.'
  });

  it('distinguishes unordered bullets from ordered numbering via md-list-marker-bullet/md-list-marker-ordered', () => {
    const bulletClasses = computeCharClasses('* first\n* second');
    expect(bulletClasses[0]).toContain('md-list-marker-bullet');
    expect(bulletClasses[0]).not.toContain('md-list-marker-ordered');

    const orderedClasses = computeCharClasses('1. first\n2. second');
    expect(orderedClasses[0]).toContain('md-list-marker-ordered');
    expect(orderedClasses[0]).not.toContain('md-list-marker-bullet');
  });

  it('recurses into inline styling within a list item', () => {
    const text = '- an **important** item';
    const classes = computeCharClasses(text);
    const boldIndex = text.indexOf('important');
    expect(classes[boldIndex]).toContain('md-strong');
  });
});

describe('computeCharClasses — blockquotes', () => {
  it('marks each line\'s leading "> " as md-marker and the block as md-blockquote', () => {
    const text = '> line one\n> line two';
    const classes = computeCharClasses(text);
    expect(classes[0]).toContain('md-marker'); // '>' on line one
    const lineTwoStart = text.indexOf('line two') - 2; // the '> ' before "line two"
    expect(classes[lineTwoStart]).toContain('md-marker');
    const contentIndex = text.indexOf('line one');
    expect(classes[contentIndex]).toContain('md-blockquote');
  });
});

describe('computeCharClasses — defensive fallback', () => {
  it('never throws for empty input', () => {
    expect(() => computeCharClasses('')).not.toThrow();
    expect(computeCharClasses('')).toEqual([]);
  });

  it('never throws for whitespace-only input', () => {
    expect(() => computeCharClasses('   \n\n  ')).not.toThrow();
  });

  it('leaves plain text with no markdown syntax entirely unstyled', () => {
    const text = 'just a regular sentence with no markdown at all';
    const classes = computeCharClasses(text);
    expect(classes.every((c) => c === null)).toBe(true);
  });
});

describe('computeLineSegments — per-line structure', () => {
  it('returns one Segment[] entry per line, matching text.split("\\n").length', () => {
    const text = 'line1\nline2\nline3';
    const segments = computeLineSegments(text);
    expect(segments).toHaveLength(3);
  });

  it('produces an empty-string segment for a blank line rather than an empty array', () => {
    const text = 'a\n\nb';
    const segments = computeLineSegments(text);
    expect(segments[1]).toEqual([{ text: '', className: '' }]);
  });

  it('splits a span crossing a line boundary (fenced code block) into per-line pieces with the same className', () => {
    const text = '```\nline a\nline b\n```';
    const segments = computeLineSegments(text);
    // The interior lines should be entirely 'md-code-block'.
    expect(segments[1].every((s) => s.className === 'md-code-block')).toBe(true);
    expect(segments[2].every((s) => s.className === 'md-code-block')).toBe(true);
  });

  it('gives plain (className "") segments to unstyled text', () => {
    const segments = computeLineSegments('no markdown here');
    expect(segments[0]).toEqual([{ text: 'no markdown here', className: '' }]);
  });
});
