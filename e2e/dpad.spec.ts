import { test, expect, type Page } from '@playwright/test';
import { createMarkdownDocument, setDocumentContent, getLineBox } from './helpers';

const LONG_LINE = 'a'.repeat(100);
const SHORT_LINE = 'short';
const CARET_CONTENT = [SHORT_LINE, 'a much longer line of text here', 'tiny'].join('\n');
const MANY_LINES = Array.from({ length: 80 }, (_, i) => `line-${i}`).join('\n');

async function createDocument(page: Page, title: string) {
  await page.getByRole('button', { name: 'New document' }).click({ force: true });
  await page.getByRole('textbox', { name: 'Title' }).fill(title);
  await page.getByRole('button', { name: 'Create' }).click();
}

async function placeCaretAtEndOfLine(page: Page, line: number) {
  const textarea = page.getByTestId('markdown-overlay-textarea');
  const tbox = await textarea.boundingBox();
  if (!tbox) throw new Error('textarea has no bounding box');
  const box = await getLineBox(page, line);
  // Click near the right edge of the row so the caret lands at the end of that line.
  // Using the textarea locator ensures the element is focused and onClick fires.
  const x = tbox.width - 4;
  const y = box.y + box.height / 2 - tbox.y;
  await textarea.click({ position: { x, y } });
}

test.describe('Scroll d-pad (mobile / touch)', () => {
  test.use({
    hasTouch: true,
    isMobile: true,
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
  });

  test('scroll d-pad appears for vertical overflow and down scrolls the virtual container', async ({ page }) => {
    await createMarkdownDocument(page);
    await setDocumentContent(page, MANY_LINES);

    const dpad = page.getByTestId('dpad-scroll');
    await expect(dpad).toBeVisible();

    const container = page.getByTestId('virtual-scroll-container');
    const before = await container.evaluate((el) => el.scrollTop);
    expect(before).toBe(0);

    await page.getByTestId('dpad-scroll-down').click();
    const after = await container.evaluate((el) => el.scrollTop);
    expect(after).toBeGreaterThan(0);
  });

  test('scroll d-pad left/right scrolls the textarea horizontally when wrapping is off', async ({ page }) => {
    await createMarkdownDocument(page);
    await page.getByLabel('Wrap text').uncheck();
    await setDocumentContent(page, LONG_LINE);

    const dpad = page.getByTestId('dpad-scroll');
    await expect(dpad).toBeVisible();

    const textarea = page.getByTestId('markdown-overlay-textarea');
    await textarea.evaluate((el) => {
      const t = el as HTMLTextAreaElement;
      t.selectionStart = 0;
      t.selectionEnd = 0;
      t.scrollLeft = 0;
    });
    const before = await textarea.evaluate((el) => (el as HTMLTextAreaElement).scrollLeft);
    expect(before).toBe(0);

    await page.getByTestId('dpad-scroll-right').click();
    const afterRight = await textarea.evaluate((el) => (el as HTMLTextAreaElement).scrollLeft);
    expect(afterRight).toBeGreaterThan(0);

    await page.getByTestId('dpad-scroll-left').click();
    const afterLeft = await textarea.evaluate((el) => (el as HTMLTextAreaElement).scrollLeft);
    expect(afterLeft).toBeLessThan(afterRight);
  });

  test('scroll d-pad hides horizontal buttons when there is no horizontal overflow', async ({ page }) => {
    await createMarkdownDocument(page);
    await setDocumentContent(page, MANY_LINES);

    const dpad = page.getByTestId('dpad-scroll');
    await expect(dpad).toBeVisible();

    await expect(page.getByTestId('dpad-scroll-up')).toBeVisible();
    await expect(page.getByTestId('dpad-scroll-down')).toBeVisible();
    await expect(page.getByTestId('dpad-scroll-left')).toHaveCount(0);
    await expect(page.getByTestId('dpad-scroll-right')).toHaveCount(0);
  });
});

test.describe('Caret d-pad (mobile / touch)', () => {
  test.use({
    hasTouch: true,
    isMobile: true,
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
  });

  test('caret d-pad appears and moves the caret up and down while preserving the desired column', async ({ page }) => {
    await createMarkdownDocument(page);
    await setDocumentContent(page, CARET_CONTENT);

    const dpad = page.getByTestId('dpad-caret');
    await expect(dpad).toBeVisible();

    const statusBar = page.getByTestId('markdown-overlay-status-bar');

    // Place the caret at the end of the longest middle line (1-based line 2, col 32).
    await placeCaretAtEndOfLine(page, 1);
    await expect(statusBar).toHaveText(/^Line 2, Col 32$/);

    // Up should clamp to the shorter first line (1-based line 1, col 6).
    await page.getByTestId('dpad-caret-up').evaluate((el) => (el as HTMLButtonElement).click());
    await expect(statusBar).toHaveText(/^Line 1, Col 6$/);

    // Down should restore the desired column on the longer line (1-based line 2, col 32).
    await page.getByTestId('dpad-caret-down').evaluate((el) => (el as HTMLButtonElement).click());
    await expect(statusBar).toHaveText(/^Line 2, Col 32$/);
  });

  test('caret d-pad left/right moves across and between lines', async ({ page }) => {
    await createMarkdownDocument(page);
    await setDocumentContent(page, CARET_CONTENT);

    const dpad = page.getByTestId('dpad-caret');
    await expect(dpad).toBeVisible();

    const statusBar = page.getByTestId('markdown-overlay-status-bar');

    // Place caret at the end of the first line.
    await placeCaretAtEndOfLine(page, 0);
    await expect(statusBar).toHaveText(/^Line 1, Col 6$/);

    // Right moves to the start of the next line.
    await page.getByTestId('dpad-caret-right').evaluate((el) => (el as HTMLButtonElement).click());
    await expect(statusBar).toHaveText(/^Line 2, Col 1$/);

    // Left moves back to the end of the previous line.
    await page.getByTestId('dpad-caret-left').evaluate((el) => (el as HTMLButtonElement).click());
    await expect(statusBar).toHaveText(/^Line 1, Col 6$/);
  });
});

test.describe('D-pad visibility (desktop / mouse)', () => {
  test.use({
    hasTouch: false,
    isMobile: false,
    viewport: { width: 1280, height: 720 },
  });

  test('no caret or scroll d-pad is rendered even when content overflows', async ({ page }) => {
    await createMarkdownDocument(page);
    await page.getByLabel('Wrap text').uncheck();
    await setDocumentContent(page, MANY_LINES + '\n' + LONG_LINE);

    await expect(page.getByTestId('dpad-caret')).toHaveCount(0);
    await expect(page.getByTestId('dpad-scroll')).toHaveCount(0);
  });
});

test.describe('Tab overflow arrows (mobile / touch)', () => {
  test.use({
    hasTouch: true,
    isMobile: true,
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
  });

  test('tab bar shows left/right arrows when tabs overflow and right arrow scrolls the tab list', async ({ page }) => {
    await page.goto('./');
    await page.getByTestId('tab-list').waitFor();

    for (let i = 0; i < 5; i++) {
      await createDocument(page, `t${i}`);
    }

    const rightArrow = page.getByTestId('tab-scroll-right');
    await expect(rightArrow).toBeVisible();

    const tabList = page.getByTestId('tab-list');
    const before = await tabList.evaluate((el) => el.scrollLeft);

    await rightArrow.click();
    const after = await tabList.evaluate((el) => el.scrollLeft);
    expect(after).toBeGreaterThan(before);
  });
});
