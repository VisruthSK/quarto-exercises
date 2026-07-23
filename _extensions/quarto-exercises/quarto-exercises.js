const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
const UNIT_KEYS = ["exercises", "blanks", "chooses", "clozes"];

const $ = (root, selector) => root.querySelector(selector);
const $$ = (root, selector) => Array.from(root.querySelectorAll(selector));

document.addEventListener("DOMContentLoaded", initExercises);

if (window.Quarto && typeof window.Quarto.onRender === "function") {
  window.Quarto.onRender(initExercises);
}

async function digest(salt, value) {
  const bytes = new TextEncoder().encode(`${salt}\0${value}`);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hash)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

async function decodePattern(salt, encoded) {
  const key = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(salt)));
  const bytes = new Uint8Array(encoded.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(encoded.slice(i * 2, i * 2 + 2), 16) ^ key[i % key.length];
  }
  return new TextDecoder().decode(bytes);
}

async function matchesRegex(value, metadata) {
  const pattern = await decodePattern(metadata.salt, metadata.regex);
  try {
    return new RegExp(pattern, metadata.ignoreCase ? "i" : "").test(canonicalize(value, metadata));
  } catch (err) {
    console.warn("Invalid regex pattern in exercise metadata", err);
    return false;
  }
}

function canonicalize(value, rules = {}) {
  let normalized = value || "";
  if (rules.trim !== false) normalized = normalized.trim();
  if (rules.collapseSpace) normalized = normalized.replace(/\s+/g, " ");
  if (rules.ignoreCase) normalized = normalized.toLowerCase();
  return normalized;
}

function checkModeFor(control) {
  return control.closest(".quarto-exercise-blank-container, .quarto-exercise-choose-container, .quarto-exercise-code-cloze-container")?.dataset.checkMode ||
    control.closest(".quarto-exercise")?.dataset.checkMode ||
    (control.closest(".check-batch") ? "batch" : "exercise");
}

function makeControl(container, kind, id, qx) {
  return {
    closest: (sel) => container.closest(sel) || (container.matches(sel) ? container : null),
    _controlId: id || container.dataset.id || container.id || `default-${kind}`,
    _kind: kind,
    ...(qx && { _qx: qx })
  };
}

async function checkAnswer(control, submittedValue) {
  const container = control.closest(".quarto-exercise-blank-container") ||
                    control.closest(".quarto-exercise-choose-container") ||
                    control.closest(".quarto-exercise-code-cloze-container") ||
                    control.closest(".quarto-exercise");
  if (!container) return false;

  if (control.classList && control.classList.contains("quarto-exercise-answer")) {
    const exercise = control.closest(".quarto-exercise");
    const expected = exercise?.dataset.qxCorrect?.split(" ") || [];
    return expected.includes(await digest(exercise?.dataset.qxSalt || "", control.dataset.key || ""));
  }

  if (control._qx) {
    if (control._qx.regex) return matchesRegex(submittedValue, control._qx);
    const value = canonicalize(submittedValue, control._qx);
    return control._qx.digests.includes(await digest(control._qx.salt, value));
  }
  if (container.dataset.qxDigests || container.dataset.qxRegex) {
    const metadata = {
      salt: container.dataset.qxSalt,
      regex: container.dataset.qxRegex,
      ignoreCase: container.dataset.qxIgnoreCase === "true",
      trim: container.dataset.qxTrim !== "false",
      collapseSpace: container.dataset.qxCollapseSpace === "true"
    };
    if (metadata.regex) return matchesRegex(submittedValue, metadata);
    const value = canonicalize(submittedValue, metadata);
    return container.dataset.qxDigests.split(" ").includes(await digest(container.dataset.qxSalt, value));
  }
  return false;
}

function initExercises() {
  $$(document, ".quarto-exercise").forEach(initExercise);
  initCheckControllers();
  $$(document, ".quarto-exercise-blank-container")
    .filter(blank => !blank.closest(".quarto-exercise"))
    .forEach(initStandaloneBlank);
  $$(document, ".quarto-exercise-choose-container")
    .filter(choose => !choose.closest(".quarto-exercise"))
    .forEach(initStandaloneChoose);
  $$(document, ".quarto-exercise-code-cloze-standalone")
    .forEach(initStandaloneCodeCloze);
}

