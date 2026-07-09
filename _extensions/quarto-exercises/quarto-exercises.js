document.addEventListener("DOMContentLoaded", initExercises);

if (window.Quarto && typeof window.Quarto.onRender === "function") {
  window.Quarto.onRender(initExercises);
}

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

const $ = (root, selector) => root.querySelector(selector);
const $$ = (root, selector) => Array.from(root.querySelectorAll(selector));

function hexToBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return bytes;
}

async function decryptPayload(keyHex, encryptedHex) {
  const rawBytes = hexToBytes(encryptedHex);
  const iv = rawBytes.slice(0, 12);
  const ciphertextWithTag = rawBytes.slice(12);
  const keyBytes = hexToBytes(keyHex);
  const cryptoKey = await window.crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "AES-GCM" },
    false,
    ["decrypt"]
  );
  const decrypted = await window.crypto.subtle.decrypt(
    { name: "AES-GCM", iv: iv },
    cryptoKey,
    ciphertextWithTag
  );
  return new TextDecoder().decode(decrypted);
}

async function initExercises() {
  await Promise.all($$(document, ".quarto-exercise").map(initExercise));
  await Promise.all($$(document, ".quarto-exercise-blank-container")
    .filter(blank => !blank.closest(".quarto-exercise"))
    .map(initStandaloneBlank));
  await Promise.all($$(document, ".quarto-exercise-choose-container")
    .filter(choose => !choose.closest(".quarto-exercise"))
    .map(initStandaloneChoose));
  await Promise.all($$(document, ".quarto-exercise-code-cloze-standalone")
    .map(initStandaloneCodeCloze));
}

function bool(value, fallback = false) {
  return value == null ? fallback : value === "true";
}

function shuffle(items) {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

function labelFor(index) {
  let number = index + 1;
  let label = "";
  while (number > 0) {
    const remainder = (number - 1) % ALPHABET.length;
    label = ALPHABET[remainder] + label;
    number = Math.floor((number - 1) / ALPHABET.length);
  }
  return label;
}

function setHidden(el, hidden) {
  if (el) el.hidden = hidden;
}

function setFeedback(el, text, state) {
  if (!el) return;
  el.textContent = text || "";
  el.classList.toggle("is-correct", state === "correct");
  el.classList.toggle("is-incorrect", state === "incorrect");
  el.hidden = !text;
}

function setCorrectText(container, selector, value) {
  const el = $(container, selector);
  if (!el) return;
  el.textContent = value || "";
  el.hidden = !value;
}

function resetFeedback(feedback) {
  if (!feedback) return;
  feedback.textContent = "";
  feedback.classList.remove("is-correct", "is-incorrect");
  feedback.hidden = true;
}

function splitList(value) {
  const out = [];
  let item = "";
  const text = value || "";

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const next = text[i + 1];

    if (char === "\\" && (next === "|" || next === "\\")) {
      item += next;
      i++;
    } else if (char === "|") {
      if (item !== "") out.push(item);
      item = "";
    } else {
      item += char;
    }
  }

  if (item !== "") out.push(item);
  return out;
}

function answerOptions(container) {
  return splitList(container.dataset.options);
}

function checkBlankMatch(value, answersStr, matchMode, ignoreCase, trimMode, collapseSpace) {
  const normalize = text => {
    let out = text || "";
    if (trimMode) out = out.trim();
    if (collapseSpace) out = out.replace(/\s+/g, " ");
    return out;
  };

  const compare = text => (ignoreCase ? text.toLowerCase() : text);
  const userValue = compare(normalize(value));

  if (matchMode === "regex") {
    try {
      return new RegExp(normalize(answersStr || ""), ignoreCase ? "i" : "").test(normalize(value));
    } catch (error) {
      console.warn("Invalid regex in blank:", answersStr, error);
      return false;
    }
  }

  const answers = splitList(answersStr).map(answer => compare(normalize(answer)));
  return answers.some(answer => answer === userValue);
}

