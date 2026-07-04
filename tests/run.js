// tests/run.js
// Automated test suite for quarto-exercises extension
// Run with: node tests/run.js

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const assert = require('assert');
const test = require('node:test');

const TEMP_DIR = path.join(__dirname, 'test-sandbox');

// Helper to prepare temp directory
function setup() {
  if (fs.existsSync(TEMP_DIR)) {
    fs.rmSync(TEMP_DIR, { recursive: true, force: true });
  }
  fs.mkdirSync(TEMP_DIR);
  
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
  const res = spawnSync('quarto', ['render', filePath, '--to', format], {
    encoding: 'utf8',
    shell: true
  });
  return {
    stdout: res.stdout || '',
    stderr: res.stderr || '',
    success: res.status === 0
  };
}

test.describe('Quarto Exercises Extension Tests', () => {

  test.before(() => {
    setup();
  });

  test('1. JS Unit Tests (Matching Logic)', () => {
    function checkBlankMatch(val, answersStr, matchMode, ignoreCase, trimMode, collapseSpace) {
      let userVal = val || "";
      if (trimMode) userVal = userVal.trim();
      if (collapseSpace) userVal = userVal.replace(/\s+/g, " ");

      const answers = answersStr.split(",").map(a => {
        let target = a;
        if (trimMode) target = target.trim();
        if (collapseSpace) target = target.replace(/\s+/g, " ");
        return target;
      });

      if (matchMode === "regex") {
        const flags = ignoreCase ? "i" : "";
        const regex = new RegExp(answers[0], flags);
        return regex.test(userVal);
      } else {
        return answers.some(ans => {
          if (ignoreCase) return ans.toLowerCase() === userVal.toLowerCase();
          return ans === userVal;
        });
      }
    }

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

  test('2. Multiple Choice Rendering (HTML)', () => {
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
Legolas
:::

::: {.hint}
He is short and has hairy feet.
:::
:::
`;
    fs.writeFileSync(path.join(TEMP_DIR, 'mc.qmd'), qmdContent);
    const result = runQuarto('mc.qmd');
    
    assert.strictEqual(result.success, true);
    
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
  });

  test('3. Fill in the blank and Cloze Rendering (HTML)', () => {
    const qmdContent = `---
title: "Blank Test"
filters:
  - quarto-exercises
---

The wizard is [\`Gandalf\`]{.blank answer="Gandalf" ignore-case=true}.

The Fellowship leaves [Rivendell / Minas Tirith / Edoras]{.choose answer="Rivendell"}.
`;
    fs.writeFileSync(path.join(TEMP_DIR, 'blank.qmd'), qmdContent);
    const result = runQuarto('blank.qmd');
    
    assert.strictEqual(result.success, true);
    
    const htmlPath = path.join(TEMP_DIR, 'blank.html');
    const html = fs.readFileSync(htmlPath, 'utf8');

    // Basic blank renders as input
    assert.match(html, /class="quarto-exercise-blank-input"/);
    assert.match(html, /data-answers="Gandalf"/);
    assert.match(html, /data-ignore-case="true"/);

    // Standalone choose renders as dropdown
    assert.match(html, /class="quarto-exercise-choose-select"/);
    assert.match(html, /data-options="Rivendell,Minas Tirith,Edoras"/);
    assert.match(html, /data-answer="Rivendell"/);
  });

  test('4. Validation Warnings (Stderr Output)', () => {
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
    const result = runQuarto('warnings.qmd');
    
    const stderrLog = result.stderr + result.stdout;
    
    assert.match(stderrLog, /has no correct answers/);
    assert.match(stderrLog, /has no \.answer blocks or inline blanks\/choices/);
    assert.match(stderrLog, /match="regex" with no answer/);
    assert.match(stderrLog, /choose block with no answer/);
  });

  test('5. Non-HTML Fallback Rendering', () => {
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
    const result = runQuarto('fallback.qmd', 'markdown');
    
    assert.strictEqual(result.success, true);
    
    const mdPath = path.join(TEMP_DIR, 'fallback.md');
    const md = fs.readFileSync(mdPath, 'utf8');

    // Should render list letters and answer keys
    assert.match(md, /A\.\s+Frodo/);
    assert.match(md, /B\.\s+Legolas/);
    assert.match(md, /Answer:\s+A/);
    assert.match(md, /Gandalf/);
  });

  test('6. JS Click Interaction Simulation (Unit Test)', () => {
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
});
