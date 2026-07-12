document.addEventListener("DOMContentLoaded", initExercises);

if (window.Quarto && typeof window.Quarto.onRender === "function") {
  window.Quarto.onRender(initExercises);
}

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

const $ = (root, selector) => root.querySelector(selector);
const $$ = (root, selector) => Array.from(root.querySelectorAll(selector));

let aesGcmKey = null;
const decryptedCache = new WeakMap();

async function getAesGcmKey() {
  if (aesGcmKey) return aesGcmKey;
  const keyStr = window.quartoExercisesKey;
  if (!keyStr) return null;
  const keyBytes = hexToBytes(keyStr);
  aesGcmKey = await window.crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "AES-GCM" },
    false,
    ["decrypt"]
  );
  return aesGcmKey;
}

function hexToBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
  }
  return bytes;
}

async function decryptPayload(exerciseId, controlId, payloadStr) {
  // protects against static source inspection, not runtime inspection
  const key = await getAesGcmKey();
  if (!key) return null;

  try {
    const iv = hexToBytes(payloadStr.slice(0, 24));
    const tag = hexToBytes(payloadStr.slice(-32));
    const ciphertext = hexToBytes(payloadStr.slice(24, -32));

    const combined = new Uint8Array(ciphertext.length + tag.length);
    combined.set(ciphertext);
    combined.set(tag, ciphertext.length);

    const docId = window.quartoExercisesDocId || 'default-doc';
    const aad = `${docId}:${exerciseId}:${controlId}`;

    const decryptedBuffer = await window.crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: iv,
        additionalData: new TextEncoder().encode(aad),
        tagLength: 128
      },
      key,
      combined
    );
    const plaintext = new TextDecoder().decode(decryptedBuffer);
    return JSON.parse(plaintext);
  } catch (e) {
    console.error("Decryption failed:", e);
    return null;
  }
}