function adjustInputWidth(input) {
  if (!input) return;
  if (!input.value) {
    input.style.width = "";
    return;
  }
  const measurer = document.createElement("span");
  Object.assign(measurer.style, {
    visibility: "hidden",
    position: "absolute",
    whiteSpace: "pre",
    font: window.getComputedStyle(input).font
  });
  measurer.textContent = input.value;
  document.body.appendChild(measurer);
  input.style.width = `${Math.min(Math.max(measurer.getBoundingClientRect().width + 16, 80), 380)}px`;
  measurer.remove();
}

// Pre-size a code-blank to its answer text so the blank gives a visual hint
// of the expected length. Falls back to adjustInputWidth as the user types.
function adjustCodeBlankWidth(input, hintText) {
  if (!input) return;
  if (input.value) { adjustInputWidth(input); return; }
  const text = hintText || "";
  if (!text) { input.style.width = ""; return; }
  const measurer = document.createElement("span");
  Object.assign(measurer.style, {
    visibility: "hidden",
    position: "absolute",
    whiteSpace: "pre",
    font: window.getComputedStyle(input).font
  });
  measurer.textContent = text;
  document.body.appendChild(measurer);
  // Add a tiny buffer for the text cursor only
  input.style.width = `${Math.min(Math.max(measurer.getBoundingClientRect().width + 4, 8), 380)}px`;
  measurer.remove();
}

// Resize code blank to fit the entered text (used on blur, not on hint)
function adjustCodeBlankWidthToText(input) {
  if (!input) return;
  if (!input.value) { 
    input.style.width = ""; 
    // Restore underline when empty
    input.style.borderBottom = "";
    return; 
  }
  const measurer = document.createElement("span");
  const style = window.getComputedStyle(input);
  Object.assign(measurer.style, {
    visibility: "hidden",
    position: "absolute",
    whiteSpace: "pre",
    font: style.font,
    letterSpacing: style.letterSpacing,
    wordSpacing: style.wordSpacing,
    textTransform: style.textTransform,
    fontVariant: style.fontVariant,
    fontFeatureSettings: style.fontFeatureSettings
  });
  measurer.textContent = input.value;
  document.body.appendChild(measurer);
  // Minimal 1px buffer for cursor, capped to prevent long entries from
  // expanding the code block indefinitely.
  input.style.width = `${Math.min(Math.max(measurer.getBoundingClientRect().width + 1, 0), 380)}px`;
  // Remove underline once text is entered
  input.style.borderBottom = "none";
  measurer.remove();
}

function adjustSelectWidth(select) {
  if (!select) return;
  const selectedText = select.options[select.selectedIndex]?.text || "Choose...";
  const measurer = document.createElement("span");
  const style = window.getComputedStyle(select);
  Object.assign(measurer.style, {
    visibility: "hidden",
    position: "absolute",
    whiteSpace: "pre",
    font: style.font
  });
  measurer.textContent = selectedText;
  document.body.appendChild(measurer);
  
  const textWidth = measurer.getBoundingClientRect().width;
  const paddingLeft = parseFloat(style.paddingLeft) || 0;
  const paddingRight = parseFloat(style.paddingRight) || 0;
  const borderLeft = parseFloat(style.borderLeftWidth) || 0;
  const borderRight = parseFloat(style.borderRightWidth) || 0;
  
  select.style.width = `${textWidth + paddingLeft + paddingRight + borderLeft + borderRight + 6}px`;
  measurer.remove();
}

function initBlank(container, onCheck) {
  const input = $(container, ".quarto-exercise-blank-input");
  if (!input || input.dataset.initialized) return;

  input.dataset.initialized = "true";
  adjustInputWidth(input);
  input.addEventListener("input", () => adjustInputWidth(input));
  input.addEventListener("keydown", event => {
    if (event.key === "Enter") {
      event.preventDefault();
      onCheck();
    }
  });
}