function controllerActions(kind) {
  const actions = document.createElement("div");
  actions.className = `quarto-exercise-actions quarto-exercise-${kind}-controls`;
  actions.dataset.checkController = kind;
  actions.innerHTML =
    `<button type="button" class="quarto-exercise-check-btn quarto-exercise-btn quarto-exercise-btn-primary">${kind === "page" ? "Check Page" : "Check"}</button>` +
    `<button type="button" class="quarto-exercise-reset-btn quarto-exercise-btn quarto-exercise-btn-secondary">${kind === "page" ? "Reset Page" : "Reset"}</button>` +
    '<span class="quarto-exercise-status" role="status"></span>';
  return actions;
}

function removeExerciseControls(exercise) {
  const actions = $(exercise, ".quarto-exercise-actions");
  if (!actions) return;
  $$(actions, ".quarto-exercise-check-btn, .quarto-exercise-reset-btn, .quarto-exercise-status")
    .forEach(button => button.remove());
  if (actions.children.length === 0) actions.remove();
}

function findCheckableUnits(root) {
  const exercises = $$(root, ".quarto-exercise");
  const blanks = $$(root, ".quarto-exercise-blank-container").filter(el => !el.closest(".quarto-exercise"));
  const chooses = $$(root, ".quarto-exercise-choose-container").filter(el => !el.closest(".quarto-exercise"));
  const clozes = $$(root, ".quarto-exercise-code-cloze-standalone").filter(el => !el.closest(".quarto-exercise"));
  return { exercises, blanks, chooses, clozes };
}

function unitList(units) {
  return UNIT_KEYS.flatMap(key => units[key]);
}

function gradeControllerUnit(unit) {
  return gradeUnit(unit, { showFeedback: true, reveal: bool(unit.dataset.reveal) });
}

function initController(kind, root) {
  if (root.dataset.controllerInitialized) return;
  root.dataset.controllerInitialized = "true";

  const units = findCheckableUnits(root);
  units.exercises.forEach(removeExerciseControls);
  units.blanks.forEach(el => $(el.parentNode, ".quarto-exercise-blank-check-btn")?.remove());
  units.chooses.forEach(el => $(el.parentNode, ".quarto-exercise-choose-check-btn")?.remove());
  units.clozes.forEach(el => {
    const actions = el.nextElementSibling || el.closest(".quarto-exercise-code-cloze-wrapper")?.querySelector(".quarto-exercise-actions");
    $(actions, ".quarto-exercise-check-btn")?.remove();
    $(actions, ".quarto-exercise-reset-btn")?.remove();
  });

  const actions = controllerActions(kind);
  root.appendChild(actions);
  const status = $(actions, ".quarto-exercise-status");

  $(actions, ".quarto-exercise-check-btn").addEventListener("click", async () => {
    const results = await Promise.all(unitList(units).map(gradeControllerUnit));

    const allCorrect = results.every(res => res.correct);
    const totalEarned = results.reduce((sum, res) => sum + res.earned, 0);
    const totalPossible = results.reduce((sum, res) => sum + res.possible, 0);

    const roundedEarned = Math.round(totalEarned * 100) / 100;
    const roundedPossible = Math.round(totalPossible * 100) / 100;

    const showScore = unitList(units).some(unit => bool(unit.dataset.score));
    status.textContent = (allCorrect ? "Correct!" : "Not quite.") + (showScore ? ` Score: ${roundedEarned} / ${roundedPossible}.` : "");
    status.classList.toggle("is-correct", allCorrect);
    status.classList.toggle("is-incorrect", !allCorrect);
  });

  $(actions, ".quarto-exercise-reset-btn").addEventListener("click", () => {
    unitList(units).forEach(resetUnit);
    clearStatus(status);
  });
}

