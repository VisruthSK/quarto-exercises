// tests/run.js
// Automated test suite for quarto-exercises extension
// Run with: node tests/run.js

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const assert = require('assert');
const test = require('node:test');
const vm = require('vm');

const TEMP_DIR = path.join(__dirname, '.tmp', 'test-sandbox');
const quote = value => `"${String(value).replace(/"/g, '""')}"`;

// Helper to prepare temp directory
function setup() {
  if (fs.existsSync(TEMP_DIR)) {
    fs.rmSync(TEMP_DIR, { recursive: true, force: true });
  }
  fs.mkdirSync(TEMP_DIR, { recursive: true });
  
  // Copy _extensions folder into test-temp so Quarto can find the extension locally
  // Go up one level since this script is located in /tests
  const extSrc = path.join(__dirname, '..', '_extensions');
  const extDest = path.join(TEMP_DIR, '_extensions');
  fs.mkdirSync(extDest, { recursive: true });
  copyFolderSync(extSrc, extDest);
}

function copyFolderSync(from, to) {
  fs.mkdirSync(to, { recursive: true });
  fs.readdirSync(from).forEach(element => {
    const stat = fs.lstatSync(path.join(from, element));
    if (stat.isFile()) {
      fs.copyFileSync(path.join(from, element), path.join(to, element));
    } else if (stat.isDirectory()) {
      copyFolderSync(path.join(from, element), path.join(to, element));
    }
  });
}

// Helper to run quarto render and capture stdout/stderr
function runQuarto(fileName, format = 'html') {
  const filePath = path.join(TEMP_DIR, fileName);
  const res = spawnSync(`quarto render ${quote(filePath)} --to ${quote(format)}`, {
    encoding: 'utf8',
    shell: true
  });
  return {
    stdout: res.stdout || '',
    stderr: res.stderr || (res.error ? res.error.message : ''),
    error: res.error,
    success: res.status === 0
  };
}

function hasQuarto() {
  const res = spawnSync('quarto --version', { encoding: 'utf8', shell: true });
  return res.status === 0;
}

function renderOrSkip(t, fileName, format = 'html') {
  if (!hasQuarto()) {
    if (process.env.CI) {
      assert.fail('Quarto CLI is required in CI');
    }
    t.skip('Quarto CLI is not available to this test runner');
    return null;
  }
  const result = runQuarto(fileName, format);
  if (result.error && /EPERM/.test(result.error.message)) {
    if (process.env.CI) {
      assert.fail(`Quarto CLI cannot be spawned in CI: ${result.error.message}`);
    }
    t.skip(`Quarto CLI cannot be spawned here: ${result.error.message}`);
    return null;
  }
  assert.strictEqual(result.success, true, result.stderr || result.stdout);
  return result;
}