function verifyBlank(container, { showFeedback = false, reveal = false } = {}) {
  const input = $(container, ".quarto-exercise-blank-input");
  const feedback = $(container, ".quarto-exercise-blank-feedback");

  const isObfuscated = !!container._decryptedAttrs;
  const attrs = isObfuscated ? container._decryptedAttrs : container.dataset;

  const isCorrect = checkBlankMatch(
    input.value,
    isObfuscated ? attrs.answers : container.dataset.answers,
    isObfuscated ? attrs.match : (container.dataset.match || "exact"),
    isObfuscated ? attrs.ignoreCase : bool(container.dataset.ignoreCase),
    isObfuscated ? attrs.trim : (container.dataset.trim !== "false"),
    isObfuscated ? attrs.collapseSpace : bool(container.dataset.collapseSpace)
  );

  container.classList.toggle("is-correct", isCorrect);
  input.classList.toggle("is-correct", isCorrect);
  input.classList.toggle("is-incorrect", !isCorrect);

  let correctText = "";
  if (isCorrect) {
    correctText = input.value;
  } else if (reveal) {
    const answersList = splitList(isObfuscated ? attrs.answers : container.dataset.answers);
    correctText = answersList[0] || "";
  }
  setCorrectText(container, ".quarto-exercise-blank-correct-text", correctText);

  if (showFeedback) {
    setFeedback(
      feedback,
      isCorrect ? container.dataset.feedbackCorrect : container.dataset.feedbackIncorrect,
      isCorrect ? "correct" : "incorrect"
    );
  } else {
    resetFeedback(feedback);
  }

  return isCorrect;
}

function resetBlank(container) {
  const input = $(container, ".quarto-exercise-blank-input");
  container.classList.remove("is-correct");
  input.disabled = false;
  input.value = "";
  input.classList.remove("is-correct", "is-incorrect");
  setCorrectText(container, ".quarto-exercise-blank-correct-text", "");
  resetFeedback($(container, ".quarto-exercise-blank-feedback"));
  adjustInputWidth(input);
}

async function initStandaloneBlank(container) {
  const checkButton = $(container, ".quarto-exercise-blank-check-btn");
  const check = () => verifyBlank(container, { showFeedback: true });

  if (container.dataset.pbk && container.dataset.pba) {
    try {
      const decryptedStr = await decryptPayload(container.dataset.pbk, container.dataset.pba);
      container._decryptedAttrs = JSON.parse(decryptedStr);
    } catch (e) {
      console.error("Failed to decrypt blank:", e);
    }
  }

  initBlank(container, check);
  if (checkButton && !checkButton.dataset.initialized) {
    checkButton.dataset.initialized = "true";
    checkButton.addEventListener("click", check);
  }
}

function populateChoose(container) {
  const select = $(container, ".quarto-exercise-choose-select");
  const options = bool(container.dataset.shuffle) ? shuffle(answerOptions(container)) : answerOptions(container);

  select.replaceChildren(new Option("Choose...", ""));
  options.forEach(option => select.appendChild(new Option(option, option)));
}

function initChoose(container, onCheck, { instant = false } = {}) {
  const select = $(container, ".quarto-exercise-choose-select");
  if (!select || select.dataset.initialized) return;

  select.dataset.initialized = "true";
  populateChoose(container);
  adjustSelectWidth(select);

  select.addEventListener("change", () => {
    adjustSelectWidth(select);
    if (instant) onCheck();
  });
  select.addEventListener("keydown", event => {
    if (event.key === "Enter") {
      event.preventDefault();
      onCheck();
    }
  });
}

