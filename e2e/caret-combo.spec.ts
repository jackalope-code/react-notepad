import { test } from '@playwright/test';
import { createMarkdownDocument, setDocumentContent, getLineBox, getChartBox, clickLineAndExpect } from './helpers';

// Combination scenario: a sequence of headings, followed by stacked
// charts, followed by text — the full combination the original bug report
// called out explicitly.
const CHART_1 = ['```mermaid', 'graph TD', 'A --> B', '```'];
const CHART_2 = ['```mermaid', 'pie title P', '"X" : 1', '"Y" : 2', '```'];

test.describe('Caret alignment: headings + stacked charts + text combo', () => {
  test('reports correct line numbers across headings, back-to-back charts, and trailing text', async ({ page }) => {
    const lines = [
      '# Section Heading',
      '## Sub Heading',
      'intro paragraph line',
      ...CHART_1,
      ...CHART_2,
      'paragraph directly under the charts',
      '### Another Heading',
      'final paragraph line',
    ];

    const headingLine = 0;
    const subHeadingLine = 1;
    const introLine = 2;
    const chart1Start = 3;
    const chart2Start = 3 + CHART_1.length;
    const underneathLine = 3 + CHART_1.length + CHART_2.length;
    const anotherHeadingLine = underneathLine + 1;
    const finalLine = anotherHeadingLine + 1;

    await createMarkdownDocument(page);
    await setDocumentContent(page, lines.join('\n'));

    for (const line of [headingLine, subHeadingLine, introLine]) {
      const box = await getLineBox(page, line);
      await clickLineAndExpect(page, box, line);
    }

    await getChartBox(page, chart1Start);
    await getChartBox(page, chart2Start);

    for (const line of [underneathLine, anotherHeadingLine, finalLine]) {
      const box = await getLineBox(page, line);
      await clickLineAndExpect(page, box, line);
    }
  });
});