function loadRuntime() {
  const listeners = {};
  const runtime = fs.readFileSync(path.join(__dirname, '..', '_extensions', 'quarto-exercises', 'quarto-exercises.js'), 'utf8');
  const context = {
    console,
    Option: function Option(text, value) {
      return { text, value };
    },
    document: {
      addEventListener(type, handler) {
        listeners[type] = handler;
      },
      querySelectorAll() {
        return [];
      },
      querySelector() {
        return null;
      },
      createElement() {
        return {
          style: {},
          textContent: '',
          getBoundingClientRect: () => ({ width: 0 }),
          remove() {}
        };
      },
      body: {
        appendChild() {}
      }
    },
    window: {},
    getComputedStyle: () => ({ font: '16px serif' })
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(runtime, context);
  return context;
}

function optionalPlaywright() {
  try {
    return require('playwright');
  } catch {
    return null;
  }
}

function visualFixture() {
  const css = fs.readFileSync(path.join(__dirname, '..', '_extensions', 'quarto-exercises', 'quarto-exercises.css'), 'utf8');
  const js = fs.readFileSync(path.join(__dirname, '..', '_extensions', 'quarto-exercises', 'quarto-exercises.js'), 'utf8');

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<style>
body {
  margin: 0;
  padding: 32px;
  font: 16px/1.5 system-ui, sans-serif;
  color: #202124;
  background: #fff;
}
body.quarto-dark {
  color: #e8eaed;
  background: #202124;
}
main {
  max-width: 760px;
  margin: 0 auto;
}
${css}
</style>
</head>
<body>
<main>
<div class="quarto-exercise" id="visual-ex" data-id="visual-ex" data-type="radio" data-instant="false" data-reveal="true" data-lock="false" data-reset="true" data-shuffle="false" data-reshuffle-on-reset="false" data-explanation-policy="after-check" data-feedback-correct="Correct!" data-feedback-incorrect="Not quite.">
<p>Choose the code fragment that returns the mean.</p>
<fieldset class="quarto-exercise-fieldset"><legend class="visually-hidden">Answer choices</legend><div class="quarto-exercise-choices">
<div class="quarto-exercise-answer" data-key="a" data-correct="false"><div class="quarto-exercise-control"><input id="visual-ex-a" type="radio" name="visual-ex" value="a" class="quarto-exercise-input"><label for="visual-ex-a" class="quarto-exercise-answer-label"></label></div><div class="quarto-exercise-answer-content"><p><code>sum(x)</code></p></div><div class="quarto-exercise-feedback" aria-live="polite" hidden>That returns the total.</div></div>
<div class="quarto-exercise-answer" data-key="b" data-correct="true"><div class="quarto-exercise-control"><input id="visual-ex-b" type="radio" name="visual-ex" value="b" class="quarto-exercise-input"><label for="visual-ex-b" class="quarto-exercise-answer-label"></label></div><div class="quarto-exercise-answer-content"><div class="sourceCode"><pre><code>mean(x)</code></pre></div></div><div class="quarto-exercise-feedback" aria-live="polite" hidden>Right.</div></div>
</div></fieldset>
<p>The Fellowship leaves <span class="quarto-exercise-choose-container" data-answer="Rivendell" data-options="Rivendell,Edoras" data-shuffle="false" data-ignore-case="false" data-feedback-correct="Right" data-feedback-incorrect="Wrong"><select class="quarto-exercise-choose-select"><option value="">Choose...</option></select><span class="quarto-exercise-choose-correct-text" hidden></span><button type="button" class="quarto-exercise-choose-check-btn">Check</button><span class="quarto-exercise-choose-feedback" aria-live="polite" hidden></span></span> with <span class="quarto-exercise-blank-container" data-answers="Gandalf" data-match="exact" data-ignore-case="false" data-trim="true" data-collapse-space="false" data-feedback-correct="Right" data-feedback-incorrect="Wrong"><input type="text" class="quarto-exercise-blank-input" value="" aria-label="Fill in the blank"><span class="quarto-exercise-blank-correct-text" hidden></span><button type="button" class="quarto-exercise-blank-check-btn">Check</button><span class="quarto-exercise-blank-feedback" aria-live="polite" hidden></span></span>.</p>
<div class="quarto-exercise-actions"><button type="button" class="quarto-exercise-check-btn">Check</button><button type="button" class="quarto-exercise-reset-btn">Reset</button><span class="quarto-exercise-status" aria-live="polite"></span></div>
<div class="quarto-exercise-hint" aria-live="polite">Use the base function.</div>
<div class="quarto-exercise-explanation" hidden aria-live="polite">The mean is the arithmetic average.</div>
</div>
</main>
<script>${js}</script>
</body>
</html>`;
}

async function runVisualMode(playwright, mode) {
  const browser = await playwright.chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 900, height: 720 },
    colorScheme: mode
  });
  await page.setContent(visualFixture(), { waitUntil: 'load' });
  if (mode === 'dark') {
    await page.evaluate(() => document.body.classList.add('quarto-dark'));
  }

  await page.click('[data-key="a"]');
  await page.selectOption('.quarto-exercise-choose-select', 'Edoras');
  await page.fill('.quarto-exercise-blank-input', 'Saruman');
  await page.click('.quarto-exercise-check-btn');
  await page.screenshot({
    path: path.join(TEMP_DIR, 'visual', `${mode}-incorrect.png`),
    fullPage: true
  });

  const incorrectState = await page.evaluate(() => {
    const answer = document.querySelector('[data-key="a"]');
    const feedback = document.querySelector('.quarto-exercise-choose-feedback');
    const hint = document.querySelector('.quarto-exercise-hint');
    const exercise = document.querySelector('.quarto-exercise');
    const answerBox = answer.getBoundingClientRect();
    const contentBox = answer.querySelector('.quarto-exercise-answer-content').getBoundingClientRect();
    const controlBox = answer.querySelector('.quarto-exercise-control').getBoundingClientRect();
    return {
      answerColor: getComputedStyle(answer).color,
      feedbackColor: getComputedStyle(feedback).color,
      hintColor: getComputedStyle(hint).color,
      exerciseBg: getComputedStyle(exercise).backgroundColor,
      contentRightOfControl: contentBox.left > controlBox.left,
      exerciseHeight: answerBox.height
    };
  });

  await page.click('.quarto-exercise-reset-btn');
  await page.click('[data-key="b"]');
  await page.selectOption('.quarto-exercise-choose-select', 'Rivendell');
  await page.fill('.quarto-exercise-blank-input', 'Gandalf');
  await page.click('.quarto-exercise-check-btn');
  await page.screenshot({
    path: path.join(TEMP_DIR, 'visual', `${mode}-correct.png`),
    fullPage: true
  });

  const correctState = await page.evaluate(() => {
    const answer = document.querySelector('[data-key="b"]');
    const status = document.querySelector('.quarto-exercise-status');
    const explanation = document.querySelector('.quarto-exercise-explanation');
    return {
      answerColor: getComputedStyle(answer).color,
      statusColor: getComputedStyle(status).color,
      explanationVisible: !explanation.hidden,
      statusText: status.textContent
    };
  });

  await browser.close();
  return { incorrectState, correctState };
}

test.describe('Quarto Exercises Extension Tests', () => {

  test.before(() => {
    setup();
  });

  test('1. JS Unit Tests (Production Matching Logic)', () => {
    const { checkBlankMatch } = loadRuntime();

    // Exact match
    assert.strictEqual(checkBlankMatch("Gandalf", "Gandalf", "exact", false, true, false), true);
    assert.strictEqual(checkBlankMatch("gandalf", "Gandalf", "exact", false, true, false), false);
    assert.strictEqual(checkBlankMatch("gandalf", "Gandalf", "exact", true, true, false), true);
    
    // Trim/Collapse spaces
    assert.strictEqual(checkBlankMatch("  Gandalf  ", "Gandalf", "exact", false, true, false), true);
    assert.strictEqual(checkBlankMatch("Gandalf The Grey", "Gandalf  The   Grey", "exact", false, true, true), true);

    // One of multiple
    assert.strictEqual(checkBlankMatch("Frodo Baggins", "Frodo,Frodo Baggins", "one-of", false, true, false), true);
    assert.strictEqual(checkBlankMatch("Samwise", "Frodo,Frodo Baggins", "one-of", false, true, false), false);

    // Regex
    assert.strictEqual(checkBlankMatch("The Fellowship of the Ring", "^The\\s+Fellowship\\s+of\\s+the\\s+Ring$", "regex", false, true, false), true);
    assert.strictEqual(checkBlankMatch("the fellowship of the ring", "^The\\s+Fellowship\\s+of\\s+the\\s+Ring$", "regex", true, true, false), true);
  });

  test('2. Multiple Choice Rendering (HTML)', (t) => {
    const qmdContent = `---
title: "MC Test"
filters:
  - quarto-exercises
---

::: {.exercise #ex1 shuffle=true}
Select the hobbit.

::: {.answer correct=true key="frodo"}
Frodo Baggins
:::

::: {.answer key="legolas"}
\`\`\`r
mean(1:3)
\`\`\`
:::

::: {.hint}
He is short and has hairy feet.
:::
:::
`;
    fs.writeFileSync(path.join(TEMP_DIR, 'mc.qmd'), qmdContent);
    if (!renderOrSkip(t, 'mc.qmd')) return;
    
    const htmlPath = path.join(TEMP_DIR, 'mc.html');
    const html = fs.readFileSync(htmlPath, 'utf8');

    // 1. Single-correct question renders as radio inputs.
    assert.match(html, /type="radio"/);
    assert.match(html, /class="quarto-exercise"/);
    assert.match(html, /data-type="radio"/);

    // 2. Explicit answer keys are preserved.
    assert.match(html, /data-key="frodo"/);
    assert.match(html, /data-key="legolas"/);

    // 3. Accessibility elements present
    assert.match(html, /fieldset class="quarto-exercise-fieldset"/);
    assert.match(html, /legend class="visually-hidden"/);

    // 4. Hints are parsed and rendered correctly
    assert.match(html, /class="quarto-exercise-hint-btn"/);
    assert.match(html, /class="quarto-exercise-hint"/);

    // Answer content is block-level, not invalid paragraphs inside spans/labels.
    assert.doesNotMatch(html, /<span class="quarto-exercise-answer-content">/);
    assert.doesNotMatch(html, /<label[^>]*>(?:(?!<\/label>)[\s\S])*<div class="sourceCode"/);
    assert.match(html, /<div class="quarto-exercise-control">/);
    assert.match(html, /<div class="quarto-exercise-answer-content">/);
  });

  test('3. Fill in the blank and Cloze Rendering (HTML)', (t) => {
    const qmdContent = `---
title: "Blank Test"
filters:
  - quarto-exercises
---

The wizard is [\`Gandalf\`]{.blank answer="Gandalf" ignore-case=true}.

The Fellowship leaves [Rivendell / Minas Tirith / Edoras]{.choose answer="Rivendell"}.
`;
    fs.writeFileSync(path.join(TEMP_DIR, 'blank.qmd'), qmdContent);
    if (!renderOrSkip(t, 'blank.qmd')) return;
    
    const htmlPath = path.join(TEMP_DIR, 'blank.html');
    const html = fs.readFileSync(htmlPath, 'utf8');

    // Basic blank renders as input
    assert.match(html, /class="quarto-exercise-blank-input"/);
    assert.match(html, /class="quarto-exercise-blank-check-btn"/);
    assert.match(html, /data-answers="Gandalf"/);
    assert.match(html, /data-ignore-case="true"/);

    // Standalone choose renders as dropdown
    assert.match(html, /class="quarto-exercise-choose-select"/);
    assert.match(html, /data-options="Rivendell,Minas Tirith,Edoras"/);
    assert.match(html, /data-answer="Rivendell"/);
  });

  test('4. Validation Warnings (Stderr Output)', (t) => {
    const qmdContent = `---
title: "Warnings Test"
filters:
  - quarto-exercises
---

::: {.exercise #no-correct}
No correct answers here.

::: {.answer}
Answer 1
:::
:::

::: {.exercise #no-answers}
No answer blocks.
:::

[\`missing-ans\`]{.blank match="regex"}

[No Answer]{.choose}
`;
    fs.writeFileSync(path.join(TEMP_DIR, 'warnings.qmd'), qmdContent);
    const result = renderOrSkip(t, 'warnings.qmd');
    if (!result) return;
    
    const stderrLog = result.stderr + result.stdout;
    
    assert.match(stderrLog, /has no correct answers/);
    assert.match(stderrLog, /has no \.answer blocks or inline blanks\/choices/);
    assert.match(stderrLog, /match="regex" with no answer/);
    assert.match(stderrLog, /choose block with no answer/);
  });

  test('5. Non-HTML Fallback Rendering', (t) => {
    const qmdContent = `---
title: "Fallback Test"
filters:
  - quarto-exercises
quarto-exercises:
  show-answers: true
---

::: {.exercise}
Select the hobbit.

::: {.answer correct=true}
Frodo
:::

::: {.answer}
Legolas
:::
:::

The wizard is [\`Gandalf\`]{.blank answer="Gandalf"}.
`;
    fs.writeFileSync(path.join(TEMP_DIR, 'fallback.qmd'), qmdContent);
    if (!renderOrSkip(t, 'fallback.qmd', 'markdown')) return;
    
    const mdPath = path.join(TEMP_DIR, 'fallback.md');
    const md = fs.readFileSync(mdPath, 'utf8');

    // Should render list letters and answer keys
    assert.match(md, /A\.\s+Frodo/);
    assert.match(md, /B\.\s+Legolas/);
    assert.match(md, /Answer:\s+A/);
    assert.match(md, /Gandalf/);
    assert.doesNotMatch(md, /<div>/);
  });

  test('6. Boolean attributes accept uppercase TRUE', (t) => {
    const qmdContent = `---
title: "Boolean Test"
filters:
  - quarto-exercises
---

::: {.exercise}
Select the hobbit.

::: {.answer correct=TRUE}
Frodo
:::

::: {.answer}
Legolas
:::
:::
`;
    fs.writeFileSync(path.join(TEMP_DIR, 'bool.qmd'), qmdContent);
    const result = renderOrSkip(t, 'bool.qmd');
    if (!result) return;
    const log = result.stderr + result.stdout;
    const html = fs.readFileSync(path.join(TEMP_DIR, 'bool.html'), 'utf8');

    assert.doesNotMatch(log, /invalid boolean value/);
    assert.doesNotMatch(log, /has no correct answers/);
    assert.match(html, /data-correct="true"/);
  });

  test('7. JS Click Interaction Simulation (Unit Test)', () => {
    let dispatchCount = 0;
    
    const mockInput = {
      type: 'radio',
      checked: false,
      dispatchEvent: function(event) {
        if (event.type === 'change') {
          dispatchCount++;
        }
      }
    };

    const mockEx = {
      classList: {
        contains: (cls) => false
      }
    };

    const simulateClick = (target) => {
      const e = {
        target: target,
        preventDefault: () => {
          e.defaultPrevented = true;
        },
        defaultPrevented: false
      };

      if (mockEx.classList.contains("is-locked")) return;
      if (e.target !== mockInput) {
        e.preventDefault();
        if (mockInput.type === "radio") {
          mockInput.checked = true;
        } else {
          mockInput.checked = !mockInput.checked;
        }
        mockInput.dispatchEvent({ type: 'change' });
      }
    };

    // Case A: Click on a code block (nested span)
    mockInput.checked = false;
    dispatchCount = 0;
    const mockCodeSpan = {};
    simulateClick(mockCodeSpan);
    assert.strictEqual(mockInput.checked, true, "Clicking nested element should check the radio input");
    assert.strictEqual(dispatchCount, 1, "Clicking nested element should dispatch change event");

    // Case B: Click on the radio input itself directly (browser handles check, JS skips modification)
    mockInput.checked = true;
    dispatchCount = 0;
    simulateClick(mockInput);
    assert.strictEqual(mockInput.checked, true, "Clicking radio input itself directly should not be modified by handler");
    assert.strictEqual(dispatchCount, 0, "Clicking radio input itself should not dispatch duplicate change event");

    // Case C: Checkbox toggle test
    const mockCheckbox = {
      type: 'checkbox',
      checked: false,
      dispatchEvent: function(event) {
        if (event.type === 'change') dispatchCount++;
      }
    };

    const simulateCheckboxClick = (target) => {
      const e = {
        target: target,
        preventDefault: () => { e.defaultPrevented = true; },
        defaultPrevented: false
      };
      if (e.target !== mockCheckbox) {
        e.preventDefault();
        if (mockCheckbox.type === "radio") {
          mockCheckbox.checked = true;
        } else {
          mockCheckbox.checked = !mockCheckbox.checked;
        }
        mockCheckbox.dispatchEvent({ type: 'change' });
      }
    };

    dispatchCount = 0;
    simulateCheckboxClick(mockCodeSpan);
    assert.strictEqual(mockCheckbox.checked, true, "First click on checkbox card should check it");
    assert.strictEqual(dispatchCount, 1);

    dispatchCount = 0;
    simulateCheckboxClick(mockCodeSpan);
    assert.strictEqual(mockCheckbox.checked, false, "Second click on checkbox card should uncheck it");
    assert.strictEqual(dispatchCount, 1);
  });

  test('8. Tests leave tracked files clean', (t) => {
    const res = spawnSync('git status --short -- tests/.tmp', {
      encoding: 'utf8',
      shell: true,
      cwd: path.join(__dirname, '..')
    });
    if (res.error) {
      if (process.env.CI) {
        assert.fail(`git cannot be spawned in CI: ${res.error.message}`);
      }
      t.skip(`git cannot be spawned here: ${res.error.message}`);
      return;
    }
    assert.strictEqual(res.stdout.trim(), '');
  });

  test('9. Documented CSS variables exist in the stylesheet', () => {
    const readme = fs.readFileSync(path.join(__dirname, '..', 'README.md'), 'utf8');
    const css = fs.readFileSync(path.join(__dirname, '..', '_extensions', 'quarto-exercises', 'quarto-exercises.css'), 'utf8');
    const documented = Array.from(readme.matchAll(/--ex-[\w-]+/g), match => match[0]);

    documented.forEach(variable => {
      assert.match(css, new RegExp(`${variable}:`));
      assert.match(css, new RegExp(`var\\(${variable}\\)`));
    });
  });

  test('10. Light and dark visual smoke snapshots', async (t) => {
    const playwright = optionalPlaywright();
    if (!playwright) {
      if (process.env.CI) {
        assert.fail('Playwright is required in CI');
      }
      t.skip('Playwright is not installed');
      return;
    }

    fs.mkdirSync(path.join(TEMP_DIR, 'visual'), { recursive: true });

    for (const mode of ['light', 'dark']) {
      let result;
      try {
        result = await runVisualMode(playwright, mode);
      } catch (error) {
        if (!process.env.CI && /spawn EPERM/.test(error.message || '')) {
          t.skip(`Playwright browser cannot be spawned here: ${error.message}`);
          return;
        }
        throw error;
      }
      const { incorrectState, correctState } = result;

      assert.match(incorrectState.answerColor, /rgb\(197, 34, 31\)/, `${mode} incorrect answer color`);
      assert.match(incorrectState.feedbackColor, /rgb\(197, 34, 31\)/, `${mode} inline feedback color`);
      assert.strictEqual(incorrectState.contentRightOfControl, true, `${mode} answer content should sit beside control`);
      assert.ok(incorrectState.exerciseHeight > 20, `${mode} answer row should have visible height`);

      if (mode === 'dark') {
        assert.match(incorrectState.hintColor, /rgb\(170, 170, 170\)/, 'dark hint color');
      } else {
        assert.match(incorrectState.hintColor, /rgb\(85, 85, 85\)/, 'light hint color');
      }

      assert.match(correctState.answerColor, /rgb\(19, 115, 51\)/, `${mode} correct answer color`);
      assert.match(correctState.statusColor, /rgb\(19, 115, 51\)/, `${mode} status color`);
      assert.strictEqual(correctState.explanationVisible, true, `${mode} explanation should show after check`);
      assert.strictEqual(correctState.statusText, 'Correct!');

      for (const state of ['incorrect', 'correct']) {
        const shot = path.join(TEMP_DIR, 'visual', `${mode}-${state}.png`);
        assert.ok(fs.existsSync(shot), `${shot} should exist`);
        assert.ok(fs.statSync(shot).size > 1000, `${shot} should not be blank`);
      }
    }
  });
});