function verifyChoose(container, { showFeedback = false, reveal = false } = {}) {
  const select = $(container, ".quarto-exercise-choose-select");
  const feedback = $(container, ".quarto-exercise-choose-feedback");
  const userValue = select.value;

  const isObfuscated = !!container._decryptedAttrs;
  const attrs = isObfuscated ? container._decryptedAttrs : container.dataset;
  const answer = isObfuscated ? attrs.answer : (container.dataset.answer || "");
  const ignoreCase = isObfuscated ? attrs.ignoreCase : (container.dataset.ignoreCase === "true");

  const isCorrect = userValue
    ? ignoreCase
      ? userValue.toLowerCase() === answer.toLowerCase()
      : userValue === answer
    : false;

  container.classList.toggle("is-correct", isCorrect);
  select.classList.toggle("is-correct", isCorrect);
  select.classList.toggle("is-incorrect", !isCorrect);

  let correctText = "";
  if (isCorrect) {
    correctText = userValue;
  } else if (reveal) {
    correctText = answer;
  }
  setCorrectText(container, ".quarto-exercise-choose-correct-text", correctText);

  if (showFeedback && userValue) {
    setFeedback(
      feedback,
      isCorrect ? container.dataset.feedbackCorrect : container.dataset.feedbackIncorrect,
      isCorrect ? "correct" : "incorrect"
    );
  } else {
    resetFeedback(feedback);
  }

  return isCorrect;
}

function resetChoose(container) {
  const select = $(container, ".quarto-exercise-choose-select");
  container.classList.remove("is-correct");
  select.disabled = false;
  select.value = "";
  select.classList.remove("is-correct", "is-incorrect");
  setCorrectText(container, ".quarto-exercise-choose-correct-text", "");
  resetFeedback($(container, ".quarto-exercise-choose-feedback"));
  adjustSelectWidth(select);
}

async function initStandaloneChoose(container) {
  const checkButton = $(container, ".quarto-exercise-choose-check-btn");
  const check = () => verifyChoose(container, { showFeedback: true });

  if (container.dataset.pbk && container.dataset.pba) {
    try {
      const decryptedStr = await decryptPayload(container.dataset.pbk, container.dataset.pba);
      container._decryptedAttrs = JSON.parse(decryptedStr);
    } catch (e) {
      console.error("Failed to decrypt choose:", e);
    }
  }

  initChoose(container, check, { instant: !checkButton || bool(container.dataset.instant) });
  if (checkButton && !checkButton.dataset.initialized) {
    checkButton.dataset.initialized = "true";
    checkButton.addEventListener("click", check);
  }
}

async function initExercise(exercise) {
  if (exercise.dataset.initialized) return;
  exercise.dataset.initialized = "true";

  if (exercise.dataset.pbk && exercise.dataset.pba) {
    try {
      const decryptedStr = await decryptPayload(exercise.dataset.pbk, exercise.dataset.pba);
      exercise._decryptedMetadata = JSON.parse(decryptedStr);
    } catch (e) {
      console.error("Failed to decrypt exercise:", e);
    }
  }

  const answers = $$(exercise, ".quarto-exercise-answer");
  const blanks = $$(exercise, ".quarto-exercise-blank-container");
  const chooses = $$(exercise, ".quarto-exercise-choose-container");
  const codeClozes = $$(exercise, ".quarto-exercise-code-cloze-container");
  const checkButton = $(exercise, ".quarto-exercise-check-btn");
  const resetButton = $(exercise, ".quarto-exercise-reset-btn");
  const hintButton = $(exercise, ".quarto-exercise-hint-btn");
  const hintPanel = $(exercise, ".quarto-exercise-hint");
  const explanation = $(exercise, ".quarto-exercise-explanation");
  const status = $(exercise, ".quarto-exercise-status");
  const instant = bool(exercise.dataset.instant);
  const reveal = bool(exercise.dataset.reveal);
  const lock = bool(exercise.dataset.lock);

  const verify = () => verifyExercise(exercise, { answers, blanks, chooses, codeClozes, explanation, status, reveal, lock, checkButton, resetButton });

  initAnswers(exercise, answers, verify, instant);
  blanks.forEach(blank => initBlank(blank, verify));
  chooses.forEach(choose => initChoose(choose, verify, { instant }));
  codeClozes.forEach(cc => initCodeCloze(cc, verify));

  if (bool(exercise.dataset.shuffle)) {
    shuffleAnswers(exercise, answers);
  } else {
    updateAnswerLabels(exercise);
  }

  if (hintButton && hintPanel) {
    hintButton.addEventListener("click", () => {
      hintPanel.hidden = !hintPanel.hidden;
    });
  }
  if (checkButton) checkButton.addEventListener("click", verify);
  if (resetButton) {
    resetButton.addEventListener("click", () => resetExercise(exercise, { answers, blanks, chooses, codeClozes, explanation, status, hintPanel, checkButton, resetButton }));
  }
}

