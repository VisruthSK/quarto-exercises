/**
 * visual.spec.ts — Comprehensive visual-regression & interaction suite
 *
 * Covers every exercise type in every meaningful state:
 *   - MCQ: single, multi, feedback, hint, explanation, reveal, lock, question-box
 *   - Inline blank: exact, multi-answer, regex, feedback
 *   - Inline choose: correct/incorrect/reset
 *   - Code cloze: standalone, inside exercise
 *   - Check-batch: idle, scored, partial, reset
 *   - Mixed exercise (blank + choose together)
 *   - Page-level controller: idle, perfect, partial, zero, reset
 *   - Full-page smoke tests
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

/** Locate the exercise by data-testid and return it. */
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

const snap = { maxDiffPixelRatio: 0.05 } as const;
const snapLoose = { maxDiffPixelRatio: 0.1 } as const; // for full-page shots

// ═══════════════════════════════════════════════════════════════════════════
// MCQ – SINGLE CHOICE
// ═══════════════════════════════════════════════════════════════════════════

test.describe('MCQ single-choice', () => {
  test.beforeEach(async ({ page }) => { await goto(page, fixturesUrl); });

  test('idle – no selection', async ({ page }) => {
    await expect(ex(page, 'mcq-basic-single')).toHaveScreenshot('mcq-single-idle.png', snap);
  });

  test('one answer selected (not yet checked)', async ({ page }) => {
    await clickAnswer(ex(page, 'mcq-basic-single'), 'Boromir');
    await expect(ex(page, 'mcq-basic-single')).toHaveScreenshot('mcq-single-selected.png', snap);
  });

  test('incorrect answer → is-incorrect class + Not quite.', async ({ page }) => {
    const e = ex(page, 'mcq-basic-single');
    await clickAnswer(e, 'Boromir');
    await e.getByRole('button', { name: 'Check' }).click();
    await expect(e.locator('.quarto-exercise-status')).toHaveText('Not quite.');
    await expect(e.locator('.quarto-exercise-answer.is-incorrect')).toBeVisible();
    await expect(e).toHaveScreenshot('mcq-single-incorrect.png', snap);
  });

  test('correct answer → is-correct class + Correct!', async ({ page }) => {
    const e = ex(page, 'mcq-basic-single');
    await clickAnswer(e, 'Frodo Baggins');
    await e.getByRole('button', { name: 'Check' }).click();
    await expect(e.locator('.quarto-exercise-status')).toHaveText('Correct!');
    await expect(e.locator('.quarto-exercise-answer.is-correct')).toBeVisible();
    await expect(e).toHaveScreenshot('mcq-single-correct.png', snap);
  });

  test('reset clears selection, classes, and status', async ({ page }) => {
    const e = ex(page, 'mcq-basic-single');
    await clickAnswer(e, 'Frodo Baggins');
    await e.getByRole('button', { name: 'Check' }).click();
    await e.getByRole('button', { name: 'Reset' }).click();
    await expect(e.locator('.is-correct, .is-incorrect')).toHaveCount(0);
    await expect(e.locator('.quarto-exercise-status')).toHaveText('');
    await expect(e).toHaveScreenshot('mcq-single-reset.png', snap);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// MCQ – MULTIPLE CHOICE (checkbox)
// ═══════════════════════════════════════════════════════════════════════════

test.describe('MCQ multiple-choice', () => {
  test.beforeEach(async ({ page }) => { await goto(page, fixturesUrl); });

  test('idle – no selection', async ({ page }) => {
    await expect(ex(page, 'mcq-basic-multi')).toHaveScreenshot('mcq-multi-idle.png', snap);
  });

  test('partial selection (missing one correct) → Not quite.', async ({ page }) => {
    const e = ex(page, 'mcq-basic-multi');
    await clickAnswer(e, 'Frodo Baggins');
    await e.getByRole('button', { name: 'Check' }).click();
    await expect(e.locator('.quarto-exercise-status')).toHaveText('Not quite.');
    await expect(e).toHaveScreenshot('mcq-multi-partial.png', snap);
  });

  test('wrong answer selected → is-incorrect on that answer', async ({ page }) => {
    const e = ex(page, 'mcq-basic-multi');
    await clickAnswer(e, 'Legolas Greenleaf');
    await e.getByRole('button', { name: 'Check' }).click();
    await expect(e.locator('.quarto-exercise-answer.is-incorrect')).toBeVisible();
    await expect(e).toHaveScreenshot('mcq-multi-wrong-selected.png', snap);
  });

  test('all correct answers selected → Correct!', async ({ page }) => {
    const e = ex(page, 'mcq-basic-multi');
    await clickAnswer(e, 'Frodo Baggins');
    await clickAnswer(e, 'Samwise Gamgee');
    await clickAnswer(e, 'Meriadoc Brandybuck');
    await e.getByRole('button', { name: 'Check' }).click();
    await expect(e.locator('.quarto-exercise-status')).toHaveText('Correct!');
    await expect(e).toHaveScreenshot('mcq-multi-correct.png', snap);
  });

  test('reset clears all states', async ({ page }) => {
    const e = ex(page, 'mcq-basic-multi');
    await clickAnswer(e, 'Frodo Baggins');
    await e.getByRole('button', { name: 'Check' }).click();
    await e.getByRole('button', { name: 'Reset' }).click();
    await expect(e.locator('.is-correct, .is-incorrect, .is-selected')).toHaveCount(0);
    await expect(e).toHaveScreenshot('mcq-multi-reset.png', snap);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// MCQ – PER-ANSWER FEEDBACK
// ═══════════════════════════════════════════════════════════════════════════

test.describe('MCQ per-answer feedback', () => {
  test.beforeEach(async ({ page }) => { await goto(page, fixturesUrl); });

  test('correct answer shows its feedback message', async ({ page }) => {
    const e = ex(page, 'mcq-with-feedback');
    // Click the radio input for "Gandalf" directly by key attribute
    await e.locator('.quarto-exercise-answer[data-key="gandalf"] .quarto-exercise-input').click();
    await e.getByRole('button', { name: 'Check' }).click();
    await expect(e.locator('.quarto-exercise-status')).toHaveText('Correct!');
    // Feedback for selected answer should be visible
    await expect(e.locator('[data-key="gandalf"] .quarto-exercise-feedback')).toBeVisible();
    await expect(e).toHaveScreenshot('mcq-feedback-correct.png', snap);
  });

  test('incorrect answer shows its feedback message', async ({ page }) => {
    const e = ex(page, 'mcq-with-feedback');
    await e.locator('.quarto-exercise-answer[data-key="saruman"] .quarto-exercise-input').click();
    await e.getByRole('button', { name: 'Check' }).click();
    await expect(e.locator('.quarto-exercise-status')).toHaveText('Not quite.');
    await expect(e.locator('[data-key="saruman"] .quarto-exercise-feedback')).toBeVisible();
    await expect(e).toHaveScreenshot('mcq-feedback-incorrect.png', snap);
  });

  test('reset hides feedback', async ({ page }) => {
    const e = ex(page, 'mcq-with-feedback');
    await e.locator('.quarto-exercise-answer[data-key="saruman"] .quarto-exercise-input').click();
    await e.getByRole('button', { name: 'Check' }).click();
    await e.getByRole('button', { name: 'Reset' }).click();
    await expect(e.locator('.quarto-exercise-feedback:not([hidden])')).toHaveCount(0);
    await expect(e).toHaveScreenshot('mcq-feedback-reset.png', snap);
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
    await expect(e).toHaveScreenshot('mcq-hint-hidden.png', snap);
  });

  test('hint visible after clicking Hint button', async ({ page }) => {
    const e = ex(page, 'mcq-with-hint');
    await e.getByRole('button', { name: 'Hint' }).click();
    await expect(e.locator('.quarto-exercise-hint')).toBeVisible();
    await expect(e).toHaveScreenshot('mcq-hint-open.png', snap);
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
    await expect(e).toHaveScreenshot('mcq-explanation-incorrect.png', snap);
  });

  test('explanation visible after correct check', async ({ page }) => {
    const e = ex(page, 'mcq-with-explanation');
    await clickAnswer(e, 'Frodo (via Gollum)');
    await e.getByRole('button', { name: 'Check' }).click();
    await expect(e.locator('.quarto-exercise-explanation')).toBeVisible();
    await expect(e).toHaveScreenshot('mcq-explanation-correct.png', snap);
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
    // Correct answer should be revealed even though wrong answer was chosen
    await expect(e.locator('.quarto-exercise-answer.is-correct')).toBeVisible();
    await expect(e).toHaveScreenshot('mcq-reveal-incorrect.png', snap);
  });

  test('correct check shows correct answer highlighted', async ({ page }) => {
    const e = ex(page, 'mcq-with-reveal');
    await clickAnswer(e, 'Théoden');
    await e.getByRole('button', { name: 'Check' }).click();
    await expect(e.locator('.quarto-exercise-status')).toHaveText('Correct!');
    await expect(e).toHaveScreenshot('mcq-reveal-correct.png', snap);
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
    await expect(e).toHaveScreenshot('mcq-lock-locked.png', snap);
  });

  test('incorrect answer does NOT lock', async ({ page }) => {
    const e = ex(page, 'mcq-with-lock');
    await clickAnswer(e, 'A bow');
    await e.getByRole('button', { name: 'Check' }).click();
    await expect(e.locator('.quarto-exercise-check-btn')).not.toBeDisabled();
    await expect(e).toHaveScreenshot('mcq-lock-unlocked-incorrect.png', snap);
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
    await expect(e).toHaveScreenshot('mcq-question-box.png', snap);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// INLINE BLANK – INSIDE EXERCISE WRAPPER
// ═══════════════════════════════════════════════════════════════════════════

test.describe('Inline blank (exercise-wrapped)', () => {
  test.beforeEach(async ({ page }) => { await goto(page, fixturesUrl); });

  test('idle blank', async ({ page }) => {
    await expect(ex(page, 'blank-exercise')).toHaveScreenshot('blank-exercise-idle.png', snap);
  });

  test('wrong answer → is-incorrect on input', async ({ page }) => {
    const e = ex(page, 'blank-exercise');
    await e.locator('.quarto-exercise-blank-input').fill('Saruman');
    await e.getByRole('button', { name: 'Check' }).click();
    await expect(e.locator('.quarto-exercise-blank-input')).toHaveClass(/is-incorrect/);
    await expect(e.locator('.quarto-exercise-status')).toHaveText('Not quite.');
    await expect(e).toHaveScreenshot('blank-exercise-incorrect.png', snap);
  });

  test('correct answer → is-correct on input', async ({ page }) => {
    const e = ex(page, 'blank-exercise');
    await e.locator('.quarto-exercise-blank-input').fill('Gandalf');
    await e.getByRole('button', { name: 'Check' }).click();
    await expect(e.locator('.quarto-exercise-blank-input')).toHaveClass(/is-correct/);
    await expect(e.locator('.quarto-exercise-status')).toHaveText('Correct!');
    await expect(e).toHaveScreenshot('blank-exercise-correct.png', snap);
  });

  test('reset clears input value and classes', async ({ page }) => {
    const e = ex(page, 'blank-exercise');
    await e.locator('.quarto-exercise-blank-input').fill('Gandalf');
    await e.getByRole('button', { name: 'Check' }).click();
    await e.getByRole('button', { name: 'Reset' }).click();
    await expect(e.locator('.quarto-exercise-blank-input')).toHaveValue('');
    await expect(e.locator('.quarto-exercise-blank-input')).not.toHaveClass(/is-correct/);
    await expect(e.locator('.quarto-exercise-blank-input')).not.toHaveClass(/is-incorrect/);
    await expect(e).toHaveScreenshot('blank-exercise-reset.png', snap);
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
    await expect(e).toHaveScreenshot('blank-multi-correct-alt.png', snap);
  });

  test('wrong answer still fails', async ({ page }) => {
    const e = ex(page, 'blank-multi-answer');
    await e.locator('.quarto-exercise-blank-input').fill('Boromir');
    await e.getByRole('button', { name: 'Check' }).click();
    await expect(e.locator('.quarto-exercise-blank-input')).toHaveClass(/is-incorrect/);
    await expect(e).toHaveScreenshot('blank-multi-incorrect.png', snap);
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
    await expect(e).toHaveScreenshot('blank-regex-correct.png', snap);
  });

  test('answer not matching regex fails', async ({ page }) => {
    const e = ex(page, 'blank-regex');
    await e.locator('.quarto-exercise-blank-input').fill('Mordor');
    await e.getByRole('button', { name: 'Check' }).click();
    await expect(e.locator('.quarto-exercise-blank-input')).toHaveClass(/is-incorrect/);
    await expect(e).toHaveScreenshot('blank-regex-incorrect.png', snap);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// INLINE CHOOSE – INSIDE EXERCISE WRAPPER
// ═══════════════════════════════════════════════════════════════════════════

test.describe('Inline choose (exercise-wrapped)', () => {
  test.beforeEach(async ({ page }) => { await goto(page, fixturesUrl); });

  test('idle state', async ({ page }) => {
    await expect(ex(page, 'choose-exercise')).toHaveScreenshot('choose-exercise-idle.png', snap);
  });

  test('wrong option → is-incorrect', async ({ page }) => {
    const e = ex(page, 'choose-exercise');
    await e.locator('.quarto-exercise-choose-select').selectOption('Gondor');
    await e.getByRole('button', { name: 'Check' }).click();
    await expect(e.locator('.quarto-exercise-choose-select')).toHaveClass(/is-incorrect/);
    await expect(e.locator('.quarto-exercise-status')).toHaveText('Not quite.');
    await expect(e).toHaveScreenshot('choose-exercise-incorrect.png', snap);
  });

  test('correct option → is-correct', async ({ page }) => {
    const e = ex(page, 'choose-exercise');
    await e.locator('.quarto-exercise-choose-select').selectOption('Mordor');
    await e.getByRole('button', { name: 'Check' }).click();
    await expect(e.locator('.quarto-exercise-choose-select')).toHaveClass(/is-correct/);
    await expect(e.locator('.quarto-exercise-status')).toHaveText('Correct!');
    await expect(e).toHaveScreenshot('choose-exercise-correct.png', snap);
  });

  test('reset clears selection and classes', async ({ page }) => {
    const e = ex(page, 'choose-exercise');
    await e.locator('.quarto-exercise-choose-select').selectOption('Mordor');
    await e.getByRole('button', { name: 'Check' }).click();
    await e.getByRole('button', { name: 'Reset' }).click();
    await expect(e.locator('.quarto-exercise-choose-select')).toHaveValue('');
    await expect(e.locator('.quarto-exercise-choose-select')).not.toHaveClass(/is-correct/);
    await expect(e).toHaveScreenshot('choose-exercise-reset.png', snap);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// CODE CLOZE – STANDALONE
// ═══════════════════════════════════════════════════════════════════════════

test.describe('Code cloze standalone', () => {
  test.beforeEach(async ({ page }) => { await goto(page, fixturesUrl); });

  // The standalone cloze wrapper is the code block's parent section
  const clozeWrapper = (page: any) =>
    page.locator('.quarto-exercise-code-cloze-standalone').first().locator('..');

  test('idle – shows selects and inputs in code block', async ({ page }) => {
    await expect(clozeWrapper(page)).toHaveScreenshot('cloze-standalone-idle.png', snap);
  });

  test('correct answers → Correct! status', async ({ page }) => {
    const cloze = page.locator('.quarto-exercise-code-cloze-standalone').first();
    await cloze.locator('select').selectOption('c');
    await cloze.locator('input').fill('sum');
    await clozeWrapper(page).getByRole('button', { name: 'Check' }).click();
    await expect(clozeWrapper(page).locator('.quarto-exercise-status')).toHaveText('Correct!');
    await expect(clozeWrapper(page)).toHaveScreenshot('cloze-standalone-correct.png', snap);
  });

  test('wrong answers → Incorrect status', async ({ page }) => {
    const cloze = page.locator('.quarto-exercise-code-cloze-standalone').first();
    await cloze.locator('select').selectOption('list');
    await cloze.locator('input').fill('wrong');
    await clozeWrapper(page).getByRole('button', { name: 'Check' }).click();
    await expect(clozeWrapper(page).locator('.quarto-exercise-status')).toContainText('Incorrect');
    await expect(clozeWrapper(page)).toHaveScreenshot('cloze-standalone-incorrect.png', snap);
  });

  test('reset clears inputs and status', async ({ page }) => {
    const cloze = page.locator('.quarto-exercise-code-cloze-standalone').first();
    await cloze.locator('select').selectOption('c');
    await cloze.locator('input').fill('sum');
    await clozeWrapper(page).getByRole('button', { name: 'Check' }).click();
    await clozeWrapper(page).getByRole('button', { name: 'Reset' }).click();
    await expect(clozeWrapper(page).locator('.quarto-exercise-status')).toHaveText('');
    await expect(clozeWrapper(page)).toHaveScreenshot('cloze-standalone-reset.png', snap);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// CODE CLOZE – INSIDE EXERCISE WRAPPER
// ═══════════════════════════════════════════════════════════════════════════

test.describe('Code cloze in exercise', () => {
  test.beforeEach(async ({ page }) => { await goto(page, fixturesUrl); });

  test('idle', async ({ page }) => {
    await expect(ex(page, 'cloze-exercise')).toHaveScreenshot('cloze-exercise-idle.png', snap);
  });

  test('correct answers → Correct!', async ({ page }) => {
    const e = ex(page, 'cloze-exercise');
    await e.locator('select').selectOption('sum');
    await e.locator('input').fill('total');
    await e.getByRole('button', { name: 'Check' }).click();
    await expect(e.locator('.quarto-exercise-status')).toHaveText('Correct!');
    await expect(e).toHaveScreenshot('cloze-exercise-correct.png', snap);
  });

  test('wrong answers → Not quite.', async ({ page }) => {
    const e = ex(page, 'cloze-exercise');
    await e.locator('select').selectOption('max');
    await e.locator('input').fill('wrong');
    await e.getByRole('button', { name: 'Check' }).click();
    await expect(e.locator('.quarto-exercise-status')).toHaveText('Not quite.');
    await expect(e).toHaveScreenshot('cloze-exercise-incorrect.png', snap);
  });

  test('reset clears all cloze inputs', async ({ page }) => {
    const e = ex(page, 'cloze-exercise');
    await e.locator('select').selectOption('sum');
    await e.locator('input').fill('total');
    await e.getByRole('button', { name: 'Check' }).click();
    await e.getByRole('button', { name: 'Reset' }).click();
    await expect(e.locator('.quarto-exercise-status')).toHaveText('');
    await expect(e).toHaveScreenshot('cloze-exercise-reset.png', snap);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// MIXED EXERCISE (blank + choose together)
// ═══════════════════════════════════════════════════════════════════════════

test.describe('Mixed exercise (blank + choose)', () => {
  test.beforeEach(async ({ page }) => { await goto(page, fixturesUrl); });

  test('idle', async ({ page }) => {
    await expect(ex(page, 'mixed-exercise')).toHaveScreenshot('mixed-idle.png', snap);
  });

  test('both correct → Correct!', async ({ page }) => {
    const e = ex(page, 'mixed-exercise');
    await e.locator('.quarto-exercise-choose-select').selectOption('Aragorn');
    await e.locator('.quarto-exercise-blank-input').fill('Strider');
    await e.getByRole('button', { name: 'Check' }).click();
    await expect(e.locator('.quarto-exercise-status')).toHaveText('Correct!');
    await expect(e).toHaveScreenshot('mixed-correct.png', snap);
  });

  test('one wrong → Not quite.', async ({ page }) => {
    const e = ex(page, 'mixed-exercise');
    await e.locator('.quarto-exercise-choose-select').selectOption('Aragorn');
    await e.locator('.quarto-exercise-blank-input').fill('WrongName');
    await e.getByRole('button', { name: 'Check' }).click();
    await expect(e.locator('.quarto-exercise-status')).toHaveText('Not quite.');
    await expect(e).toHaveScreenshot('mixed-partial.png', snap);
  });

  test('reset clears both controls', async ({ page }) => {
    const e = ex(page, 'mixed-exercise');
    await e.locator('.quarto-exercise-choose-select').selectOption('Aragorn');
    await e.locator('.quarto-exercise-blank-input').fill('Strider');
    await e.getByRole('button', { name: 'Check' }).click();
    await e.getByRole('button', { name: 'Reset' }).click();
    await expect(e.locator('.quarto-exercise-blank-input')).toHaveValue('');
    await expect(e.locator('.quarto-exercise-choose-select')).toHaveValue('');
    await expect(e).toHaveScreenshot('mixed-reset.png', snap);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// CHECK-BATCH
// ═══════════════════════════════════════════════════════════════════════════

test.describe('Check-batch', () => {
  test.beforeEach(async ({ page }) => { await goto(page, fixturesUrl); });

  test('idle – one shared Check + Reset, no individual buttons', async ({ page }) => {
    const batch = ex(page, 'batch-container');
    // Individual exercises must NOT have their own Check buttons
    await expect(ex(page, 'batch-q1').locator('.quarto-exercise-check-btn')).toHaveCount(0);
    await expect(batch).toHaveScreenshot('batch-idle.png', snap);
  });

  test('all correct → Correct! in batch status', async ({ page }) => {
    await clickAnswer(ex(page, 'batch-q1'), 'Samwise Gamgee');
    await ex(page, 'batch-container').locator('.quarto-exercise-blank-input').fill('Samwise');
    await ex(page, 'batch-container').getByRole('button', { name: 'Check' }).click();
    await expect(ex(page, 'batch-container').locator('.quarto-exercise-status')).toHaveText('Correct!');
    await expect(ex(page, 'batch-container')).toHaveScreenshot('batch-correct.png', snap);
  });

  test('one wrong → Not quite.', async ({ page }) => {
    await clickAnswer(ex(page, 'batch-q1'), 'Meriadoc Brandybuck');
    await ex(page, 'batch-container').locator('.quarto-exercise-blank-input').fill('wrong');
    await ex(page, 'batch-container').getByRole('button', { name: 'Check' }).click();
    await expect(ex(page, 'batch-container').locator('.quarto-exercise-status')).toHaveText('Not quite.');
    await expect(ex(page, 'batch-container')).toHaveScreenshot('batch-incorrect.png', snap);
  });

  test('reset clears all exercise states', async ({ page }) => {
    await clickAnswer(ex(page, 'batch-q1'), 'Samwise Gamgee');
    await ex(page, 'batch-container').getByRole('button', { name: 'Check' }).click();
    await ex(page, 'batch-container').getByRole('button', { name: 'Reset' }).click();
    await expect(ex(page, 'batch-container').locator('.quarto-exercise-status')).toHaveText('');
    await expect(ex(page, 'batch-container').locator('.is-correct, .is-incorrect')).toHaveCount(0);
    await expect(ex(page, 'batch-container')).toHaveScreenshot('batch-reset.png', snap);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PAGE-LEVEL CONTROLLER (full-page-check.html)
// ═══════════════════════════════════════════════════════════════════════════

test.describe('Page-level controller', () => {
  test.beforeEach(async ({ page }) => { await goto(page, fullPageUrl); });

  test('idle – controls visible, status empty', async ({ page }) => {
    await expect(page.locator('.quarto-exercise-page-controls')).toHaveScreenshot('page-ctrl-idle.png', snap);
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
    await expect(page.locator('.quarto-exercise-page-controls')).toHaveScreenshot('page-ctrl-perfect.png', snap);
  });

  test('partial score – Not quite. + Score: 3 / 6', async ({ page }) => {
    await page.locator('[data-testid="page-ring"]').getByText('Frodo Baggins').click();
    await page.locator('[data-testid="page-blank"] .quarto-exercise-blank-input').fill('Gandalf');
    await page.getByRole('button', { name: 'Check Page' }).click();
    await expect(page.locator('.quarto-exercise-page-controls .quarto-exercise-status'))
      .toHaveText('Not quite. Score: 3 / 6.');
    await expect(page.locator('.quarto-exercise-page-controls')).toHaveScreenshot('page-ctrl-partial.png', snap);
  });

  test('zero score – nothing answered', async ({ page }) => {
    await page.getByRole('button', { name: 'Check Page' }).click();
    await expect(page.locator('.quarto-exercise-page-controls .quarto-exercise-status'))
      .toHaveText('Not quite. Score: 0 / 6.');
    await expect(page.locator('.quarto-exercise-page-controls')).toHaveScreenshot('page-ctrl-zero.png', snap);
  });

  test('reset clears status and inputs', async ({ page }) => {
    await page.locator('[data-testid="page-ring"]').getByText('Frodo Baggins').click();
    await page.locator('[data-testid="page-blank"] .quarto-exercise-blank-input').fill('Gandalf');
    await page.getByRole('button', { name: 'Check Page' }).click();
    await page.getByRole('button', { name: 'Reset Page' }).click();
    await expect(page.locator('.quarto-exercise-page-controls .quarto-exercise-status')).toHaveText('');
    await expect(page.locator('[data-testid="page-blank"] .quarto-exercise-blank-input')).toHaveValue('');
    await expect(page.locator('.is-correct, .is-incorrect')).toHaveCount(0);
    await expect(page.locator('.quarto-exercise-page-controls')).toHaveScreenshot('page-ctrl-reset.png', snap);
  });

  test('reveal:false – correct answers NOT highlighted after partial check', async ({ page }) => {
    await page.locator('[data-testid="page-ring"]').getByText('Frodo Baggins').click();
    await page.getByRole('button', { name: 'Check Page' }).click();
    // fellowship answers not selected, reveal:false → no is-correct shown
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
    await expect(page.locator('[data-testid="page-ring"]')).toHaveScreenshot('page-ring-correct.png', snap);
  });

  test('unanswered MCQ after page check', async ({ page }) => {
    await page.getByRole('button', { name: 'Check Page' }).click();
    await expect(page.locator('[data-testid="page-ring"]')).toHaveScreenshot('page-ring-unanswered.png', snap);
  });

  test('correct blank after page check', async ({ page }) => {
    await page.locator('[data-testid="page-blank"] .quarto-exercise-blank-input').fill('Gandalf');
    await page.getByRole('button', { name: 'Check Page' }).click();
    await expect(page.locator('[data-testid="page-blank"]')).toHaveScreenshot('page-blank-correct.png', snap);
  });

  test('incorrect blank after page check', async ({ page }) => {
    await page.locator('[data-testid="page-blank"] .quarto-exercise-blank-input').fill('Saruman');
    await page.getByRole('button', { name: 'Check Page' }).click();
    await expect(page.locator('[data-testid="page-blank"]')).toHaveScreenshot('page-blank-incorrect.png', snap);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// FULL-PAGE VISUAL SMOKE TESTS
// ═══════════════════════════════════════════════════════════════════════════

test.describe('Full-page smoke tests', () => {
  test('fixtures.html – initial load (full page)', async ({ page }) => {
    await goto(page, fixturesUrl);
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(page).toHaveScreenshot('smoke-fixtures.png', { ...snapLoose, fullPage: true });
  });

  test('example.html – initial load (full page)', async ({ page }) => {
    await goto(page, exampleUrl);
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(page).toHaveScreenshot('smoke-example.png', { ...snapLoose, fullPage: true });
  });

  test('full-page-check.html – initial load (full page)', async ({ page }) => {
    await goto(page, fullPageUrl);
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(page).toHaveScreenshot('smoke-full-page-check.png', { ...snapLoose, fullPage: true });
  });

  test('full-page-check.html – after perfect score (full page)', async ({ page }) => {
    await goto(page, fullPageUrl);
    await page.locator('[data-testid="page-ring"]').getByText('Frodo Baggins').click();
    await page.locator('[data-testid="page-fellowship"]').getByText('Frodo Baggins').click();
    await page.locator('[data-testid="page-fellowship"]').getByText('Samwise Gamgee').click();
    await page.locator('[data-testid="page-blank"] .quarto-exercise-blank-input').fill('Gandalf');
    await page.getByRole('button', { name: 'Check Page' }).click();
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(page).toHaveScreenshot('smoke-full-page-perfect.png', { ...snapLoose, fullPage: true });
  });
});
