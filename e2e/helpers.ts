import { expect, type Page } from '@playwright/test';

// Fixed line height shared by the overlay and the real textarea in
// MarkdownOverlayNotepad (see SHARED_FONT_CSS in src/MarkdownOverlayNotepad.tsx).
// Kept here only as a documented fallback — tests should prefer measuring
// real element bounding boxes (getLineBox/getChartBox below) over doing
// pixel math with this constant directly.
export const LINE_HEIGHT_PX = 20;

/**
 * Opens the app and creates a brand-new markdown-enabled document via the
 * real UI (New document -> title ending in .md -> Create), matching how a
 * real user would get into MarkdownOverlayNotepad. Each Playwright test
 * gets an isolated browser context, so this always starts from the app's
 * default single blank document.
 */
export async function createMarkdownDocument(page: Page, title = 'e2e-test.md') {
  await page.goto('./');
  await page.getByLabel('New document').click();
  const titleInput = page.getByRole('textbox', { name: 'Title' });
  await titleInput.fill(title);
  await page.getByRole('button', { name: 'Create' }).click();
  // The new tab becomes active and MarkdownOverlayNotepad mounts.
  const textarea = page.getByTestId('markdown-overlay-textarea');
  await textarea.waitFor({ state: 'visible' });
  return textarea;
}

/** Types content into the overlay textarea by setting its full value at once
 * (mirrors how MarkdownOverlayNotepad's controlled `onChange` handles a
 * full-value replace) and waits for the overlay to re-render. */
export async function setDocumentContent(page: Page, content: string) {
  const textarea = page.getByTestId('markdown-overlay-textarea');
  await textarea.fill(content);
  return textarea;
}

/** Bounding box (in page/viewport coordinates) of the rendered overlay row
 * for a given zero-based source line number. Only works for lines that are
 * NOT inside a chart fence (those have no 'overlay-line'; use getChartBox). */
export async function getLineBox(page: Page, lineNumber: number) {
  const row = page.locator(`[data-testid="overlay-line"][data-line="${lineNumber}"]`);
  await row.waitFor({ state: 'visible' });
  const box = await row.boundingBox();
  if (!box) throw new Error(`overlay-line ${lineNumber} has no bounding box`);
  return box;
}

/** Bounding box of the chart thumbnail whose fence starts at the given
 * zero-based source line number. */
export async function getChartBox(page: Page, fenceStartLine: number) {
  const chart = page.locator(`[data-testid="chart-thumbnail"][data-line-start="${fenceStartLine}"]`);
  await chart.waitFor({ state: 'visible' });
  // Wait out mermaid's async render (the thumbnail shows a 'Rendering…'
  // placeholder until then) before reporting a bounding box to click on.
  await expect(chart).not.toContainText('Rendering…');
  const box = await chart.boundingBox();
  if (!box) throw new Error(`chart-thumbnail at line ${fenceStartLine} has no bounding box`);
  return box;
}

/** Clicks the vertical/horizontal center of a bounding box via real mouse
 * coordinates (real hit-testing, unlike fireEvent.click in jsdom tests). */
export async function clickBoxCenter(page: Page, box: { x: number; y: number; width: number; height: number }) {
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}

/**
 * Clicks the center of `box` and asserts (with Playwright's normal
 * auto-retrying `expect`) that the status bar reports the given 0-based
 * line number shortly after. Using a retrying assertion here — rather than
 * a single synchronous read right after the click — matters: the click's
 * `selectionchange`/React state update is not guaranteed to have committed
 * by the very next microtask, and a one-shot read can observe a stale
 * value left over from a previous click.
 */
export async function clickLineAndExpect(
  page: Page,
  box: { x: number; y: number; width: number; height: number },
  expectedLine: number,
) {
  await clickBoxCenter(page, box);
  const statusBar = page.getByTestId('markdown-overlay-status-bar');
  await expect(statusBar).toHaveText(new RegExp(`^Line ${expectedLine + 1}, Col \\d+$`));
}