function initAnswers(exercise, answers, verify, instant) {
  answers.forEach(answer => {
    const input = $(answer, ".quarto-exercise-input");
    if (!input) return;

    answer.addEventListener("click", event => {
      if (exercise.classList.contains("is-locked") || event.target === input) return;
      event.preventDefault();
      input.checked = input.type === "radio" || !input.checked;
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });

    input.addEventListener("change", () => {
      if (input.type === "radio") {
        answers.forEach(item => item.classList.toggle("is-selected", $(item, ".quarto-exercise-input").checked));
      } else {
        answer.classList.toggle("is-selected", input.checked);
      }
      if (instant) verify();
    });
  });
}

function updateAnswerLabels(exercise) {
  $$(exercise, ".quarto-exercise-answer").forEach((answer, index) => {
    const label = $(answer, ".quarto-exercise-answer-label");
    if (label) label.textContent = `${labelFor(index)}. `;
  });
}

function shuffleAnswers(exercise, answers) {
  const choices = $(exercise, ".quarto-exercise-choices");
  if (!choices || answers.length === 0) return;
  shuffle([...answers]).forEach(answer => choices.appendChild(answer));
  updateAnswerLabels(exercise);
}

function verifyAnswers(exercise, answers, reveal) {
  if (answers.length === 0) return true;

  const isObfuscated = !!exercise._decryptedMetadata;
  const correctTokens = isObfuscated ? exercise._decryptedMetadata.correct : [];

  const radio = exercise.dataset.type === "radio";
  let allCorrect = true;

  answers.forEach(answer => {
    const input = $(answer, ".quarto-exercise-input");
    const feedback = $(answer, ".quarto-exercise-feedback");
    const correct = isObfuscated
      ? correctTokens.includes(answer.dataset.key)
      : answer.dataset.correct === "true";
    const selected = input.checked;

    answer.classList.remove("is-correct", "is-incorrect");
    setHidden(feedback, true);

    if (radio) {
      if (selected) {
        answer.classList.add(correct ? "is-correct" : "is-incorrect");
        setHidden(feedback, false);
        allCorrect = correct;
      }
    } else if (selected && correct) {
      answer.classList.add("is-correct");
      setHidden(feedback, false);
    } else if (selected && !correct) {
      answer.classList.add("is-incorrect");
      setHidden(feedback, false);
      allCorrect = false;
    } else if (!selected && correct) {
      allCorrect = false;
    }
  });

  if (radio && !answers.some(answer => $(answer, ".quarto-exercise-input").checked)) {
    allCorrect = false;
  }

  if (reveal) {
    answers
      .filter(answer => {
        return isObfuscated
          ? correctTokens.includes(answer.dataset.key)
          : answer.dataset.correct === "true";
      })
      .forEach(answer => answer.classList.add("is-correct"));
  }

  return allCorrect;
}

