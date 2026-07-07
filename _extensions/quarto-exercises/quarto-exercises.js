document.addEventListener("DOMContentLoaded", initExercises);

if (window.Quarto && typeof window.Quarto.onRender === "function") {
  window.Quarto.onRender(initExercises);
}

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

const $ = (root, selector) => root.querySelector(selector);
const $$ = (root, selector) => Array.from(root.querySelectorAll(selector));

function initExercises() {
  $$(document, ".quarto-exercise").forEach(initExercise);
  $$(document, ".quarto-exercise-blank-container")
    .filter(blank => !blank.closest(".quarto-exercise"))
    .forEach(initStandaloneBlank);
  $$(document, ".quarto-exercise-choose-container")
    .filter(choose => !choose.closest(".quarto-exercise"))
    .forEach(initStandaloneChoose);
  $$(document, ".quarto-exercise-code-cloze-standalone")
    .forEach(initStandaloneCodeCloze);
}

function bool(value, fallback = false) {
  return value == null ? fallback : value === "true";
}

function dataValue(el, container, name, fallback = "") {
  if (el && el.dataset[name] !== undefined && el.dataset[name] !== "") return el.dataset[name];
  if (container && container.dataset[name] !== undefined && container.dataset[name] !== "") return container.dataset[name];
  return fallback;
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

class Control {
  constructor(el, type, container) {
    this.el = el;
    this.type = type;
    this.container = container;
  }

  get exercise() {
    return this.container.closest(".quarto-exercise");
  }

  get parentLockActive() {
    return Boolean(this.exercise && bool(this.exercise.dataset.lock));
  }

  get answers() {
    return dataValue(this.el, this.container, "answers");
  }

  get answer() {
    return dataValue(this.el, this.container, "answer");
  }

  get match() {
    return dataValue(this.el, this.container, "match", "exact");
  }

  get ignoreCase() {
    return dataValue(this.el, this.container, "ignoreCase", this.exercise?.dataset.ignoreCase || "false") === "true";
  }

  get trim() {
    return dataValue(this.el, this.container, "trim", "true") !== "false";
  }

  get collapseSpace() {
    return dataValue(this.el, this.container, "collapseSpace", "false") === "true";
  }

  get lock() {
    return dataValue(this.el, this.container, "lock", this.exercise?.dataset.lock || "");
  }

  verify(reveal = false) {
    this.el.classList.remove("is-correct", "is-incorrect");
    let ok = false;
    if (this.type === "blank") {
      ok = checkBlankMatch(this.el.value, this.answers, this.match, this.ignoreCase, this.trim, this.collapseSpace);
      this.el.classList.toggle("is-correct", ok);
      this.el.classList.toggle("is-incorrect", !ok);
      if (reveal) {
        const displayText = ok ? this.el.value : firstAnswer(this.answers);
        if (this.el._codeBlankCorrectSpan) {
          this.el._codeBlankCorrectSpan.textContent = displayText;
          this.el._codeBlankCorrectSpan.hidden = false;
        } else {
          setCorrectText(this.container, ".quarto-exercise-blank-correct-text", displayText);
        }
      }
    } else if (this.type === "choose") {
      ok = checkChooseMatch(this.el.value, this.answer, this.ignoreCase);
      this.el.classList.toggle("is-correct", ok);
      this.el.classList.toggle("is-incorrect", !ok && this.el.value !== "");
      if (reveal) {
        if (this.el.classList.contains("quarto-exercise-code-choose")) {
          revealCodeClozeChoose(this.el, ok ? this.el.value : this.answer);
        } else {
          setCorrectText(this.container, ".quarto-exercise-choose-correct-text", ok ? this.el.value : this.answer);
        }
      }
    }
    return ok;
  }

  reset() {
    this.el.classList.remove("is-correct", "is-incorrect");
    this.el.disabled = false;
    this.el.value = "";
    if (this.type === "blank") {
      if (this.el._codeBlankCorrectSpan) {
        this.el._codeBlankCorrectSpan.textContent = "";
        this.el._codeBlankCorrectSpan.hidden = true;
      } else {
        setCorrectText(this.container, ".quarto-exercise-blank-correct-text", "");
      }
      if (this.el.classList.contains("quarto-exercise-code-blank")) {
        this.el.style.width = "";
        this.el.style.borderBottom = "";
      } else {
        adjustInputWidth(this.el);
      }
    } else if (this.type === "choose") {
      if (this.el._codeClozeCorrectSpan && this.el._codeClozeCorrectSpan.parentNode) {
        this.el._codeClozeCorrectSpan.parentNode.replaceChild(this.el, this.el._codeClozeCorrectSpan);
        this.el._codeClozeCorrectSpan = null;
      } else {
        setCorrectText(this.container, ".quarto-exercise-choose-correct-text", "");
      }
      adjustSelectWidth(this.el);
    }
  }

  lockControl() {
    if (!this.parentLockActive && this.lock === "false") return;
    this.el.disabled = true;
    if (this.type === "blank") {
      if (this.el._codeBlankCorrectSpan) {
        // Keeps disabled
      } else {
        this.container.classList.add("is-locked");
        setCorrectText(this.container, ".quarto-exercise-blank-correct-text", this.el.value);
      }
    } else if (this.type === "choose") {
      if (this.el.classList.contains("quarto-exercise-code-choose")) {
        revealCodeClozeChoose(this.el, this.el.value);
      } else {
        this.container.classList.add("is-locked");
        setCorrectText(this.container, ".quarto-exercise-choose-correct-text", this.el.value);
      }
    }
  }
}

function checkChooseMatch(userValue, answer, ignoreCase) {
  if (!userValue) return false;
  return ignoreCase ? userValue.toLowerCase() === answer.toLowerCase() : userValue === answer;
}

function initBlank(container, onCheck, { instant = false } = {}) {
  const input = $(container, ".quarto-exercise-blank-input");
  if (!input || input.dataset.initialized) return;

  input.dataset.initialized = "true";
  adjustInputWidth(input);
  input.addEventListener("input", () => {
    adjustInputWidth(input);
    if (instant) onCheck();
  });
  input.addEventListener("keydown", event => {
    if (event.key === "Enter") {
      event.preventDefault();
      onCheck();
    }
  });
}

function firstAnswer(value) {
  return splitList(value)[0] || "";
}

function verifyBlank(container, { showFeedback = false, reveal = false } = {}) {
  const input = $(container, ".quarto-exercise-blank-input");
  const control = new Control(input, "blank", container);
  const ok = control.verify(reveal);
  container.classList.toggle("is-correct", ok);
  container.classList.toggle("is-incorrect", !ok);

  if (reveal) {
    container.classList.add("is-locked");
  }

  const feedback = $(container, ".quarto-exercise-blank-feedback");
  if (showFeedback && feedback) {
    setFeedback(
      feedback,
      ok ? container.dataset.feedbackCorrect : container.dataset.feedbackIncorrect,
      ok ? "correct" : "incorrect"
    );
  } else {
    resetFeedback(feedback);
  }

  return ok;
}

function resetBlank(container) {
  container.classList.remove("is-correct", "is-incorrect", "is-locked");
  const input = $(container, ".quarto-exercise-blank-input");
  if (input) {
    const control = new Control(input, "blank", container);
    control.reset();
  }
  resetFeedback($(container, ".quarto-exercise-blank-feedback"));
}

function initStandaloneBlank(container) {
  const checkButton = $(container, ".quarto-exercise-blank-check-btn");
  const resetButton = $(container, ".quarto-exercise-blank-reset-btn");
  const check = () => {
    const ok = verifyBlank(container, { showFeedback: true, reveal: bool(container.dataset.reveal) });
    if (bool(container.dataset.lock) && ok) {
      const input = $(container, ".quarto-exercise-blank-input");
      if (input) {
        new Control(input, "blank", container).lockControl();
      }
      if (checkButton) checkButton.disabled = true;
    }
  };

  initBlank(container, check, { instant: bool(container.dataset.instant) });
  if (checkButton && !checkButton.dataset.initialized) {
    checkButton.dataset.initialized = "true";
    checkButton.addEventListener("click", check);
  }
  if (resetButton && !resetButton.dataset.initialized) {
    resetButton.dataset.initialized = "true";
    resetButton.addEventListener("click", () => {
      resetBlank(container);
      if (checkButton) checkButton.disabled = false;
    });
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
  const control = new Control(select, "choose", container);
  const ok = control.verify(reveal);
  container.classList.toggle("is-correct", ok);
  container.classList.toggle("is-incorrect", !ok && select.value !== "");

  if (reveal) {
    container.classList.add("is-locked");
  }

  const feedback = $(container, ".quarto-exercise-choose-feedback");
  if (showFeedback && select.value && feedback) {
    setFeedback(
      feedback,
      ok ? container.dataset.feedbackCorrect : container.dataset.feedbackIncorrect,
      ok ? "correct" : "incorrect"
    );
  } else {
    resetFeedback(feedback);
  }

  return ok;
}

function resetChoose(container) {
  container.classList.remove("is-correct", "is-incorrect", "is-locked");
  const select = $(container, ".quarto-exercise-choose-select");
  if (select) {
    const control = new Control(select, "choose", container);
    control.reset();
  }
  resetFeedback($(container, ".quarto-exercise-choose-feedback"));
}

function initStandaloneChoose(container) {
  const checkButton = $(container, ".quarto-exercise-choose-check-btn");
  const resetButton = $(container, ".quarto-exercise-choose-reset-btn");
  const check = () => {
    const ok = verifyChoose(container, { showFeedback: true, reveal: bool(container.dataset.reveal) });
    if (bool(container.dataset.lock) && ok) {
      const select = $(container, ".quarto-exercise-choose-select");
      if (select) {
        new Control(select, "choose", container).lockControl();
      }
      if (checkButton) checkButton.disabled = true;
    }
  };

  initChoose(container, check, { instant: !checkButton || bool(container.dataset.instant) });
  if (checkButton && !checkButton.dataset.initialized) {
    checkButton.dataset.initialized = "true";
    checkButton.addEventListener("click", check);
  }
  if (resetButton && !resetButton.dataset.initialized) {
    resetButton.dataset.initialized = "true";
    resetButton.addEventListener("click", () => {
      resetChoose(container);
      populateChoose(container);
      if (checkButton) checkButton.disabled = false;
    });
  }
}

function initExercise(exercise) {
  if (exercise.dataset.initialized) return;
  exercise.dataset.initialized = "true";

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
  blanks.forEach(blank => initBlank(blank, verify, { instant }));
  chooses.forEach(choose => initChoose(choose, verify, { instant }));
  codeClozes.forEach(cc => initCodeCloze(cc, verify, { instant }));

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
      if (event.target.closest("a, button, input, select, textarea, label")) return;
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
    if (label) label.textContent = `${labelFor(index)}.`;
  });
}

