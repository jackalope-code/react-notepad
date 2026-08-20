import { test, expect } from '@playwright/test';
import { createMarkdownDocument, setDocumentContent, getLineBox, clickLineAndExpect } from './helpers';

// Regression coverage for the caret-alignment bug near scaled headings:
// heading content is enlarged visually via `transform: scale()` (never a
// font-size change) specifically so it can't desync the overlay's 20px
// line grid from the real textarea underneath it. These tests click at the
// real, rendered pixel position of each line and assert the caret lands on
// the line a user actually clicked, for every heading level plus plain
// text lines interleaved between them.
test.describe('Caret alignment: headings', () => {
  test('clicking each line of a heading-only document reports the correct 1:1 line number', async ({ page }) => {
    const lines = [
      '# Heading 1',
      'plain text after h1',
      '## Heading 2',
      'plain text after h2',
      '### Heading 3',
      '#### Heading 4',
      '##### Heading 5',
      'final plain text line',
    ];
    await createMarkdownDocument(page);
    await setDocumentContent(page, lines.join('\n'));

    for (let i = 0; i < lines.length; i++) {
      const box = await getLineBox(page, i);
      await clickLineAndExpect(page, box, i);
    }
  });

  test('a scaled heading does not change the pixel height of its own line', async ({ page }) => {
    const lines = ['# Big Heading', 'next line right below it'];
    await createMarkdownDocument(page);
    await setDocumentContent(page, lines.join('\n'));

    const headingBox = await getLineBox(page, 0);
    const nextBox = await getLineBox(page, 1);

    expect(headingBox.height).toBeCloseTo(20, 0);
    // The next line must start exactly one line-height below the heading,
    // regardless of the heading's visually-scaled glyphs.
    expect(nextBox.y - headingBox.y).toBeCloseTo(20, 0);
  });
});
