import { test, expect } from '@playwright/test';
import { createMarkdownDocument, setDocumentContent, getLineBox, getChartBox, clickLineAndExpect, clickBoxCenter } from './helpers';

// Reproduces the originally reported bug: three charts stacked directly on
// top of each other, followed by plain text underneath. Each fence's
// spacer height must stack correctly so the text below the third chart is
// still on the line the user actually clicks.
const CHART_A = ['```mermaid', 'graph TD', 'A --> B', '```'];
const CHART_B = ['```mermaid', 'pie title P', '"X" : 1', '"Y" : 2', '```'];
const CHART_C = ['```mermaid', 'classDiagram', 'class Foo', '```'];

function buildDocument() {
  const lines = ['intro text', ...CHART_A, ...CHART_B, ...CHART_C, 'text underneath the stack', 'one more line'];
  return {
    lines,
    introLine: 0,
    chartAStart: 1,
    chartBStart: 1 + CHART_A.length,
    chartCStart: 1 + CHART_A.length + CHART_B.length,
    textUnderneathLine: 1 + CHART_A.length + CHART_B.length + CHART_C.length,
    lastLine: 1 + CHART_A.length + CHART_B.length + CHART_C.length + 1,
  };
}

test.describe('Caret alignment: three stacked charts + text underneath', () => {
  test('clicking text before, between (n/a here), and after three stacked charts reports the correct line', async ({ page }) => {
    const { lines, introLine, chartAStart, chartBStart, chartCStart, textUnderneathLine, lastLine } = buildDocument();

    await createMarkdownDocument(page);
    await setDocumentContent(page, lines.join('\n'));

    const introBox = await getLineBox(page, introLine);
    await clickLineAndExpect(page, introBox, introLine);

    // Sanity-check all three charts actually rendered as thumbnails at the
    // expected fence start lines before trusting positions after them.
    await getChartBox(page, chartAStart);
    await getChartBox(page, chartBStart);
    await getChartBox(page, chartCStart);

    const underneathBox = await getLineBox(page, textUnderneathLine);
    await clickLineAndExpect(page, underneathBox, textUnderneathLine);

    const lastBox = await getLineBox(page, lastLine);
    await clickLineAndExpect(page, lastBox, lastLine);
  });

  test('the caret is never visually rendered inside any of the three stacked chart boxes', async ({ page }) => {
    const { lines, chartAStart, chartBStart, chartCStart } = buildDocument();
    await createMarkdownDocument(page);
    await setDocumentContent(page, lines.join('\n'));

    for (const startLine of [chartAStart, chartBStart, chartCStart]) {
      const chartBox = await getChartBox(page, startLine);
      await clickBoxCenter(page, chartBox);
      // Clicking a chart opens its editor rather than placing a caret
      // inside the chart's box in the main document view.
      await expect(page.getByTestId('chart-editor-popover')).toBeVisible();
      await page.getByTestId('chart-editor-close').click();
      await expect(page.getByTestId('chart-editor-popover')).not.toBeVisible();
    }
  });
});