async function checkAnswer(control, submittedValue) {
  const container = control.closest(".quarto-exercise-blank-container") ||
                    control.closest(".quarto-exercise-choose-container") ||
                    control.closest(".quarto-exercise-code-cloze-container") ||
                    control.closest(".quarto-exercise");
  if (!container) return false;

  let exerciseId = "default";
  const parentEx = container.closest(".quarto-exercise");
  if (parentEx) {
    exerciseId = parentEx.dataset.id || "default";
  } else if (container.dataset.parentId) {
    exerciseId = container.dataset.parentId;
  }

  // MCQ answer check
  if (control.classList && control.classList.contains("quarto-exercise-answer")) {
    if (control.dataset.correct !== undefined) {
      return control.dataset.correct === "true";
    }

    if (decryptedCache.has(control)) {
      return decryptedCache.get(control).correct === true;
    }

    const pba = control.dataset.pba;
    if (!pba) return false;

    const key = control.dataset.key;
    const decrypted = await decryptPayload(exerciseId, key, pba);
    if (decrypted) {
      decryptedCache.set(control, decrypted);
      return decrypted.correct === true;
    }
    return false;
  }

  // Get GCM payload for blanks/chooses or clozes
  let decrypted = null;
  const pba = container._payload || container.dataset.pba || container.getAttribute("data-pba");
  if (pba) {
    if (container.classList.contains("quarto-exercise-code-cloze-container")) {
      // Code cloze: decrypts the entire metadata map
      if (decryptedCache.has(container)) {
        decrypted = decryptedCache.get(container);
      } else {
        const clozeId = container.dataset.parentId || container.dataset.id || container.id || exerciseId;
        const fullClozeMeta = await decryptPayload(clozeId, container.dataset.id || container.id, pba);
        if (fullClozeMeta && fullClozeMeta.metadata) {
          decrypted = fullClozeMeta.metadata;
          decryptedCache.set(container, decrypted);
        }
      }
      // Get the spec for this specific token
      if (decrypted && decrypted[control._controlId]) {
        decrypted = decrypted[control._controlId].attrs;
      } else {
        decrypted = null;
      }
    } else {
      // Standalone blank or choose
      if (decryptedCache.has(container)) {
        decrypted = decryptedCache.get(container);
      } else {
        decrypted = await decryptPayload(exerciseId, container.id, pba);
        if (decrypted) {
          decryptedCache.set(container, decrypted);
        }
      }
    }
  }

  if (decrypted) {
    // Obfuscated GCM path
    if (control._kind === "blank") {
      const matchMode = decrypted.match || "exact";
      const answersList = decrypted.answers || decrypted.answer || [];
      const ignoreCase = decrypted.ignoreCase || decrypted["ignore-case"] === "true";
      const trimMode = decrypted.trim !== "false" && decrypted.trim !== false;
      const collapseSpace = decrypted.collapseSpace || decrypted["collapse-space"] === "true";
      return checkBlankMatch(
        submittedValue,
        answersList,
        matchMode,
        ignoreCase,
        trimMode,
        collapseSpace
      );
    }
    if (control._kind === "choose") {
      const expected = decrypted.answer || "";
      let normalized = submittedValue;
      const ignoreCase = decrypted.ignoreCase || decrypted["ignore-case"] === "true";
      if (ignoreCase) {
        return normalized.trim().toLowerCase() === expected.trim().toLowerCase();
      }
      return normalized.trim() === expected.trim();
    }
  } else {
    // Non-obfuscated fallback matching (legacy / plaintext mode)
    if (control._kind === "blank" && control._answers) {
      return checkBlankMatch(
        submittedValue,
        control._answers,
        control._attrs.match || "exact",
        control._attrs.ignoreCase,
        control._attrs.trim !== false,
        control._attrs.collapseSpace
      );
    }

    if (control._kind === "choose" && control._answer) {
      let normalized = submittedValue;
      let expected = control._answer;
      if (control._attrs.ignoreCase) {
        return normalized.trim().toLowerCase() === expected.trim().toLowerCase();
      }
      return normalized.trim() === expected.trim();
    }
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
  $$(exercise, ".quarto-exercise-actions > .quarto-exercise-check-btn, .quarto-exercise-actions > .quarto-exercise-reset-btn")
    .forEach(button => button.remove());
}

function findCheckableUnits(root) {
  const exercises = $$(root, ".quarto-exercise");
  const blanks = $$(root, ".quarto-exercise-blank-container").filter(el => !el.closest(".quarto-exercise"));
  const chooses = $$(root, ".quarto-exercise-choose-container").filter(el => !el.closest(".quarto-exercise"));
  const clozes = $$(root, ".quarto-exercise-code-cloze-standalone").filter(el => !el.closest(".quarto-exercise"));
  return { exercises, blanks, chooses, clozes };
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
    const results = await Promise.all([
      ...units.exercises.map(ex => gradeUnit(ex, { showFeedback: true, reveal: bool(ex.dataset.reveal) })),
      ...units.blanks.map(b => gradeUnit(b, { showFeedback: true })),
      ...units.chooses.map(c => gradeUnit(c, { showFeedback: true })),
      ...units.clozes.map(cc => gradeUnit(cc, { showFeedback: true }))
    ]);

    const allCorrect = results.every(res => res.correct);
    const totalEarned = results.reduce((sum, res) => sum + res.earned, 0);
    const totalPossible = results.reduce((sum, res) => sum + res.possible, 0);

    const roundedEarned = Math.round(totalEarned * 100) / 100;
    const roundedPossible = Math.round(totalPossible * 100) / 100;

    const showScore = window.quartoExercisesScore === true || units.exercises.some(ex => bool(ex.dataset.score));
    status.textContent = (allCorrect ? "Correct!" : "Not quite.") + (showScore ? ` Score: ${roundedEarned} / ${roundedPossible}.` : "");
    status.classList.toggle("is-correct", allCorrect);
    status.classList.toggle("is-incorrect", !allCorrect);
  });

  $(actions, ".quarto-exercise-reset-btn").addEventListener("click", () => {
    units.exercises.forEach(ex => resetExercise(ex, exerciseParts(ex)));

    units.blanks.forEach(b => {
      const input = $(b, ".quarto-exercise-blank-input");
      if (input) {
        input.value = "";
        input.classList.remove("is-correct", "is-incorrect");
        adjustInputWidth(input);
      }
      setCorrectText(b, ".quarto-exercise-blank-correct-text", "");
      resetFeedback($(b, ".quarto-exercise-blank-feedback"));
      b._earnedPoints = 0;
    });

    units.chooses.forEach(c => {
      const select = $(c, ".quarto-exercise-choose-select");
      if (select) {
        select.value = "";
        select.classList.remove("is-correct", "is-incorrect");
        adjustSelectWidth(select);
      }
      resetFeedback($(c, ".quarto-exercise-choose-feedback"));
      c._earnedPoints = 0;
    });

    units.clozes.forEach(c => {
      resetCodeCloze(c);
      const act = c.nextElementSibling || c.closest(".quarto-exercise-code-cloze-wrapper")?.querySelector(".quarto-exercise-actions");
      const stat = act ? $(act, ".quarto-exercise-status") : null;
      if (stat) {
        stat.textContent = "";
        stat.classList.remove("is-correct", "is-incorrect");
      }
      c._earnedPoints = 0;
    });

    status.textContent = "";
    status.classList.remove("is-correct", "is-incorrect");
  });
}

