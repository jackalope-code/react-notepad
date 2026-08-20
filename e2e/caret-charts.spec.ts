import { test, expect } from '@playwright/test';
import { createMarkdownDocument, setDocumentContent, getLineBox, getChartBox, clickLineAndExpect, clickBoxCenter } from './helpers';

// Regression coverage for caret placement directly above/below a single
// embedded chart, for each supported chart type. A chart fence is replaced
// in the overlay by a single fixed-height spacer (see ChartBlockRow in
// MarkdownOverlayNotepad.tsx) sized to exactly match how many 20px lines it
// would have taken as raw text, specifically so lines after it never drift
// out of sync with the real textarea underneath.
const CHART_FIXTURES: { name: string; source: string[] }[] = [
  {
    name: 'flowchart',
    source: ['```mermaid', 'graph TD', 'A --> B', 'B --> C', '```'],
  },
  {
    name: 'pie chart',
    source: ['```mermaid', 'pie title Pets', '"Dogs" : 40', '"Cats" : 60', '```'],
  },
  {
    name: 'class diagram',
    source: ['```mermaid', 'classDiagram', 'class Animal', 'Animal : +String name', '```'],
  },
];

for (const { name, source } of CHART_FIXTURES) {
  test.describe(`Caret alignment: ${name}`, () => {
    test(`clicking the line above and the line below a ${name} reports the correct line, and clicking the chart itself opens its editor`, async ({ page }) => {
      const before = 'before the chart';
      const after = 'after the chart';
      const lines = [before, ...source, after];
      const beforeLine = 0;
      const chartStartLine = 1;
      const afterLine = 1 + source.length;

      await createMarkdownDocument(page);
      await setDocumentContent(page, lines.join('\n'));

      const beforeBox = await getLineBox(page, beforeLine);
      await clickLineAndExpect(page, beforeBox, beforeLine);

      const afterBox = await getLineBox(page, afterLine);
      await clickLineAndExpect(page, afterBox, afterLine);

      // Clicking the chart thumbnail itself must open the popover editor
      // (not silently move the caret to some line inside/around the fence
      // — the exact click-interception bug this overlay layering fixes).
      const chartBox = await getChartBox(page, chartStartLine);
      await clickBoxCenter(page, chartBox);
      await expect(page.getByTestId('chart-editor-popover')).toBeVisible();
      const textarea = page.getByTestId('markdown-overlay-textarea');
      await expect(textarea).not.toBeFocused();

      await page.getByTestId('chart-editor-close').click();
      await expect(page.getByTestId('chart-editor-popover')).not.toBeVisible();
    });
  });
}