function verifyExercise(exercise, parts) {
  const answersOk = verifyAnswers(exercise, parts.answers, parts.reveal);
  const blanksOk = parts.blanks.every(blank => verifyBlank(blank, { showFeedback: true, reveal: parts.reveal }));
  const choosesOk = parts.chooses.every(choose => verifyChoose(choose, { showFeedback: true, reveal: parts.reveal }));
  const codeClozes = parts.codeClozes || [];
  const codeClozeOk = codeClozes.every(cc => verifyCodeCloze(cc, { showFeedback: true, reveal: parts.reveal }));
  const allCorrect = answersOk && blanksOk && choosesOk && codeClozeOk;

  updateExplanation(parts.explanation, exercise.dataset.explanationPolicy, allCorrect);
  updateStatus(parts.status, exercise, allCorrect);

  if (parts.lock && allCorrect) {
    lockExercise(exercise, parts);
  }

  return allCorrect;
}

function updateExplanation(explanation, policy = "correct", allCorrect) {
  if (!explanation) return;
  explanation.hidden = policy === "never" || (policy === "correct" && !allCorrect);
}

function updateStatus(status, exercise, allCorrect) {
  if (!status) return;
  status.textContent = allCorrect ? exercise.dataset.feedbackCorrect : exercise.dataset.feedbackIncorrect;
  status.classList.toggle("is-correct", allCorrect);
  status.classList.toggle("is-incorrect", !allCorrect);
}

function lockExercise(exercise, { answers, blanks, chooses, checkButton, resetButton }) {
  exercise.classList.add("is-locked");
  [checkButton, resetButton].filter(Boolean).forEach(button => {
    button.disabled = true;
  });
  answers.forEach(answer => {
    $(answer, ".quarto-exercise-input").disabled = true;
  });
  blanks.forEach(blank => {
    $(blank, ".quarto-exercise-blank-input").disabled = true;
  });
  chooses.forEach(choose => {
    $(choose, ".quarto-exercise-choose-select").disabled = true;
  });
}

function resetExercise(exercise, parts) {
  exercise.classList.remove("is-locked");
  [parts.checkButton, parts.resetButton].filter(Boolean).forEach(button => {
    button.disabled = false;
  });

  parts.answers.forEach(answer => {
    const input = $(answer, ".quarto-exercise-input");
    input.disabled = false;
    input.checked = false;
    answer.classList.remove("is-selected", "is-correct", "is-incorrect");
    setHidden($(answer, ".quarto-exercise-feedback"), true);
  });

  parts.blanks.forEach(resetBlank);
  parts.chooses.forEach(resetChoose);
  (parts.codeClozes || []).forEach(resetCodeCloze);
  setHidden(parts.explanation, true);
  setHidden(parts.hintPanel, true);

  if (parts.status) {
    parts.status.textContent = "";
    parts.status.classList.remove("is-correct", "is-incorrect");
  }

  if (bool(exercise.dataset.reshuffleOnReset)) {
    shuffleAnswers(exercise, parts.answers);
  }
}

function exerciseParts(exercise) {
  return {
    answers: $$(exercise, ".quarto-exercise-answer"),
    blanks: $$(exercise, ".quarto-exercise-blank-container"),
    chooses: $$(exercise, ".quarto-exercise-choose-container"),
    codeClozes: $$(exercise, ".quarto-exercise-code-cloze-container"),
    explanation: $(exercise, ".quarto-exercise-explanation"),
    status: $(exercise, ".quarto-exercise-status"),
    hintPanel: $(exercise, ".quarto-exercise-hint"),
    reveal: bool(exercise.dataset.reveal),
    lock: bool(exercise.dataset.lock),
    checkButton: $(exercise, ".quarto-exercise-check-btn"),
    resetButton: $(exercise, ".quarto-exercise-reset-btn")
  };
}

function resolveExercise(exercise) {
  return typeof exercise === "string" ? document.querySelector(exercise) : exercise;
}

window.QuartoExercises = {
  init: initExercises,
  checkExercise(exercise) {
    const root = resolveExercise(exercise);
    return root ? verifyExercise(root, exerciseParts(root)) : false;
  },
  resetExercise(exercise) {
    const root = resolveExercise(exercise);
    if (root) resetExercise(root, exerciseParts(root));
  }
};