function shuffleAnswers(exercise, answers) {
  const container = $(exercise, ".quarto-exercise-choices");
  if (!container) return;
  shuffle(answers).forEach(answer => container.appendChild(answer));
  updateAnswerLabels(exercise);
}

function verifyAnswers(exercise, answers, reveal) {
  if (answers.length === 0) return true;

  const radio = exercise.dataset.type === "radio";
  let allCorrect = true;

  answers.forEach(answer => {
    const input = $(answer, ".quarto-exercise-input");
    const feedback = $(answer, ".quarto-exercise-feedback");
    const correct = answer.dataset.correct === "true";
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
      .filter(answer => answer.dataset.correct === "true")
      .forEach(answer => answer.classList.add("is-correct"));
  }

  return allCorrect;
}

function verifyExercise(exercise, { answers, blanks, chooses, codeClozes, explanation, status, reveal, lock, checkButton, resetButton }) {
  let allCorrect = true;

  const checkedCount = answers.filter(answer => $(answer, ".quarto-exercise-input").checked).length;
  if (answers.length > 0 && checkedCount === 0) {
    return false;
  }

  const answersOk = verifyAnswers(exercise, answers, reveal);
  if (!answersOk) allCorrect = false;

  blanks.forEach(blank => {
    if (!verifyBlank(blank, { showFeedback: true, reveal })) allCorrect = false;
  });

  chooses.forEach(choose => {
    if (!verifyChoose(choose, { showFeedback: true, reveal })) allCorrect = false;
  });

  (codeClozes || []).forEach(codeCloze => {
    if (!verifyCodeCloze(codeCloze, { showFeedback: true, reveal })) allCorrect = false;
  });

  updateStatus(status, exercise, allCorrect);
  updateExplanation(explanation, exercise.dataset.explanationPolicy, allCorrect);

  if (lock && allCorrect) {
    lockExercise(exercise, { answers, blanks, chooses, codeClozes, checkButton, resetButton });
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

function lockExercise(exercise, { answers, blanks, chooses, codeClozes, checkButton, resetButton }) {
  exercise.classList.add("is-locked");
  [checkButton, resetButton].filter(Boolean).forEach(button => {
    button.disabled = true;
  });
  answers.forEach(answer => {
    $(answer, ".quarto-exercise-input").disabled = true;
  });
  blanks.forEach(blank => {
    const input = $(blank, ".quarto-exercise-blank-input");
    if (input) new Control(input, "blank", blank).lockControl();
  });
  chooses.forEach(choose => {
    const select = $(choose, ".quarto-exercise-choose-select");
    if (select) new Control(select, "choose", choose).lockControl();
  });
  (codeClozes || []).forEach(codeCloze => {
    const controls = codeCloze._clozeControls || [];
    controls.forEach(ctrl => ctrl.lockControl());
  });
}

function resetExercise(exercise, parts) {
  exercise.classList.remove("is-locked");
  [parts.checkButton, parts.resetButton].filter(Boolean).forEach(button => {
    button.disabled = false;
  });

  parts.answers.forEach(answer => {
    answer.classList.remove("is-correct", "is-incorrect", "is-selected");
    const input = $(answer, ".quarto-exercise-input");
    if (input) {
      input.disabled = false;
      input.checked = false;
    }
    setHidden($(answer, ".quarto-exercise-feedback"), true);
  });

  parts.blanks.forEach(resetBlank);
  parts.chooses.forEach(resetChoose);
  (parts.codeClozes || []).forEach(resetCodeCloze);

  setHidden(parts.explanation, true);
  if (parts.status) {
    parts.status.textContent = "";
    parts.status.classList.remove("is-correct", "is-incorrect");
  }

  if (bool(exercise.dataset.shuffle) && bool(exercise.dataset.reshuffleOnReset)) {
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

function behaviorValue(attrs, container, name, fallback = "") {
  if (attrs && attrs[name] !== undefined && attrs[name] !== "") return attrs[name];
  const datasetName = name.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
  return dataValue(null, container, datasetName, fallback);
}

function initCodeCloze(container, onCheck, { instant = false } = {}) {
  if (container.dataset.initialized) return;
  container.dataset.initialized = "true";

  const code = container.querySelector("code");
  if (!code) return;

  const metadata = parseClozeMetadata(container);
  const controls = [];
  const blockInstant = bool(container.dataset.instant, instant);

  for (const [token, info] of Object.entries(metadata)) {
    const attrs = info.attrs || {};
    const controlInstant = behaviorValue(attrs, container, "instant", blockInstant ? "true" : "false") === "true";
    if (info.type === "blank") {
      const blankSpan = document.createElement("span");
      blankSpan.className = "quarto-exercise-code-blank-container";

      const input = document.createElement("input");
      input.type = "text";
      input.className = "quarto-exercise-blank-input quarto-exercise-code-blank";
      input.setAttribute("aria-label", "Fill in the blank");
      input.dataset.answers = attrs.answer || attrs.answers || "";
      input.dataset.match = attrs.match || "exact";
      input.dataset.ignoreCase = behaviorValue(attrs, container, "ignore-case", "false");
      input.dataset.trim = attrs.trim || "true";
      input.dataset.collapseSpace = attrs["collapse-space"] || "false";
      input.addEventListener("input", () => {
        adjustCodeBlankWidthToText(input);
        if (controlInstant && onCheck) onCheck();
      });
      input.addEventListener("blur", () => adjustCodeBlankWidthToText(input));
      input.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); if (onCheck) onCheck(); } });
      blankSpan.appendChild(input);

      const correctSpan = document.createElement("span");
      correctSpan.className = "quarto-exercise-code-blank-correct-text";
      correctSpan.hidden = true;
      blankSpan.appendChild(correctSpan);

      input._codeBlankCorrectSpan = correctSpan;

      replaceTokenWithElement(code, token, blankSpan);
      controls.push(new Control(input, "blank", blankSpan));
    } else if (info.type === "choose") {
      const select = document.createElement("select");
      select.className = "quarto-exercise-choose-select quarto-exercise-code-choose";
      select.appendChild(new Option("Choose...", ""));
      const options = bool(attrs.shuffle) ? shuffle(splitList(attrs.options)) : splitList(attrs.options);
      options.forEach(opt => {
        select.appendChild(new Option(opt, opt));
      });
      select.dataset.answer = attrs.answer || "";
      select.dataset.ignoreCase = behaviorValue(attrs, container, "ignore-case", "false");
      select.addEventListener("change", () => {
        adjustSelectWidth(select);
        if (controlInstant && onCheck) onCheck();
      });
      select.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); if (onCheck) onCheck(); } });
      adjustSelectWidth(select);
      replaceTokenWithElement(code, token, select);
      controls.push(new Control(select, "choose", container));
    }
  }

  container._clozeControls = controls;
}