function initCheckControllers() {
  const documentUnits = findCheckableUnits(document);
  const pageMode = unitList(documentUnits).some(unit => unit.dataset.checkMode === "page");
  if (pageMode) {
    const content = document.querySelector("main#quarto-document-content, main.content, main") || document.body;
    const units = findCheckableUnits(content);
    if (unitList(units).length > 0) {
      initController("page", content);
    }
  } else {
    $$(document, ".check-batch").forEach(batch => {
      initController("batch", batch);
    });
  }
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

function clearStatus(status) {
  if (!status) return;
  status.textContent = "";
  status.classList.remove("is-correct", "is-incorrect");
}

function setStatus(status, text, isCorrect) {
  if (!status) return;
  status.textContent = text;
  status.classList.toggle("is-correct", isCorrect);
  status.classList.toggle("is-incorrect", !isCorrect);
}

function onEnter(element, callback) {
  element.addEventListener("keydown", event => {
    if (event.key === "Enter") {
      event.preventDefault();
      const mode = checkModeFor(element);
      if (mode === "exercise" && callback) {
        callback();
      }
    }
  });
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

let staticMeasurer = null;

function getStaticMeasurer() {
  if (!staticMeasurer && typeof document !== "undefined" && document.body) {
    staticMeasurer = document.createElement("span");
    staticMeasurer.className = "quarto-exercise-measurer";
    staticMeasurer.style.visibility = "hidden";
    staticMeasurer.style.position = "absolute";
    staticMeasurer.style.left = "-9999px";
    staticMeasurer.style.top = "-9999px";
    staticMeasurer.style.whiteSpace = "pre";
    staticMeasurer.style.pointerEvents = "none";
    document.body.appendChild(staticMeasurer);
  }
  return staticMeasurer;
}

function adjustWidth(el, options = {}) {
  if (!el) return;
  const {
    getText = (el) => el.value,
    minWidth = 80,
    maxWidth = 380,
    extraPadding = 16,
    includePadding = false,
    includeBorder = false,
    removeBorderBottom = false,
    fallbackText = null,
    copyFontDetails = false
  } = options;

  const text = getText(el) ?? fallbackText ?? "";
  if (!text && fallbackText === null) {
    el.style.width = "";
    if (removeBorderBottom) el.style.borderBottom = "";
    return;
  }

  const style = window.getComputedStyle ? window.getComputedStyle(el) : el.style || {};
  let measurer = getStaticMeasurer();
  let createdFallback = false;
  if (!measurer) {
    measurer = document.createElement("span");
    measurer.style.visibility = "hidden";
    measurer.style.position = "absolute";
    measurer.style.whiteSpace = "pre";
    if (typeof document !== "undefined" && document.body) {
      document.body.appendChild(measurer);
    }
    createdFallback = true;
  }

  measurer.style.font = style.font || "";
  measurer.style.letterSpacing = copyFontDetails ? (style.letterSpacing || "") : "";
  measurer.style.wordSpacing = copyFontDetails ? (style.wordSpacing || "") : "";
  measurer.style.textTransform = copyFontDetails ? (style.textTransform || "") : "";
  measurer.style.fontVariant = copyFontDetails ? (style.fontVariant || "") : "";
  measurer.style.fontFeatureSettings = copyFontDetails ? (style.fontFeatureSettings || "") : "";

  measurer.textContent = text;

  let width = (measurer.getBoundingClientRect ? measurer.getBoundingClientRect().width : 0) + extraPadding;
  if (includePadding) {
    width += (parseFloat(style.paddingLeft) || 0) + (parseFloat(style.paddingRight) || 0);
  }
  if (includeBorder) {
    width += (parseFloat(style.borderLeftWidth) || 0) + (parseFloat(style.borderRightWidth) || 0);
  }

  width = Math.min(Math.max(width, minWidth), maxWidth);
  el.style.width = `${width}px`;

  if (removeBorderBottom) {
    el.style.borderBottom = "none";
  }

  if (createdFallback) {
    measurer.remove();
  }
}

function adjustInputWidth(input) {
  adjustWidth(input, { getText: (el) => el.value, minWidth: 80, maxWidth: 380, extraPadding: 16 });
}

function adjustCodeBlankWidthToText(input) {
  adjustWidth(input, {
    getText: (el) => el.value,
    minWidth: 0,
    maxWidth: 380,
    extraPadding: 1,
    removeBorderBottom: true,
    copyFontDetails: true
  });
}

function adjustSelectWidth(select) {
  adjustWidth(select, {
    getText: (el) => el.options[el.selectedIndex]?.text || "Choose...",
    minWidth: 0,
    maxWidth: 380,
    extraPadding: 6,
    includePadding: true,
    includeBorder: true
  });
}

function initBlank(container, onCheck) {
  const input = $(container, ".quarto-exercise-blank-input");
  if (!input || input.dataset.initialized) return;

  input.dataset.initialized = "true";

  adjustInputWidth(input);
  input.addEventListener("input", () => adjustInputWidth(input));
  input.addEventListener("blur", () => adjustInputWidth(input));
  onEnter(input, onCheck);
}

async function verifySimpleControl(container, kind, inputSelector, feedbackSelector, correctTextSelector, { showFeedback = false } = {}) {
  const element = $(container, inputSelector);
  const feedback = $(container, feedbackSelector);

  const control = makeControl(container, kind);
  const isCorrect = await checkAnswer(control, element ? element.value : "");

  container.classList.toggle("is-correct", isCorrect);
  if (element) {
    element.classList.toggle("is-correct", isCorrect);
    element.classList.toggle("is-incorrect", !isCorrect);
  }

  setCorrectText(container, correctTextSelector, isCorrect && element ? element.value : "");

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

async function verifyBlank(container, options = {}) {
  return verifySimpleControl(container, "blank", ".quarto-exercise-blank-input", ".quarto-exercise-blank-feedback", ".quarto-exercise-blank-correct-text", options);
}

function resetBlank(container) {
  const input = $(container, ".quarto-exercise-blank-input");
  container.classList.remove("is-correct");
  if (input) {
    input.disabled = false;
    input.value = "";
    input.classList.remove("is-correct", "is-incorrect");
  }
  setCorrectText(container, ".quarto-exercise-blank-correct-text", "");
  resetFeedback($(container, ".quarto-exercise-blank-feedback"));
  adjustInputWidth(input);
}

function initStandaloneBlank(container) {
  const checkButton = $(container, ".quarto-exercise-blank-check-btn");
  const check = async () => await verifyBlank(container, { showFeedback: true });

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
  onEnter(select, onCheck);
}

async function verifyChoose(container, options = {}) {
  return verifySimpleControl(container, "choose", ".quarto-exercise-choose-select", ".quarto-exercise-choose-feedback", ".quarto-exercise-choose-correct-text", options);
}

function resetChoose(container) {
  const select = $(container, ".quarto-exercise-choose-select");
  container.classList.remove("is-correct");
  select.disabled = false;
  select.selectedIndex = 0;
  select.classList.remove("is-correct", "is-incorrect");
  setCorrectText(container, ".quarto-exercise-choose-correct-text", "");
  resetFeedback($(container, ".quarto-exercise-choose-feedback"));
  adjustSelectWidth(select);
  const correctSpan = $(container, ".quarto-exercise-code-choose-correct");
  if (correctSpan) {
    correctSpan.remove();
    select.style.display = "";
    select._codeClozeCorrectSpan = null;
  }
}

function initStandaloneChoose(container) {
  const checkButton = $(container, ".quarto-exercise-choose-check-btn");
  const check = async () => await verifyChoose(container, { showFeedback: true });

  initChoose(container, check);
  if (checkButton && !checkButton.dataset.initialized) {
    checkButton.dataset.initialized = "true";
    checkButton.addEventListener("click", check);
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

  const verify = async () => await verifyExercise(exercise, { answers, blanks, chooses, codeClozes, explanation, status, reveal, lock, checkButton, resetButton });

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

async function verifyAnswers(exercise, answers, reveal) {
  if (answers.length === 0) return true;

  const radio = exercise.dataset.type === "radio";
  let allCorrect = true;

  for (const answer of answers) {
    const input = $(answer, ".quarto-exercise-input");
    const feedback = $(answer, ".quarto-exercise-feedback");
    const correct = await checkAnswer(answer, "true");
    const selected = input.checked;

    answer.classList.remove("is-correct", "is-incorrect");
    setAnswerState(answer, null);
    setHidden(feedback, true);

    if (radio) {
      if (selected) {
        answer.classList.add(correct ? "is-correct" : "is-incorrect");
        setAnswerState(answer, correct ? "correct" : "incorrect");
        setHidden(feedback, false);
        allCorrect = correct;
      }
    } else if (selected && correct) {
      answer.classList.add("is-correct");
      setAnswerState(answer, "correct");
      setHidden(feedback, false);
    } else if (selected && !correct) {
      answer.classList.add("is-incorrect");
      setAnswerState(answer, "incorrect");
      setHidden(feedback, false);
      allCorrect = false;
    } else if (!selected && correct) {
      allCorrect = false;
    }
  }

  if (radio && !answers.some(answer => $(answer, ".quarto-exercise-input").checked)) {
    allCorrect = false;
  }

  if (reveal) {
    for (const answer of answers) {
      const correct = await checkAnswer(answer, "true");
      if (correct) {
        answer.classList.add("is-correct");
      }
    }
  }

  return allCorrect;
}

function setAnswerState(answer, state) {
  const target = $(answer, ".quarto-exercise-answer-state");
  if (target) target.textContent = state === "correct" ? "Correct." : state === "incorrect" ? "Incorrect." : "";
}

async function gradeUnit(unit, { showFeedback = true, reveal = false } = {}) {
  if (unit.classList.contains("quarto-exercise")) {
    const parts = exerciseParts(unit);
    const hasMcq = parts.answers.length > 0;
    const blanksCount = parts.blanks.length;
    const choosesCount = parts.chooses.length;

    // Verify MCQ
    const answersOk = await verifyAnswers(unit, parts.answers, reveal);

    // Verify blanks
    let blanksOk = true;
    let correctBlanks = 0;
    for (const blank of parts.blanks) {
      const ok = await verifyBlank(blank, { showFeedback, reveal });
      if (ok) correctBlanks++;
      else blanksOk = false;
    }

    // Verify chooses
    let choosesOk = true;
    let correctChooses = 0;
    for (const choose of parts.chooses) {
      const ok = await verifyChoose(choose, { showFeedback, reveal });
      if (ok) correctChooses++;
      else choosesOk = false;
    }

    // Verify code clozes
    let codeClozeOk = true;
    let correctClozes = 0;
    let totalClozeUnits = 0;
    for (const cc of parts.codeClozes) {
      const ok = await verifyCodeCloze(cc, { showFeedback, reveal });
      if (!ok) codeClozeOk = false;
      correctClozes += cc._correctCount || 0;
      totalClozeUnits += cc._totalCount || 0;
    }

    const allCorrect = answersOk && blanksOk && choosesOk && codeClozeOk;
    const possible = Number(unit.dataset.points) || 1;
    const N = (hasMcq ? 1 : 0) + blanksCount + choosesCount + totalClozeUnits;
    const correctUnits = (answersOk && hasMcq ? 1 : 0) + correctBlanks + correctChooses + correctClozes;
    const earned = N > 0 ? (possible / N) * correctUnits : 0;

    unit._earnedPoints = earned;
    unit._possiblePoints = possible;

    updateExplanation(parts.explanation, unit.dataset.explanationPolicy, allCorrect);
    updateStatus(parts.status, unit, allCorrect, earned, possible);

    if (parts.lock && allCorrect) {
      lockExercise(unit, parts);
    }

    return { earned, possible, correct: allCorrect };
  } else if (unit.classList.contains("quarto-exercise-blank-container")) {
    const ok = await verifyBlank(unit, { showFeedback, reveal });
    const possible = Number(unit.dataset.points) || 1;
    const earned = ok ? possible : 0;
    unit._earnedPoints = earned;
    unit._possiblePoints = possible;
    return { earned, possible, correct: ok };
  } else if (unit.classList.contains("quarto-exercise-choose-container")) {
    const ok = await verifyChoose(unit, { showFeedback, reveal });
    const possible = Number(unit.dataset.points) || 1;
    const earned = ok ? possible : 0;
    unit._earnedPoints = earned;
    unit._possiblePoints = possible;
    return { earned, possible, correct: ok };
  } else if (unit.classList.contains("quarto-exercise-code-cloze-standalone")) {
    const ok = await verifyCodeCloze(unit, { showFeedback, reveal });
    const possible = Number(unit.dataset.points) || 1;
    const earned = unit._totalCount > 0 ? (possible / unit._totalCount) * (unit._correctCount || 0) : (ok ? possible : 0);
    unit._earnedPoints = earned;
    unit._possiblePoints = possible;

    const actions = unit.nextElementSibling || unit.closest(".quarto-exercise-code-cloze-wrapper")?.querySelector(".quarto-exercise-actions");
    setStatus(actions ? $(actions, ".quarto-exercise-status") : null, ok ? "Correct!" : "Incorrect", ok);
    return { earned, possible, correct: ok };
  }
  return { earned: 0, possible: 0, correct: false };
}

async function verifyExercise(exercise, parts) {
  const res = await gradeUnit(exercise, { showFeedback: true, reveal: parts.reveal });
  return res.correct;
}

function updateExplanation(explanation, policy = "correct", allCorrect) {
  if (!explanation) return;
  explanation.hidden = policy === "never" || (policy === "correct" && !allCorrect);
}

function updateStatus(status, exercise, allCorrect, earned = null, possible = null) {
  if (!status) return;
  const pts = possible !== null ? possible : (Number(exercise.dataset.points) || 1);
  const earn = earned !== null ? earned : (allCorrect ? pts : 0);
  const roundedEarn = Math.round(earn * 100) / 100;
  const score = bool(exercise.dataset.score) ? ` Score: ${roundedEarn} / ${pts}.` : "";
  status.textContent = (allCorrect ? exercise.dataset.feedbackCorrect : exercise.dataset.feedbackIncorrect) + score;
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
    if (input) {
      input.disabled = false;
      input.checked = false;
    }
    answer.classList.remove("is-selected", "is-correct", "is-incorrect");
    setAnswerState(answer, null);
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

function resetUnit(unit) {
  if (unit.classList.contains("quarto-exercise")) {
    resetExercise(unit, exerciseParts(unit));
  } else if (unit.classList.contains("quarto-exercise-blank-container")) {
    resetBlank(unit);
  } else if (unit.classList.contains("quarto-exercise-choose-container")) {
    resetChoose(unit);
  } else if (unit.classList.contains("quarto-exercise-code-cloze-standalone")) {
    resetCodeCloze(unit);
    const actions = unit.nextElementSibling || unit.closest(".quarto-exercise-code-cloze-wrapper")?.querySelector(".quarto-exercise-actions");
    clearStatus(actions ? $(actions, ".quarto-exercise-status") : null);
  }
  unit._earnedPoints = 0;
}

window.QuartoExercises = {
  init: initExercises,
  async checkExercise(exercise) {
    const root = resolveExercise(exercise);
    if (!root) return false;
    const res = await gradeUnit(root, { showFeedback: true });
    return res.correct;
  },
  resetExercise(exercise) {
    const root = resolveExercise(exercise);
    if (root) resetUnit(root);
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

function replaceTokenWithElement(codeNode, token, el) {
  let textNode = null;
  const walker = document.createTreeWalker(codeNode, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    if (walker.currentNode.textContent.includes(token)) {
      textNode = walker.currentNode;
      break;
    }
  }
  if (!textNode) return;

  const text = textNode.textContent;
  const idx = text.indexOf(token);
  const beforeText = text.substring(0, idx);
  const afterText = text.substring(idx + token.length);

  const parent = textNode.parentNode;
  const beforeNode = document.createTextNode(beforeText);
  const afterNode = document.createTextNode(afterText);

  parent.replaceChild(afterNode, textNode);
  parent.insertBefore(el, afterNode);
  parent.insertBefore(beforeNode, el);
}

function initCodeCloze(container, onCheck) {
  if (container.dataset.initialized) return;
  container.dataset.initialized = "true";

  const code = container.querySelector("code");
  if (!code) return;

  const metadata = parseClozeMetadata(container);
  const controls = [];

  for (const [token, info] of Object.entries(metadata)) {
    if (info.type === "blank") {
      const attrs = info.attrs || {};
      const input = document.createElement("input");
      input.type = "text";
      input.className = "quarto-exercise-blank-input quarto-exercise-code-blank";
      input.setAttribute("aria-label", "Fill in the blank");
      input.addEventListener("input", () => adjustCodeBlankWidthToText(input));
      input.addEventListener("blur", () => adjustCodeBlankWidthToText(input));
      onEnter(input, onCheck);
      replaceTokenWithElement(code, token, input);
      controls.push({
        type: "blank",
        el: input,
        attrs,
        token,
        qx: info.qx,
      });
    } else if (info.type === "choose") {
      const attrs = info.attrs || {};
      const select = document.createElement("select");
      select.className = "quarto-exercise-choose-select quarto-exercise-code-choose";
      select.appendChild(new Option("Choose...", ""));
      splitList(attrs.options).forEach(opt => {
        select.appendChild(new Option(opt, opt));
      });
      select.addEventListener("change", () => adjustSelectWidth(select));
      onEnter(select, onCheck);
      adjustSelectWidth(select);
      replaceTokenWithElement(code, token, select);
      controls.push({
        type: "choose",
        el: select,
        attrs,
        token,
        qx: info.qx
      });
    }
  }

  container._clozeControls = controls;
}

async function verifyCodeCloze(container, { showFeedback = false, reveal = false } = {}) {
  const controls = container._clozeControls || [];
  let allCorrect = true;
  let correctCount = 0;

  for (const ctrl of controls) {
    const { type, el, token } = ctrl;
    el.classList.remove("is-correct", "is-incorrect");

    const controlObj = makeControl(container, type, token, ctrl.qx);

    const ok = await checkAnswer(controlObj, el.value);
    if (ok) {
      correctCount++;
    }

    if (type === "blank") {
      el.classList.toggle("is-correct", ok);
      el.classList.toggle("is-incorrect", !ok);
      if (!ok) allCorrect = false;
    } else if (type === "choose") {
      el.classList.toggle("is-correct", ok);
      el.classList.toggle("is-incorrect", !ok && el.value !== "");
      if (ok || reveal) {
        if (el._codeClozeCorrectSpan) continue;
        const selectedText = ok ? el.value : "";
        if (selectedText) {
          const span = document.createElement("span");
          span.className = "quarto-exercise-code-choose-correct";
          span.textContent = selectedText;
          el.style.display = "none";
          el.parentNode.insertBefore(span, el.nextSibling);
          el._codeClozeCorrectSpan = span;
        }
      }
      if (!ok) allCorrect = false;
    }
  }

  container._correctCount = correctCount;
  container._totalCount = controls.length;
  return allCorrect;
}

function resetCodeCloze(container) {
  const controls = container._clozeControls || [];
  controls.forEach(({ type, el }) => {
    el.classList.remove("is-correct", "is-incorrect");
    el.disabled = false;
    if (type === "blank") {
      el.value = "";
      el.style.width = "";
      el.style.borderBottom = "";
    } else if (type === "choose") {
      el.selectedIndex = 0;
      adjustSelectWidth(el);
      const span = el._codeClozeCorrectSpan;
      if (span) {
        span.remove();
        el.style.display = "";
        el._codeClozeCorrectSpan = null;
      }
    }
  });
}

function initStandaloneCodeCloze(container) {
  const actions = container.nextElementSibling;
  const checkBtn = actions && actions.classList.contains("quarto-exercise-actions") ? $(actions, ".quarto-exercise-check-btn") : null;
  const resetBtn = actions && actions.classList.contains("quarto-exercise-actions") ? $(actions, ".quarto-exercise-reset-btn") : null;

  const check = async () => {
    const ok = await verifyCodeCloze(container, { showFeedback: true });
    setStatus(actions ? $(actions, ".quarto-exercise-status") : null, ok ? "Correct!" : "Incorrect", ok);
  };

  initCodeCloze(container, check);

  if (checkBtn && !checkBtn.dataset.initialized) {
    checkBtn.dataset.initialized = "true";
    checkBtn.addEventListener("click", check);
  }
  if (resetBtn && !resetBtn.dataset.initialized) {
    resetBtn.dataset.initialized = "true";
    resetBtn.addEventListener("click", () => {
      resetCodeCloze(container);
      clearStatus(actions ? $(actions, ".quarto-exercise-status") : null);
    });
  }
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    digest,
    decodePattern,
    matchesRegex,
    initExercises,
    initController,
    initCheckControllers,
    checkAnswer,
    canonicalize,
    splitList,
    makeControl,
    checkModeFor,
    bool,
    shuffle,
    labelFor,
    setHidden,
    setFeedback,
    setCorrectText,
    resetFeedback,
    clearStatus,
    setStatus,
    onEnter,
    adjustWidth,
    adjustInputWidth,
    adjustCodeBlankWidthToText,
    adjustSelectWidth,
    initBlank,
    verifyBlank,
    resetBlank,
    initStandaloneBlank,
    initChoose,
    verifyChoose,
    resetChoose,
    initStandaloneChoose,
    initExercise,
    lockExercise,
    exerciseParts,
    gradeUnit,
    verifyExercise,
    resetExercise,
    resetUnit,
    parseClozeMetadata,
    initCodeCloze,
    verifyCodeCloze,
    resetCodeCloze,
    initStandaloneCodeCloze,
    QuartoExercises: window.QuartoExercises
  };
}