// ---- Code Cloze implementation ----

function parseClozeMetadata(container) {
  try {
    return JSON.parse(container.dataset.clozeMetadata || "{}");
  } catch (e) {
    console.warn("Invalid cloze metadata", e);
    return {};
  }
}

function findTokenTextNode(code, token) {
  const walker = document.createTreeWalker(code, NodeFilter.SHOW_TEXT);
  let node;
  while ((node = walker.nextNode())) {
    if (node.textContent.includes(token)) return node;
  }
  return null;
}

function replaceTokenWithElement(code, token, el) {
  const textNode = findTokenTextNode(code, token);
  if (!textNode) return;
  const idx = textNode.textContent.indexOf(token);
  const before = textNode.textContent.slice(0, idx);
  const after = textNode.textContent.slice(idx + token.length);
  const parent = textNode.parentNode;
  const beforeNode = document.createTextNode(before);
  const afterNode = document.createTextNode(after);
  parent.replaceChild(afterNode, textNode);
  parent.insertBefore(el, afterNode);
  parent.insertBefore(beforeNode, el);
}

async function initCodeCloze(container, onCheck) {
  if (container.dataset.initialized) return;
  container.dataset.initialized = "true";

  const code = container.querySelector("code");
  if (!code) return;

  const metadata = parseClozeMetadata(container);
  
  if (container.dataset.pbk) {
    const keyHex = container.dataset.pbk;
    for (const [token, info] of Object.entries(metadata)) {
      if (info.pba) {
        try {
          const decryptedStr = await decryptPayload(keyHex, info.pba);
          info.attrs = JSON.parse(decryptedStr);
        } catch (e) {
          console.error("Failed to decrypt cloze token:", token, e);
        }
      }
    }
  }

  const controls = [];

  for (const [token, info] of Object.entries(metadata)) {
    if (info.type === "blank") {
      const attrs = info.attrs || {};
      const input = document.createElement("input");
      input.type = "text";
      input.className = "quarto-exercise-blank-input quarto-exercise-code-blank";
      input.setAttribute("aria-label", "Fill in the blank");
      input.dataset.answers = attrs.answer || attrs.answers || "";
      input.dataset.match = attrs.match || "exact";
      input.dataset.ignoreCase = attrs["ignore-case"] || "false";
      input.dataset.trim = attrs.trim || "true";
      input.dataset.collapseSpace = attrs["collapse-space"] || "false";
      input.addEventListener("input", () => adjustCodeBlankWidthToText(input));
      input.addEventListener("blur", () => adjustCodeBlankWidthToText(input));
      input.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); if (onCheck) onCheck(); } });
      // Size is deferred until after the element is in the DOM so
      // getComputedStyle returns real font metrics.
      replaceTokenWithElement(code, token, input);
      // No initial sizing to hint text - uses CSS default width
      controls.push({ type: "blank", el: input, attrs });
    } else if (info.type === "choose") {
      const attrs = info.attrs || {};
      const select = document.createElement("select");
      select.className = "quarto-exercise-choose-select quarto-exercise-code-choose";
      select.appendChild(new Option("Choose...", ""));
      splitList(attrs.options).forEach(opt => {
        select.appendChild(new Option(opt, opt));
      });
      select.dataset.answer = attrs.answer || "";
      select.dataset.ignoreCase = attrs["ignore-case"] || "false";
      select.addEventListener("change", () => adjustSelectWidth(select));
      select.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); if (onCheck) onCheck(); } });
      adjustSelectWidth(select);
      replaceTokenWithElement(code, token, select);
      controls.push({ type: "choose", el: select, attrs });
    }
  }

  container._clozeControls = controls;
}