function revealCodeClozeChoose(select, text) {
  if (select._codeClozeCorrectSpan) {
    select._codeClozeCorrectSpan.textContent = text;
    return;
  }
  const span = document.createElement("span");
  span.className = "quarto-exercise-code-choose-correct";
  span.textContent = text;
  if (select.parentNode) {
    select.parentNode.replaceChild(span, select);
  }
  select._codeClozeCorrectSpan = span;
}

function verifyCodeCloze(container, { showFeedback = false, reveal = false } = {}) {
  const controls = container._clozeControls || [];
  let allCorrect = true;

  controls.forEach(ctrl => {
    if (!ctrl.verify(reveal)) allCorrect = false;
  });

  return allCorrect;
}

function resetCodeCloze(container) {
  const controls = container._clozeControls || [];
  controls.forEach(ctrl => {
    ctrl.reset();
  });
}

function initStandaloneCodeCloze(container) {
  const wrapper = container.closest(".quarto-exercise-code-cloze-wrapper") || container;
  const checkButton = wrapper.querySelector(".quarto-exercise-check-btn");
  const resetButton = wrapper.querySelector(".quarto-exercise-reset-btn");
  const status = wrapper.querySelector(".quarto-exercise-status");

  const instant = bool(container.dataset.instant);
  const resetOption = bool(container.dataset.reset, true);

  if (instant && checkButton) {
    checkButton.style.display = "none";
  }
  if (!resetOption && resetButton) {
    resetButton.style.display = "none";
  }

  const check = () => {
    const ok = verifyCodeCloze(container, { showFeedback: true, reveal: bool(container.dataset.reveal) });
    if (status) {
      status.textContent = ok ? container.dataset.feedbackCorrect : container.dataset.feedbackIncorrect;
      status.className = "quarto-exercise-status " + (ok ? "is-correct" : "is-incorrect");
    }
    if (bool(container.dataset.lock) && ok) {
      container.classList.add("is-locked");
      if (checkButton) checkButton.disabled = true;
      if (resetButton) resetButton.disabled = true;
      const controls = container._clozeControls || [];
      controls.forEach(ctrl => ctrl.lockControl());
    }
  };

  initCodeCloze(container, check, { instant });
  if (checkButton && !checkButton.dataset.initialized) {
    checkButton.dataset.initialized = "true";
    checkButton.addEventListener("click", check);
  }
  if (resetButton) {
    if (resetButton.dataset.initialized) return;
    resetButton.dataset.initialized = "true";
    resetButton.addEventListener("click", () => {
      resetCodeCloze(container);
      if (checkButton) checkButton.disabled = false;
      if (resetButton) resetButton.disabled = false;
      container.classList.remove("is-locked");
      if (status) {
        status.textContent = "";
        status.className = "quarto-exercise-status";
      }
    });
  }
}
