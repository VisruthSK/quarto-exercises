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

function renderQuarto(fileName, format = 'html') {
  const result = runQuarto(fileName, format);
  assert.strictEqual(result.success, true, result.stderr || result.stdout);
  return result;
}

function parseLuaDefaults(lua) {
  const block = lua.match(/local defaults = \{([\s\S]*?)\n\}/);
  assert.ok(block, 'Lua defaults block should exist');
  const out = {};
  for (const line of block[1].split(/\r?\n/)) {
    const match = line.match(/^\s*(?:\["([^"]+)"\]|([\w-]+))\s*=\s*(.+?)(?:,)?\s*$/);
    if (!match) continue;
    const key = match[1] || match[2];
    const raw = match[3];
    if (raw === 'true') out[key] = true;
    else if (raw === 'false') out[key] = false;
    else out[key] = raw.replace(/^"(.*)"$/, '$1');
  }
  return out;
}

function parseCssVariables(css, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const root = css.match(new RegExp(`${escaped}\\s*\\{([\\s\\S]*?)\\n\\}`));
  assert.ok(root, `CSS ${selector} block should exist`);
  return Object.fromEntries(
    Array.from(root[1].matchAll(/^\s*(--ex-[\w-]+):\s*(.+?);\s*$/gm), match => [match[1], match[2]])
  );
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
*, *::before, *::after {
  transition: none !important;
  animation: none !important;
}
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
<p>The Fellowship leaves <span class="quarto-exercise-choose-container" data-answer="Rivendell" data-options="Rivendell|Edoras|Minas Tirith" data-shuffle="false" data-ignore-case="false" data-feedback-correct="Right" data-feedback-incorrect="Wrong"><select class="quarto-exercise-choose-select"><option value="">Choose...</option></select><span class="quarto-exercise-choose-correct-text" hidden></span><button type="button" class="quarto-exercise-choose-check-btn">Check</button><span class="quarto-exercise-choose-feedback" aria-live="polite" hidden></span></span> with <span class="quarto-exercise-blank-container" data-answers="Gandalf" data-match="exact" data-ignore-case="false" data-trim="true" data-collapse-space="false" data-feedback-correct="Right" data-feedback-incorrect="Wrong"><input type="text" class="quarto-exercise-blank-input" value="" aria-label="Fill in the blank"><span class="quarto-exercise-blank-correct-text" hidden></span><button type="button" class="quarto-exercise-blank-check-btn">Check</button><span class="quarto-exercise-blank-feedback" aria-live="polite" hidden></span></span>.</p>
<div class="quarto-exercise-actions"><button type="button" class="quarto-exercise-check-btn">Check</button><button type="button" class="quarto-exercise-reset-btn">Reset</button><button type="button" class="quarto-exercise-hint-btn">Hint</button><span class="quarto-exercise-status" aria-live="polite"></span></div>
<div class="quarto-exercise-hint" hidden aria-live="polite">Use the base function.</div>
<div class="quarto-exercise-explanation" hidden aria-live="polite">The mean is the arithmetic average.</div>
</div>
<p>Standalone blank: <span class="quarto-exercise-blank-container" data-answers="Moria" data-match="exact" data-ignore-case="false" data-trim="true" data-collapse-space="false" data-feedback-correct="Right" data-feedback-incorrect=""><input type="text" class="quarto-exercise-blank-input" value="" aria-label="Fill in the blank"><span class="quarto-exercise-blank-correct-text" hidden></span><button type="button" class="quarto-exercise-blank-check-btn">Check</button><span class="quarto-exercise-blank-feedback" aria-live="polite" hidden></span></span>.</p>
<p>Long placeholder blank: <span class="quarto-exercise-blank-container" data-answers="Moria" data-match="exact" data-ignore-case="false" data-trim="true" data-collapse-space="false" data-feedback-correct="Right" data-feedback-incorrect=""><input type="text" class="quarto-exercise-blank-input" value="" placeholder="Enter the name of the mines of Moria here" aria-label="Fill in the blank"><span class="quarto-exercise-blank-correct-text" hidden></span><button type="button" class="quarto-exercise-blank-check-btn">Check</button><span class="quarto-exercise-blank-feedback" aria-live="polite" hidden></span></span>.</p>
<div class="quarto-exercise" id="checkbox-ex" data-id="checkbox-ex" data-type="checkbox" data-instant="false" data-reveal="true" data-lock="false" data-reset="true" data-shuffle="false" data-reshuffle-on-reset="false" data-explanation-policy="correct" data-feedback-correct="Correct!" data-feedback-incorrect="Not quite.">
<p>Select all hobbits.</p>
<fieldset class="quarto-exercise-fieldset"><legend class="visually-hidden">Answer choices</legend><div class="quarto-exercise-choices">
<div class="quarto-exercise-answer" data-key="frodo" data-correct="true"><div class="quarto-exercise-control"><input id="checkbox-ex-frodo" type="checkbox" name="checkbox-ex" value="frodo" class="quarto-exercise-input"><label for="checkbox-ex-frodo" class="quarto-exercise-answer-label"></label></div><div class="quarto-exercise-answer-content"><p>Frodo</p></div><div class="quarto-exercise-feedback" aria-live="polite" hidden>Frodo is a hobbit.</div></div>
<div class="quarto-exercise-answer" data-key="sam" data-correct="true"><div class="quarto-exercise-control"><input id="checkbox-ex-sam" type="checkbox" name="checkbox-ex" value="sam" class="quarto-exercise-input"><label for="checkbox-ex-sam" class="quarto-exercise-answer-label"></label></div><div class="quarto-exercise-answer-content"><p>Sam</p></div><div class="quarto-exercise-feedback" aria-live="polite" hidden>Sam is a hobbit.</div></div>
<div class="quarto-exercise-answer" data-key="legolas" data-correct="false"><div class="quarto-exercise-control"><input id="checkbox-ex-legolas" type="checkbox" name="checkbox-ex" value="legolas" class="quarto-exercise-input"><label for="checkbox-ex-legolas" class="quarto-exercise-answer-label"></label></div><div class="quarto-exercise-answer-content"><p>Legolas</p></div><div class="quarto-exercise-feedback" aria-live="polite" hidden>Legolas is an elf.</div></div>
</div></fieldset>
<div class="quarto-exercise-actions"><button type="button" class="quarto-exercise-check-btn">Check</button><button type="button" class="quarto-exercise-reset-btn">Reset</button><span class="quarto-exercise-status" aria-live="polite"></span></div>
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

  const standaloneBlankState = await page.evaluate(() => {
    const blank = document.querySelector('main > p .quarto-exercise-blank-container');
    const input = blank.querySelector('.quarto-exercise-blank-input');
    const button = blank.querySelector('.quarto-exercise-blank-check-btn');
    const longBlank = document.querySelectorAll('.quarto-exercise-blank-input')[1];
    return {
      placeholder: input.placeholder,
      buttonBg: getComputedStyle(button).backgroundColor,
      buttonBorder: getComputedStyle(button).borderTopColor,
      shortWidth: input.getBoundingClientRect().width,
      longWidth: longBlank.getBoundingClientRect().width
    };
  });
  await page.fill('main > p .quarto-exercise-blank-input', 'Gandalf');
  await page.click('main > p .quarto-exercise-blank-check-btn');
  standaloneBlankState.feedbackHiddenAfterWrong = await page.evaluate(() => document.querySelector('main > p .quarto-exercise-blank-feedback').hidden);

  const hintState = await page.evaluate(() => {
    const hint = document.querySelector('#visual-ex .quarto-exercise-hint');
    return { initiallyHidden: hint.hidden };
  });
  await page.click('#visual-ex .quarto-exercise-hint-btn');
  hintState.visibleAfterClick = await page.evaluate(() => !document.querySelector('#visual-ex .quarto-exercise-hint').hidden);

  await page.click('[data-key="a"]');
  const selectWidthChoose = await page.evaluate(() => document.querySelector('.quarto-exercise-choose-select').getBoundingClientRect().width);
  await page.selectOption('.quarto-exercise-choose-select', 'Minas Tirith');
  const selectWidthLong = await page.evaluate(() => document.querySelector('.quarto-exercise-choose-select').getBoundingClientRect().width);
  await page.selectOption('.quarto-exercise-choose-select', 'Edoras');
  await page.fill('.quarto-exercise-blank-input', 'Saruman');
  await page.click('#visual-ex .quarto-exercise-check-btn');
  await page.screenshot({
    path: path.join(TEMP_DIR, 'visual', `${mode}-incorrect.png`),
    fullPage: true
  });

  const incorrectState = await page.evaluate(() => {
    const answer = document.querySelector('[data-key="a"]');
    const feedback = document.querySelector('.quarto-exercise-feedback');
    const blankFeedback = document.querySelector('.quarto-exercise-blank-feedback');
    const hint = document.querySelector('.quarto-exercise-hint');
    const exercise = document.querySelector('.quarto-exercise');
    const answerBox = answer.getBoundingClientRect();
    const contentBox = answer.querySelector('.quarto-exercise-answer-content').getBoundingClientRect();
    const controlBox = answer.querySelector('.quarto-exercise-control').getBoundingClientRect();
    return {
      answerColor: getComputedStyle(answer).color,
      feedbackColor: getComputedStyle(feedback).color,
      chooseFeedbackVisible: !feedback.hidden,
      blankFeedbackVisible: !blankFeedback.hidden,
      hintColor: getComputedStyle(hint).color,
      exerciseBg: getComputedStyle(exercise).backgroundColor,
      contentRightOfControl: contentBox.left > controlBox.left,
      exerciseHeight: answerBox.height
    };
  });

  await page.click('#visual-ex .quarto-exercise-reset-btn');
  await page.click('[data-key="b"]');
  await page.selectOption('.quarto-exercise-choose-select', 'Rivendell');
  await page.fill('.quarto-exercise-blank-input', 'Gandalf');
  await page.click('#visual-ex .quarto-exercise-check-btn');
  await page.screenshot({
    path: path.join(TEMP_DIR, 'visual', `${mode}-correct.png`),
    fullPage: true
  });

  const correctState = await page.evaluate(() => {
    const answer = document.querySelector('[data-key="b"]');
    const status = document.querySelector('.quarto-exercise-status');
    const explanation = document.querySelector('.quarto-exercise-explanation');
    const blankText = document.querySelector('.quarto-exercise-blank-correct-text');
    return {
      answerColor: getComputedStyle(answer).color,
      statusColor: getComputedStyle(status).color,
      blankColor: getComputedStyle(blankText).color,
      blankUnderline: getComputedStyle(blankText).borderBottomColor,
      explanationVisible: !explanation.hidden,
      statusText: status.textContent
    };
  });

  await page.click('#checkbox-ex [data-key="frodo"]');
  await page.click('#checkbox-ex [data-key="legolas"]');
  await page.click('#checkbox-ex .quarto-exercise-check-btn');
  const checkboxWrongState = await page.evaluate(() => {
    const frodoInput = document.querySelector('#checkbox-ex [data-key="frodo"] .quarto-exercise-input');
    const legolasInput = document.querySelector('#checkbox-ex [data-key="legolas"] .quarto-exercise-input');
    return {
      correctFeedbackVisible: !document.querySelector('#checkbox-ex [data-key="frodo"] .quarto-exercise-feedback').hidden,
      wrongFeedbackVisible: !document.querySelector('#checkbox-ex [data-key="legolas"] .quarto-exercise-feedback').hidden,
      unselectedCorrectRevealed: document.querySelector('#checkbox-ex [data-key="sam"]').classList.contains('is-correct'),
      statusText: document.querySelector('#checkbox-ex .quarto-exercise-status').textContent,
      frodoBg: getComputedStyle(frodoInput).backgroundColor,
      frodoBorder: getComputedStyle(frodoInput).borderColor,
      legolasBg: getComputedStyle(legolasInput).backgroundColor,
      legolasBorder: getComputedStyle(legolasInput).borderColor
    };
  });

  await page.click('#checkbox-ex .quarto-exercise-reset-btn');
  await page.click('#checkbox-ex [data-key="frodo"]');
  await page.click('#checkbox-ex [data-key="sam"]');
  await page.click('#checkbox-ex .quarto-exercise-check-btn');
  const checkboxCorrectState = await page.evaluate(() => ({
    frodoFeedbackVisible: !document.querySelector('#checkbox-ex [data-key="frodo"] .quarto-exercise-feedback').hidden,
    samFeedbackVisible: !document.querySelector('#checkbox-ex [data-key="sam"] .quarto-exercise-feedback').hidden,
    statusText: document.querySelector('#checkbox-ex .quarto-exercise-status').textContent
  }));

  await browser.close();
  return { standaloneBlankState, hintState, incorrectState, correctState, checkboxWrongState, checkboxCorrectState, selectWidthChoose, selectWidthLong };
}

test.describe('Quarto Exercises Extension Tests', () => {

  test.before(() => {
    setup();
  });

  test('JS unit tests for production matching logic', () => {
    const { checkBlankMatch } = loadRuntime();

    // Exact match
    assert.strictEqual(checkBlankMatch("Gandalf", "Gandalf", "exact", false, true, false), true);
    assert.strictEqual(checkBlankMatch("gandalf", "Gandalf", "exact", false, true, false), false);
    assert.strictEqual(checkBlankMatch("gandalf", "Gandalf", "exact", true, true, false), true);
    
    // Trim/Collapse spaces
    assert.strictEqual(checkBlankMatch("  Gandalf  ", "Gandalf", "exact", false, true, false), true);
    assert.strictEqual(checkBlankMatch("Gandalf The Grey", "Gandalf  The   Grey", "exact", false, true, true), true);

    // One of multiple
    assert.strictEqual(checkBlankMatch("Frodo Baggins", "Frodo|Frodo Baggins", "one-of", false, true, false), true);
    assert.strictEqual(checkBlankMatch("Samwise", "Frodo|Frodo Baggins", "one-of", false, true, false), false);
    assert.strictEqual(checkBlankMatch(" Frodo ", " Frodo |Sam", "one-of", false, false, false), true);
    assert.strictEqual(checkBlankMatch("Frodo", " Frodo |Sam", "one-of", false, false, false), false);

    // Regex
    assert.strictEqual(checkBlankMatch("The Fellowship of the Ring", "^The\\s+Fellowship\\s+of\\s+the\\s+Ring$", "regex", false, true, false), true);
    assert.strictEqual(checkBlankMatch("the fellowship of the ring", "^The\\s+Fellowship\\s+of\\s+the\\s+Ring$", "regex", true, true, false), true);
    assert.strictEqual(checkBlankMatch("Fellowship of the Ring", "^(the\\s+)?fellowship\\s+of\\s+the\\s+ring$", "regex", true, true, false), true);
    assert.strictEqual(checkBlankMatch("The Fellowship of the Ring", "^(the\\s+)?fellowship\\s+of\\s+the\\s+ring$", "regex", true, true, false), true);
    assert.strictEqual(checkBlankMatch("Frodo, Sam", "^Frodo,\\s+Sam$", "regex", false, true, false), true);
    assert.strictEqual(checkBlankMatch("Frodo", "^Frodo,\\s+Sam$", "regex", false, true, false), false);
  });

  test('Code cloze blank sizing resizes to typed text and toggles underline', () => {
    const context = loadRuntime();
    const { adjustCodeBlankWidthToText } = context;

    function withMockedMeasurement(run) {
      const originalGetComputedStyle = context.getComputedStyle;
      const originalCreateElement = context.document.createElement;
      const originalAppendChild = context.document.body.appendChild;

      let measurerWidth = 0;
      context.getComputedStyle = () => ({
        font: '16px monospace',
        letterSpacing: 'normal',
        wordSpacing: 'normal',
        textTransform: 'none',
        fontVariant: 'normal',
        fontFeatureSettings: 'normal'
      });
      context.document.createElement = (tag) => {
        if (tag === 'span') {
          return {
            style: {},
            textContent: '',
            getBoundingClientRect: () => ({ width: measurerWidth }),
            remove: () => {}
          };
        }
        return originalCreateElement.call(context.document, tag);
      };
      context.document.body.appendChild = (el) => {
        const widths = { total: 48, x: 8, abcdef: 48, '': 0 };
        measurerWidth = widths[el.textContent] ?? el.textContent.length * 8;
      };

      try {
        run();
      } finally {
        context.getComputedStyle = originalGetComputedStyle;
        context.document.createElement = originalCreateElement;
        context.document.body.appendChild = originalAppendChild;
      }
    }

    withMockedMeasurement(() => {
      // Empty input restores CSS defaults.
      const empty = { value: '', style: { width: '100px', borderBottom: 'none' }, dataset: {} };
      adjustCodeBlankWidthToText(empty);
      assert.strictEqual(empty.style.width, '', 'empty input should clear explicit width');
      assert.strictEqual(empty.style.borderBottom, '', 'empty input should restore underline');

      // Typed text resizes tightly and removes the placeholder underline.
      const medium = { value: 'total', style: { width: '80px', borderBottom: '1px solid rgb(85, 85, 85)' }, dataset: {} };
      adjustCodeBlankWidthToText(medium);
      assert.strictEqual(medium.style.width, '49px', 'width should be text width plus 1px cursor buffer');
      assert.strictEqual(medium.style.borderBottom, 'none', 'underline should disappear once text is present');

      // Short inputs are not constrained by a minimum width.
      const short = { value: 'x', style: { width: '80px', borderBottom: '1px solid rgb(85, 85, 85)' }, dataset: {} };
      adjustCodeBlankWidthToText(short);
      assert.strictEqual(short.style.width, '9px', 'single character should shrink to text width plus cursor buffer');

      // Width is capped to avoid runaway expansion.
      const long = { value: 'a'.repeat(500), style: { width: '80px', borderBottom: '1px solid rgb(85, 85, 85)' }, dataset: {} };
      adjustCodeBlankWidthToText(long);
      assert.strictEqual(long.style.width, '380px', 'long text should use the explicit width cap');
      assert.strictEqual(long.style.borderBottom, 'none', 'underline should still be removed for long text');
    });
  });

  test('Multiple choice rendering in HTML', (t) => {
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
    renderQuarto('mc.qmd');
    
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

  test('Fill-in-the-blank and cloze rendering in HTML', (t) => {
    const qmdContent = `---
title: "Blank Test"
filters:
  - quarto-exercises
---

The wizard is [\`Gandalf\`]{.blank answer="Gandalf" ignore-case=true}.

The Fellowship leaves [Rivendell|Minas Tirith|Edoras]{.choose answer="Rivendell"}.

\`\`\`{.code-cloze lang="r"}
rings <- list("Narya", "Nenya", "Vilya")
for(i in {{blank answer="seq_along(rings)"}}) {
  bearer <- {{choose answer="Frodo" options="Frodo|Sam"}}
}
\`\`\`
`;
    fs.writeFileSync(path.join(TEMP_DIR, 'blank.qmd'), qmdContent);
    renderQuarto('blank.qmd');
    
    const htmlPath = path.join(TEMP_DIR, 'blank.html');
    const html = fs.readFileSync(htmlPath, 'utf8');

    // Basic blank renders as input
    assert.match(html, /class="quarto-exercise-blank-input"/);
    assert.match(html, /class="quarto-exercise-blank-check-btn"/);
    assert.doesNotMatch(html, /placeholder=/);
    assert.match(html, /data-answers="Gandalf"/);
    assert.match(html, /data-ignore-case="true"/);
    assert.match(html, /data-feedback-incorrect=""/);

    // Standalone choose renders as dropdown
    assert.match(html, /class="quarto-exercise-choose-select"/);
    assert.match(html, /data-options="Rivendell\|Minas Tirith\|Edoras"/);
    assert.match(html, /data-answer="Rivendell"/);

    // Code cloze renders correctly
    assert.match(html, /class="[^"]*quarto-exercise-code-cloze-container/);
    assert.match(html, /data-cloze-metadata=/);
    assert.match(html, /QEXCLOZEP/);

    // Syntax highlighting must be preserved — Pandoc emits sourceCode class
    // and wraps tokens in <span> elements when it knows the language.
    assert.match(html, /class="sourceCode r"/,
      'code-cloze block must carry the r language class so Pandoc syntax-highlights it');
    // There must be at least one <span class="..."> inside the highlighted code
    // (e.g. keywords, strings, operators highlighted as spans)
    assert.match(html, /<span class="[^"]+">(?!<\/span>)/,
      'syntax highlighting must produce <span> elements inside the code block');
  });

  test('Pipe-delimited choices preserve spaces as option values', (t) => {
    const qmdContent = `---
title: "Pipe Choice Test"
filters:
  - quarto-exercises
---

The path is [Mordor| Gondor |Rohan]{.choose answer="Mordor"}.
`;
    fs.writeFileSync(path.join(TEMP_DIR, 'pipe-choice.qmd'), qmdContent);
    renderQuarto('pipe-choice.qmd');

    const html = fs.readFileSync(path.join(TEMP_DIR, 'pipe-choice.html'), 'utf8');
    assert.match(html, /data-options="Mordor\| Gondor \|Rohan"/);
    assert.match(html, /data-answer="Mordor"/);
  });

  test('Inline blanks validate exact, one-of, regex, trimming, and whitespace behavior in browser', async () => {
    const playwright = require('playwright');

    const qmdContent = `---
title: "Inline Blank Behavior Test"
format:
  html:
    embed-resources: true
filters:
  - quarto-exercises
---

Trimmed exact: [\`Gandalf\`]{.blank answer="Gandalf" feedback-correct="Exact ok" feedback-incorrect="Exact wrong"}.

Collapsed one-of: [\`Sam\`]{.blank answers="Samwise|Sam|Samwise Gamgee" match="one-of" ignore-case=true collapse-space=true feedback-correct="List ok" feedback-incorrect="List wrong"}.

Literal spaces: [\`Frodo  Baggins\`]{.blank answers="Frodo  Baggins|Sam" match="one-of" trim=false feedback-correct="Spaces ok" feedback-incorrect="Spaces wrong"}.

Binary literal: [\`1001\`]{.blank answer="^(0b)?1001$" match="regex" ignore-case=true feedback-correct="Regex ok" feedback-incorrect="Regex wrong"}.

Comma regex: [\`Frodo, Sam\`]{.blank answer="^Frodo,\\s+Sam$" match="regex" feedback-correct="Comma ok" feedback-incorrect="Comma wrong"}.
`;
    fs.writeFileSync(path.join(TEMP_DIR, 'inline-blank-behavior.qmd'), qmdContent);
    renderQuarto('inline-blank-behavior.qmd');

    const browser = await playwright.chromium.launch();
    try {
      const page = await browser.newPage();
      await page.goto(`file://${path.join(TEMP_DIR, 'inline-blank-behavior.html')}`, { waitUntil: 'load' });
      const blanks = page.locator('.quarto-exercise-blank-container');

      async function checkBlank(index, value, expectedFeedback) {
        const blank = blanks.nth(index);
        await blank.locator('input').fill(value);
        await blank.locator('button').click();
        await expectFeedback(blank, expectedFeedback);
      }

      async function expectFeedback(blank, text) {
        await page.waitForFunction(
          ([el, expected]) => el.querySelector('.quarto-exercise-blank-feedback').textContent === expected,
          [await blank.elementHandle(), text]
        );
        assert.strictEqual(await blank.locator('.quarto-exercise-blank-feedback').textContent(), text);
      }

      await checkBlank(0, '  Gandalf  ', 'Exact ok');
      await checkBlank(1, 'samwise   gamgee', 'List ok');
      await checkBlank(2, 'Frodo Baggins', 'Spaces wrong');
      await checkBlank(2, 'Frodo  Baggins', 'Spaces ok');
      await checkBlank(3, '10010', 'Regex wrong');
      await checkBlank(3, '0B1001', 'Regex ok');
      await checkBlank(4, 'Frodo', 'Comma wrong');
      await checkBlank(4, 'Frodo, Sam', 'Comma ok');
    } finally {
      await browser.close();
    }
  });

  test('Inline choices expose pipe options and require the selected answer in browser', async () => {
    const playwright = require('playwright');

    const qmdContent = `---
title: "Inline Choice Behavior Test"
format:
  html:
    embed-resources: true
filters:
  - quarto-exercises
---

Destination: [Mordor|Minas Tirith|Rohan]{.choose answer="Minas Tirith" feedback-correct="Choice ok" feedback-incorrect="Choice wrong"}.

Syntax token: [yes/no|maybe|unknown]{.choose answer="yes/no" feedback-correct="Slash ok" feedback-incorrect="Slash wrong"}.

Spaced option: [Mordor| Gondor |Rohan]{.choose answer="Mordor" feedback-correct="Space list ok" feedback-incorrect="Space list wrong"}.
`;
    fs.writeFileSync(path.join(TEMP_DIR, 'inline-choice-behavior.qmd'), qmdContent);
    renderQuarto('inline-choice-behavior.qmd');

    const browser = await playwright.chromium.launch();
    try {
      const page = await browser.newPage();
      await page.goto(`file://${path.join(TEMP_DIR, 'inline-choice-behavior.html')}`, { waitUntil: 'load' });
      const choices = page.locator('.quarto-exercise-choose-container');

      assert.deepStrictEqual(await choices.nth(0).locator('option').evaluateAll(options => options.map(option => option.textContent)), [
        'Choose...', 'Mordor', 'Minas Tirith', 'Rohan'
      ]);
      assert.deepStrictEqual(await choices.nth(1).locator('option').evaluateAll(options => options.map(option => option.textContent)), [
        'Choose...', 'yes/no', 'maybe', 'unknown'
      ]);
      assert.deepStrictEqual(await choices.nth(2).locator('option').evaluateAll(options => options.map(option => option.textContent)), [
        'Choose...', 'Mordor', ' Gondor ', 'Rohan'
      ]);

      async function checkChoice(index, value, expectedFeedback) {
        const choice = choices.nth(index);
        await choice.locator('select').selectOption(value);
        await choice.locator('button').click();
        await page.waitForFunction(
          ([el, expected]) => el.querySelector('.quarto-exercise-choose-feedback').textContent === expected,
          [await choice.elementHandle(), expectedFeedback]
        );
        assert.strictEqual(await choice.locator('.quarto-exercise-choose-feedback').textContent(), expectedFeedback);
      }

      await checkChoice(0, 'Mordor', 'Choice wrong');
      await checkChoice(0, 'Minas Tirith', 'Choice ok');
      await checkChoice(1, 'yes/no', 'Slash ok');
      await checkChoice(2, ' Gondor ', 'Space list wrong');
      await checkChoice(2, 'Mordor', 'Space list ok');
    } finally {
      await browser.close();
    }
  });

  test('Code cloze regex blanks preserve backslashes and validate optional words', async () => {
    const playwright = require('playwright');

    const qmdContent = `---
title: "Code Cloze Regex Test"
format:
  html:
    embed-resources: true
filters:
  - quarto-exercises
---

\`\`\`{.code-cloze lang="python"}
book = {{blank answer="^(the\\s+)?fellowship\\s+of\\s+the\\s+ring$" match="regex" ignore-case="true"}}
\`\`\`
`;
    fs.writeFileSync(path.join(TEMP_DIR, 'code-cloze-regex.qmd'), qmdContent);
    renderQuarto('code-cloze-regex.qmd');

    const browser = await playwright.chromium.launch();
    try {
      const page = await browser.newPage();
      await page.goto(`file://${path.join(TEMP_DIR, 'code-cloze-regex.html')}`, { waitUntil: 'load' });
      const blank = page.locator('.quarto-exercise-code-blank');
      const check = page.locator('.quarto-exercise-check-btn');

      await blank.fill('Fellowship of the Ring');
      await check.click();
      assert.strictEqual(await blank.evaluate(el => el.classList.contains('is-correct')), true);

      await page.locator('.quarto-exercise-reset-btn').click();
      await blank.fill('The Fellowship of the Ring');
      await check.click();
      assert.strictEqual(await blank.evaluate(el => el.classList.contains('is-correct')), true);
    } finally {
      await browser.close();
    }
  });

  test('Grouped code cloze validates all controls and accepts optional-word regex blanks', async () => {
    const playwright = require('playwright');

    const qmdContent = `---
title: "Grouped Code Cloze Regex Test"
format:
  html:
    embed-resources: true
filters:
  - quarto-exercises
---

::: {.exercise explanation="after-check"}
\`\`\`{.code-cloze lang="python"}
fellowship = {
    "bearer": {{choose answer='"Frodo"' options='"Frodo"|"Sam"|"Merry"' ignore-case="true" shuffle="false"}},
    "companion": {{blank answers='"Samwise"|"Sam"|"Samwise Gamgee"' match="one-of" ignore-case="true" trim="true" collapse-space="true"}},
    "first_book_title": {{blank answer="^(the\\s+)?fellowship\\s+of\\s+the\\s+ring$" match="regex" ignore-case="true"}},
}
\`\`\`
:::
`;
    fs.writeFileSync(path.join(TEMP_DIR, 'grouped-code-cloze-regex.qmd'), qmdContent);
    renderQuarto('grouped-code-cloze-regex.qmd');

    const browser = await playwright.chromium.launch();
    try {
      const page = await browser.newPage();
      await page.goto(`file://${path.join(TEMP_DIR, 'grouped-code-cloze-regex.html')}`, { waitUntil: 'load' });

      await page.locator('.quarto-exercise-code-choose').selectOption('"Frodo"');
      await page.locator('.quarto-exercise-code-blank').nth(0).fill('"Sam"');
      await page.locator('.quarto-exercise-code-blank').nth(1).fill('Fellowship of the Ring');
      await page.locator('.quarto-exercise-check-btn').click();

      assert.strictEqual(await page.locator('.quarto-exercise-code-blank').nth(1).evaluate(el => el.classList.contains('is-correct')), true);
      assert.strictEqual(await page.locator('.quarto-exercise-status').textContent(), 'Correct!');
    } finally {
      await browser.close();
    }
  });

  test('Validation warnings appear in stderr output', (t) => {
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

[\`Gandalf\`]{.blank}

[No Answer]{.choose}
`;
    fs.writeFileSync(path.join(TEMP_DIR, 'warnings.qmd'), qmdContent);
    const result = renderQuarto('warnings.qmd');
    
    const stderrLog = result.stderr + result.stdout;
    
    assert.match(stderrLog, /has no correct answers/);
    assert.match(stderrLog, /has no \.answer blocks or inline blanks\/choices/);
    assert.match(stderrLog, /match="regex" with no answer/);
    assert.match(stderrLog, /blank with no answer/);
    assert.match(stderrLog, /choose block with no answer/);
  });

  test('Non-HTML fallback rendering', (t) => {
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
    renderQuarto('fallback.qmd', 'markdown');
    
    const mdPath = path.join(TEMP_DIR, 'fallback.md');
    const md = fs.readFileSync(mdPath, 'utf8');

    // Should render list letters and answer keys
    assert.match(md, /A\.\s+Frodo/);
    assert.match(md, /B\.\s+Legolas/);
    assert.match(md, /Answer:\s+A/);
    assert.match(md, /Gandalf/);
    assert.doesNotMatch(md, /<div>/);
  });

  test('Code cloze fallback renders placeholders and answer keys in non-HTML output', () => {
    const qmdContent = `---
title: "Code Cloze Fallback Test"
filters:
  - quarto-exercises
quarto-exercises:
  show-answers: true
---

\`\`\`{.code-cloze lang="r"}
x <- {{choose answer="c" options="c|list|data.frame"}}(1, 2, 3)
total <- {{blank answer="sum"}}(x)
\`\`\`
`;
    fs.writeFileSync(path.join(TEMP_DIR, 'code-cloze-fallback.qmd'), qmdContent);
    renderQuarto('code-cloze-fallback.qmd', 'markdown');

    const md = fs.readFileSync(path.join(TEMP_DIR, 'code-cloze-fallback.md'), 'utf8');
    assert.match(md, /x <- ________\(1, 2, 3\)/);
    assert.match(md, /total <- ________\(x\)/);
    assert.match(md, /Answer:\s*1\. c,\s*2\. sum/);
    assert.doesNotMatch(md, /\{\{choose/);
    assert.doesNotMatch(md, /\{\{blank/);
  });

  test('Boolean attributes accept uppercase TRUE', (t) => {
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
    const result = renderQuarto('bool.qmd');
    const log = result.stderr + result.stdout;
    const html = fs.readFileSync(path.join(TEMP_DIR, 'bool.html'), 'utf8');

    assert.doesNotMatch(log, /invalid boolean value/);
    assert.doesNotMatch(log, /has no correct answers/);
    assert.match(html, /data-correct="true"/);
  });

  test('Numeric boolean attributes are invalid and not truthy', (t) => {
    const qmdContent = `---
title: "Numeric Boolean Test"
filters:
  - quarto-exercises
---

::: {.exercise #numeric-bool}
Select the hobbit.

::: {.answer correct=1}
Frodo
:::

::: {.answer}
Legolas
:::
:::
`;
    fs.writeFileSync(path.join(TEMP_DIR, 'numeric-bool.qmd'), qmdContent);
    const result = renderQuarto('numeric-bool.qmd');
    const log = result.stderr + result.stdout;
    const html = fs.readFileSync(path.join(TEMP_DIR, 'numeric-bool.html'), 'utf8');

    assert.match(log, /invalid boolean value for 'correct': '1'/);
    assert.match(log, /has no correct answers/);
    assert.match(html, /data-correct="false"/);
    assert.doesNotMatch(html, /data-correct="true"/);
  });

  test('JS click interaction simulation', () => {
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

  test('Code cloze blank browser behavior: default width, blur resize, reset', async () => {
    const playwright = require('playwright');

    const qmdContent = `---
title: "Code Cloze Blank Test"
format:
  html:
    embed-resources: true
filters:
  - quarto-exercises
---

\`\`\`{.code-cloze lang="python"}
numbers = [1, 2, 3, 4, 5]
total = {{choose answer="sum" options="sum|max|min|len"}}(numbers)
print({{blank answer="total"}})
\`\`\`
`;
    fs.writeFileSync(path.join(TEMP_DIR, 'code-cloze.qmd'), qmdContent);
    renderQuarto('code-cloze.qmd');

    const browser = await playwright.chromium.launch();
    try {
      const page = await browser.newPage({ viewport: { width: 900, height: 600 } });
      await page.goto(`file://${path.join(TEMP_DIR, 'code-cloze.html')}`, { waitUntil: 'load' });

      const blank = page.locator('.quarto-exercise-code-blank').first();
      const select = page.locator('.quarto-exercise-code-choose').first();
      const reset = page.locator('.quarto-exercise-reset-btn');
      const check = page.locator('.quarto-exercise-check-btn');
      const pageErrors = [];
      page.on('pageerror', error => pageErrors.push(error.message));

      const getBlankState = async () => blank.evaluate(el => ({
        width: el.getBoundingClientRect().width,
        styleWidth: el.style.width,
        styleWidthNumber: parseFloat(el.style.width) || 0,
        borderBottomWidth: parseFloat(getComputedStyle(el).borderBottomWidth),
        borderBottomStyle: getComputedStyle(el).borderBottomStyle,
        value: el.value,
        correct: el.classList.contains('is-correct'),
        incorrect: el.classList.contains('is-incorrect')
      }));
      const expectWidthNear = (actual, expected, label) => {
        assert.ok(Math.abs(actual - expected) < 0.5, `${label} (got ${actual}px, expected ${expected}px)`);
      };
      const waitForResetWidth = () => page.waitForFunction(() => {
        const el = document.querySelector('.quarto-exercise-code-blank');
        return el.value === '' && el.style.width === '' && Math.abs(el.getBoundingClientRect().width - 80) < 0.5;
      });

      const initial = await getBlankState();
      expectWidthNear(initial.width, 80, 'code blank should start at default width');
      assert.ok(initial.borderBottomWidth > 0, 'code blank should start with a visible underline');
      assert.strictEqual(initial.borderBottomStyle, 'solid', 'code blank underline should be solid');
      assert.strictEqual(initial.value, '', 'code blank should start empty');

      await blank.fill('print');
      const whileTyping = await getBlankState();
      assert.ok(whileTyping.styleWidthNumber < 80, `code blank should shrink to typed text while typing (got ${whileTyping.styleWidth})`);
      assert.strictEqual(whileTyping.borderBottomWidth, 0, 'code blank should remove underline while typing');
      assert.strictEqual(whileTyping.value, 'print', 'code blank value should be the typed text');

      await blank.press('Tab');
      await page.waitForFunction(
        () => parseFloat(document.querySelector('.quarto-exercise-code-blank').style.width) < 80
      );
      const afterBlur = await getBlankState();
      assert.strictEqual(afterBlur.styleWidth, whileTyping.styleWidth, 'blur should preserve the current typed-text width');
      assert.strictEqual(afterBlur.borderBottomWidth, 0, 'code blank should keep underline removed after blur');

      await blank.fill('system.out.println');
      const afterLongEdit = await getBlankState();
      assert.ok(
        afterLongEdit.styleWidthNumber > afterBlur.styleWidthNumber,
        `code blank should expand while editing after blur (got ${afterLongEdit.styleWidth}, started at ${afterBlur.styleWidth})`
      );
      assert.strictEqual(afterLongEdit.value, 'system.out.println', 'longer edit should remain visible in the input value');

      await reset.click();
      await waitForResetWidth();
      const afterEditReset = await getBlankState();
      expectWidthNear(afterEditReset.width, 80, 'code blank should reset to default width after dynamic editing');
      assert.strictEqual(afterEditReset.styleWidth, '', 'code blank should clear explicit width on reset');
      assert.strictEqual(afterEditReset.value, '', 'code blank should clear value on reset after dynamic editing');

      await blank.fill('total');
      await blank.press('Tab');
      await select.selectOption('max');
      await check.click();
      const incorrect = await getBlankState();
      assert.strictEqual(incorrect.correct, true, 'correct blank text should be marked correct');
      assert.strictEqual(
        await select.evaluate(el => el.classList.contains('is-incorrect')),
        true,
        'wrong code choose value should be marked incorrect'
      );

      await reset.click();
      await waitForResetWidth();
      const afterReset = await getBlankState();
      expectWidthNear(afterReset.width, 80, 'code blank should reset to default width');
      assert.strictEqual(afterReset.styleWidth, '', 'code blank should clear explicit width on reset');
      assert.ok(afterReset.borderBottomWidth > 0, 'code blank should restore underline on reset');
      assert.strictEqual(afterReset.value, '', 'code blank should clear value on reset');
      assert.strictEqual(afterReset.correct, false, 'code blank correct state should clear on reset');
      assert.strictEqual(afterReset.incorrect, false, 'code blank incorrect state should clear on reset');
      assert.strictEqual(await select.inputValue(), '', 'code choose should reset to placeholder value');
      assert.strictEqual(
        await select.evaluate(el => el.classList.contains('is-incorrect')),
        false,
        'code choose incorrect state should clear on reset'
      );

      await blank.fill('total');
      await select.selectOption('sum');
      await check.click();
      await check.click();
      assert.deepStrictEqual(pageErrors, [], 'checking an already-correct code cloze should not throw');
      assert.strictEqual(await page.locator('.quarto-exercise-status').textContent(), 'Correct!');
    } finally {
      await browser.close();
    }
  });

  test('Exercise browser behavior: reveal, explanation, reset, and lock', async () => {
    const playwright = require('playwright');
    const qmdContent = `---
title: "Exercise Browser Behavior"
format:
  html:
    embed-resources: true
filters:
  - quarto-exercises
---

::: {.exercise #reveal-ex reveal=true explanation="after-check"}
Choose the hobbit.

::: {.answer key="frodo" correct=true}
Frodo
:::

::: {.answer key="legolas"}
Legolas
:::

::: {.explanation}
Frodo is the hobbit.
:::
:::

::: {.exercise #lock-ex lock=true}
Choose the wizard.

::: {.answer key="gandalf" correct=true}
Gandalf
:::

::: {.answer key="saruman"}
Saruman
:::
:::
`;
    fs.writeFileSync(path.join(TEMP_DIR, 'browser-behavior.qmd'), qmdContent);
    renderQuarto('browser-behavior.qmd');

    const browser = await playwright.chromium.launch();
    try {
      const page = await browser.newPage({ viewport: { width: 900, height: 600 } });
      await page.goto(`file://${path.join(TEMP_DIR, 'browser-behavior.html')}`, { waitUntil: 'load' });

      await page.click('#reveal-ex [data-key="legolas"]');
      await page.click('#reveal-ex .quarto-exercise-check-btn');
      assert.strictEqual(await page.locator('#reveal-ex .quarto-exercise-status').textContent(), 'Not quite.');
      assert.strictEqual(await page.locator('#reveal-ex .quarto-exercise-explanation').isVisible(), true);
      assert.strictEqual(await page.locator('#reveal-ex [data-key="frodo"]').evaluate(el => el.classList.contains('is-correct')), true);
      assert.strictEqual(await page.locator('#reveal-ex [data-key="legolas"]').evaluate(el => el.classList.contains('is-incorrect')), true);

      await page.click('#reveal-ex .quarto-exercise-reset-btn');
      assert.strictEqual(await page.locator('#reveal-ex .quarto-exercise-status').textContent(), '');
      assert.strictEqual(await page.locator('#reveal-ex .quarto-exercise-explanation').isVisible(), false);
      assert.strictEqual(await page.locator('#reveal-ex [data-key="frodo"]').evaluate(el => el.classList.contains('is-correct')), false);
      assert.strictEqual(await page.locator('#reveal-ex [data-key="legolas"] input').isChecked(), false);

      await page.click('#lock-ex [data-key="gandalf"]');
      await page.click('#lock-ex .quarto-exercise-check-btn');
      assert.strictEqual(await page.locator('#lock-ex').evaluate(el => el.classList.contains('is-locked')), true);
      assert.strictEqual(await page.locator('#lock-ex [data-key="gandalf"] input').isDisabled(), true);
      assert.strictEqual(await page.locator('#lock-ex .quarto-exercise-check-btn').isDisabled(), true);
      assert.strictEqual(await page.locator('#lock-ex .quarto-exercise-reset-btn').isDisabled(), true);
      assert.strictEqual(await page.locator('#lock-ex .quarto-exercise-status').textContent(), 'Correct!');
    } finally {
      await browser.close();
    }
  });

  test('Tests leave tracked files clean', (t) => {
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

  test('Lua defaults stay explicit and stable', () => {
    const lua = fs.readFileSync(path.join(__dirname, '..', '_extensions', 'quarto-exercises', 'quarto-exercises.lua'), 'utf8');
    assert.deepStrictEqual(parseLuaDefaults(lua), {
      instant: false,
      reveal: false,
      lock: false,
      reset: true,
      shuffle: false,
      'reshuffle-on-reset': false,
      'show-answers': false,
      explanation: 'correct',
      'feedback-correct': 'Correct!',
      'feedback-incorrect': 'Not quite.',
      'ignore-case': false
    });
  });

  test('Default options render into exercise, blank, and choice controls', () => {
    const qmdContent = `---
title: "Default Options"
filters:
  - quarto-exercises
---

::: {.exercise #defaults}
Choose one and fill the inline controls.

::: {.answer correct=true}
Correct choice
:::

::: {.answer}
Wrong choice
:::

::: {.explanation}
Only shows after a correct check by default.
:::
:::

Default blank: [\`Gandalf\`]{.blank answer="Gandalf"}.

Default choice: [Rivendell|Edoras]{.choose answer="Rivendell"}.
`;
    fs.writeFileSync(path.join(TEMP_DIR, 'defaults.qmd'), qmdContent);
    renderQuarto('defaults.qmd');

    const html = fs.readFileSync(path.join(TEMP_DIR, 'defaults.html'), 'utf8');
    assert.match(html, /id="defaults"/);
    assert.match(html, /data-instant="false"/);
    assert.match(html, /data-reveal="false"/);
    assert.match(html, /data-lock="false"/);
    assert.match(html, /data-reset="true"/);
    assert.match(html, /data-shuffle="false"/);
    assert.match(html, /data-reshuffle-on-reset="false"/);
    assert.match(html, /data-explanation-policy="correct"/);
    assert.match(html, /data-feedback-correct="Correct!"/);
    assert.match(html, /data-feedback-incorrect="Not quite\."/);
    assert.match(html, /class="quarto-exercise-check-btn"/);
    assert.match(html, /class="quarto-exercise-reset-btn"/);

    assert.match(html, /class="quarto-exercise-blank-container"[^>]*data-ignore-case="false"/);
    assert.match(html, /class="quarto-exercise-blank-container"[^>]*data-trim="true"/);
    assert.match(html, /class="quarto-exercise-blank-container"[^>]*data-collapse-space="false"/);
    assert.match(html, /class="quarto-exercise-choose-container"[^>]*data-shuffle="false"/);
    assert.match(html, /class="quarto-exercise-choose-container"[^>]*data-ignore-case="false"/);
  });

  test('Global metadata overrides render into exercise, blank, and choice controls', () => {
    const qmdContent = `---
title: "Override Options"
filters:
  - quarto-exercises
quarto-exercises:
  instant: true
  reveal: true
  lock: true
  reset: false
  shuffle: true
  reshuffle-on-reset: true
  explanation: after-check
  feedback-correct: "Yep"
  feedback-incorrect: "Nope"
  ignore-case: true
---

::: {.exercise #overrides}
Choose one.

::: {.answer correct=true}
Correct choice
:::

::: {.answer}
Wrong choice
:::

::: {.explanation}
Shows after any check.
:::
:::

Case-insensitive blank: [\`Gandalf\`]{.blank answer="Gandalf"}.

Shuffled choice: [Rivendell|Edoras]{.choose answer="Rivendell"}.
`;
    fs.writeFileSync(path.join(TEMP_DIR, 'overrides.qmd'), qmdContent);
    renderQuarto('overrides.qmd');

    const html = fs.readFileSync(path.join(TEMP_DIR, 'overrides.html'), 'utf8');
    assert.match(html, /id="overrides"/);
    assert.match(html, /data-instant="true"/);
    assert.match(html, /data-reveal="true"/);
    assert.match(html, /data-lock="true"/);
    assert.match(html, /data-reset="false"/);
    assert.match(html, /data-shuffle="true"/);
    assert.match(html, /data-reshuffle-on-reset="true"/);
    assert.match(html, /data-explanation-policy="after-check"/);
    assert.match(html, /data-feedback-correct="Yep"/);
    assert.match(html, /data-feedback-incorrect="Nope"/);
    assert.doesNotMatch(html, /class="quarto-exercise-check-btn"/);
    assert.doesNotMatch(html, /class="quarto-exercise-reset-btn"/);

    assert.match(html, /class="quarto-exercise-blank-container"[^>]*data-ignore-case="true"/);
    assert.match(html, /class="quarto-exercise-choose-container"[^>]*data-shuffle="true"/);
  });

  test('Exercise attributes override global metadata for one exercise', () => {
    const qmdContent = `---
title: "Local Overrides"
filters:
  - quarto-exercises
quarto-exercises:
  instant: true
  reveal: true
  lock: true
  reset: false
  shuffle: true
  reshuffle-on-reset: true
  explanation: never
  feedback-correct: "Global correct"
  feedback-incorrect: "Global wrong"
---

::: {.exercise #local instant=false reveal=false lock=false reset=true shuffle=false reshuffle-on-reset=false explanation="after-check" feedback-correct="Local correct" feedback-incorrect="Local wrong"}
Choose one.

::: {.answer correct=true}
Correct choice
:::

::: {.answer}
Wrong choice
:::

::: {.explanation}
Local explanation.
:::
:::
`;
    fs.writeFileSync(path.join(TEMP_DIR, 'local-overrides.qmd'), qmdContent);
    renderQuarto('local-overrides.qmd');

    const html = fs.readFileSync(path.join(TEMP_DIR, 'local-overrides.html'), 'utf8');
    assert.match(html, /id="local"/);
    assert.match(html, /data-instant="false"/);
    assert.match(html, /data-reveal="false"/);
    assert.match(html, /data-lock="false"/);
    assert.match(html, /data-reset="true"/);
    assert.match(html, /data-shuffle="false"/);
    assert.match(html, /data-reshuffle-on-reset="false"/);
    assert.match(html, /data-explanation-policy="after-check"/);
    assert.match(html, /data-feedback-correct="Local correct"/);
    assert.match(html, /data-feedback-incorrect="Local wrong"/);
    assert.match(html, /class="quarto-exercise-check-btn"/);
    assert.match(html, /class="quarto-exercise-reset-btn"/);
  });

  test('Stylesheet exposes the expected light and dark CSS defaults', () => {
    const css = fs.readFileSync(path.join(__dirname, '..', '_extensions', 'quarto-exercises', 'quarto-exercises.css'), 'utf8');
    assert.deepStrictEqual(parseCssVariables(css, ':root'), {
      '--ex-accent': '#1a73e8',
      '--ex-accent-dark': '#4285f4',
      '--ex-correct': '#137333',
      '--ex-incorrect': '#c5221f',
      '--ex-incorrect-border': '#ea4335',
      '--ex-muted': '#555',
      '--ex-muted-dark': '#aaa',
      '--ex-border-color': '#ccc',
      '--ex-border-strong': '#ced4da',
      '--ex-bg': 'transparent',
      '--ex-control-bg': '#f8f9fa',
      '--ex-control-hover-bg': '#e9ecef',
      '--ex-control-primary-bg': '#e9ecef',
      '--ex-control-primary-hover-bg': '#dee2e6',
      '--ex-border-radius': '4px',
      '--ex-focus-ring': '0 0 0 2px rgba(26, 115, 232, 0.3)',
      '--ex-panel-border': '#6c757d',
      '--ex-panel-border-dark': '#adb5bd'
    });
    assert.deepStrictEqual(parseCssVariables(css, 'body.quarto-dark'), {
      '--ex-accent': '#8ab4f8',
      '--ex-accent-dark': '#aecbfa',
      '--ex-correct': '#81c995',
      '--ex-incorrect': '#f28b82',
      '--ex-incorrect-border': '#f28b82',
      '--ex-muted': '#aaa',
      '--ex-muted-dark': '#aaa',
      '--ex-border-color': '#555',
      '--ex-border-strong': '#666',
      '--ex-bg': 'transparent',
      '--ex-control-bg': '#2d2e30',
      '--ex-control-hover-bg': '#3c4043',
      '--ex-control-primary-bg': '#3c4043',
      '--ex-control-primary-hover-bg': '#4f5357',
      '--ex-focus-ring': '0 0 0 2px rgba(138, 180, 248, 0.4)',
      '--ex-panel-border': '#9aa0a6'
    });
  });

  test('Light and dark visual smoke snapshots', async () => {
    const playwright = require('playwright');

    fs.mkdirSync(path.join(TEMP_DIR, 'visual'), { recursive: true });

    for (const mode of ['light', 'dark']) {
      const result = await runVisualMode(playwright, mode);
      const { standaloneBlankState, hintState, incorrectState, correctState, checkboxWrongState, checkboxCorrectState, selectWidthChoose, selectWidthLong } = result;

      assert.ok(selectWidthChoose < selectWidthLong, `${mode} choose select should expand for longer selected option`);
      assert.strictEqual(standaloneBlankState.placeholder, '', `${mode} standalone blank placeholder should be empty`);
      assert.strictEqual(standaloneBlankState.shortWidth, standaloneBlankState.longWidth, `${mode} placeholder should not affect default width of entry box`);
      if (mode === 'dark') {
        assert.match(standaloneBlankState.buttonBg, /rgb\(45, 46, 48\)/, `${mode} blank check button background`);
        assert.match(standaloneBlankState.buttonBorder, /rgb\(85, 85, 85\)/, `${mode} blank check button border`);
      } else {
        assert.match(standaloneBlankState.buttonBg, /rgb\(248, 249, 250\)/, `${mode} blank check button background`);
        assert.match(standaloneBlankState.buttonBorder, /rgb\(204, 204, 204\)/, `${mode} blank check button border`);
      }
      assert.strictEqual(standaloneBlankState.feedbackHiddenAfterWrong, true, `${mode} default blank wrong feedback should be hidden`);
      assert.strictEqual(hintState.initiallyHidden, true, `${mode} hint should start hidden`);
      assert.strictEqual(hintState.visibleAfterClick, true, `${mode} hint button should reveal hint`);

      if (mode === 'dark') {
        assert.match(incorrectState.answerColor, /rgb\(242, 139, 130\)/, `${mode} incorrect answer color`);
        assert.match(incorrectState.feedbackColor, /rgb\(242, 139, 130\)/, `${mode} inline feedback color`);
      } else {
        assert.match(incorrectState.answerColor, /rgb\(197, 34, 31\)/, `${mode} incorrect answer color`);
        assert.match(incorrectState.feedbackColor, /rgb\(197, 34, 31\)/, `${mode} inline feedback color`);
      }

      assert.strictEqual(incorrectState.chooseFeedbackVisible, true, `${mode} nested choose feedback should show`);
      assert.strictEqual(incorrectState.blankFeedbackVisible, true, `${mode} nested blank feedback should show`);
      assert.strictEqual(incorrectState.contentRightOfControl, true, `${mode} answer content should sit beside control`);
      assert.ok(incorrectState.exerciseHeight > 20, `${mode} answer row should have visible height`);

      if (mode === 'dark') {
        assert.match(incorrectState.hintColor, /rgb\(170, 170, 170\)/, 'dark hint color');
      } else {
        assert.match(incorrectState.hintColor, /rgb\(85, 85, 85\)/, 'light hint color');
      }

      if (mode === 'dark') {
        assert.match(correctState.answerColor, /rgb\(129, 201, 149\)/, `${mode} correct answer color`);
        assert.match(correctState.statusColor, /rgb\(129, 201, 149\)/, `${mode} status color`);
        assert.match(correctState.blankColor, /rgb\(129, 201, 149\)/, `${mode} blank correct text should be green`);
        assert.match(correctState.blankUnderline, /rgb\(129, 201, 149\)/, `${mode} blank underline should be green`);
      } else {
        assert.match(correctState.answerColor, /rgb\(19, 115, 51\)/, `${mode} correct answer color`);
        assert.match(correctState.statusColor, /rgb\(19, 115, 51\)/, `${mode} status color`);
        assert.match(correctState.blankColor, /rgb\(19, 115, 51\)/, `${mode} blank correct text should be green`);
        assert.match(correctState.blankUnderline, /rgb\(19, 115, 51\)/, `${mode} blank underline should be green`);
      }

      assert.strictEqual(correctState.explanationVisible, true, `${mode} explanation should show after check`);
      assert.strictEqual(correctState.statusText, 'Correct!');
      assert.strictEqual(checkboxWrongState.correctFeedbackVisible, true, `${mode} selected correct checkbox feedback should show`);
      assert.strictEqual(checkboxWrongState.wrongFeedbackVisible, true, `${mode} selected wrong checkbox feedback should show`);
      
      if (mode === 'dark') {
        assert.match(checkboxWrongState.frodoBg, /rgb\(129, 201, 149\)/, `${mode} correct checked checkbox background`);
        assert.match(checkboxWrongState.legolasBg, /rgb\(242, 139, 130\)/, `${mode} incorrect checked checkbox background`);
      } else {
        assert.match(checkboxWrongState.frodoBg, /rgb\(19, 115, 51\)/, `${mode} correct checked checkbox background`);
        assert.match(checkboxWrongState.legolasBg, /rgb\(197, 34, 31\)/, `${mode} incorrect checked checkbox background`);
      }

      assert.strictEqual(checkboxWrongState.unselectedCorrectRevealed, true, `${mode} reveal=true should reveal unselected correct checkbox`);
      assert.strictEqual(checkboxWrongState.statusText, 'Not quite.');
      assert.strictEqual(checkboxCorrectState.frodoFeedbackVisible, true, `${mode} exact-set feedback should show for Frodo`);
      assert.strictEqual(checkboxCorrectState.samFeedbackVisible, true, `${mode} exact-set feedback should show for Sam`);
      assert.strictEqual(checkboxCorrectState.statusText, 'Correct!');

      for (const state of ['incorrect', 'correct']) {
        const shot = path.join(TEMP_DIR, 'visual', `${mode}-${state}.png`);
        assert.ok(fs.existsSync(shot), `${shot} should exist`);
        assert.ok(fs.statSync(shot).size > 1000, `${shot} should not be blank`);
      }
    }
  });
});
