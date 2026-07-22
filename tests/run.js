// tests/run.js
// Automated test suite for quarto-exercises extension
// Run with: node tests/run.js

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const assert = require('assert');
const test = require('node:test');
const vm = require('vm');
const { pathToFileURL } = require('url');

const TEMP_DIR = path.join(__dirname, '.tmp', 'test-sandbox');
const quote = value => `"${String(value).replace(/"/g, '""')}"`;

// Helper to prepare temp directory
function setup() {
  if (fs.existsSync(TEMP_DIR)) {
    fs.rmSync(TEMP_DIR, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
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
function runQuarto(fileName, format = 'html', extraEnv = {}) {
  const filePath = path.join(TEMP_DIR, fileName);
  const targetEnv = { ...extraEnv };
  const mergedEnv = { ...process.env, ...targetEnv };
  for (const k in mergedEnv) {
    if (mergedEnv[k] === undefined || mergedEnv[k] === '') {
      delete mergedEnv[k];
    }
  }
  const cmd = `quarto render ${quote(filePath)} --to ${quote(format)}`;
  const res = spawnSync(cmd, {
    encoding: 'utf8',
    shell: true,
    env: mergedEnv
  });
  return {
    stdout: res.stdout || '',
    stderr: res.stderr || (res.error ? res.error.message : ''),
    error: res.error,
    success: res.status === 0
  };
}

function renderQuarto(fileName, format = 'html', extraEnv = {}) {
  const result = runQuarto(fileName, format, extraEnv);
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
    else if (/^\d+$/.test(raw)) out[key] = Number(raw);
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

function createMockElement(tagName = 'div', attrs = {}, children = []) {
  const listeners = {};
  const classListSet = new Set((attrs.class || '').split(' ').filter(Boolean));
  const dataset = attrs.dataset || {};
  for (const k in attrs) {
    if (k.startsWith('data-')) {
      const camelKey = k.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      dataset[camelKey] = attrs[k];
    }
  }

  const el = {
    tagName: tagName.toUpperCase(),
    id: attrs.id || '',
    className: attrs.class || '',
    dataset,
    attributes: attrs,
    style: {},
    children: [...children],
    childNodes: [...children],
    parentNode: null,
    nextSibling: null,
    nextElementSibling: null,
    value: attrs.value || '',
    type: attrs.type || '',
    checked: attrs.checked || false,
    disabled: attrs.disabled || false,
    selectedIndex: 0,
    options: children.filter(c => c.tagName === 'OPTION'),
    hidden: attrs.hidden || false,
    textContent: attrs.textContent || '',

    classList: {
      contains: (c) => classListSet.has(c),
      add: (c) => { classListSet.add(c); el.className = Array.from(classListSet).join(' '); },
      remove: (c) => { classListSet.delete(c); el.className = Array.from(classListSet).join(' '); },
      toggle: (c, force) => {
        const val = force !== undefined ? force : !classListSet.has(c);
        if (val) classListSet.add(c); else classListSet.delete(c);
        el.className = Array.from(classListSet).join(' ');
        return val;
      }
    },

    setAttribute(k, v) { attrs[k] = v; el[k] = v; if (k === 'class') { classListSet.clear(); String(v).split(' ').filter(Boolean).forEach(c => classListSet.add(c)); el.className = v; } },
    getAttribute(k) { return attrs[k] || null; },
    removeAttribute(k) { delete attrs[k]; delete el[k]; },

    addEventListener(type, fn) {
      if (!listeners[type]) listeners[type] = [];
      listeners[type].push(fn);
    },
    dispatchEvent(event) {
      const evt = typeof event === 'string' ? { type: event, preventDefault() {} } : { preventDefault() {}, ...event };
      (listeners[evt.type] || []).forEach(fn => fn(evt));
    },

    querySelector(sel) {
      return el.querySelectorAll(sel)[0] || null;
    },
    querySelectorAll(sel) {
      const results = [];
      const matchSel = (node) => {
        if (!node) return false;
        if (sel === 'code' && node.tagName === 'CODE') return true;
        if (sel.startsWith('.')) {
          const cls = sel.slice(1).split('.')[0];
          if (node.classList && node.classList.contains(cls)) return true;
        }
        if (sel.startsWith('#')) {
          if (node.id === sel.slice(1)) return true;
        }
        if (sel.includes('.quarto-exercise-blank-input') && node.classList && node.classList.contains('quarto-exercise-blank-input')) return true;
        if (sel.includes('.quarto-exercise-choose-select') && node.classList && node.classList.contains('quarto-exercise-choose-select')) return true;
        if (sel.includes('.quarto-exercise-answer') && node.classList && node.classList.contains('quarto-exercise-answer')) return true;
        if (sel.includes('.quarto-exercise-status') && node.classList && node.classList.contains('quarto-exercise-status')) return true;
        if (sel.includes('.quarto-exercise-actions') && node.classList && node.classList.contains('quarto-exercise-actions')) return true;
        return false;
      };

      const walk = (n) => {
        for (const child of n.children || []) {
          if (matchSel(child)) results.push(child);
          walk(child);
        }
      };
      walk(el);
      return results;
    },

    closest(sel) {
      let cur = el;
      while (cur) {
        if (sel.split(', ').some(s => {
          if (s.startsWith('.')) return cur.classList && cur.classList.contains(s.slice(1));
          if (s.startsWith('#')) return cur.id === s.slice(1);
          return cur.tagName === s.toUpperCase();
        })) {
          return cur;
        }
        cur = cur.parentNode;
      }
      return null;
    },

    matches(sel) {
      return sel.split(', ').some(s => {
        if (s.startsWith('.')) return el.classList && el.classList.contains(s.slice(1));
        if (s.startsWith('#')) return el.id === s.slice(1);
        return el.tagName === s.toUpperCase();
      });
    },

    appendChild(child) {
      if (!child) return child;
      child.parentNode = el;
      el.children.push(child);
      el.childNodes.push(child);
      if (child.tagName === 'OPTION') el.options.push(child);
      return child;
    },

    replaceChildren(...newChildren) {
      el.children = [];
      el.childNodes = [];
      el.options = [];
      for (const c of newChildren) el.appendChild(c);
    },

    insertBefore(newNode, refNode) {
      newNode.parentNode = el;
      const idx = el.children.indexOf(refNode);
      if (idx >= 0) el.children.splice(idx, 0, newNode);
      else el.children.push(newNode);
      return newNode;
    },

    replaceChild(newChild, oldChild) {
      const idx = el.children.indexOf(oldChild);
      if (idx >= 0) {
        newChild.parentNode = el;
        el.children[idx] = newChild;
      }
      return oldChild;
    },

    remove() {
      if (el.parentNode) {
        const idx = el.parentNode.children.indexOf(el);
        if (idx >= 0) el.parentNode.children.splice(idx, 1);
      }
    },

    getBoundingClientRect() {
      return { width: 100, height: 40, top: 0, left: 0, right: 100, bottom: 40 };
    }
  };

  Object.defineProperty(el, 'innerHTML', {
    get() { return el.textContent; },
    set(html) {
      el.children = [];
      el.childNodes = [];
      if (html.includes('quarto-exercise-check-btn')) {
        const btn = createMockElement('button', { class: 'quarto-exercise-check-btn quarto-exercise-btn quarto-exercise-btn-primary' });
        btn.parentNode = el;
        el.children.push(btn);
        el.childNodes.push(btn);
      }
      if (html.includes('quarto-exercise-reset-btn')) {
        const btn = createMockElement('button', { class: 'quarto-exercise-reset-btn quarto-exercise-btn quarto-exercise-btn-secondary' });
        btn.parentNode = el;
        el.children.push(btn);
        el.childNodes.push(btn);
      }
      if (html.includes('quarto-exercise-status')) {
        const span = createMockElement('span', { class: 'quarto-exercise-status' });
        span.parentNode = el;
        el.children.push(span);
        el.childNodes.push(span);
      }
    }
  });

  children.forEach(c => { c.parentNode = el; });
  return el;
}

function loadRuntime() {
  const listeners = {};
  delete require.cache[require.resolve('../_extensions/quarto-exercises/quarto-exercises.js')];

  global.Option = function Option(text, value) {
    return createMockElement('option', { value, textContent: text });
  };
  global.document = {
    addEventListener(type, handler) {
      listeners[type] = handler;
    },
    querySelectorAll() { return []; },
    querySelector() { return null; },
    createElement(tag) {
      return createMockElement(tag);
    },
    createTreeWalker(root, filter) {
      let foundNode = null;
      const walk = (n) => {
        if (foundNode) return;
        if (n.textContent && n.textContent.includes('QEXCLOZEP')) {
          foundNode = n;
          return;
        }
        for (const c of n.children || []) walk(c);
      };
      walk(root);
      let step = 0;
      return {
        nextNode() {
          if (step === 0 && foundNode) {
            step++;
            this.currentNode = foundNode;
            return true;
          }
          return false;
        }
      };
    },
    createTextNode(text) {
      return { textContent: text, parentNode: null };
    },
    body: createMockElement('body')
  };
  global.window = global;
  global.NodeFilter = { SHOW_TEXT: 4 };
  global.getComputedStyle = () => ({ font: '16px serif', letterSpacing: 'normal', wordSpacing: 'normal', textTransform: 'none', fontVariant: 'normal', fontFeatureSettings: 'normal' });

  const exportsObj = require('../_extensions/quarto-exercises/quarto-exercises.js');
  return { ...exportsObj, document: global.document, window: global.window, listeners, createMockElement };
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
  --bs-body-color: #202124;
  --bs-body-bg: #fff;
}
body.quarto-dark {
  color: #e8eaed;
  background: #202124;
  --bs-body-color: #e8eaed;
  --bs-body-bg: #202124;
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
<div class="quarto-exercise" id="visual-ex" data-id="visual-ex" data-type="radio" data-qx-salt="s1" data-qx-correct="b9f833b1ea3f44fb47f4a201df30f9f33d73acf9d444307e17817ae981fd77e3" data-instant="false" data-reveal="true" data-lock="false" data-reset="true" data-shuffle="false" data-reshuffle-on-reset="false" data-explanation-policy="after-check" data-feedback-correct="Correct!" data-feedback-incorrect="Not quite.">
<p>Choose the code fragment that returns the mean.</p>
<fieldset class="quarto-exercise-fieldset"><legend class="visually-hidden">Answer choices</legend><div class="quarto-exercise-choices">
<div class="quarto-exercise-answer" data-key="a"><div class="quarto-exercise-control"><input id="visual-ex-a" type="radio" name="visual-ex" value="a" class="quarto-exercise-input"><label for="visual-ex-a" class="quarto-exercise-answer-label"></label></div><div class="quarto-exercise-answer-content"><p><code>sum(x)</code></p></div><div class="quarto-exercise-feedback" aria-live="polite" hidden>That returns the total.</div></div>
<div class="quarto-exercise-answer" data-key="b"><div class="quarto-exercise-control"><input id="visual-ex-b" type="radio" name="visual-ex" value="b" class="quarto-exercise-input"><label for="visual-ex-b" class="quarto-exercise-answer-label"></label></div><div class="quarto-exercise-answer-content"><div class="sourceCode"><pre><code>mean(x)</code></pre></div></div><div class="quarto-exercise-feedback" aria-live="polite" hidden>Right.</div></div>
</div></fieldset>
<p>The Fellowship leaves <span class="quarto-exercise-choose-container" data-qx-salt="s2" data-qx-digests="6a4e1f66a7a3226d4929cadb9ae166f19bc891064321ee91cd8138a9f0030d8b" data-options="Rivendell|Edoras|Minas Tirith" data-shuffle="false" data-feedback-correct="Right" data-feedback-incorrect="Wrong"><select class="quarto-exercise-choose-select"><option value="">Choose...</option></select><span class="quarto-exercise-choose-correct-text" hidden></span><button type="button" class="quarto-exercise-choose-check-btn">Check</button><span class="quarto-exercise-choose-feedback" aria-live="polite" hidden></span></span> with <span class="quarto-exercise-blank-container" data-qx-salt="s3" data-qx-digests="717918c208983cba7e2bfdab7854d7b3673fb5ed04059513e32a0dd0be2aab2d" data-feedback-correct="Right" data-feedback-incorrect="Wrong"><input type="text" class="quarto-exercise-blank-input" value="" aria-label="Fill in the blank"><span class="quarto-exercise-blank-correct-text" hidden></span><button type="button" class="quarto-exercise-blank-check-btn">Check</button><span class="quarto-exercise-blank-feedback" aria-live="polite" hidden></span></span>.</p>
<div class="quarto-exercise-actions"><button type="button" class="quarto-exercise-check-btn">Check</button><button type="button" class="quarto-exercise-reset-btn">Reset</button><button type="button" class="quarto-exercise-hint-btn">Hint</button><span class="quarto-exercise-status" aria-live="polite"></span></div>
<div class="quarto-exercise-hint" hidden aria-live="polite">Use the base function.</div>
<div class="quarto-exercise-explanation" hidden aria-live="polite">The mean is the arithmetic average.</div>
</div>
<p>Standalone blank: <span class="quarto-exercise-blank-container" data-qx-salt="s4" data-qx-digests="0186fe0a5aa2e9c5bd1a8bf7a6d5b951a06720d7ffd17a14ce9d9c94a55db846" data-feedback-correct="Right" data-feedback-incorrect=""><input type="text" class="quarto-exercise-blank-input" value="" aria-label="Fill in the blank"><span class="quarto-exercise-blank-correct-text" hidden></span><button type="button" class="quarto-exercise-blank-check-btn">Check</button><span class="quarto-exercise-blank-feedback" aria-live="polite" hidden></span></span>.</p>
<p>Long placeholder blank: <span class="quarto-exercise-blank-container" data-qx-salt="s4" data-qx-digests="0186fe0a5aa2e9c5bd1a8bf7a6d5b951a06720d7ffd17a14ce9d9c94a55db846" data-feedback-correct="Right" data-feedback-incorrect=""><input type="text" class="quarto-exercise-blank-input" value="" placeholder="Enter the name of the mines of Moria here" aria-label="Fill in the blank"><span class="quarto-exercise-blank-correct-text" hidden></span><button type="button" class="quarto-exercise-blank-check-btn">Check</button><span class="quarto-exercise-blank-feedback" aria-live="polite" hidden></span></span>.</p>
<div class="sourceCode"><pre><code><span>member = </span><select class="quarto-exercise-code-choose"><option value="">Choose...</option><option value="Gimli">Gimli</option><option value="Legolas">Legolas</option></select></code></pre></div>
<div class="quarto-exercise" id="checkbox-ex" data-id="checkbox-ex" data-type="checkbox" data-qx-salt="s5" data-qx-correct="28c36f1054b6b9b77f71f7465a03cedfe216fbb4d2ca6f452dedc101c64926d9 66f8d9609638cd8653a3e5b1e8ede4c38ba467221810c4ea5513c1a4da1a0d3a" data-instant="false" data-reveal="true" data-lock="false" data-reset="true" data-shuffle="false" data-reshuffle-on-reset="false" data-explanation-policy="correct" data-feedback-correct="Correct!" data-feedback-incorrect="Not quite.">
<p>Select all hobbits.</p>
<fieldset class="quarto-exercise-fieldset"><legend class="visually-hidden">Answer choices</legend><div class="quarto-exercise-choices">
<div class="quarto-exercise-answer" data-key="frodo"><div class="quarto-exercise-control"><input id="checkbox-ex-frodo" type="checkbox" name="checkbox-ex" value="frodo" class="quarto-exercise-input"><label for="checkbox-ex-frodo" class="quarto-exercise-answer-label"></label></div><div class="quarto-exercise-answer-content"><p>Frodo</p></div><div class="quarto-exercise-feedback" aria-live="polite" hidden>Frodo is a hobbit.</div></div>
<div class="quarto-exercise-answer" data-key="sam"><div class="quarto-exercise-control"><input id="checkbox-ex-sam" type="checkbox" name="checkbox-ex" value="sam" class="quarto-exercise-input"><label for="checkbox-ex-sam" class="quarto-exercise-answer-label"></label></div><div class="quarto-exercise-answer-content"><p>Sam</p></div><div class="quarto-exercise-feedback" aria-live="polite" hidden>Sam is a hobbit.</div></div>
<div class="quarto-exercise-answer" data-key="legolas"><div class="quarto-exercise-control"><input id="checkbox-ex-legolas" type="checkbox" name="checkbox-ex" value="legolas" class="quarto-exercise-input"><label for="checkbox-ex-legolas" class="quarto-exercise-answer-label"></label></div><div class="quarto-exercise-answer-content"><p>Legolas</p></div><div class="quarto-exercise-feedback" aria-live="polite" hidden>Legolas is an elf.</div></div>
</div></fieldset>
<div class="quarto-exercise-actions"><button type="button" class="quarto-exercise-check-btn">Check</button><button type="button" class="quarto-exercise-reset-btn">Reset</button><span class="quarto-exercise-status" aria-live="polite"></span></div>
</div>
<div class="check-batch quarto-exercise-batch-grid" id="visual-batch" style="--ex-batch-columns: 2;">
<div class="quarto-exercise"><p>What does Gimli carry?</p></div>
<div class="quarto-exercise"><p>What kind of being is Treebeard?</p></div>
<div class="quarto-exercise-actions"><button type="button">Check</button><button type="button">Reset</button></div>
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
  const fixturePath = path.join(TEMP_DIR, 'visual', `${mode}-fixture.html`);
  fs.writeFileSync(fixturePath, visualFixture());
  await page.goto(pathToFileURL(fixturePath).href, { waitUntil: 'load' });
  if (mode === 'dark') {
    await page.evaluate(() => document.body.classList.add('quarto-dark'));
  }

  const chooseStates = await page.evaluate(() => {
    const body = getComputedStyle(document.body);
    return ['.quarto-exercise-choose-select', '.quarto-exercise-code-choose'].map(selector => {
      const select = document.querySelector(selector);
      const option = select.options[0];
      return {
        selector,
        selectColor: getComputedStyle(select).color,
        selectBackground: getComputedStyle(select).backgroundColor,
        optionColor: getComputedStyle(option).color,
        optionBackground: getComputedStyle(option).backgroundColor,
        bodyColor: body.color,
        bodyBackground: body.backgroundColor
      };
    });
  });

  const batchGridState = await page.evaluate(() => {
    const batch = document.querySelector('#visual-batch');
    const exercises = Array.from(batch.querySelectorAll(':scope > .quarto-exercise'));
    const actions = batch.querySelector(':scope > .quarto-exercise-actions');
    const exerciseBottom = Math.max(...exercises.map(exercise => exercise.getBoundingClientRect().bottom));
    return {
      columns: getComputedStyle(batch).gridTemplateColumns.split(' ').length,
      gap: parseFloat(getComputedStyle(batch).rowGap),
      visualGap: actions.getBoundingClientRect().top - exerciseBottom,
      exerciseBottomMargins: exercises.map(exercise => parseFloat(getComputedStyle(exercise).marginBottom)),
      actionsTopMargin: parseFloat(getComputedStyle(actions).marginTop)
    };
  });

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
  return { batchGridState, chooseStates, standaloneBlankState, hintState, incorrectState, correctState, checkboxWrongState, checkboxCorrectState, selectWidthChoose, selectWidthLong };
}

test.describe('Quarto Exercises Extension Tests', () => {

  test.before(() => {
    setup();
  });

  test('JS unit tests for canonicalization and escaped lists', () => {
    const { canonicalize, splitList } = loadRuntime();
    const list = value => Array.from(splitList(value));

    assert.deepStrictEqual(list("red|green|blue"), ["red", "green", "blue"]);
    assert.deepStrictEqual(list("yes\\|no|maybe"), ["yes|no", "maybe"]);
    assert.deepStrictEqual(list("C:\\\\Temp|D:\\\\Data"), ["C:\\Temp", "D:\\Data"]);
    assert.deepStrictEqual(list("literal\\\\\\|pipe|plain"), ["literal\\|pipe", "plain"]);

    assert.strictEqual(canonicalize("  Gandalf  ", {}), "Gandalf");
    assert.strictEqual(canonicalize("Gandalf  The   Grey", { collapseSpace: true }), "Gandalf The Grey");
    assert.strictEqual(canonicalize("  FRODO  ", { ignoreCase: true }), "frodo");
    assert.strictEqual(canonicalize(" Frodo ", { trim: false }), " Frodo ");
  });

  test('JS unit tests for internal utility and evaluation functions', async () => {
    const runtime = loadRuntime();
    const {
      bool,
      labelFor,
      setHidden,
      setFeedback,
      setCorrectText,
      resetFeedback,
      clearStatus,
      setStatus,
      onEnter,
      checkModeFor,
      makeControl,
      checkAnswer,
      gradeUnit,
      parseClozeMetadata,
      QuartoExercises,
      digest
    } = runtime;

    // 1. bool helper
    assert.strictEqual(bool(null), false);
    assert.strictEqual(bool(undefined, true), true);
    assert.strictEqual(bool("true"), true);
    assert.strictEqual(bool("false"), false);

    // 2. labelFor helper
    assert.strictEqual(labelFor(0), "A");
    assert.strictEqual(labelFor(25), "Z");
    assert.strictEqual(labelFor(26), "AA");
    assert.strictEqual(labelFor(27), "AB");

    // 3. DOM element state helpers (null-safety and attribute toggling)
    setHidden(null, true);
    setFeedback(null, "text", "correct");
    setCorrectText({ querySelector: () => null }, ".selector", "val");
    resetFeedback(null);
    clearStatus(null);
    setStatus(null, "text", true);

    const mockFeedback = { textContent: "", classList: { remove: () => {}, toggle: () => {} }, hidden: false };
    resetFeedback(mockFeedback);
    assert.strictEqual(mockFeedback.textContent, "");
    assert.strictEqual(mockFeedback.hidden, true);

    const mockStatus = { textContent: "", classList: { remove: () => {}, toggle: () => {} } };
    clearStatus(mockStatus);
    assert.strictEqual(mockStatus.textContent, "");

    // 4. onEnter listener
    let enterTriggered = false;
    let keyHandler = null;
    const mockInput = {
      addEventListener(event, fn) { if (event === "keydown") keyHandler = fn; },
      closest() { return null; }
    };
    onEnter(mockInput, () => { enterTriggered = true; });
    keyHandler({ key: "Space", preventDefault() {} });
    assert.strictEqual(enterTriggered, false);
    keyHandler({ key: "Enter", preventDefault() {} });
    assert.strictEqual(enterTriggered, true);

    // 5. checkModeFor resolution
    const mockBlankControl = {
      closest(sel) {
        if (sel.includes("quarto-exercise-blank-container")) return { dataset: { checkMode: "page" } };
        return null;
      }
    };
    assert.strictEqual(checkModeFor(mockBlankControl), "page");

    const mockExControl = {
      closest(sel) {
        if (sel.includes("quarto-exercise")) return { dataset: { checkMode: "batch" } };
        return null;
      }
    };
    assert.strictEqual(checkModeFor(mockExControl), "batch");

    const mockBatchControl = {
      closest(sel) {
        if (sel.includes("check-batch")) return {};
        return null;
      }
    };
    assert.strictEqual(checkModeFor(mockBatchControl), "batch");

    const mockDefaultControl = { closest() { return null; } };
    assert.strictEqual(checkModeFor(mockDefaultControl), "exercise");

    // 6. makeControl defaults and dataset id fallback
    const mockContainerId = { dataset: { id: "custom-id" }, closest() { return null; }, matches() { return false; } };
    const ctrl1 = makeControl(mockContainerId, "blank");
    assert.strictEqual(ctrl1._controlId, "custom-id");

    const mockContainerNoId = { dataset: {}, id: "fallback-id", closest() { return null; }, matches() { return false; } };
    const ctrl2 = makeControl(mockContainerNoId, "choose");
    assert.strictEqual(ctrl2._controlId, "fallback-id");

    const mockContainerDefault = { dataset: {}, closest() { return null; }, matches() { return false; } };
    const ctrl3 = makeControl(mockContainerDefault, "code");
    assert.strictEqual(ctrl3._controlId, "default-code");

    // 7. checkAnswer edge cases & hash validation
    assert.strictEqual(await checkAnswer(mockDefaultControl, "val"), false);

    const salt = "test-salt";
    const targetVal = "answer123";
    const hashed = await digest(salt, targetVal);

    const qxCtrl = {
      closest() { return { dataset: {} }; },
      _qx: { salt, digests: [hashed], trim: true, collapseSpace: true, ignoreCase: true }
    };
    assert.strictEqual(await checkAnswer(qxCtrl, "  Answer123  "), true);
    assert.strictEqual(await checkAnswer(qxCtrl, "wrong"), false);

    // Container fallback dataset checking
    const containerWithDataset = {
      dataset: { qxSalt: salt, qxDigests: hashed, qxIgnoreCase: "true", qxTrim: "true", qxCollapseSpace: "true" }
    };
    const ctrlWithContainerDataset = {
      closest() { return containerWithDataset; }
    };
    assert.strictEqual(await checkAnswer(ctrlWithContainerDataset, "answer123"), true);

    // Regex matching validation
    const { decodePattern, matchesRegex } = runtime;
    const pattern = "^hello$";
    const patternBytes = new TextEncoder().encode(pattern);
    const keyBytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(salt)));
    const encodedBytes = new Uint8Array(patternBytes.length);
    for (let i = 0; i < patternBytes.length; i++) {
      encodedBytes[i] = patternBytes[i] ^ keyBytes[i % keyBytes.length];
    }
    const encodedHex = [...encodedBytes].map(b => b.toString(16).padStart(2, "0")).join("");

    const decoded = await decodePattern(salt, encodedHex);
    assert.strictEqual(decoded, pattern);

    const regexMeta = { salt, regex: encodedHex, ignoreCase: true, trim: true, collapseSpace: true };
    assert.strictEqual(await matchesRegex("hello", regexMeta), true);
    assert.strictEqual(await matchesRegex("world", regexMeta), false);

    const qxRegexCtrl = {
      closest() { return { dataset: {} }; },
      _qx: regexMeta
    };
    assert.strictEqual(await checkAnswer(qxRegexCtrl, "  Hello  "), true);

    // 8. parseClozeMetadata
    assert.strictEqual(JSON.stringify(parseClozeMetadata({ dataset: { clozeMetadata: '{"key":"val"}' } })), JSON.stringify({ key: "val" }));
    assert.strictEqual(JSON.stringify(parseClozeMetadata({ dataset: { clozeMetadata: 'invalid json' } })), JSON.stringify({}));

    // 9. gradeUnit unknown unit class fallback
    const unknownUnit = { classList: { contains: () => false } };
    const result = await gradeUnit(unknownUnit);
    assert.strictEqual(JSON.stringify(result), JSON.stringify({ earned: 0, possible: 0, correct: false }));

    // 10. QuartoExercises public API safety
    assert.strictEqual(await QuartoExercises.checkExercise("#nonexistent-ex-id"), false);
    QuartoExercises.resetExercise("#nonexistent-ex-id");
  });

  test('JS DOM runtime unit tests for all controls and controllers', async () => {
    function createMockElement(tagName = 'div', attrs = {}, children = []) {
      const listeners = {};
      const classListSet = new Set((attrs.class || '').split(' ').filter(Boolean));
      const dataset = attrs.dataset || {};
      for (const k in attrs) {
        if (k.startsWith('data-')) {
          const camelKey = k.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
          dataset[camelKey] = attrs[k];
        }
      }

      const el = {
        tagName: tagName.toUpperCase(),
        id: attrs.id || '',
        className: attrs.class || '',
        dataset,
        attributes: attrs,
        style: {},
        children: [...children],
        childNodes: [...children],
        parentNode: null,
        nextSibling: null,
        nextElementSibling: null,
        value: attrs.value || '',
        type: attrs.type || '',
        checked: attrs.checked || false,
        disabled: attrs.disabled || false,
        selectedIndex: 0,
        options: children.filter(c => c.tagName === 'OPTION'),
        hidden: attrs.hidden || false,
        textContent: attrs.textContent || '',

        classList: {
          contains: (c) => classListSet.has(c),
          add: (c) => { classListSet.add(c); el.className = Array.from(classListSet).join(' '); },
          remove: (c) => { classListSet.delete(c); el.className = Array.from(classListSet).join(' '); },
          toggle: (c, force) => {
            const val = force !== undefined ? force : !classListSet.has(c);
            if (val) classListSet.add(c); else classListSet.delete(c);
            el.className = Array.from(classListSet).join(' ');
            return val;
          }
        },

        setAttribute(k, v) { attrs[k] = v; el[k] = v; },
        getAttribute(k) { return attrs[k] || null; },
        removeAttribute(k) { delete attrs[k]; delete el[k]; },

        addEventListener(type, fn) {
          if (!listeners[type]) listeners[type] = [];
          listeners[type].push(fn);
        },
        dispatchEvent(event) {
          const evt = typeof event === 'string' ? { type: event, preventDefault() {} } : { preventDefault() {}, ...event };
          (listeners[evt.type] || []).forEach(fn => fn(evt));
        },

        querySelector(sel) {
          return el.querySelectorAll(sel)[0] || null;
        },
        querySelectorAll(sel) {
          const results = [];
          const matchSel = (node) => {
            if (sel === 'code' && node.tagName === 'CODE') return true;
            if (sel.startsWith('.')) {
              const cls = sel.slice(1).split('.')[0];
              if (node.classList && node.classList.contains(cls)) return true;
            }
            if (sel.startsWith('#')) {
              if (node.id === sel.slice(1)) return true;
            }
            if (sel.includes('.quarto-exercise-blank-input') && node.classList && node.classList.contains('quarto-exercise-blank-input')) return true;
            if (sel.includes('.quarto-exercise-choose-select') && node.classList && node.classList.contains('quarto-exercise-choose-select')) return true;
            if (sel.includes('.quarto-exercise-answer') && node.classList && node.classList.contains('quarto-exercise-answer')) return true;
            if (sel.includes('.quarto-exercise-status') && node.classList && node.classList.contains('quarto-exercise-status')) return true;
            if (sel.includes('.quarto-exercise-actions') && node.classList && node.classList.contains('quarto-exercise-actions')) return true;
            return false;
          };

          const walk = (n) => {
            for (const child of n.children || []) {
              if (matchSel(child)) results.push(child);
              walk(child);
            }
          };
          walk(el);
          return results;
        },

        closest(sel) {
          let cur = el;
          while (cur) {
            if (sel.split(', ').some(s => {
              if (s.startsWith('.')) return cur.classList && cur.classList.contains(s.slice(1));
              if (s.startsWith('#')) return cur.id === s.slice(1);
              return cur.tagName === s.toUpperCase();
            })) {
              return cur;
            }
            cur = cur.parentNode;
          }
          return null;
        },

        matches(sel) {
          return sel.split(', ').some(s => {
            if (s.startsWith('.')) return el.classList && el.classList.contains(s.slice(1));
            if (s.startsWith('#')) return el.id === s.slice(1);
            return el.tagName === s.toUpperCase();
          });
        },

        appendChild(child) {
          child.parentNode = el;
          el.children.push(child);
          el.childNodes.push(child);
          if (child.tagName === 'OPTION') el.options.push(child);
          return child;
        },

        replaceChildren(...newChildren) {
          el.children = [];
          el.childNodes = [];
          el.options = [];
          for (const c of newChildren) el.appendChild(c);
        },

        insertBefore(newNode, refNode) {
          newNode.parentNode = el;
          const idx = el.children.indexOf(refNode);
          if (idx >= 0) el.children.splice(idx, 0, newNode);
          else el.children.push(newNode);
          return newNode;
        },

        replaceChild(newChild, oldChild) {
          const idx = el.children.indexOf(oldChild);
          if (idx >= 0) {
            newChild.parentNode = el;
            el.children[idx] = newChild;
          }
          return oldChild;
        },

        remove() {
          if (el.parentNode) {
            const idx = el.parentNode.children.indexOf(el);
            if (idx >= 0) el.parentNode.children.splice(idx, 1);
          }
        },

        getBoundingClientRect() {
          return { width: 100, height: 40, top: 0, left: 0, right: 100, bottom: 40 };
        }
      };

      children.forEach(c => { c.parentNode = el; });
      return el;
    }

    const runtime = loadRuntime();
    const {
      initExercises,
      initController,
      initCheckControllers,
      initBlank,
      verifyBlank,
      resetBlank,
      initStandaloneBlank,
      initChoose,
      verifyChoose,
      resetChoose,
      initStandaloneChoose,
      initExercise,
      gradeUnit,
      verifyExercise,
      resetExercise,
      lockExercise,
      resetUnit,
      initCodeCloze,
      verifyCodeCloze,
      resetCodeCloze,
      initStandaloneCodeCloze,
      digest
    } = runtime;

    const salt = "salt-dom-test";
    const hashedAns = await digest(salt, "hobbit");

    // 1. Standalone Blank Container Test
    const blankInput = createMockElement("input", { class: "quarto-exercise-blank-input" });
    const blankCorrectText = createMockElement("span", { class: "quarto-exercise-blank-correct-text", hidden: true });
    const blankFeedback = createMockElement("span", { class: "quarto-exercise-blank-feedback", hidden: true });
    const blankCheckBtn = createMockElement("button", { class: "quarto-exercise-blank-check-btn" });
    const blankContainer = createMockElement("span", {
      class: "quarto-exercise-blank-container",
      id: "blank-1",
      "data-feedback-correct": "Correct!",
      "data-feedback-incorrect": "Wrong!",
      "data-qx-salt": salt,
      "data-qx-digests": hashedAns,
      "data-qx-ignore-case": "true",
      "data-qx-trim": "true"
    }, [blankInput, blankCorrectText, blankCheckBtn, blankFeedback]);

    initStandaloneBlank(blankContainer);
    blankInput.value = "  Hobbit  ";
    blankInput.dispatchEvent("input");
    blankInput.dispatchEvent("blur");
    blankInput.dispatchEvent({ type: "keydown", key: "Enter", preventDefault() {} });
    blankCheckBtn.dispatchEvent("click");
    assert.strictEqual(await verifyBlank(blankContainer, { showFeedback: true }), true);
    assert.strictEqual(blankContainer.classList.contains("is-correct"), true);
    assert.strictEqual(blankInput.classList.contains("is-correct"), true);

    resetBlank(blankContainer);
    assert.strictEqual(blankContainer.classList.contains("is-correct"), false);
    assert.strictEqual(blankInput.value, "");

    // 2. Standalone Choose Container Test
    const chooseSelect = createMockElement("select", { class: "quarto-exercise-choose-select" });
    const chooseCorrectText = createMockElement("span", { class: "quarto-exercise-choose-correct-text", hidden: true });
    const chooseFeedback = createMockElement("span", { class: "quarto-exercise-choose-feedback", hidden: true });
    const chooseCheckBtn = createMockElement("button", { class: "quarto-exercise-choose-check-btn" });
    const chooseContainer = createMockElement("span", {
      class: "quarto-exercise-choose-container",
      id: "choose-1",
      "data-options": "hobbit|wizard|elf",
      "data-shuffle": "true",
      "data-feedback-correct": "Correct!",
      "data-feedback-incorrect": "Wrong!",
      "data-qx-salt": salt,
      "data-qx-digests": hashedAns,
      "data-qx-ignore-case": "true"
    }, [chooseSelect, chooseCorrectText, chooseCheckBtn, chooseFeedback]);

    initStandaloneChoose(chooseContainer);
    chooseSelect.value = "hobbit";
    chooseSelect.dispatchEvent("change");
    chooseCheckBtn.dispatchEvent("click");
    assert.strictEqual(await verifyChoose(chooseContainer, { showFeedback: true }), true);

    resetChoose(chooseContainer);
    assert.strictEqual(chooseSelect.selectedIndex, 0);

    // 3. Exercise Container Test (MCQ + Blank + Choose)
    const mcqInput1 = createMockElement("input", { type: "radio", class: "quarto-exercise-input", value: "opt1", name: "ex1" });
    const mcqLabel1 = createMockElement("label", { class: "quarto-exercise-answer-label" });
    const mcqState1 = createMockElement("span", { class: "quarto-exercise-answer-state" });
    const mcqFeedback1 = createMockElement("div", { class: "quarto-exercise-feedback", hidden: true });
    const mcqAnswer1 = createMockElement("div", { class: "quarto-exercise-answer", "data-key": "opt1" }, [mcqInput1, mcqLabel1, mcqState1, mcqFeedback1]);

    const exCheckBtn = createMockElement("button", { class: "quarto-exercise-check-btn" });
    const exResetBtn = createMockElement("button", { class: "quarto-exercise-reset-btn" });
    const exHintBtn = createMockElement("button", { class: "quarto-exercise-hint-btn" });
    const exHint = createMockElement("div", { class: "quarto-exercise-hint", hidden: true });
    const exExplanation = createMockElement("div", { class: "quarto-exercise-explanation", hidden: true });
    const exStatus = createMockElement("span", { class: "quarto-exercise-status" });
    const exChoices = createMockElement("div", { class: "quarto-exercise-choices" }, [mcqAnswer1]);

    const exContainer = createMockElement("div", {
      class: "quarto-exercise",
      id: "ex-1",
      "data-type": "radio",
      "data-instant": "true",
      "data-reveal": "true",
      "data-lock": "true",
      "data-shuffle": "true",
      "data-explanation-policy": "correct",
      "data-feedback-correct": "Great!",
      "data-feedback-incorrect": "Try again!",
      "data-qx-salt": salt,
      "data-qx-correct": hashedAns
    }, [exChoices, exCheckBtn, exResetBtn, exHintBtn, exHint, exExplanation, exStatus]);

    initExercise(exContainer);

    // Simulate clicking MCQ answer wrapper & hint button
    mcqAnswer1.dispatchEvent({ type: "click", target: mcqAnswer1 });
    mcqInput1.checked = true;
    mcqInput1.dispatchEvent("change");
    exHintBtn.dispatchEvent("click");
    exCheckBtn.dispatchEvent("click");

    // Grade unit & verify Exercise
    const res = await gradeUnit(exContainer, { showFeedback: true, reveal: true });
    assert.strictEqual(res.correct, false);

    lockExercise(exContainer, { answers: [mcqAnswer1], blanks: [], chooses: [], checkButton: exCheckBtn, resetButton: exResetBtn });
    assert.strictEqual(exContainer.classList.contains("is-locked"), true);

    exResetBtn.dispatchEvent("click");
    resetExercise(exContainer, { answers: [mcqAnswer1], blanks: [], chooses: [], codeClozes: [], explanation: exExplanation, status: exStatus, hintPanel: exHint, checkButton: exCheckBtn, resetButton: exResetBtn });
    assert.strictEqual(exContainer.classList.contains("is-locked"), false);
    assert.strictEqual(mcqInput1.checked, false);

    // 4. Code Cloze Container Test with Choose & Blank controls
    const textNodeToken = { textContent: "QEXCLOZEP000001 QEXCLOZEP000002", parentNode: null };
    const codeNode = createMockElement("code");
    codeNode.children = [textNodeToken];
    textNodeToken.parentNode = codeNode;

    const clozeMetadata = JSON.stringify({
      "QEXCLOZEP000001": {
        type: "blank",
        attrs: { answer: "hobbit" },
        qx: { salt, digests: [hashedAns], trim: true, collapseSpace: true, ignoreCase: true }
      },
      "QEXCLOZEP000002": {
        type: "choose",
        attrs: { options: "hobbit|wizard" },
        qx: { salt, digests: [hashedAns], trim: true, collapseSpace: true, ignoreCase: true }
      }
    });
    const clozeContainer = createMockElement("div", {
      class: "quarto-exercise-code-cloze-container quarto-exercise-code-cloze-standalone",
      id: "cloze-1",
      "data-cloze-metadata": clozeMetadata
    }, [codeNode]);

    const clozeCheckBtnNode = createMockElement("button", { class: "quarto-exercise-check-btn" });
    const clozeResetBtnNode = createMockElement("button", { class: "quarto-exercise-reset-btn" });
    const clozeStatusNode = createMockElement("span", { class: "quarto-exercise-status" });
    const clozeActions = createMockElement("div", { class: "quarto-exercise-actions" }, [
      clozeCheckBtnNode,
      clozeResetBtnNode,
      clozeStatusNode
    ]);

    const clozeWrapper = createMockElement("div", { class: "quarto-exercise-code-cloze-wrapper" }, [clozeContainer, clozeActions]);
    clozeContainer.nextElementSibling = clozeActions;

    initStandaloneCodeCloze(clozeContainer);
    assert.strictEqual(clozeContainer._clozeControls.length, 2);

    const clozeInput = clozeContainer._clozeControls[0].el;
    const clozeSelect = clozeContainer._clozeControls[1].el;
    clozeInput.value = "hobbit";
    clozeSelect.value = "hobbit";
    clozeCheckBtnNode.dispatchEvent("click");

    assert.strictEqual(await verifyCodeCloze(clozeContainer, { showFeedback: true, reveal: true }), true);

    clozeResetBtnNode.dispatchEvent("click");
    resetCodeCloze(clozeContainer);
    assert.strictEqual(clozeInput.value, "");

    // 5. Controller (Page / Batch) Test & window.Quarto onRender
    global.window.Quarto = { onRender(fn) { fn(); } };
    const pageContainer = createMockElement("main", { id: "quarto-document-content" }, [exContainer, blankContainer, chooseContainer, clozeContainer]);
    initController("page", pageContainer);
    assert.strictEqual(pageContainer.dataset.controllerInitialized, "true");

    const controllerActionsNode = pageContainer.querySelector(".quarto-exercise-actions");
    if (controllerActionsNode) {
      const pageCheck = controllerActionsNode.querySelector(".quarto-exercise-check-btn");
      const pageReset = controllerActionsNode.querySelector(".quarto-exercise-reset-btn");
      if (pageCheck) pageCheck.dispatchEvent("click");
      if (pageReset) pageReset.dispatchEvent("click");
    }

    const batchContainerNode = createMockElement("div", { class: "check-batch" }, [exContainer, blankContainer]);
    initController("batch", batchContainerNode);

    // Test initCheckControllers DOM modes
    global.document.body = createMockElement("body", { "data-check-mode": "page" }, [pageContainer]);
    initCheckControllers();

    global.document.body = createMockElement("body", {}, [batchContainerNode]);
    initCheckControllers();

    initExercises();
    resetUnit(blankContainer);
    resetUnit(chooseContainer);
    resetUnit(clozeContainer);
    resetUnit(exContainer);
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

::: {.exercise .fancy-card #ex1 shuffle=true style="background: navy;"}
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
    assert.match(html, /class="quarto-exercise(?:\s|\")/);
    assert.match(html, /class="quarto-exercise fancy-card"/);
    assert.match(html, /style="background: navy;"/);
    assert.match(html, /data-type="radio"/);

    // 2. Author keys are replaced by opaque option IDs and correct digests.
    assert.match(html, /data-key="opt_[a-f0-9]{24}"/);
    assert.match(html, /data-qx-correct="[a-f0-9]{64}"/);
    assert.doesNotMatch(html, /data-key="(?:frodo|legolas)"/);

    // 3. Accessibility elements present
    assert.match(html, /fieldset class="quarto-exercise-fieldset"/);
    assert.match(html, /legend class="visually-hidden"/);

    // 4. Hints are parsed and rendered correctly
    assert.match(html, /class="quarto-exercise-hint-btn(?:\s|")/);
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
    assert.match(html, /data-qx-digests="[a-f0-9]{64}"/);
    assert.match(html, /data-qx-ignore-case="true"/);
    assert.doesNotMatch(html, /data-answers=/);
    assert.match(html, /data-feedback-incorrect=""/);

    // Standalone choose renders as dropdown
    assert.match(html, /class="quarto-exercise-choose-select"/);
    assert.match(html, /data-options="Rivendell\|Minas Tirith\|Edoras"/);
    assert.doesNotMatch(html, /data-answer=/);

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
    assert.match(html, /data-qx-digests="[a-f0-9]{64}"/);
  });

  test('Escaped pipe delimiters render as literal value characters', (t) => {
    const qmdContent = `---
title: "Escaped Pipe Test"
filters:
  - quarto-exercises
---

Literal answer: [\`yes|no\`]{.blank answers="yes\\\\|no|maybe" match="one-of"}.

Literal choice: [yes\\\\|no|maybe|unknown]{.choose answer="yes|no"}.
`;
    fs.writeFileSync(path.join(TEMP_DIR, 'escaped-pipe.qmd'), qmdContent);
    renderQuarto('escaped-pipe.qmd');

    const html = fs.readFileSync(path.join(TEMP_DIR, 'escaped-pipe.html'), 'utf8');
    assert.match(html, /data-options="yes\\\|no\|maybe\|unknown"/);
    assert.doesNotMatch(html, /data-(?:answer|answers)=/);
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
      await page.waitForFunction(el => el.classList.contains('is-correct'), await blank.elementHandle());
      assert.strictEqual(await blank.evaluate(el => el.classList.contains('is-correct')), true);

      await page.locator('.quarto-exercise-reset-btn').click();
      await blank.fill('The Fellowship of the Ring');
      await check.click();
      await page.waitForFunction(el => el.classList.contains('is-correct'), await blank.elementHandle());
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

      const lastBlank = page.locator('.quarto-exercise-code-blank').nth(1);
      await page.waitForFunction(el => el.classList.contains('is-correct'), await lastBlank.elementHandle());
      assert.strictEqual(await lastBlank.evaluate(el => el.classList.contains('is-correct')), true);

      const statusLoc = page.locator('.quarto-exercise-status');
      await page.waitForFunction(el => el.textContent === 'Correct!', await statusLoc.elementHandle());
      assert.strictEqual(await statusLoc.textContent(), 'Correct!');
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

::: {.exercise #hidden-explanation explanation="never"}
Hidden explanation.

::: {.answer correct=true}
Yes
:::

::: {.explanation}
Learners can never see this.
:::
:::
`;
    fs.writeFileSync(path.join(TEMP_DIR, 'warnings.qmd'), qmdContent);
    const result = renderQuarto('warnings.qmd');

    const stderrLog = result.stderr + result.stdout;

    assert.match(stderrLog, /has no correct answers/);
    assert.match(stderrLog, /has no \.answer blocks or inline blanks\/choices/);
    assert.match(stderrLog, /match="regex" with no answer/);
    assert.match(stderrLog, /blank with no answer/);
    assert.match(stderrLog, /choose block with no answer/);
    assert.match(stderrLog, /contains an \.explanation block, but explanation is set to 'never'/);
  });

  test('Non-HTML fallback rendering', (t) => {
    const qmdContent = `---
title: "Fallback Test"
filters:
  - quarto-exercises
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

    // Should render list letters
    assert.match(md, /A\.\s+Frodo/);
    assert.match(md, /B\.\s+Legolas/);
    assert.doesNotMatch(md, /Answer:/);
    assert.doesNotMatch(md, /Gandalf/);
    assert.doesNotMatch(md, /<div>/);
  });

  test('Code cloze fallback renders placeholders in non-HTML output', () => {
    const qmdContent = `---
title: "Code Cloze Fallback Test"
filters:
  - quarto-exercises
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
    assert.doesNotMatch(md, /Answer:/);
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
    assert.match(html, /data-qx-correct="[a-f0-9]{64}"/);
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
    assert.match(html, /data-qx-correct=""/);
    assert.doesNotMatch(html, /data-correct=/);
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
      await page.waitForFunction(el => el.classList.contains('is-correct'), await blank.elementHandle());
      await page.waitForFunction(el => el.classList.contains('is-incorrect'), await select.elementHandle());
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
      const statusLoc = page.locator('.quarto-exercise-status');
      await page.waitForFunction(el => el.textContent === 'Correct!', await statusLoc.elementHandle());
      assert.strictEqual(await statusLoc.textContent(), 'Correct!');
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

      const revealFrodo = page.locator('#reveal-ex .quarto-exercise-answer', { hasText: 'Frodo' });
      const revealLegolas = page.locator('#reveal-ex .quarto-exercise-answer', { hasText: 'Legolas' });
      await revealLegolas.click();
      await page.click('#reveal-ex .quarto-exercise-check-btn');
      assert.strictEqual(await page.locator('#reveal-ex .quarto-exercise-status').textContent(), 'Not quite.');
      assert.strictEqual(await page.locator('#reveal-ex .quarto-exercise-explanation').isVisible(), true);
      assert.strictEqual(await revealFrodo.evaluate(el => el.classList.contains('is-correct')), true);
      assert.strictEqual(await revealLegolas.evaluate(el => el.classList.contains('is-incorrect')), true);

      await page.click('#reveal-ex .quarto-exercise-reset-btn');
      assert.strictEqual(await page.locator('#reveal-ex .quarto-exercise-status').textContent(), '');
      assert.strictEqual(await page.locator('#reveal-ex .quarto-exercise-explanation').isVisible(), false);
      assert.strictEqual(await revealFrodo.evaluate(el => el.classList.contains('is-correct')), false);
      assert.strictEqual(await revealLegolas.locator('input').isChecked(), false);

      const lockGandalf = page.locator('#lock-ex .quarto-exercise-answer', { hasText: 'Gandalf' });
      await lockGandalf.click();
      await page.click('#lock-ex .quarto-exercise-check-btn');
      assert.strictEqual(await page.locator('#lock-ex').evaluate(el => el.classList.contains('is-locked')), true);
      assert.strictEqual(await lockGandalf.locator('input').isDisabled(), true);
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
      explanation: 'correct',
      'feedback-correct': 'Correct!',
      'feedback-incorrect': 'Not quite.',
      'ignore-case': false,
      'question-boxes': false,
      'check-page': false,
      score: false,
      points: 1
    });
  });

  test('Visual, answer-state, and controller APIs stay present', () => {
    const lua = fs.readFileSync(path.join(__dirname, '..', '_extensions', 'quarto-exercises', 'quarto-exercises.lua'), 'utf8');
    const js = fs.readFileSync(path.join(__dirname, '..', '_extensions', 'quarto-exercises', 'quarto-exercises.js'), 'utf8');
    const css = fs.readFileSync(path.join(__dirname, '..', '_extensions', 'quarto-exercises', 'quarto-exercises.css'), 'utf8');
    for (const option of ['question-boxes', 'option-columns', 'check-page']) {
      assert.match(lua, new RegExp(`\\["${option}"\\]`));
    }
    assert.match(lua, /quarto-exercise-answer-state/);
    assert.match(lua, /aria-live="polite"/);
    assert.match(js, /function initCheckControllers/);
    assert.match(js, /function setAnswerState/);
    assert.match(css, /quarto-exercise-boxed/);
    assert.match(css, /quarto-exercise-choices-grid/);
    assert.match(css, /quarto-exercise-answer\.is-correct::before/);
  });

  test('Exercise-level visual options render scoped classes and validate columns', () => {
    const qmdContent = `---
title: "Visual options"
filters:
  - quarto-exercises
quarto-exercises:
  question-boxes: true
---

::: {.exercise #global}
Global visual options.

::: {.answer correct=true}
One
:::

::: {.answer}
Two
:::

::: {.hint}
Helpful hint.
:::
:::

::: {.exercise #local-off question-boxes="false" option-columns="1"}
Local overrides.

::: {.answer correct=true}
One
:::

::: {.answer}
Two
:::
:::

::: {.exercise #local-on question-boxes="true" option-columns="2"}
Local opt-in.

::: {.answer correct=true}
One
:::

::: {.answer}
Two
:::
:::
`;
    fs.writeFileSync(path.join(TEMP_DIR, 'visual-options.qmd'), qmdContent);
    const result = renderQuarto('visual-options.qmd');
    const html = fs.readFileSync(path.join(TEMP_DIR, 'visual-options.html'), 'utf8');
    assert.match(html, /id="global"[^>]*class="quarto-exercise quarto-exercise-boxed"|class="quarto-exercise quarto-exercise-boxed"[^>]*id="global"/);
    assert.match(html, /id="global"[\s\S]*?quarto-exercise-options-cols-1/);
    assert.match(html, /class="quarto-exercise"[^>]*id="local-off"/);
    assert.doesNotMatch(html, /class="quarto-exercise quarto-exercise-boxed"[^>]*id="local-off"/);
    assert.match(html, /id="local-off"[\s\S]*?quarto-exercise-options-cols-1/);
    assert.match(html, /id="local-on"[\s\S]*?quarto-exercise-options-cols-2/);
    assert.match(html, /quarto-exercise-check-btn quarto-exercise-btn quarto-exercise-btn-primary/);
    assert.match(html, /quarto-exercise-reset-btn quarto-exercise-btn quarto-exercise-btn-secondary/);
    assert.match(html, /quarto-exercise-hint-btn quarto-exercise-btn quarto-exercise-btn-secondary/);
    assert.doesNotMatch(result.stderr, /unsupported/);

    fs.writeFileSync(path.join(TEMP_DIR, 'invalid-columns.qmd'), qmdContent.replace('option-columns="2"', 'option-columns="invalid"'));
    const invalid = runQuarto('invalid-columns.qmd');
    assert.strictEqual(invalid.success, true, invalid.stderr);
    assert.match(invalid.stderr, /unsupported option-columns 'invalid'/);

    fs.writeFileSync(path.join(TEMP_DIR, 'global-columns.qmd'), qmdContent.replace('question-boxes: true', 'question-boxes: true\n  option-columns: 2'));
    const globalColumns = renderQuarto('global-columns.qmd');
    assert.match(globalColumns.stderr + globalColumns.stdout, /'option-columns' is only supported on \.exercise and \.check-batch containers/);
    const globalHtml = fs.readFileSync(path.join(TEMP_DIR, 'global-columns.html'), 'utf8');
    assert.match(globalHtml, /id="global"[\s\S]*?quarto-exercise-options-cols-1/);
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
    assert.match(html, /class="quarto-exercise-check-btn(?:\s|")/);
    assert.match(html, /class="quarto-exercise-reset-btn(?:\s|")/);

    assert.match(html, /class="quarto-exercise-blank-container"[^>]*data-qx-ignore-case="false"/);
    assert.match(html, /class="quarto-exercise-blank-container"[^>]*data-qx-trim="true"/);
    assert.match(html, /class="quarto-exercise-blank-container"[^>]*data-qx-collapse-space="false"/);
    assert.match(html, /class="quarto-exercise-choose-container"[^>]*data-shuffle="false"/);
    assert.match(html, /class="quarto-exercise-choose-container"[^>]*data-qx-ignore-case="false"/);
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

    assert.match(html, /class="quarto-exercise-blank-container"[^>]*data-qx-ignore-case="true"/);
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
    assert.match(html, /class="quarto-exercise-check-btn(?:\s|")/);
    assert.match(html, /class="quarto-exercise-reset-btn(?:\s|")/);
  });

  test('Standalone blank, choose, and code-cloze accept points attribute', () => {
    const qmdContent = `---
title: "Standalone Points Test"
filters:
  - quarto-exercises
---

Blank: [Samwise]{.blank answer="Samwise" points=3}.

Choose: [Rivendell|Edoras]{.choose answer="Rivendell" points=5}.

\`\`\`{.code-cloze lang="python" points=10}
x = {{blank answer="1"}}
\`\`\`
`;
    fs.writeFileSync(path.join(TEMP_DIR, 'standalone-points.qmd'), qmdContent);
    renderQuarto('standalone-points.qmd');

    const html = fs.readFileSync(path.join(TEMP_DIR, 'standalone-points.html'), 'utf8');
    assert.match(html, /class="quarto-exercise-blank-container"[^>]*data-points="3"/);
    assert.match(html, /class="quarto-exercise-choose-container"[^>]*data-points="5"/);
    assert.match(html, /class="quarto-exercise-code-cloze-container[^>]*data-points="10"/);
  });

  test('Nested inline blanks and chooses do not emit Check buttons in any mode', () => {
    const qmdContent = `---
title: "Nested Controls Test"
filters:
  - quarto-exercises
---

::: {.exercise #ex-nested}
Blank: [Samwise]{.blank answer="Samwise"}.

Choose: [Rivendell|Edoras]{.choose answer="Rivendell"}.
:::
`;
    fs.writeFileSync(path.join(TEMP_DIR, 'nested-controls.qmd'), qmdContent);
    renderQuarto('nested-controls.qmd');

    const html = fs.readFileSync(path.join(TEMP_DIR, 'nested-controls.html'), 'utf8');
    assert.match(html, /class="quarto-exercise-check-btn(?:\s|")/);
    assert.doesNotMatch(html, /class="quarto-exercise-blank-check-btn"/);
    assert.doesNotMatch(html, /class="quarto-exercise-choose-check-btn"/);
  });

  test('check-page: true suppresses individual check and reset buttons in the HTML', () => {
    const qmdContent = `---
title: "Page Checking Mode"
filters:
  - quarto-exercises
quarto-exercises:
  check-page: true
---

::: {.exercise #ex1}
Question 1.
::: {.answer correct=true}
Yes
:::
:::
`;
    fs.writeFileSync(path.join(TEMP_DIR, 'page-mode.qmd'), qmdContent);
    renderQuarto('page-mode.qmd');

    const html = fs.readFileSync(path.join(TEMP_DIR, 'page-mode.html'), 'utf8');
    assert.doesNotMatch(html, /class="quarto-exercise-check-btn"/);
    assert.doesNotMatch(html, /class="quarto-exercise-reset-btn"/);
  });

  test('check-batch keeps one shared status and removes private exercise action rows', async () => {
    const qmdContent = `---
title: "Batch Checking Mode"
filters:
  - quarto-exercises
---

::: {.check-batch option-columns="2"}
::: {.exercise #ex-in-batch}
Inside batch.

::: {.answer correct=true}
Yes
:::
:::

::: {.exercise #ex-in-batch-2}
Also inside batch.

::: {.answer correct=true}
Yes
:::
:::
:::

::: {.exercise #ex-out-batch}
Outside batch.

::: {.answer correct=true}
Yes
:::
:::
`;
    fs.writeFileSync(path.join(TEMP_DIR, 'batch-mode.qmd'), qmdContent);
    renderQuarto('batch-mode.qmd');

    const html = fs.readFileSync(path.join(TEMP_DIR, 'batch-mode.html'), 'utf8');
    assert.match(html, /class="check-batch[^\"]*quarto-exercise-batch-grid/);
    assert.match(html, /style="[^"]*--ex-batch-columns: 2;/);

    // The exercise inside the batch should not have check/reset buttons
    const batchPart = html.match(/class="quarto-exercise"[^>]*id="ex-in-batch"[\s\S]*?class="quarto-exercise"[^>]*id="ex-out-batch"/)[0];
    assert.doesNotMatch(batchPart, /quarto-exercise-check-btn/);

    // The exercise outside the batch should still have check/reset buttons
    const outPart = html.match(/class="quarto-exercise"[^>]*id="ex-out-batch"[\s\S]*$/)[0];
    assert.match(outPart, /quarto-exercise-check-btn/);

    const { chromium } = require('playwright');
    const browser = await chromium.launch();
    const page = await browser.newPage();
    try {
      await page.goto(pathToFileURL(path.join(TEMP_DIR, 'batch-mode.html')).href);
      const batch = page.locator('.check-batch');
      assert.strictEqual(await batch.locator(':scope > .quarto-exercise').count(), 2);
      assert.strictEqual(await batch.locator(':scope > .quarto-exercise > .quarto-exercise-actions').count(), 0, 'private empty action rows should be removed');
      assert.strictEqual(await batch.locator(':scope > .quarto-exercise .quarto-exercise-status').count(), 0, 'private exercise statuses should be removed');
      assert.strictEqual(await batch.locator(':scope > .quarto-exercise-actions .quarto-exercise-status').count(), 1, 'batch should expose one shared status');

      await page.locator('#ex-in-batch .quarto-exercise-input').check();
      await page.locator('#ex-in-batch-2 .quarto-exercise-input').check();
      await batch.locator(':scope > .quarto-exercise-actions .quarto-exercise-check-btn').click();
      assert.strictEqual(await batch.locator(':scope > .quarto-exercise-actions .quarto-exercise-status').textContent(), 'Correct!');
      assert.strictEqual(await batch.getByText('Correct!', { exact: true }).count(), 1, 'only the batch should report Correct!');
    } finally {
      await browser.close();
    }
  });

  test('boxed check-batch gets quarto-exercise-boxed class and suppresses nested boxes', () => {
    const qmdContent = `---
title: "Boxed Batch"
filters:
  - quarto-exercises
---

::: {.check-batch question-boxes="true"}
::: {.exercise #ex-nested-boxed}
Nested question.
::: {.answer correct=true}
Yes
:::
:::
:::
`;
    fs.writeFileSync(path.join(TEMP_DIR, 'batch-boxed.qmd'), qmdContent);
    renderQuarto('batch-boxed.qmd');

    const html = fs.readFileSync(path.join(TEMP_DIR, 'batch-boxed.html'), 'utf8');
    assert.match(html, /class="check-batch[^"]*quarto-exercise-boxed/);
    assert.doesNotMatch(html, /class="quarto-exercise[^"]*quarto-exercise-boxed[^"]*"[^>]*id="ex-nested-boxed"/);
  });

  test('check-page: true with standalone controls suppresses all individual buttons in HTML', () => {
    const qmdContent = `---
title: "Page Checking Standalone"
filters:
  - quarto-exercises
quarto-exercises:
  check-page: true
---

The wizard is [Gandalf]{.blank answer="Gandalf"}.

Select: [One|Two]{.choose answer="One"}.

\`\`\`{.code-cloze lang="python"}
x = {{blank answer="1"}}
\`\`\`
`;
    fs.writeFileSync(path.join(TEMP_DIR, 'page-standalone.qmd'), qmdContent);
    renderQuarto('page-standalone.qmd');

    const html = fs.readFileSync(path.join(TEMP_DIR, 'page-standalone.html'), 'utf8');
    assert.doesNotMatch(html, /quarto-exercise-blank-check-btn/);
    assert.doesNotMatch(html, /quarto-exercise-choose-check-btn/);
    assert.doesNotMatch(html, /quarto-exercise-check-btn/);
    assert.doesNotMatch(html, /quarto-exercise-reset-btn/);
  });

  test('check-page grades, scores, and resets standalone-only controls', async () => {
    const qmdContent = `---
title: "Standalone page checking"
filters:
  - quarto-exercises
quarto-exercises:
  check-page: true
  score: true
---

[Gandalf]{.blank #page-blank answer="Gandalf" points=2}.

[Rivendell|Edoras]{.choose #page-choose answer="Rivendell" points=3}.
`;
    fs.writeFileSync(path.join(TEMP_DIR, 'standalone-page-checking.qmd'), qmdContent);
    renderQuarto('standalone-page-checking.qmd');

    const { chromium } = require('playwright');
    const browser = await chromium.launch();
    const page = await browser.newPage();
    try {
      await page.goto(pathToFileURL(path.join(TEMP_DIR, 'standalone-page-checking.html')).href, { waitUntil: 'load' });
      const controls = page.locator('.quarto-exercise-page-controls');
      assert.strictEqual(await controls.count(), 1, 'standalone-only documents should receive page controls');

      await page.locator('#page-blank input').fill('Gandalf');
      await page.locator('#page-choose select').selectOption('Rivendell');
      await controls.locator('.quarto-exercise-check-btn').click();
      assert.strictEqual(await controls.locator('.quarto-exercise-status').textContent(), 'Correct! Score: 5 / 5.');
      assert.strictEqual(await page.locator('#page-blank').evaluate(el => el.classList.contains('is-correct')), true);
      assert.strictEqual(await page.locator('#page-choose').evaluate(el => el.classList.contains('is-correct')), true);

      await controls.locator('.quarto-exercise-reset-btn').click();
      assert.strictEqual(await page.locator('#page-blank input').inputValue(), '');
      assert.strictEqual(await page.locator('#page-choose select').inputValue(), '');
      assert.strictEqual(await page.locator('#page-blank').evaluate(el => el.classList.contains('is-correct')), false);
      assert.strictEqual(await page.locator('#page-choose').evaluate(el => el.classList.contains('is-correct')), false);
    } finally {
      await browser.close();
    }
  });

  test('invalid JavaScript regex patterns fail during rendering', () => {
    const qmdContent = `---
title: "Invalid regex"
filters:
  - quarto-exercises
---

[\`bad\`]{.blank answer="[" match="regex"}.
`;
    fs.writeFileSync(path.join(TEMP_DIR, 'invalid-regex.qmd'), qmdContent);
    const result = runQuarto('invalid-regex.qmd');
    assert.strictEqual(result.success, false, 'invalid regex should be an authoring error');
    assert.match(result.stderr + result.stdout, /invalid regular expression/);
  });

  test('check-batch shows global scores for standalone controls', async () => {
    const qmdContent = `---
title: "Standalone batch score"
filters:
  - quarto-exercises
quarto-exercises:
  score: true
---

::: {.check-batch}
[Gandalf]{.blank #batch-blank answer="Gandalf" points=2}.

[Rivendell|Edoras]{.choose #batch-choose answer="Rivendell" points=3}.
:::
`;
    fs.writeFileSync(path.join(TEMP_DIR, 'standalone-batch-score.qmd'), qmdContent);
    renderQuarto('standalone-batch-score.qmd');

    const { chromium } = require('playwright');
    const browser = await chromium.launch();
    const page = await browser.newPage();
    try {
      await page.goto(pathToFileURL(path.join(TEMP_DIR, 'standalone-batch-score.html')).href, { waitUntil: 'load' });
      const batch = page.locator('.check-batch');
      await page.locator('#batch-blank input').fill('Gandalf');
      await page.locator('#batch-choose select').selectOption('Rivendell');
      await batch.locator('.quarto-exercise-check-btn').click();
      assert.strictEqual(await batch.locator('.quarto-exercise-status').textContent(), 'Correct! Score: 5 / 5.');
    } finally {
      await browser.close();
    }
  });

  test('check-batch with standalone controls inside .check-batch suppresses their buttons by default', () => {
    const qmdContent = `---
title: "Batch Standalone"
filters:
  - quarto-exercises
---

::: {.check-batch}
The wizard is [Gandalf]{.blank answer="Gandalf"}.

Select: [One|Two]{.choose answer="One"}.

\`\`\`{.code-cloze lang="python"}
x = {{blank answer="1"}}
\`\`\`
:::
`;
    fs.writeFileSync(path.join(TEMP_DIR, 'batch-standalone.qmd'), qmdContent);
    renderQuarto('batch-standalone.qmd');

    const html = fs.readFileSync(path.join(TEMP_DIR, 'batch-standalone.html'), 'utf8');
    assert.doesNotMatch(html, /quarto-exercise-blank-check-btn/);
    assert.doesNotMatch(html, /quarto-exercise-choose-check-btn/);
    assert.doesNotMatch(html, /quarto-exercise-check-btn/);
    assert.doesNotMatch(html, /quarto-exercise-reset-btn/);
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
      '--ex-panel-border-dark': '#adb5bd',
      '--ex-select-arrow': 'url("data:image/svg+xml;charset=UTF-8,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'8\' height=\'8\' viewBox=\'0 0 10 10\'%3E%3Cpath fill=\'%23666\' d=\'M1 3h8l-4 4z\'/%3E%3C/svg%3E")'
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
      '--ex-panel-border': '#9aa0a6',
      '--ex-select-arrow': 'url("data:image/svg+xml;charset=UTF-8,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'8\' height=\'8\' viewBox=\'0 0 10 10\'%3E%3Cpath fill=\'%23aaa\' d=\'M1 3h8l-4 4z\'/%3E%3C/svg%3E")'
    });
  });

  test('Light and dark visual smoke snapshots', async () => {
    const playwright = require('playwright');

    fs.mkdirSync(path.join(TEMP_DIR, 'visual'), { recursive: true });

    for (const mode of ['light', 'dark']) {
      const result = await runVisualMode(playwright, mode);
      const { batchGridState, chooseStates, standaloneBlankState, hintState, incorrectState, correctState, checkboxWrongState, checkboxCorrectState, selectWidthChoose, selectWidthLong } = result;

      assert.strictEqual(batchGridState.columns, 2, `${mode} batch should retain two columns`);
      assert.ok(batchGridState.visualGap <= batchGridState.gap + 1, `${mode} batch controls should be separated by only the grid gap`);
      assert.deepStrictEqual(batchGridState.exerciseBottomMargins, [0, 0], `${mode} batch exercises should not add margins to the grid gap`);
      assert.strictEqual(batchGridState.actionsTopMargin, 0, `${mode} batch actions should not add a second gap`);

      for (const state of chooseStates) {
        assert.strictEqual(state.selectColor, state.bodyColor, `${mode} ${state.selector} text should use the bslib body color`);
        assert.strictEqual(state.selectBackground, state.bodyBackground, `${mode} ${state.selector} background should use the bslib body background`);
        assert.strictEqual(state.optionColor, state.bodyColor, `${mode} ${state.selector} options should use the bslib body color`);
        assert.strictEqual(state.optionBackground, state.bodyBackground, `${mode} ${state.selector} options should use the bslib body background`);
      }

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

  test('Bslib light and dark themes keep inline and code-cloze dropdowns legible', async () => {
    const qmdContent = `---
title: "Bslib dropdown colors"
format:
  html:
    theme:
      light: flatly
      dark: darkly
filters:
  - quarto-exercises
---

Inline choice: [Gimli|Legolas]{.choose answer="Gimli"}.

\`\`\`{.code-cloze lang="r"}
member <- {{choose answer="Gimli" options="Gimli|Legolas|Pippin"}}
\`\`\`
`;
    fs.writeFileSync(path.join(TEMP_DIR, 'bslib-dropdowns.qmd'), qmdContent);
    renderQuarto('bslib-dropdowns.qmd');

    const { chromium } = require('playwright');
    const browser = await chromium.launch();
    const page = await browser.newPage();
    try {
      await page.goto(pathToFileURL(path.join(TEMP_DIR, 'bslib-dropdowns.html')).href);

      const readColors = () => page.evaluate(() => {
        const body = getComputedStyle(document.body);
        return {
          bodyColor: body.color,
          bodyBackground: body.backgroundColor,
          controls: ['.quarto-exercise-choose-select', '.quarto-exercise-code-choose'].map(selector => {
            const select = document.querySelector(selector);
            return {
              selector,
              color: getComputedStyle(select).color,
              background: getComputedStyle(select).backgroundColor,
              options: Array.from(select.options, option => ({
                color: getComputedStyle(option).color,
                background: getComputedStyle(option).backgroundColor
              }))
            };
          })
        };
      });

      const assertThemeColors = (state, mode) => {
        for (const control of state.controls) {
          assert.strictEqual(control.color, state.bodyColor, `${mode} ${control.selector} should use bslib body text`);
          assert.strictEqual(control.background, state.bodyBackground, `${mode} ${control.selector} should use bslib body background`);
          assert.ok(control.options.length >= 2, `${mode} ${control.selector} should expose its options`);
          for (const option of control.options) {
            assert.strictEqual(option.color, state.bodyColor, `${mode} ${control.selector} option text should use bslib body text`);
            assert.strictEqual(option.background, state.bodyBackground, `${mode} ${control.selector} option background should use bslib body background`);
          }
        }
      };

      const light = await readColors();
      assertThemeColors(light, 'light');
      await page.evaluate(() => window.quartoToggleColorScheme());
      await page.waitForFunction(() => document.body.classList.contains('quarto-dark'));
      const dark = await readColors();
      assertThemeColors(dark, 'dark');
      assert.notStrictEqual(light.bodyColor, dark.bodyColor, 'theme toggle should change the bslib body text color');
      assert.notStrictEqual(light.bodyBackground, dark.bodyBackground, 'theme toggle should change the bslib body background');
    } finally {
      await browser.close();
    }
  });

  test('Digest obfuscation hides answers and preserves browser grading', async () => {
    const playwright = require('playwright');
    const qmdContent = `---
title: "TDD Leak Test"
format:
  html:
    embed-resources: true
filters:
  - quarto-exercises
---

::: {.exercise #ex-mc-single}
Select Sam.

::: {.answer key="sam" correct=true}
Samwise
:::

::: {.answer key="legolas"}
Legolas
:::
:::

::: {.exercise #ex-mc-multi}
Select Frodo and Sam.

::: {.answer key="frodo" correct=true}
Frodo
:::

::: {.answer key="sam" correct=true}
Sam
:::

::: {.answer key="legolas"}
Legolas
:::
:::

Standalone blank: [\`Gandalf\`]{.blank answer="Gandalf"}.

Standalone blank multi: [\`Sam\`]{.blank answers="Samwise|Sam" match="one-of"}.

Standalone regex blank: [\`1001\`]{.blank answer="^(0b)?1001$" match="regex"}.

Standalone choose: [Rivendell|Edoras]{.choose answer="Rivendell"}.

::: {.exercise #ex-cloze}
\`\`\`{.code-cloze lang="python"}
fellowship = {
    "companion": {{blank answers='"Samwise"|"Sam"' match="one-of"}},
    "first_book_title": {{blank answer="^(the\\\\s+)?fellowship$" match="regex"}},
    "bearer": {{choose answer="Frodo" options="Frodo|Sam"}},
}
\`\`\`
:::

::: {.exercise #ex-inline}
Inline blank: [Frodo]{.blank answer="Frodo"}.
Inline choose: [Frodo|Sam]{.choose answer="Frodo"}.
:::
`;
    fs.writeFileSync(path.join(TEMP_DIR, 'tdd-leak.qmd'), qmdContent);
    const buildRes = runQuarto('tdd-leak.qmd');
    assert.strictEqual(buildRes.success, true, "Build should succeed");

    // Assert no data-processed or has no .answer block warnings are present
    assert.doesNotMatch(buildRes.stderr + buildRes.stdout, /data-processed/);
    assert.doesNotMatch(buildRes.stderr + buildRes.stdout, /has no \.answer blocks/);

    const htmlPath = path.join(TEMP_DIR, 'tdd-leak.html');
    const html = fs.readFileSync(htmlPath, 'utf8');

    // Make sure we don't leak answer strings or signatures/public keys in attributes/source
    assert.doesNotMatch(html, /class="quarto-exercise-answer"[^>]*data-correct/);
    assert.doesNotMatch(html, /class="quarto-exercise-choose-container"[^>]*data-answer=/);
    assert.doesNotMatch(html, /class="quarto-exercise-blank-container"[^>]*data-answers=/);
    assert.doesNotMatch(html, /"answers":/);
    assert.doesNotMatch(html, /"correct":/);
    assert.match(html, /data-qx-salt="salt_[a-f0-9]{24}"/);
    assert.match(html, /data-qx-(?:correct|digests)="[a-f0-9 ]+"/);
    assert.doesNotMatch(html, /QUARTO_EXERCISES_KEY|quartoExercisesKey|data-pba=/);

    // 3. Verify grading behavior in browser
    const browser = await playwright.chromium.launch();
    try {
      const page = await browser.newPage();
      page.on('console', msg => console.log('BROWSER CONSOLE:', msg.text()));
      page.on('pageerror', err => console.error('BROWSER ERROR:', err.message));
      await page.goto(`file://${htmlPath}`, { waitUntil: 'load' });

      const expectStatus = async (selector, text) => {
        const loc = page.locator(selector);
        await page.waitForFunction(
          ([el, expected]) => el.textContent === expected,
          [await loc.elementHandle(), text]
        );
        assert.strictEqual(await loc.textContent(), text);
      };

      const expectClass = async (loc, className, shouldHave = true) => {
        await page.waitForFunction(
          ([el, name, has]) => el.classList.contains(name) === has,
          [await loc.elementHandle(), className, shouldHave]
        );
        assert.strictEqual(await loc.evaluate((el, name) => el.classList.contains(name), className), shouldHave);
      };

      // Test MCQ Single Selection
      const legolasLabel = page.locator('#ex-mc-single .quarto-exercise-answer', { hasText: 'Legolas' });
      await legolasLabel.click();
      await page.click('#ex-mc-single .quarto-exercise-check-btn');
      await expectStatus('#ex-mc-single .quarto-exercise-status', 'Not quite.');

      const samLabel = page.locator('#ex-mc-single .quarto-exercise-answer', { hasText: 'Samwise' });
      await samLabel.click();
      await page.click('#ex-mc-single .quarto-exercise-check-btn');
      await expectStatus('#ex-mc-single .quarto-exercise-status', 'Correct!');

      // Test MCQ Multi Selection
      const multiFrodo = page.locator('#ex-mc-multi .quarto-exercise-answer', { hasText: 'Frodo' });
      const multiSam = page.locator('#ex-mc-multi .quarto-exercise-answer', { hasText: 'Sam' });
      const multiLegolas = page.locator('#ex-mc-multi .quarto-exercise-answer', { hasText: 'Legolas' });

      await multiFrodo.click();
      await multiLegolas.click();
      await page.click('#ex-mc-multi .quarto-exercise-check-btn');
      await expectStatus('#ex-mc-multi .quarto-exercise-status', 'Not quite.');

      await page.click('#ex-mc-multi .quarto-exercise-reset-btn');
      await multiFrodo.click();
      await multiSam.click();
      await page.click('#ex-mc-multi .quarto-exercise-check-btn');
      await expectStatus('#ex-mc-multi .quarto-exercise-status', 'Correct!');

      // Standalone blank (Gandalf)
      const blank1 = page.locator('.quarto-exercise-blank-container').nth(0);
      await blank1.locator('input').fill('Wrong');
      await blank1.locator('button').click();
      await expectClass(blank1, 'is-correct', false);
      await blank1.locator('input').fill('Gandalf');
      await blank1.locator('button').click();
      await expectClass(blank1, 'is-correct', true);

      // Standalone blank multi (Samwise / Sam)
      const blank2 = page.locator('.quarto-exercise-blank-container').nth(1);
      await blank2.locator('input').fill('Samwise');
      await blank2.locator('button').click();
      await expectClass(blank2, 'is-correct', true);

      // Standalone regex blank (^(0b)?1001$)
      const blank3 = page.locator('.quarto-exercise-blank-container').nth(2);
      await blank3.locator('input').fill('0b1001');
      await blank3.locator('button').click();
      await expectClass(blank3, 'is-correct', true);

      // Standalone choose (Rivendell)
      const choose1 = page.locator('.quarto-exercise-choose-container').nth(0);
      await choose1.locator('select').selectOption('Edoras');
      await choose1.locator('button').click();
      await expectClass(choose1, 'is-correct', false);
      await choose1.locator('select').selectOption('Rivendell');
      await choose1.locator('button').click();
      await expectClass(choose1, 'is-correct', true);

      // Code Cloze
      const clozeBlank1 = page.locator('#ex-cloze .quarto-exercise-code-blank').nth(0);
      const clozeBlank2 = page.locator('#ex-cloze .quarto-exercise-code-blank').nth(1);
      const clozeChoose = page.locator('#ex-cloze .quarto-exercise-code-choose');

      await clozeBlank1.fill('"Sam"');
      await clozeBlank2.fill('fellowship');
      await clozeChoose.selectOption('Frodo');
      await page.click('#ex-cloze .quarto-exercise-check-btn');
      await expectStatus('#ex-cloze .quarto-exercise-status', 'Correct!');

      // Inline controls inside .exercise
      const inlineBlank = page.locator('#ex-inline .quarto-exercise-blank-container');
      await inlineBlank.locator('input').fill('Frodo');
      const inlineChoose = page.locator('#ex-inline .quarto-exercise-choose-container');
      await inlineChoose.locator('select').selectOption('Frodo');
      await page.click('#ex-inline .quarto-exercise-check-btn');
      await expectClass(inlineBlank, 'is-correct', true);
      await expectClass(inlineChoose, 'is-correct', true);
    } finally {
      await browser.close();
    }

  });

  test('Canvas-like checking, document-level and scoring semantics E2E', async () => {
    const playwright = require('playwright');
    const qmdContent = `---
title: "Scoring and Page checking test"
filters:
  - quarto-exercises
quarto-exercises:
  check-page: true
  score: true
---

[Gandalf]{.blank answer="Gandalf" id="stand-blank" points=2}.

::: {.exercise #ex-multi points=4}
MCQ:

::: {.answer correct=true}
Frodo
:::

::: {.answer}
Legolas
:::

Blank: [Samwise]{.blank answer="Samwise"}.

Choose: [Rivendell|Edoras]{.choose answer="Rivendell"}.

Code Cloze:
\`\`\`{.code-cloze lang="python"}
x = {{blank answer="1"}}
\`\`\`
:::

[Rivendell|Edoras]{.choose answer="Rivendell" id="stand-choose" points=3}.
`;
    fs.writeFileSync(path.join(TEMP_DIR, 'page-scoring-e2e.qmd'), qmdContent);
    renderQuarto('page-scoring-e2e.qmd');

    const htmlPath = path.join(TEMP_DIR, 'page-scoring-e2e.html');
    const browser = await playwright.chromium.launch();
    try {
      const page = await browser.newPage();
      await page.goto(`file://${htmlPath}`, { waitUntil: 'load' });

      const expectStatus = async (selector, text) => {
        const loc = page.locator(selector);
        await page.waitForFunction(
          ([el, expected]) => el.textContent === expected,
          [await loc.elementHandle(), text]
        );
        assert.strictEqual(await loc.textContent(), text);
      };

      // Perform partial grading check:
      // ex-multi MCQ (Frodo) correct
      await page.locator('#ex-multi .quarto-exercise-answer', { hasText: 'Frodo' }).click();
      // ex-multi choose (Rivendell) correct
      await page.locator('#ex-multi .quarto-exercise-choose-select').selectOption('Rivendell');
      // stand-choose (Rivendell) correct
      await page.locator('#stand-choose .quarto-exercise-choose-select').selectOption('Rivendell');

      // Click "Check Page"
      await page.click('.quarto-exercise-page-controls .quarto-exercise-check-btn');

      // We expect: stand-blank is wrong (0/2), stand-choose is correct (3/3),
      // ex-multi: MCQ correct (1 unit), choose correct (1 unit), blank empty/wrong (0 units), cloze blank empty/wrong (0 units).
      // So ex-multi score = 2 / 4 units correct = 2 points.
      // Total score = 0 (stand-blank) + 2 (ex-multi) + 3 (stand-choose) = 5 points out of 9 possible.
      await expectStatus('.quarto-exercise-page-controls .quarto-exercise-status', 'Not quite. Score: 5 / 9.');

      // Now fill all correctly:
      await page.locator('#stand-blank input').fill('Gandalf');
      await page.locator('#ex-multi .quarto-exercise-blank-container input').fill('Samwise');
      await page.locator('#ex-multi .quarto-exercise-code-blank').fill('1');

      // Click "Check Page" again
      await page.click('.quarto-exercise-page-controls .quarto-exercise-check-btn');
      await expectStatus('.quarto-exercise-page-controls .quarto-exercise-status', 'Correct! Score: 9 / 9.');
    } finally {
      await browser.close();
    }
  });
});
