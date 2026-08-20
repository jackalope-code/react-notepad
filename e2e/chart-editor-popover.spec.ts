import { test, expect } from '@playwright/test';
import { createMarkdownDocument, setDocumentContent, getChartBox, clickBoxCenter } from './helpers';

const CHART = ['```mermaid', 'graph TD', 'A --> B', '```'];

test.describe('Chart editor popover interaction', () => {
  test('the Close button commits edits and closes the popover', async ({ page }) => {
    await createMarkdownDocument(page);
    await setDocumentContent(page, CHART.join('\n'));

    const chartBox = await getChartBox(page, 0);
    await clickBoxCenter(page, chartBox);
    const popover = page.getByTestId('chart-editor-popover');
    await expect(popover).toBeVisible();

    const sourceField = popover.locator('textarea').first();
    await sourceField.fill('graph TD\nX --> Y');

    await page.getByTestId('chart-editor-close').click();
    await expect(popover).not.toBeVisible();

    const textarea = page.getByTestId('markdown-overlay-textarea');
    await expect(textarea).toHaveValue(/X --> Y/);
  });

  test('clicking outside the popover (the backdrop) closes it and commits edits', async ({ page }) => {
    await createMarkdownDocument(page);
    await setDocumentContent(page, CHART.join('\n'));

    const chartBox = await getChartBox(page, 0);
    await clickBoxCenter(page, chartBox);
    const popover = page.getByTestId('chart-editor-popover');
    await expect(popover).toBeVisible();

    const sourceField = popover.locator('textarea').first();
    await sourceField.fill('graph TD\nX --> Y');

    // Click far outside the dialog paper, on the backdrop.
    await page.mouse.click(5, 5);
    await expect(popover).not.toBeVisible();

    const textarea = page.getByTestId('markdown-overlay-textarea');
    await expect(textarea).toHaveValue(/X --> Y/);
  });

  test('pressing Escape closes the popover and commits edits', async ({ page }) => {
    await createMarkdownDocument(page);
    await setDocumentContent(page, CHART.join('\n'));

    const chartBox = await getChartBox(page, 0);
    await clickBoxCenter(page, chartBox);
    const popover = page.getByTestId('chart-editor-popover');
    await expect(popover).toBeVisible();

    const sourceField = popover.locator('textarea').first();
    await sourceField.fill('graph TD\nX --> Y');
    await page.keyboard.press('Escape');
    await expect(popover).not.toBeVisible();

    const textarea = page.getByTestId('markdown-overlay-textarea');
    await expect(textarea).toHaveValue(/X --> Y/);
  });
});

test.describe('Insert toolbar toggle icon', () => {
  test('the floating insert button shows + when collapsed and - when expanded', async ({ page }) => {
    await createMarkdownDocument(page);
    const toggle = page.getByRole('button', { name: 'Insert options' });
    const icon = toggle.locator('svg');
    await expect(icon).toHaveAttribute('data-icon', 'plus');
    await toggle.click();
    await expect(icon).toHaveAttribute('data-icon', 'minus');
    await toggle.click();
    await expect(icon).toHaveAttribute('data-icon', 'plus');
  });
});

test.describe('No native spellcheck on the markdown overlay textarea', () => {
  test('the overlay textarea has spellcheck disabled, including when a chart fence is present', async ({ page }) => {
    await createMarkdownDocument(page);
    await setDocumentContent(page, ['some plain paragraph text', ...CHART].join('\n'));

    const textarea = page.getByTestId('markdown-overlay-textarea');
    await expect(textarea).toHaveAttribute('spellcheck', 'false');
  });
});
