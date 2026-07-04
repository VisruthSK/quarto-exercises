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

function answerOptions(container) {
  return (container.dataset.options || "")
    .split(",")
    .map(option => option.trim())
    .filter(Boolean);
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
  const answers = (answersStr || "").split(",").map(answer => compare(normalize(answer)));

  if (matchMode === "regex") {
    try {
      return new RegExp(normalize((answersStr || "").split(",")[0]), ignoreCase ? "i" : "").test(normalize(value));
    } catch (error) {
      console.warn("Invalid regex in blank:", answers[0], error);
      return false;
    }
  }

  return answers.some(answer => answer === userValue);
}

function adjustInputWidth(input) {
  if (!input) return;
  const measurer = document.createElement("span");
  Object.assign(measurer.style, {
    visibility: "hidden",
    position: "absolute",
    whiteSpace: "pre",
    font: window.getComputedStyle(input).font
  });
  measurer.textContent = input.value || input.placeholder || "";
  document.body.appendChild(measurer);
  input.style.width = `${Math.min(Math.max(measurer.getBoundingClientRect().width + 16, 50), 380)}px`;
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

function verifyBlank(container, { showFeedback = false } = {}) {
  const input = $(container, ".quarto-exercise-blank-input");
  const feedback = $(container, ".quarto-exercise-blank-feedback");
  const isCorrect = checkBlankMatch(
    input.value,
    container.dataset.answers,
    container.dataset.match || "exact",
    bool(container.dataset.ignoreCase),
    container.dataset.trim !== "false",
    bool(container.dataset.collapseSpace)
  );

  container.classList.toggle("is-correct", isCorrect);
  input.classList.toggle("is-correct", isCorrect);
  input.classList.toggle("is-incorrect", !isCorrect);
  setCorrectText(container, ".quarto-exercise-blank-correct-text", isCorrect ? input.value : "");

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

function initStandaloneBlank(container) {
  const checkButton = $(container, ".quarto-exercise-blank-check-btn");
  const check = () => verifyBlank(container, { showFeedback: true });

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

  select.addEventListener("change", () => {
    if (instant) onCheck();
  });
  select.addEventListener("keydown", event => {
    if (event.key === "Enter") {
      event.preventDefault();
      onCheck();
    }
  });
}

function verifyChoose(container, { showFeedback = false } = {}) {
  const select = $(container, ".quarto-exercise-choose-select");
  const feedback = $(container, ".quarto-exercise-choose-feedback");
  const userValue = select.value;
  const answer = container.dataset.answer || "";
  const isCorrect = userValue
    ? bool(container.dataset.ignoreCase)
      ? userValue.toLowerCase() === answer.toLowerCase()
      : userValue === answer
    : false;

  container.classList.toggle("is-correct", isCorrect);
  select.classList.toggle("is-correct", isCorrect);
  select.classList.toggle("is-incorrect", !isCorrect);
  setCorrectText(container, ".quarto-exercise-choose-correct-text", isCorrect ? userValue : "");

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
}

function initStandaloneChoose(container) {
  const checkButton = $(container, ".quarto-exercise-choose-check-btn");
  const check = () => verifyChoose(container, { showFeedback: true });

  initChoose(container, check, { instant: !checkButton || bool(container.dataset.instant) });
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
  const checkButton = $(exercise, ".quarto-exercise-check-btn");
  const resetButton = $(exercise, ".quarto-exercise-reset-btn");
  const hintButton = $(exercise, ".quarto-exercise-hint-btn");
  const hintPanel = $(exercise, ".quarto-exercise-hint");
  const explanation = $(exercise, ".quarto-exercise-explanation");
  const status = $(exercise, ".quarto-exercise-status");
  const instant = bool(exercise.dataset.instant);
  const reveal = bool(exercise.dataset.reveal);
  const lock = bool(exercise.dataset.lock);

  const verify = () => verifyExercise(exercise, { answers, blanks, chooses, explanation, status, reveal, lock, checkButton, resetButton });

  initAnswers(exercise, answers, verify, instant);
  blanks.forEach(blank => initBlank(blank, verify));
  chooses.forEach(choose => initChoose(choose, verify, { instant }));

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
    resetButton.addEventListener("click", () => resetExercise(exercise, { answers, blanks, chooses, explanation, status, hintPanel, checkButton, resetButton }));
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

function verifyExercise(exercise, parts) {
  const answersOk = verifyAnswers(exercise, parts.answers, parts.reveal);
  const blanksOk = parts.blanks.every(blank => verifyBlank(blank, { showFeedback: true }));
  const choosesOk = parts.chooses.every(choose => verifyChoose(choose, { showFeedback: true }));
  const allCorrect = answersOk && blanksOk && choosesOk;

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
