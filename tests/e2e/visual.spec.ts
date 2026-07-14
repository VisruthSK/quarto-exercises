/**
 * visual.spec.ts — Comprehensive visual-regression & interaction suite
 *
 * Covers every exercise type in every meaningful state:
 *   - MCQ: single, multi, feedback, hint, explanation, reveal, lock, question-box, instant
 *   - Inline blank: exact, multi-answer, regex
 *   - Inline choose: correct/incorrect/reset
 *   - Code cloze: standalone, inside exercise
 *   - Check-batch: idle, scored, partial, reset
 *   - Mixed exercise (blank + choose together)
 *   - Page-level controller: idle, perfect, partial, zero, reset
 *   - Full-page smoke tests (initial load + post-interaction)
 *
 * Snapshot tolerance is set globally in playwright.config.ts (maxDiffPixelRatio: 0.05).
 *
 * Generate baselines:  pnpm run test:e2e:update
 * Validate on CI:      pnpm run test:e2e
 */

import { expect, test } from 'playwright/test';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const fixturesUrl  = pathToFileURL(path.resolve('tests/e2e/fixtures.html')).href;
const fullPageUrl  = pathToFileURL(path.resolve('_site/full-page-check.html')).href;
const exampleUrl   = pathToFileURL(path.resolve('_site/example.html')).href;
const screenshotMask = readFileSync('tests/e2e/screenshot-mask.css', 'utf8');

// ── helpers ──────────────────────────────────────────────────────────────────

async function goto(page: any, url: string) {
  await page.goto(url, { waitUntil: 'load' });
  await page.addStyleTag({ content: screenshotMask });
}

/** Locate an exercise by data-testid. */
const ex = (page: any, testid: string) =>
  page.locator(`[data-testid="${testid}"]`);

/**
 * Click an MCQ answer choice by its visible text WITHOUT being tripped up
 * by hidden feedback/explanation elements that share the same words.
 * Targets only the answer-content child, which contains the display text.
 */
const clickAnswer = (exercise: any, text: string) =>
  exercise
    .locator('.quarto-exercise-answer-content')
    .filter({ hasText: new RegExp(`^\\s*${escapeRegex(text)}\\s*$`) })
    .click();

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Locate the standalone code-cloze wrapper (contains the cloze block + Check/Reset).
 * Uses the stable `.quarto-exercise-code-cloze-wrapper` class rather than
 * walking up the DOM from an inner element.
 */
const clozeStandalone = (page: any) =>
  page.locator('.quarto-exercise-code-cloze-wrapper').first();

// ═══════════════════════════════════════════════════════════════════════════
// MCQ – SINGLE CHOICE
// ═══════════════════════════════════════════════════════════════════════════