function verifyCodeCloze(container, { showFeedback = false, reveal = false } = {}) {
  const controls = container._clozeControls || [];
  let allCorrect = true;

  controls.forEach(({ type, el, attrs }) => {
    el.classList.remove("is-correct", "is-incorrect");
    if (type === "blank") {
      const ok = checkBlankMatch(
        el.value,
        el.dataset.answers,
        el.dataset.match || "exact",
        el.dataset.ignoreCase === "true",
        el.dataset.trim !== "false",
        el.dataset.collapseSpace === "true"
      );
      el.classList.toggle("is-correct", ok);
      el.classList.toggle("is-incorrect", !ok);
      if (reveal && !ok) {
        const answersList = splitList(el.dataset.answers);
        el.value = answersList[0] || "";
        el.classList.add("is-correct");
        adjustCodeBlankWidthToText(el);
      }
      if (!ok) allCorrect = false;
    } else if (type === "choose") {
      const answer = el.dataset.answer || "";
      const ignoreCase = el.dataset.ignoreCase === "true";
      const ok = el.value !== "" && (ignoreCase ? el.value.toLowerCase() === answer.toLowerCase() : el.value === answer);
      el.classList.toggle("is-correct", ok);
      el.classList.toggle("is-incorrect", !ok && el.value !== "");
      if (ok || reveal) {
        if (el._codeClozeCorrectSpan) return;
        // Replace select with the selected text so it looks like real code
        const selectedText = ok ? el.value : answer;
        const span = document.createElement("span");
        span.className = "quarto-exercise-code-choose-correct";
        span.textContent = selectedText;
        span.style.color = "var(--ex-correct)";
        span.style.fontWeight = "bold";
        span.style.fontFamily = "var(--bs-font-monospace, monospace)";
        span.style.fontSize = "inherit";
        if (el.parentNode) {
          el.parentNode.replaceChild(span, el);
        }
        // Store reference to select for reset
        el._codeClozeCorrectSpan = span;
      }
      if (!ok) allCorrect = false;
    }
  });

  return allCorrect;
}

function resetCodeCloze(container) {
  const controls = container._clozeControls || [];
  controls.forEach(({ type, el, attrs }) => {
    el.classList.remove("is-correct", "is-incorrect");
    if (type === "blank") {
      el.value = "";
      // Reset to default CSS width and restore underline
      el.style.width = "";
      el.style.borderBottom = "";
    } else if (type === "choose") {
      // If the select was replaced with a correct span, restore it
      if (el._codeClozeCorrectSpan && el._codeClozeCorrectSpan.parentNode) {
        el._codeClozeCorrectSpan.parentNode.replaceChild(el, el._codeClozeCorrectSpan);
        el._codeClozeCorrectSpan = null;
      }
      el.value = "";
      adjustSelectWidth(el);
    }
  });
}

async function initStandaloneCodeCloze(container) {
  const wrapper = container.closest(".quarto-exercise-code-cloze-wrapper") || container;
  const checkButton = wrapper.querySelector(".quarto-exercise-check-btn");
  const resetButton = wrapper.querySelector(".quarto-exercise-reset-btn");
  const status = wrapper.querySelector(".quarto-exercise-status");

  const check = () => {
    const ok = verifyCodeCloze(container, { showFeedback: true });
    if (status) {
      status.textContent = ok ? "Correct!" : "Not quite.";
      status.className = "quarto-exercise-status " + (ok ? "is-correct" : "is-incorrect");
    }
  };

  await initCodeCloze(container, check);
  if (checkButton && !checkButton.dataset.initialized) {
    checkButton.dataset.initialized = "true";
    checkButton.addEventListener("click", check);
  }
  if (resetButton) {
    if (resetButton.dataset.initialized) return;
    resetButton.dataset.initialized = "true";
    resetButton.addEventListener("click", () => {
      resetCodeCloze(container);
      if (status) { status.textContent = ""; status.className = "quarto-exercise-status"; }
    });
  }
}
