import { expect, test } from 'playwright/test';
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const exampleUrl = pathToFileURL(path.resolve('_site/example.html')).href;
const fullPageUrl = pathToFileURL(path.resolve('_site/full-page-check.html')).href;
const screenshotMask = readFileSync('tests/e2e/screenshot-mask.css', 'utf8');

test.beforeEach(async ({ page }) => {
  await page.goto(exampleUrl, { waitUntil: 'load' });
  await page.addStyleTag({ content: screenshotMask });
});

test('protected example source contains no answer metadata or internal sentinels', async () => {
  const html = await readFile('_site/example.html', 'utf8');
  for (const token of ['data-correct=', 'data-answers=', 'data-answer=', 'data-processed', '"answers":', '"correct":']) {
    expect(html).not.toContain(token);
  }
});

test('single and multiple choice check and reset', async ({ page }) => {
  const single = page.locator('[data-testid="mcq-single"]');
  await single.getByText('Boromir').click();
  await single.getByRole('button', { name: 'Check' }).click();
  await expect(single.locator('.quarto-exercise-answer.is-incorrect')).toBeVisible();
  await single.getByRole('button', { name: 'Reset' }).click();
  await single.getByText('Frodo Baggins').click();
  await single.getByRole('button', { name: 'Check' }).click();
  await expect(single.locator('.quarto-exercise-answer.is-correct')).toBeVisible();
  await expect(single).toHaveScreenshot('mcq-correct.png');

  const multiple = page.locator('[data-testid="mcq-multiple"]');
  await multiple.getByText('Frodo Baggins').click();
  await multiple.getByRole('button', { name: 'Check' }).click();
  await expect(multiple.locator('.quarto-exercise-status')).toHaveText('Not quite.');
});

test('inline blank, choose, and code cloze interactions work', async ({ page }) => {
  const blanks = page.locator('.quarto-exercise-blank-container');
  await blanks.nth(0).locator('input').fill('Wrong');
  await blanks.nth(0).getByRole('button', { name: 'Check' }).click();
  await expect(blanks.nth(0).locator('input')).toHaveClass(/is-incorrect/);
  await blanks.nth(0).locator('input').fill('Gandalf');
  await blanks.nth(0).getByRole('button', { name: 'Check' }).click();
  await expect(blanks.nth(0).locator('input')).toHaveClass(/is-correct/);

  const choose = page.locator('.quarto-exercise-choose-container').first();
  await choose.locator('select').selectOption('Mordor');
  await choose.getByRole('button', { name: 'Check' }).click();
  await expect(choose).toHaveClass(/is-correct/);

  const cloze = page.locator('.quarto-exercise-code-cloze-standalone');
  await cloze.locator('select').selectOption('c');
  await cloze.locator('input').fill('sum');
  await cloze.locator('..').getByRole('button', { name: 'Check' }).click();
  await expect(cloze.locator('..').locator('.quarto-exercise-status')).toHaveText('Correct!');
});

test('page-level checking preserves question options and reports a total score', async ({ page }) => {
  await page.goto(fullPageUrl, { waitUntil: 'load' });
  await page.locator('[data-testid="page-ring"]').getByText('Frodo Baggins').click();
  await page.locator('[data-testid="page-fellowship"]').getByText('Frodo Baggins').click();
  await page.locator('[data-testid="page-fellowship"]').getByText('Samwise Gamgee').click();
  await page.locator('[data-testid="page-blank"] .quarto-exercise-blank-input').fill('Gandalf');
  await page.getByRole('button', { name: 'Check Page' }).click();
  await expect(page.locator('.quarto-exercise-page-controls .quarto-exercise-status')).toHaveText('Correct! Score: 6 / 6.');
  await expect(page.locator('.quarto-exercise-check-btn')).toHaveCount(1);
  await expect(page.locator('.quarto-exercise-page-controls')).toHaveScreenshot('page-score-correct.png');
});