test.describe('MCQ single-choice', () => {
  test.beforeEach(async ({ page }) => { await goto(page, fixturesUrl); });

  test('idle – no selection', async ({ page }) => {
    await expect(ex(page, 'mcq-basic-single')).toHaveScreenshot('mcq-single-idle.png');
  });

  test('one answer selected (not yet checked)', async ({ page }) => {
    await clickAnswer(ex(page, 'mcq-basic-single'), 'Boromir');
    await expect(ex(page, 'mcq-basic-single')).toHaveScreenshot('mcq-single-selected.png');
  });

  test('incorrect answer → is-incorrect class + Not quite.', async ({ page }) => {
    const e = ex(page, 'mcq-basic-single');
    await clickAnswer(e, 'Boromir');
    await e.getByRole('button', { name: 'Check' }).click();
    await expect(e.locator('.quarto-exercise-status')).toHaveText('Not quite.');
    await expect(e.locator('.quarto-exercise-answer.is-incorrect')).toBeVisible();
    await expect(e).toHaveScreenshot('mcq-single-incorrect.png');
  });

  test('correct answer → is-correct class + Correct!', async ({ page }) => {
    const e = ex(page, 'mcq-basic-single');
    await clickAnswer(e, 'Frodo Baggins');
    await e.getByRole('button', { name: 'Check' }).click();
    await expect(e.locator('.quarto-exercise-status')).toHaveText('Correct!');
    await expect(e.locator('.quarto-exercise-answer.is-correct')).toBeVisible();
    await expect(e).toHaveScreenshot('mcq-single-correct.png');
  });

  test('reset clears selection, classes, and status', async ({ page }) => {
    const e = ex(page, 'mcq-basic-single');
    await clickAnswer(e, 'Frodo Baggins');
    await e.getByRole('button', { name: 'Check' }).click();
    await e.getByRole('button', { name: 'Reset' }).click();
    await expect(e.locator('.is-correct, .is-incorrect')).toHaveCount(0);
    await expect(e.locator('.quarto-exercise-status')).toHaveText('');
    await expect(e).toHaveScreenshot('mcq-single-reset.png');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// MCQ – MULTIPLE CHOICE (checkbox)
// ═══════════════════════════════════════════════════════════════════════════

test.describe('MCQ multiple-choice', () => {
  test.beforeEach(async ({ page }) => { await goto(page, fixturesUrl); });

  test('idle – no selection', async ({ page }) => {
    await expect(ex(page, 'mcq-basic-multi')).toHaveScreenshot('mcq-multi-idle.png');
  });

  test('partial selection (missing one correct) → Not quite.', async ({ page }) => {
    const e = ex(page, 'mcq-basic-multi');
    await clickAnswer(e, 'Frodo Baggins');
    await e.getByRole('button', { name: 'Check' }).click();
    await expect(e.locator('.quarto-exercise-status')).toHaveText('Not quite.');
    await expect(e).toHaveScreenshot('mcq-multi-partial.png');
  });

  test('wrong answer selected → is-incorrect on that answer', async ({ page }) => {
    const e = ex(page, 'mcq-basic-multi');
    await clickAnswer(e, 'Legolas Greenleaf');
    await e.getByRole('button', { name: 'Check' }).click();
    await expect(e.locator('.quarto-exercise-answer.is-incorrect')).toBeVisible();
    await expect(e).toHaveScreenshot('mcq-multi-wrong-selected.png');
  });

  test('all correct answers selected → Correct!', async ({ page }) => {
    const e = ex(page, 'mcq-basic-multi');
    await clickAnswer(e, 'Frodo Baggins');
    await clickAnswer(e, 'Samwise Gamgee');
    await clickAnswer(e, 'Meriadoc Brandybuck');
    await e.getByRole('button', { name: 'Check' }).click();
    await expect(e.locator('.quarto-exercise-status')).toHaveText('Correct!');
    await expect(e).toHaveScreenshot('mcq-multi-correct.png');
  });

  test('reset clears all states', async ({ page }) => {
    const e = ex(page, 'mcq-basic-multi');
    await clickAnswer(e, 'Frodo Baggins');
    await e.getByRole('button', { name: 'Check' }).click();
    await e.getByRole('button', { name: 'Reset' }).click();
    await expect(e.locator('.is-correct, .is-incorrect, .is-selected')).toHaveCount(0);
    await expect(e).toHaveScreenshot('mcq-multi-reset.png');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// MCQ – PER-ANSWER FEEDBACK
// ═══════════════════════════════════════════════════════════════════════════

test.describe('MCQ per-answer feedback', () => {
  test.beforeEach(async ({ page }) => { await goto(page, fixturesUrl); });

  test('correct answer shows its feedback message', async ({ page }) => {
    const e = ex(page, 'mcq-with-feedback');
    const answer = e.locator('.quarto-exercise-answer').filter({ hasText: 'Gandalf' });
    await answer.locator('.quarto-exercise-input').click();
    await e.getByRole('button', { name: 'Check' }).click();
    await expect(e.locator('.quarto-exercise-status')).toHaveText('Correct!');
    await expect(answer.locator('.quarto-exercise-feedback')).toBeVisible();
    await expect(e).toHaveScreenshot('mcq-feedback-correct.png');
  });

  test('incorrect answer shows its feedback message', async ({ page }) => {
    const e = ex(page, 'mcq-with-feedback');
    const answer = e.locator('.quarto-exercise-answer').filter({ hasText: 'Saruman' });
    await answer.locator('.quarto-exercise-input').click();
    await e.getByRole('button', { name: 'Check' }).click();
    await expect(e.locator('.quarto-exercise-status')).toHaveText('Not quite.');
    await expect(answer.locator('.quarto-exercise-feedback')).toBeVisible();
    await expect(e).toHaveScreenshot('mcq-feedback-incorrect.png');
  });

  test('reset hides feedback', async ({ page }) => {
    const e = ex(page, 'mcq-with-feedback');
    await e.locator('.quarto-exercise-answer').filter({ hasText: 'Saruman' }).locator('.quarto-exercise-input').click();
    await e.getByRole('button', { name: 'Check' }).click();
    await e.getByRole('button', { name: 'Reset' }).click();
    await expect(e.locator('.quarto-exercise-feedback:not([hidden])')).toHaveCount(0);
    await expect(e).toHaveScreenshot('mcq-feedback-reset.png');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// MCQ – HINT PANEL
// ═══════════════════════════════════════════════════════════════════════════

test.describe('MCQ hint panel', () => {
  test.beforeEach(async ({ page }) => { await goto(page, fixturesUrl); });

  test('hint hidden initially', async ({ page }) => {
    const e = ex(page, 'mcq-with-hint');
    await expect(e.locator('.quarto-exercise-hint')).toBeHidden();
    await expect(e).toHaveScreenshot('mcq-hint-hidden.png');
  });

  test('hint visible after clicking Hint button', async ({ page }) => {
    const e = ex(page, 'mcq-with-hint');
    await e.getByRole('button', { name: 'Hint' }).click();
    await expect(e.locator('.quarto-exercise-hint')).toBeVisible();
    await expect(e).toHaveScreenshot('mcq-hint-open.png');
  });

  test('hint toggles back to hidden', async ({ page }) => {
    const e = ex(page, 'mcq-with-hint');
    await e.getByRole('button', { name: 'Hint' }).click();
    await e.getByRole('button', { name: 'Hint' }).click();
    await expect(e.locator('.quarto-exercise-hint')).toBeHidden();
  });

  test('reset hides open hint', async ({ page }) => {
    const e = ex(page, 'mcq-with-hint');
    await e.getByRole('button', { name: 'Hint' }).click();
    await expect(e.locator('.quarto-exercise-hint')).toBeVisible();
    await e.getByRole('button', { name: 'Reset' }).click();
    await expect(e.locator('.quarto-exercise-hint')).toBeHidden();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// MCQ – EXPLANATION (shows after correct)
// ═══════════════════════════════════════════════════════════════════════════

test.describe('MCQ explanation', () => {
  test.beforeEach(async ({ page }) => { await goto(page, fixturesUrl); });

  test('explanation hidden before check', async ({ page }) => {
    const e = ex(page, 'mcq-with-explanation');
    await expect(e.locator('.quarto-exercise-explanation')).toBeHidden();
  });

  test('explanation hidden after incorrect check', async ({ page }) => {
    const e = ex(page, 'mcq-with-explanation');
    await clickAnswer(e, 'Aragorn');
    await e.getByRole('button', { name: 'Check' }).click();
    await expect(e.locator('.quarto-exercise-explanation')).toBeHidden();
    await expect(e).toHaveScreenshot('mcq-explanation-incorrect.png');
  });

  test('explanation visible after correct check', async ({ page }) => {
    const e = ex(page, 'mcq-with-explanation');
    await clickAnswer(e, 'Frodo (via Gollum)');
    await e.getByRole('button', { name: 'Check' }).click();
    await expect(e.locator('.quarto-exercise-explanation')).toBeVisible();
    await expect(e).toHaveScreenshot('mcq-explanation-correct.png');
  });

  test('reset hides explanation again', async ({ page }) => {
    const e = ex(page, 'mcq-with-explanation');
    await clickAnswer(e, 'Frodo (via Gollum)');
    await e.getByRole('button', { name: 'Check' }).click();
    await e.getByRole('button', { name: 'Reset' }).click();
    await expect(e.locator('.quarto-exercise-explanation')).toBeHidden();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// MCQ – REVEAL CORRECT ANSWERS
// ═══════════════════════════════════════════════════════════════════════════

test.describe('MCQ with reveal=true', () => {
  test.beforeEach(async ({ page }) => { await goto(page, fixturesUrl); });

  test('incorrect check reveals the correct answer highlighted', async ({ page }) => {
    const e = ex(page, 'mcq-with-reveal');
    await clickAnswer(e, 'Denethor');
    await e.getByRole('button', { name: 'Check' }).click();
    await expect(e.locator('.quarto-exercise-answer.is-correct')).toBeVisible();
    await expect(e).toHaveScreenshot('mcq-reveal-incorrect.png');
  });

  test('correct check shows correct answer highlighted', async ({ page }) => {
    const e = ex(page, 'mcq-with-reveal');
    await clickAnswer(e, 'Théoden');
    await e.getByRole('button', { name: 'Check' }).click();
    await expect(e.locator('.quarto-exercise-status')).toHaveText('Correct!');
    await expect(e).toHaveScreenshot('mcq-reveal-correct.png');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// MCQ – LOCK AFTER CORRECT
// ═══════════════════════════════════════════════════════════════════════════

test.describe('MCQ with lock=true', () => {
  test.beforeEach(async ({ page }) => { await goto(page, fixturesUrl); });

  test('buttons disabled and inputs disabled after correct answer', async ({ page }) => {
    const e = ex(page, 'mcq-with-lock');
    await clickAnswer(e, 'An axe');
    await e.getByRole('button', { name: 'Check' }).click();
    await expect(e.locator('.quarto-exercise-check-btn')).toBeDisabled();
    await expect(e.locator('.quarto-exercise-reset-btn')).toBeDisabled();
    await expect(e.locator('.quarto-exercise-input').first()).toBeDisabled();
    await expect(e).toHaveScreenshot('mcq-lock-locked.png');
  });

  test('incorrect answer does NOT lock', async ({ page }) => {
    const e = ex(page, 'mcq-with-lock');
    await clickAnswer(e, 'A bow');
    await e.getByRole('button', { name: 'Check' }).click();
    await expect(e.locator('.quarto-exercise-check-btn')).not.toBeDisabled();
    await expect(e).toHaveScreenshot('mcq-lock-unlocked-incorrect.png');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// MCQ – QUESTION BOX
// ═══════════════════════════════════════════════════════════════════════════

test.describe('MCQ question-boxes', () => {
  test.beforeEach(async ({ page }) => { await goto(page, fixturesUrl); });

  test('exercise has quarto-exercise-boxed class', async ({ page }) => {
    const e = ex(page, 'mcq-question-box');
    await expect(e).toHaveClass(/quarto-exercise-boxed/);
    await expect(e).toHaveScreenshot('mcq-question-box.png');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// MCQ – INSTANT MODE
// ═══════════════════════════════════════════════════════════════════════════

test.describe('MCQ instant mode', () => {
  test.beforeEach(async ({ page }) => { await goto(page, fixturesUrl); });

  test('correct answer is immediately marked correct on click (no Check button)', async ({ page }) => {
    const e = ex(page, 'mcq-instant');
    await expect(e.locator('.quarto-exercise-check-btn')).toHaveCount(0);
    await clickAnswer(e, 'Rivendell');
    await expect(e.locator('.quarto-exercise-answer.is-correct')).toBeVisible();
    await expect(e.locator('.quarto-exercise-status')).toHaveText('Correct!');
    await expect(e).toHaveScreenshot('mcq-instant-correct.png');
  });

  test('wrong answer is immediately marked incorrect on click', async ({ page }) => {
    const e = ex(page, 'mcq-instant');
    await clickAnswer(e, 'Lothlórien');
    await expect(e.locator('.quarto-exercise-answer.is-incorrect')).toBeVisible();
    await expect(e.locator('.quarto-exercise-status')).toHaveText('Not quite.');
    await expect(e).toHaveScreenshot('mcq-instant-incorrect.png');
  });

  test('reset clears instant state', async ({ page }) => {
    const e = ex(page, 'mcq-instant');
    await clickAnswer(e, 'Rivendell');
    await e.getByRole('button', { name: 'Reset' }).click();
    await expect(e.locator('.is-correct, .is-incorrect')).toHaveCount(0);
    await expect(e.locator('.quarto-exercise-status')).toHaveText('');
    await expect(e).toHaveScreenshot('mcq-instant-reset.png');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// INLINE BLANK – INSIDE EXERCISE WRAPPER
// ═══════════════════════════════════════════════════════════════════════════

test.describe('Inline blank (exercise-wrapped)', () => {
  test.beforeEach(async ({ page }) => { await goto(page, fixturesUrl); });

  test('idle blank', async ({ page }) => {
    await expect(ex(page, 'blank-exercise')).toHaveScreenshot('blank-exercise-idle.png');
  });

  test('wrong answer → is-incorrect on input', async ({ page }) => {
    const e = ex(page, 'blank-exercise');
    await e.locator('.quarto-exercise-blank-input').fill('Saruman');
    await e.getByRole('button', { name: 'Check' }).click();
    await expect(e.locator('.quarto-exercise-blank-input')).toHaveClass(/is-incorrect/);
    await expect(e.locator('.quarto-exercise-status')).toHaveText('Not quite.');
    await expect(e).toHaveScreenshot('blank-exercise-incorrect.png');
  });

  test('correct answer → is-correct on input', async ({ page }) => {
    const e = ex(page, 'blank-exercise');
    await e.locator('.quarto-exercise-blank-input').fill('Gandalf');
    await e.getByRole('button', { name: 'Check' }).click();
    await expect(e.locator('.quarto-exercise-blank-input')).toHaveClass(/is-correct/);
    await expect(e.locator('.quarto-exercise-status')).toHaveText('Correct!');
    await expect(e).toHaveScreenshot('blank-exercise-correct.png');
  });

  test('reset clears input value and classes', async ({ page }) => {
    const e = ex(page, 'blank-exercise');
    await e.locator('.quarto-exercise-blank-input').fill('Gandalf');
    await e.getByRole('button', { name: 'Check' }).click();
    await e.getByRole('button', { name: 'Reset' }).click();
    await expect(e.locator('.quarto-exercise-blank-input')).toHaveValue('');
    await expect(e.locator('.quarto-exercise-blank-input')).not.toHaveClass(/is-correct/);
    await expect(e.locator('.quarto-exercise-blank-input')).not.toHaveClass(/is-incorrect/);
    await expect(e).toHaveScreenshot('blank-exercise-reset.png');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// INLINE BLANK – MULTI-ANSWER (case-insensitive)
// ═══════════════════════════════════════════════════════════════════════════

test.describe('Inline blank multi-answer', () => {
  test.beforeEach(async ({ page }) => { await goto(page, fixturesUrl); });

  test('alternative spelling accepted (case-insensitive)', async ({ page }) => {
    const e = ex(page, 'blank-multi-answer');
    await e.locator('.quarto-exercise-blank-input').fill('frodo baggins');
    await e.getByRole('button', { name: 'Check' }).click();
    await expect(e.locator('.quarto-exercise-blank-input')).toHaveClass(/is-correct/);
    await expect(e).toHaveScreenshot('blank-multi-correct-alt.png');
  });

  test('wrong answer still fails', async ({ page }) => {
    const e = ex(page, 'blank-multi-answer');
    await e.locator('.quarto-exercise-blank-input').fill('Boromir');
    await e.getByRole('button', { name: 'Check' }).click();
    await expect(e.locator('.quarto-exercise-blank-input')).toHaveClass(/is-incorrect/);
    await expect(e).toHaveScreenshot('blank-multi-incorrect.png');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// INLINE BLANK – REGEX MATCH
// ═══════════════════════════════════════════════════════════════════════════

test.describe('Inline blank regex match', () => {
  test.beforeEach(async ({ page }) => { await goto(page, fixturesUrl); });

  test('regex-matching answer accepted', async ({ page }) => {
    const e = ex(page, 'blank-regex');
    await e.locator('.quarto-exercise-blank-input').fill('mount doom');
    await e.getByRole('button', { name: 'Check' }).click();
    await expect(e.locator('.quarto-exercise-blank-input')).toHaveClass(/is-correct/);
    await expect(e).toHaveScreenshot('blank-regex-correct.png');
  });

  test('answer not matching regex fails', async ({ page }) => {
    const e = ex(page, 'blank-regex');
    await e.locator('.quarto-exercise-blank-input').fill('Mordor');
    await e.getByRole('button', { name: 'Check' }).click();
    await expect(e.locator('.quarto-exercise-blank-input')).toHaveClass(/is-incorrect/);
    await expect(e).toHaveScreenshot('blank-regex-incorrect.png');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// INLINE CHOOSE – INSIDE EXERCISE WRAPPER
// ═══════════════════════════════════════════════════════════════════════════

test.describe('Inline choose (exercise-wrapped)', () => {
  test.beforeEach(async ({ page }) => { await goto(page, fixturesUrl); });

  test('idle state', async ({ page }) => {
    await expect(ex(page, 'choose-exercise')).toHaveScreenshot('choose-exercise-idle.png');
  });

  test('wrong option → is-incorrect', async ({ page }) => {
    const e = ex(page, 'choose-exercise');
    await e.locator('.quarto-exercise-choose-select').selectOption('Gondor');
    await e.getByRole('button', { name: 'Check' }).click();
    await expect(e.locator('.quarto-exercise-choose-select')).toHaveClass(/is-incorrect/);
    await expect(e.locator('.quarto-exercise-status')).toHaveText('Not quite.');
    await expect(e).toHaveScreenshot('choose-exercise-incorrect.png');
  });

  test('correct option → is-correct', async ({ page }) => {
    const e = ex(page, 'choose-exercise');
    await e.locator('.quarto-exercise-choose-select').selectOption('Mordor');
    await e.getByRole('button', { name: 'Check' }).click();
    await expect(e.locator('.quarto-exercise-choose-select')).toHaveClass(/is-correct/);
    await expect(e.locator('.quarto-exercise-status')).toHaveText('Correct!');
    await expect(e).toHaveScreenshot('choose-exercise-correct.png');
  });

  test('reset clears selection and classes', async ({ page }) => {
    const e = ex(page, 'choose-exercise');
    await e.locator('.quarto-exercise-choose-select').selectOption('Mordor');
    await e.getByRole('button', { name: 'Check' }).click();
    await e.getByRole('button', { name: 'Reset' }).click();
    await expect(e.locator('.quarto-exercise-choose-select')).toHaveValue('');
    await expect(e.locator('.quarto-exercise-choose-select')).not.toHaveClass(/is-correct/);
    await expect(e).toHaveScreenshot('choose-exercise-reset.png');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// CODE CLOZE – STANDALONE
// ═══════════════════════════════════════════════════════════════════════════

test.describe('Code cloze standalone', () => {
  test.beforeEach(async ({ page }) => { await goto(page, fixturesUrl); });

  test('idle – shows selects and inputs in code block', async ({ page }) => {
    await expect(clozeStandalone(page)).toHaveScreenshot('cloze-standalone-idle.png');
  });

  test('correct answers → Correct! status', async ({ page }) => {
    const cloze = page.locator('.quarto-exercise-code-cloze-standalone').first();
    await cloze.locator('select').selectOption('c');
    await cloze.locator('input').fill('sum');
    await clozeStandalone(page).getByRole('button', { name: 'Check' }).click();
    await expect(clozeStandalone(page).locator('.quarto-exercise-status')).toHaveText('Correct!');
    await expect(clozeStandalone(page)).toHaveScreenshot('cloze-standalone-correct.png');
  });

  test('wrong answers → Incorrect status', async ({ page }) => {
    const cloze = page.locator('.quarto-exercise-code-cloze-standalone').first();
    await cloze.locator('select').selectOption('list');
    await cloze.locator('input').fill('wrong');
    await clozeStandalone(page).getByRole('button', { name: 'Check' }).click();
    await expect(clozeStandalone(page).locator('.quarto-exercise-status')).toContainText('Incorrect');
    await expect(clozeStandalone(page)).toHaveScreenshot('cloze-standalone-incorrect.png');
  });

  test('reset clears inputs and status', async ({ page }) => {
    const cloze = page.locator('.quarto-exercise-code-cloze-standalone').first();
    await cloze.locator('select').selectOption('c');
    await cloze.locator('input').fill('sum');
    await clozeStandalone(page).getByRole('button', { name: 'Check' }).click();
    await clozeStandalone(page).getByRole('button', { name: 'Reset' }).click();
    await expect(clozeStandalone(page).locator('.quarto-exercise-status')).toHaveText('');
    await expect(clozeStandalone(page)).toHaveScreenshot('cloze-standalone-reset.png');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// CODE CLOZE – INSIDE EXERCISE WRAPPER
// ═══════════════════════════════════════════════════════════════════════════

test.describe('Code cloze in exercise', () => {
  test.beforeEach(async ({ page }) => { await goto(page, fixturesUrl); });

  test('idle', async ({ page }) => {
    await expect(ex(page, 'cloze-exercise')).toHaveScreenshot('cloze-exercise-idle.png');
  });

  test('correct answers → Correct!', async ({ page }) => {
    const e = ex(page, 'cloze-exercise');
    await e.locator('select').selectOption('sum');
    await e.locator('input').fill('total');
    await e.getByRole('button', { name: 'Check' }).click();
    await expect(e.locator('.quarto-exercise-status')).toHaveText('Correct!');
    await expect(e).toHaveScreenshot('cloze-exercise-correct.png');
  });

  test('wrong answers → Not quite.', async ({ page }) => {
    const e = ex(page, 'cloze-exercise');
    await e.locator('select').selectOption('max');
    await e.locator('input').fill('wrong');
    await e.getByRole('button', { name: 'Check' }).click();
    await expect(e.locator('.quarto-exercise-status')).toHaveText('Not quite.');
    await expect(e).toHaveScreenshot('cloze-exercise-incorrect.png');
  });

  test('reset clears all cloze inputs', async ({ page }) => {
    const e = ex(page, 'cloze-exercise');
    await e.locator('select').selectOption('sum');
    await e.locator('input').fill('total');
    await e.getByRole('button', { name: 'Check' }).click();
    await e.getByRole('button', { name: 'Reset' }).click();
    await expect(e.locator('.quarto-exercise-status')).toHaveText('');
    await expect(e).toHaveScreenshot('cloze-exercise-reset.png');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// MIXED EXERCISE (blank + choose together)
// ═══════════════════════════════════════════════════════════════════════════

test.describe('Mixed exercise (blank + choose)', () => {
  test.beforeEach(async ({ page }) => { await goto(page, fixturesUrl); });

  test('idle', async ({ page }) => {
    await expect(ex(page, 'mixed-exercise')).toHaveScreenshot('mixed-idle.png');
  });

  test('both correct → Correct!', async ({ page }) => {
    const e = ex(page, 'mixed-exercise');
    await e.locator('.quarto-exercise-choose-select').selectOption('Aragorn');
    await e.locator('.quarto-exercise-blank-input').fill('Strider');
    await e.getByRole('button', { name: 'Check' }).click();
    await expect(e.locator('.quarto-exercise-status')).toHaveText('Correct!');
    await expect(e).toHaveScreenshot('mixed-correct.png');
  });

  test('one wrong → Not quite.', async ({ page }) => {
    const e = ex(page, 'mixed-exercise');
    await e.locator('.quarto-exercise-choose-select').selectOption('Aragorn');
    await e.locator('.quarto-exercise-blank-input').fill('WrongName');
    await e.getByRole('button', { name: 'Check' }).click();
    await expect(e.locator('.quarto-exercise-status')).toHaveText('Not quite.');
    await expect(e).toHaveScreenshot('mixed-partial.png');
  });

  test('reset clears both controls', async ({ page }) => {
    const e = ex(page, 'mixed-exercise');
    await e.locator('.quarto-exercise-choose-select').selectOption('Aragorn');
    await e.locator('.quarto-exercise-blank-input').fill('Strider');
    await e.getByRole('button', { name: 'Check' }).click();
    await e.getByRole('button', { name: 'Reset' }).click();
    await expect(e.locator('.quarto-exercise-blank-input')).toHaveValue('');
    await expect(e.locator('.quarto-exercise-choose-select')).toHaveValue('');
    await expect(e).toHaveScreenshot('mixed-reset.png');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// CHECK-BATCH
// ═══════════════════════════════════════════════════════════════════════════

test.describe('Check-batch', () => {
  test.beforeEach(async ({ page }) => { await goto(page, fixturesUrl); });

  test('idle – one shared Check + Reset, no individual buttons', async ({ page }) => {
    const batch = ex(page, 'batch-container');
    await expect(ex(page, 'batch-q1').locator('.quarto-exercise-check-btn')).toHaveCount(0);
    await expect(batch).toHaveScreenshot('batch-idle.png');
  });

  test('all correct → Correct! in batch status', async ({ page }) => {
    await clickAnswer(ex(page, 'batch-q1'), 'Samwise Gamgee');
    await ex(page, 'batch-container').locator('.quarto-exercise-blank-input').fill('Samwise');
    await ex(page, 'batch-container').getByRole('button', { name: 'Check' }).click();
    await expect(ex(page, 'batch-container').locator('.quarto-exercise-status')).toHaveText('Correct!');
    await expect(ex(page, 'batch-container')).toHaveScreenshot('batch-correct.png');
  });

  test('one wrong → Not quite.', async ({ page }) => {
    await clickAnswer(ex(page, 'batch-q1'), 'Meriadoc Brandybuck');
    await ex(page, 'batch-container').locator('.quarto-exercise-blank-input').fill('wrong');
    await ex(page, 'batch-container').getByRole('button', { name: 'Check' }).click();
    await expect(ex(page, 'batch-container').locator('.quarto-exercise-status')).toHaveText('Not quite.');
    await expect(ex(page, 'batch-container')).toHaveScreenshot('batch-incorrect.png');
  });

  test('reset clears all exercise states', async ({ page }) => {
    await clickAnswer(ex(page, 'batch-q1'), 'Samwise Gamgee');
    await ex(page, 'batch-container').getByRole('button', { name: 'Check' }).click();
    await ex(page, 'batch-container').getByRole('button', { name: 'Reset' }).click();
    await expect(ex(page, 'batch-container').locator('.quarto-exercise-status')).toHaveText('');
    await expect(ex(page, 'batch-container').locator('.is-correct, .is-incorrect')).toHaveCount(0);
    await expect(ex(page, 'batch-container')).toHaveScreenshot('batch-reset.png');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PAGE-LEVEL CONTROLLER (full-page-check.html)
// ═══════════════════════════════════════════════════════════════════════════

test.describe('Page-level controller', () => {
  test.beforeEach(async ({ page }) => { await goto(page, fullPageUrl); });

  test('idle – controls visible, status empty', async ({ page }) => {
    await expect(page.locator('.quarto-exercise-page-controls')).toHaveScreenshot('page-ctrl-idle.png');
  });

  test('only one Check Page button exists in the document', async ({ page }) => {
    await expect(page.locator('.quarto-exercise-check-btn')).toHaveCount(1);
    await expect(page.locator('main#quarto-document-content > .quarto-exercise-page-controls')).toHaveCount(1);
  });

  test('perfect score – Correct! + Score: 6 / 6', async ({ page }) => {
    await page.locator('[data-testid="page-ring"]').getByText('Frodo Baggins').click();
    await page.locator('[data-testid="page-fellowship"]').getByText('Frodo Baggins').click();
    await page.locator('[data-testid="page-fellowship"]').getByText('Samwise Gamgee').click();
    await page.locator('[data-testid="page-blank"] .quarto-exercise-blank-input').fill('Gandalf');
    await page.getByRole('button', { name: 'Check Page' }).click();
    await expect(page.locator('.quarto-exercise-page-controls .quarto-exercise-status'))
      .toHaveText('Correct! Score: 6 / 6.');
    await expect(page.locator('.quarto-exercise-page-controls')).toHaveScreenshot('page-ctrl-perfect.png');
  });

  test('partial score – Not quite. + Score: 3 / 6', async ({ page }) => {
    await page.locator('[data-testid="page-ring"]').getByText('Frodo Baggins').click();
    await page.locator('[data-testid="page-blank"] .quarto-exercise-blank-input').fill('Gandalf');
    await page.getByRole('button', { name: 'Check Page' }).click();
    await expect(page.locator('.quarto-exercise-page-controls .quarto-exercise-status'))
      .toHaveText('Not quite. Score: 3 / 6.');
    await expect(page.locator('.quarto-exercise-page-controls')).toHaveScreenshot('page-ctrl-partial.png');
  });

  test('zero score – nothing answered', async ({ page }) => {
    await page.getByRole('button', { name: 'Check Page' }).click();
    await expect(page.locator('.quarto-exercise-page-controls .quarto-exercise-status'))
      .toHaveText('Not quite. Score: 0 / 6.');
    await expect(page.locator('.quarto-exercise-page-controls')).toHaveScreenshot('page-ctrl-zero.png');
  });

  test('reset clears status and inputs', async ({ page }) => {
    await page.locator('[data-testid="page-ring"]').getByText('Frodo Baggins').click();
    await page.locator('[data-testid="page-blank"] .quarto-exercise-blank-input').fill('Gandalf');
    await page.getByRole('button', { name: 'Check Page' }).click();
    await page.getByRole('button', { name: 'Reset Page' }).click();
    await expect(page.locator('.quarto-exercise-page-controls .quarto-exercise-status')).toHaveText('');
    await expect(page.locator('[data-testid="page-blank"] .quarto-exercise-blank-input')).toHaveValue('');
    await expect(page.locator('.is-correct, .is-incorrect')).toHaveCount(0);
    await expect(page.locator('.quarto-exercise-page-controls')).toHaveScreenshot('page-ctrl-reset.png');
  });

  test('reveal:false – correct answers NOT highlighted after partial check', async ({ page }) => {
    await page.locator('[data-testid="page-ring"]').getByText('Frodo Baggins').click();
    await page.getByRole('button', { name: 'Check Page' }).click();
    await expect(page.locator('[data-testid="page-fellowship"] .quarto-exercise-answer.is-correct')).toHaveCount(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PAGE-LEVEL – EXERCISE STATES AFTER CHECK
// ═══════════════════════════════════════════════════════════════════════════

test.describe('Exercise states after page-level check', () => {
  test.beforeEach(async ({ page }) => { await goto(page, fullPageUrl); });

  test('correct MCQ after page check', async ({ page }) => {
    await page.locator('[data-testid="page-ring"]').getByText('Frodo Baggins').click();
    await page.getByRole('button', { name: 'Check Page' }).click();
    await expect(page.locator('[data-testid="page-ring"]')).toHaveScreenshot('page-ring-correct.png');
  });

  test('unanswered MCQ after page check', async ({ page }) => {
    await page.getByRole('button', { name: 'Check Page' }).click();
    await expect(page.locator('[data-testid="page-ring"]')).toHaveScreenshot('page-ring-unanswered.png');
  });

  test('correct blank after page check', async ({ page }) => {
    await page.locator('[data-testid="page-blank"] .quarto-exercise-blank-input').fill('Gandalf');
    await page.getByRole('button', { name: 'Check Page' }).click();
    await expect(page.locator('[data-testid="page-blank"]')).toHaveScreenshot('page-blank-correct.png');
  });

  test('incorrect blank after page check', async ({ page }) => {
    await page.locator('[data-testid="page-blank"] .quarto-exercise-blank-input').fill('Saruman');
    await page.getByRole('button', { name: 'Check Page' }).click();
    await expect(page.locator('[data-testid="page-blank"]')).toHaveScreenshot('page-blank-incorrect.png');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// FULL-PAGE SMOKE TESTS
// ═══════════════════════════════════════════════════════════════════════════

test.describe('Full-page smoke tests', () => {
  test.describe.configure({ timeout: 60_000 });

  test('fixtures.html – initial load', async ({ page }) => {
    await goto(page, fixturesUrl);
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(page).toHaveScreenshot('smoke-fixtures.png', { fullPage: true });
  });

  test('fixtures.html – after answering all exercises correctly', async ({ page }) => {
    await goto(page, fixturesUrl);
    // MCQ single
    await clickAnswer(ex(page, 'mcq-basic-single'), 'Frodo Baggins');
    await ex(page, 'mcq-basic-single').getByRole('button', { name: 'Check' }).click();
    // MCQ multi
    await clickAnswer(ex(page, 'mcq-basic-multi'), 'Frodo Baggins');
    await clickAnswer(ex(page, 'mcq-basic-multi'), 'Samwise Gamgee');
    await clickAnswer(ex(page, 'mcq-basic-multi'), 'Meriadoc Brandybuck');
    await ex(page, 'mcq-basic-multi').getByRole('button', { name: 'Check' }).click();
    // Blank exercise
    await ex(page, 'blank-exercise').locator('.quarto-exercise-blank-input').fill('Gandalf');
    await ex(page, 'blank-exercise').getByRole('button', { name: 'Check' }).click();
    // Choose exercise
    await ex(page, 'choose-exercise').locator('.quarto-exercise-choose-select').selectOption('Mordor');
    await ex(page, 'choose-exercise').getByRole('button', { name: 'Check' }).click();
    // Cloze exercise
    await ex(page, 'cloze-exercise').locator('select').selectOption('sum');
    await ex(page, 'cloze-exercise').locator('input').fill('total');
    await ex(page, 'cloze-exercise').getByRole('button', { name: 'Check' }).click();
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(page).toHaveScreenshot('smoke-fixtures-answered.png', { fullPage: true });
  });

  test('example.html – initial load', async ({ page }) => {
    await goto(page, exampleUrl);
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(page).toHaveScreenshot('smoke-example.png', { fullPage: true });
  });

  test('full-page-check.html – initial load', async ({ page }) => {
    await goto(page, fullPageUrl);
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(page).toHaveScreenshot('smoke-full-page-check.png', { fullPage: true });
  });

  test('full-page-check.html – after perfect score', async ({ page }) => {
    await goto(page, fullPageUrl);
    await page.locator('[data-testid="page-ring"]').getByText('Frodo Baggins').click();
    await page.locator('[data-testid="page-fellowship"]').getByText('Frodo Baggins').click();
    await page.locator('[data-testid="page-fellowship"]').getByText('Samwise Gamgee').click();
    await page.locator('[data-testid="page-blank"] .quarto-exercise-blank-input').fill('Gandalf');
    await page.getByRole('button', { name: 'Check Page' }).click();
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(page).toHaveScreenshot('smoke-full-page-perfect.png', { fullPage: true });
  });
});