function initCheckControllers() {
  const mode = window.quartoExercisesCheckMode || "exercise";
  if (mode === "batch") {
    $$(document, ".check-batch").forEach(batch => {
      initController("batch", batch);
    });
  } else if (mode === "page") {
    const content = document.querySelector("main#quarto-document-content, main.content, main") || document.body;
    const units = findCheckableUnits(content);
    if (units.exercises.length > 0 || units.blanks.length > 0 || units.chooses.length > 0 || units.clozes.length > 0) {
      initController("page", content);
    }
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

  const answersArr = Array.isArray(answersStr) ? answersStr : splitList(answersStr || "");

  if (matchMode === "regex") {
    const pattern = answersArr[0] || "";
    try {
      return new RegExp(normalize(pattern), ignoreCase ? "i" : "").test(normalize(value));
    } catch (error) {
      console.warn("Invalid regex in blank:", pattern, error);
      return false;
    }
  }

  const answers = answersArr.map(answer => compare(normalize(answer)));
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
  input.style.width = `${Math.min(Math.max(measurer.getBoundingClientRect().width + 4, 8), 380)}px`;
  measurer.remove();
}

function adjustCodeBlankWidthToText(input) {
  if (!input) return;
  if (!input.value) {
    input.style.width = "";
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
  input.style.width = `${Math.min(Math.max(measurer.getBoundingClientRect().width + 1, 0), 380)}px`;
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

  if (container.dataset.sigs) {
    try {
      container._signatures = JSON.parse(container.dataset.sigs);
    } catch(e){}
    container.removeAttribute("data-sigs");
  }
  if (container.dataset.pba) {
    container._payload = container.dataset.pba;
    container.removeAttribute("data-pba");
  }

  adjustInputWidth(input);
  input.addEventListener("input", () => adjustInputWidth(input));
  input.addEventListener("blur", () => adjustInputWidth(input));
  input.addEventListener("keydown", event => {
    if (event.key === "Enter") {
      event.preventDefault();
      const mode = window.quartoExercisesCheckMode || "exercise";
      if (mode === "exercise") {
        onCheck();
      }
    }
  });
}

async function verifyBlank(container, { showFeedback = false, reveal = false } = {}) {
  const input = $(container, ".quarto-exercise-blank-input");
  const feedback = $(container, ".quarto-exercise-blank-feedback");

  const control = {
    closest: (sel) => container.closest(sel) || (container.matches(sel) ? container : null),
    _controlId: container.dataset.id || container.id || "default-blank",
    _kind: "blank",
    _signatures: container._signatures,
    _regexPayload: container._regexPayload,
    _answers: container.dataset.answers,
    _attrs: {
      match: container.dataset.match || "exact",
      ignoreCase: container.dataset.ignoreCase === "true",
      trim: container.dataset.trim !== "false",
      collapseSpace: container.dataset.collapseSpace === "true"
    }
  };

  const isCorrect = await checkAnswer(control, input.value);

  container.classList.toggle("is-correct", isCorrect);
  input.classList.toggle("is-correct", isCorrect);
  input.classList.toggle("is-incorrect", !isCorrect);

  let correctText = "";
  if (isCorrect) {
    correctText = input.value;
  } else if (reveal) {
    let answersList = [];
    const decrypted = decryptedCache.get(container);
    if (decrypted) {
      const rawAns = decrypted.answers || decrypted.answer || [];
      answersList = Array.isArray(rawAns) ? rawAns : splitList(rawAns);
    } else {
      answersList = splitList(container.dataset.answers || "");
    }
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

  if (container.dataset.sigs) {
    try {
      container._signatures = JSON.parse(container.dataset.sigs);
    } catch(e){}
    container.removeAttribute("data-sigs");
  }

  populateChoose(container);
  adjustSelectWidth(select);

  select.addEventListener("change", () => {
    adjustSelectWidth(select);
    if (instant) onCheck();
  });
  select.addEventListener("keydown", event => {
    if (event.key === "Enter") {
      event.preventDefault();
      const mode = window.quartoExercisesCheckMode || "exercise";
      if (mode === "exercise") {
        onCheck();
      }
    }
  });
}

async function verifyChoose(container, { showFeedback = false, reveal = false } = {}) {
  const select = $(container, ".quarto-exercise-choose-select");
  const feedback = $(container, ".quarto-exercise-choose-feedback");

  const control = {
    closest: (sel) => container.closest(sel) || (container.matches(sel) ? container : null),
    _controlId: container.dataset.id || container.id || "default-choose",
    _kind: "choose",
    _signatures: container._signatures,
    _answer: container.dataset.answer,
    _attrs: {
      ignoreCase: container.dataset.ignoreCase === "true"
    }
  };

  const isCorrect = await checkAnswer(control, select.value);

  container.classList.toggle("is-correct", isCorrect);
  select.classList.toggle("is-correct", isCorrect);
  select.classList.toggle("is-incorrect", !isCorrect);

  let correctText = "";
  if (isCorrect) {
    correctText = select.value;
  } else if (reveal) {
    let expected = "";
    const decrypted = decryptedCache.get(container);
    if (decrypted) {
      expected = decrypted.answer || "";
    } else {
      expected = container.dataset.answer || "";
    }
    correctText = expected;
  }
  setCorrectText(container, ".quarto-exercise-choose-correct-text", correctText);

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
    const stat = actions ? $(actions, ".quarto-exercise-status") : null;
    if (stat) {
      stat.textContent = ok ? "Correct!" : "Incorrect";
      stat.classList.toggle("is-correct", ok);
      stat.classList.toggle("is-incorrect", !ok);
    }
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
    if (!root) return;
    if (root.classList.contains("quarto-exercise")) {
      resetExercise(root, exerciseParts(root));
    } else if (root.classList.contains("quarto-exercise-blank-container")) {
      resetBlank(root);
    } else if (root.classList.contains("quarto-exercise-choose-container")) {
      resetChoose(root);
    } else if (root.classList.contains("quarto-exercise-code-cloze-standalone")) {
      resetCodeCloze(root);
    }
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
      input.addEventListener("keydown", e => {
        if (e.key === "Enter") {
          e.preventDefault();
          const mode = window.quartoExercisesCheckMode || "exercise";
          if (mode === "exercise" && onCheck) onCheck();
        }
      });
      replaceTokenWithElement(code, token, input);
      controls.push({
        type: "blank",
        el: input,
        attrs,
        token,
        signatures: info.signatures,
        regexPayload: info.pba
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
      select.addEventListener("keydown", e => {
        if (e.key === "Enter") {
          e.preventDefault();
          const mode = window.quartoExercisesCheckMode || "exercise";
          if (mode === "exercise" && onCheck) onCheck();
        }
      });
      adjustSelectWidth(select);
      replaceTokenWithElement(code, token, select);
      controls.push({
        type: "choose",
        el: select,
        attrs,
        token,
        signatures: info.signatures
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
    const { type, el, attrs, token, signatures, regexPayload } = ctrl;
    el.classList.remove("is-correct", "is-incorrect");

    const controlObj = {
      closest: (sel) => container.closest(sel) || (container.matches(sel) ? container : null),
      _controlId: token,
      _kind: type,
      _signatures: signatures,
      _regexPayload: regexPayload,
      _answers: attrs.answer || attrs.answers || "",
      _answer: attrs.answer || "",
      _attrs: {
        match: attrs.match || "exact",
        ignoreCase: attrs["ignore-case"] === "true",
        trim: attrs.trim !== "false",
        collapseSpace: attrs["collapse-space"] === "true"
      }
    };

    const ok = await checkAnswer(controlObj, el.value);
    if (ok) {
      correctCount++;
    }

    if (type === "blank") {
      el.classList.toggle("is-correct", ok);
      el.classList.toggle("is-incorrect", !ok);
      if (reveal && !ok) {
        let answersList = [];
        let rawAns = attrs.answer || attrs.answers || "";
        const decrypted = decryptedCache.get(container);
        if (decrypted && decrypted[token]) {
          const spec = decrypted[token].attrs;
          rawAns = spec.answer || spec.answers || "";
        }
        answersList = Array.isArray(rawAns) ? rawAns : splitList(rawAns);
        if (answersList[0]) {
          el.value = answersList[0];
          el.classList.add("is-correct");
          adjustCodeBlankWidthToText(el);
        }
      }
      if (!ok) allCorrect = false;
    } else if (type === "choose") {
      el.classList.toggle("is-correct", ok);
      el.classList.toggle("is-incorrect", !ok && el.value !== "");
      if (ok || reveal) {
        if (el._codeClozeCorrectSpan) continue;
        let answer = attrs.answer || "";
        const decrypted = decryptedCache.get(container);
        if (decrypted && decrypted[token]) {
          const spec = decrypted[token].attrs;
          answer = spec.answer || "";
        }
        const selectedText = ok ? el.value : answer;
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
    const status = actions ? $(actions, ".quarto-exercise-status") : null;
    if (status) {
      status.textContent = ok ? "Correct!" : "Incorrect";
      status.classList.toggle("is-correct", ok);
      status.classList.toggle("is-incorrect", !ok);
    }
  };

  initCodeCloze(container, check);

  if (checkBtn) {
    checkBtn.addEventListener("click", check);
  }
  if (resetBtn) {
    resetBtn.addEventListener("click", () => {
      resetCodeCloze(container);
      const status = actions ? $(actions, ".quarto-exercise-status") : null;
      if (status) {
        status.textContent = "";
        status.classList.remove("is-correct", "is-incorrect");
      }
    });
  }
}
