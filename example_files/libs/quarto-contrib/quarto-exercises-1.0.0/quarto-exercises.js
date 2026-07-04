// quarto-exercises.js
// JavaScript runtime for the quarto-exercises Quarto extension

document.addEventListener("DOMContentLoaded", () => {
  initExercises();
});

// Re-initialize if content is dynamically loaded or updated
if (window.Quarto) {
  window.Quarto.onRender(() => {
    initExercises();
  });
}

function initExercises() {
  const exercises = document.querySelectorAll(".quarto-exercise");
  exercises.forEach(initExercise);

  // Initialize standalone elements
  const standaloneBlanks = document.querySelectorAll(".quarto-exercise-blank-container");
  standaloneBlanks.forEach(blank => {
    if (!blank.closest(".quarto-exercise")) {
      initStandaloneBlank(blank);
    }
  });

  const standaloneChooses = document.querySelectorAll(".quarto-exercise-choose-container");
  standaloneChooses.forEach(choose => {
    if (!choose.closest(".quarto-exercise")) {
      initStandaloneChoose(choose);
    }
  });
}

// Utility to shuffle an array
function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

// Helper to check text matches based on attributes
function checkBlankMatch(val, answersStr, matchMode, ignoreCase, trimMode, collapseSpace) {
  let userVal = val || "";
  if (trimMode) {
    userVal = userVal.trim();
  }
  if (collapseSpace) {
    userVal = userVal.replace(/\s+/g, " ");
  }

  const answers = answersStr.split(",").map(a => {
    let target = a;
    if (trimMode) target = target.trim();
    if (collapseSpace) target = target.replace(/\s+/g, " ");
    return target;
  });

  if (matchMode === "regex") {
    const flags = ignoreCase ? "i" : "";
    try {
      const regex = new RegExp(answers[0], flags);
      return regex.test(userVal);
    } catch (e) {
      console.warn("Invalid regex in blank: ", answers[0], e);
      return false;
    }
  } else {
    return answers.some(ans => {
      if (ignoreCase) {
        return ans.toLowerCase() === userVal.toLowerCase();
      }
      return ans === userVal;
    });
  }
}

// Expand text input dynamically
function adjustInputWidth(input) {
  const tempSpan = document.createElement("span");
  tempSpan.style.visibility = "hidden";
  tempSpan.style.position = "absolute";
  tempSpan.style.whiteSpace = "pre";
  tempSpan.style.font = window.getComputedStyle(input).font;
  tempSpan.textContent = input.value || input.placeholder || "";
  document.body.appendChild(tempSpan);
  
  const width = tempSpan.getBoundingClientRect().width;
  document.body.removeChild(tempSpan);
  
  input.style.width = Math.min(Math.max(width + 16, 50), 380) + "px";
}

// ----------------------------------------------------
// Standalone Blanks
// ----------------------------------------------------
function initStandaloneBlank(container) {
  const input = container.querySelector(".quarto-exercise-blank-input");
  const feedback = container.querySelector(".quarto-exercise-blank-feedback");

  if (!input || input.dataset.initialized) return;
  input.dataset.initialized = "true";

  adjustInputWidth(input);
  input.addEventListener("input", () => adjustInputWidth(input));

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      checkStandaloneBlank(container, input, feedback);
    }
  });
}

function checkStandaloneBlank(container, input, feedback) {
  const answers = container.dataset.answers || "";
  const matchMode = container.dataset.match || "exact";
  const ignoreCase = container.dataset.ignoreCase === "true";
  const trimMode = container.dataset.trim !== "false";
  const collapseSpace = container.dataset.collapseSpace === "true";
  const fbCorrect = container.dataset.feedbackCorrect !== undefined ? container.dataset.feedbackCorrect : "";
  const fbIncorrect = container.dataset.feedbackIncorrect !== undefined ? container.dataset.feedbackIncorrect : "";

  const isCorrect = checkBlankMatch(input.value, answers, matchMode, ignoreCase, trimMode, collapseSpace);

  input.classList.remove("is-correct", "is-incorrect");
  feedback.classList.remove("is-correct", "is-incorrect");

  if (isCorrect) {
    container.classList.add("is-correct");
    const correctSpan = container.querySelector(".quarto-exercise-blank-correct-text");
    if (correctSpan) {
      correctSpan.textContent = input.value;
    }
    input.classList.add("is-correct");
    feedback.classList.add("is-correct");
    feedback.textContent = fbCorrect;
    if (fbCorrect === "") {
      feedback.style.display = "none";
    } else {
      feedback.style.display = "block";
    }
  } else {
    container.classList.remove("is-correct");
    input.classList.add("is-incorrect");
    feedback.classList.add("is-incorrect");
    feedback.textContent = fbIncorrect;
    if (fbIncorrect === "") {
      feedback.style.display = "none";
    } else {
      feedback.style.display = "block";
    }
  }
}

// ----------------------------------------------------
// Standalone Choose
// ----------------------------------------------------
function initStandaloneChoose(container) {
  const select = container.querySelector(".quarto-exercise-choose-select");
  const checkBtn = container.querySelector(".quarto-exercise-choose-check-btn");
  const feedback = container.querySelector(".quarto-exercise-choose-feedback");

  if (!select || select.dataset.initialized) return;
  select.dataset.initialized = "true";

  const optionsAttr = container.dataset.options || "";
  const rawOptions = optionsAttr.split(",").filter(o => o.trim() !== "");
  const shuffleOpts = container.dataset.shuffle === "true";
  
  let options = [...rawOptions];
  if (shuffleOpts) {
    shuffleArray(options);
  }

  select.innerHTML = '<option value="">Choose...</option>';
  options.forEach(opt => {
    const el = document.createElement("option");
    el.value = opt;
    el.textContent = opt;
    select.appendChild(el);
  });

  const checkAction = () => checkStandaloneChoose(container, select, feedback);

  if (checkBtn) {
    checkBtn.addEventListener("click", checkAction);
  }

  select.addEventListener("change", () => {
    if (!checkBtn || container.dataset.instant === "true") {
      checkAction();
    }
  });

  select.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      checkAction();
    }
  });
}

function checkStandaloneChoose(container, select, feedback) {
  const answer = container.dataset.answer || "";
  const ignoreCase = container.dataset.ignoreCase === "true";
  const fbCorrect = container.dataset.feedbackCorrect !== undefined ? container.dataset.feedbackCorrect : "";
  const fbIncorrect = container.dataset.feedbackIncorrect !== undefined ? container.dataset.feedbackIncorrect : "";

  const userVal = select.value;
  if (!userVal) {
    feedback.style.display = "none";
    select.classList.remove("is-correct", "is-incorrect");
    return;
  }

  const isCorrect = ignoreCase 
    ? userVal.toLowerCase() === answer.toLowerCase()
    : userVal === answer;

  select.classList.remove("is-correct", "is-incorrect");
  feedback.classList.remove("is-correct", "is-incorrect");

  if (isCorrect) {
    container.classList.add("is-correct");
    const correctSpan = container.querySelector(".quarto-exercise-choose-correct-text");
    if (correctSpan) {
      correctSpan.textContent = select.value;
    }
    select.classList.add("is-correct");
    feedback.classList.add("is-correct");
    feedback.textContent = fbCorrect;
    if (fbCorrect === "") {
      feedback.style.display = "none";
    } else {
      feedback.style.display = "block";
    }
  } else {
    container.classList.remove("is-correct");
    select.classList.add("is-incorrect");
    feedback.classList.add("is-incorrect");
    feedback.textContent = fbIncorrect;
    if (fbIncorrect === "") {
      feedback.style.display = "none";
    } else {
      feedback.style.display = "block";
    }
  }
}

// ----------------------------------------------------
// Block Exercises
// ----------------------------------------------------
function initExercise(ex) {
  if (ex.dataset.initialized) return;
  ex.dataset.initialized = "true";

  const choicesContainer = ex.querySelector(".quarto-exercise-choices");
  const answers = Array.from(ex.querySelectorAll(".quarto-exercise-answer"));
  const checkBtn = ex.querySelector(".quarto-exercise-check-btn");
  const resetBtn = ex.querySelector(".quarto-exercise-reset-btn");
  const explanation = ex.querySelector(".quarto-exercise-explanation");
  const hintBtn = ex.querySelector(".quarto-exercise-hint-btn");
  const hintPanel = ex.querySelector(".quarto-exercise-hint");

  const instant = ex.dataset.instant === "true";
  const reveal = ex.dataset.reveal === "true";
  const lock = ex.dataset.lock === "true";
  const explanationPolicy = ex.dataset.explanationPolicy || "correct";

  const alphabet = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O", "P", "Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z"];

  const updateLabels = () => {
    const currentAnswers = ex.querySelectorAll(".quarto-exercise-answer");
    currentAnswers.forEach((ans, index) => {
      const lblSpan = ans.querySelector(".quarto-exercise-answer-label");
      if (lblSpan) {
        const letter = alphabet[index % 26] + (index >= 26 ? Math.floor(index / 26) : "");
        lblSpan.textContent = letter + ". ";
      }
    });
  };

  const shuffleAnswers = () => {
    if (!choicesContainer || answers.length === 0) return;
    const shuffled = [...answers];
    shuffleArray(shuffled);
    shuffled.forEach(item => choicesContainer.appendChild(item));
    updateLabels();
  };

  if (ex.dataset.shuffle === "true") {
    shuffleAnswers();
  } else {
    updateLabels();
  }

  answers.forEach(ans => {
    const input = ans.querySelector(".quarto-exercise-input");

    ans.addEventListener("click", (e) => {
      if (ex.classList.contains("is-locked")) return;
      if (e.target !== input) {
        e.preventDefault();
        if (input.type === "radio") {
          input.checked = true;
        } else {
          input.checked = !input.checked;
        }
        input.dispatchEvent(new Event("change"));
      }
    });

    input.addEventListener("change", () => {
      if (input.type === "radio") {
        answers.forEach(a => {
          const inp = a.querySelector(".quarto-exercise-input");
          a.classList.toggle("is-selected", inp.checked);
        });
      } else {
        ans.classList.toggle("is-selected", input.checked);
      }

      if (instant) {
        verifyExercise();
      }
    });
  });

  const nestedBlanks = ex.querySelectorAll(".quarto-exercise-blank-container");
  nestedBlanks.forEach(blank => {
    const input = blank.querySelector(".quarto-exercise-blank-input");
    adjustInputWidth(input);
    input.addEventListener("input", () => adjustInputWidth(input));
    
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        verifyExercise();
      }
    });
  });

  const nestedChooses = ex.querySelectorAll(".quarto-exercise-choose-container");
  nestedChooses.forEach(choose => {
    const select = choose.querySelector(".quarto-exercise-choose-select");
    
    const optionsAttr = choose.dataset.options || "";
    const rawOptions = optionsAttr.split(",").filter(o => o.trim() !== "");
    const shuffleOpts = choose.dataset.shuffle === "true";
    let options = [...rawOptions];
    
    if (shuffleOpts) {
      shuffleArray(options);
    }

    select.innerHTML = '<option value="">Choose...</option>';
    options.forEach(opt => {
      const el = document.createElement("option");
      el.value = opt;
      el.textContent = opt;
      select.appendChild(el);
    });

    select.addEventListener("change", () => {
      if (instant) {
        verifyExercise();
      }
    });
  });

  const verifyExercise = () => {
    const statusEl = ex.querySelector(".quarto-exercise-status");
    let allCorrect = true;

    if (answers.length > 0) {
      const isRadio = ex.dataset.type === "radio";
      
      if (isRadio) {
        let selectedAnswer = null;
        answers.forEach(ans => {
          const input = ans.querySelector(".quarto-exercise-input");
          const feedback = ans.querySelector(".quarto-exercise-feedback");
          
          ans.classList.remove("is-correct", "is-incorrect");
          if (feedback) feedback.style.display = "none";
          
          if (input.checked) {
            selectedAnswer = ans;
          }
        });

        if (selectedAnswer) {
          const isCorrect = selectedAnswer.dataset.correct === "true";
          const feedback = selectedAnswer.querySelector(".quarto-exercise-feedback");

          if (isCorrect) {
            selectedAnswer.classList.add("is-correct");
          } else {
            selectedAnswer.classList.add("is-incorrect");
            allCorrect = false;
          }
          if (feedback) feedback.style.display = "block";

          if (reveal) {
            answers.forEach(ans => {
              if (ans !== selectedAnswer) {
                const isAnsCorrect = ans.dataset.correct === "true";
                if (isAnsCorrect) {
                  ans.classList.add("is-correct");
                }
              }
            });
          }
        } else {
          allCorrect = false;
        }
      } else {
        let selectedAllCorrect = true;

        answers.forEach(ans => {
          const input = ans.querySelector(".quarto-exercise-input");
          const feedback = ans.querySelector(".quarto-exercise-feedback");
          const isCorrect = ans.dataset.correct === "true";

          ans.classList.remove("is-correct", "is-incorrect");
          if (feedback) feedback.style.display = "none";

          if (input.checked) {
            if (!isCorrect) {
              selectedAllCorrect = false;
            }
          } else {
            if (isCorrect) {
              selectedAllCorrect = false;
            }
          }
        });

        if (!selectedAllCorrect) {
          allCorrect = false;
        } else {
          answers.forEach(ans => {
            const input = ans.querySelector(".quarto-exercise-input");
            const feedback = ans.querySelector(".quarto-exercise-feedback");
            const isCorrect = ans.dataset.correct === "true";
            if (input.checked && isCorrect) {
              ans.classList.add("is-correct");
              if (feedback) feedback.style.display = "block";
            }
          });
        }
      }
    }

    nestedBlanks.forEach(blank => {
      const input = blank.querySelector(".quarto-exercise-blank-input");
      const feedback = blank.querySelector(".quarto-exercise-blank-feedback");
      
      const answersStr = blank.dataset.answers || "";
      const matchMode = blank.dataset.match || "exact";
      const ignoreCase = blank.dataset.ignoreCase === "true";
      const trimMode = blank.dataset.trim !== "false";
      const collapseSpace = blank.dataset.collapseSpace === "true";
      const fbCorrect = blank.dataset.feedbackCorrect || "Correct!";
      const fbIncorrect = blank.dataset.feedbackIncorrect || "Not quite.";

      const isBlankCorrect = checkBlankMatch(input.value, answersStr, matchMode, ignoreCase, trimMode, collapseSpace);

      input.classList.remove("is-correct", "is-incorrect");

      if (isBlankCorrect) {
        blank.classList.add("is-correct");
        const correctSpan = blank.querySelector(".quarto-exercise-blank-correct-text");
        if (correctSpan) {
          correctSpan.textContent = input.value;
        }
        input.classList.add("is-correct");
      } else {
        blank.classList.remove("is-correct");
        input.classList.add("is-incorrect");
        allCorrect = false;
      }
      feedback.style.display = "none";
    });

    nestedChooses.forEach(choose => {
      const select = choose.querySelector(".quarto-exercise-choose-select");
      const feedback = choose.querySelector(".quarto-exercise-choose-feedback");

      const answer = choose.dataset.answer || "";
      const ignoreCase = choose.dataset.ignoreCase === "true";
      const fbCorrect = choose.dataset.feedbackCorrect || "Correct!";
      const fbIncorrect = choose.dataset.feedbackIncorrect || "Not quite.";

      const userVal = select.value;
      
      select.classList.remove("is-correct", "is-incorrect");

      if (!userVal) {
        choose.classList.remove("is-correct");
        select.classList.add("is-incorrect");
        feedback.style.display = "none";
        allCorrect = false;
        return;
      }

      const isChooseCorrect = ignoreCase 
        ? userVal.toLowerCase() === answer.toLowerCase()
        : userVal === answer;

      if (isChooseCorrect) {
        choose.classList.add("is-correct");
        const correctSpan = choose.querySelector(".quarto-exercise-choose-correct-text");
        if (correctSpan) {
          correctSpan.textContent = select.value;
        }
        select.classList.add("is-correct");
      } else {
        choose.classList.remove("is-correct");
        select.classList.add("is-incorrect");
        allCorrect = false;
      }
      feedback.style.display = "none";
    });

    if (lock && allCorrect) {
      ex.classList.add("is-locked");
      if (checkBtn) checkBtn.disabled = true;
      if (resetBtn) resetBtn.disabled = true;
      answers.forEach(ans => {
        ans.querySelector(".quarto-exercise-input").disabled = true;
      });
      nestedBlanks.forEach(blank => {
        blank.querySelector(".quarto-exercise-blank-input").disabled = true;
      });
      nestedChooses.forEach(choose => {
        choose.querySelector(".quarto-exercise-choose-select").disabled = true;
      });
    }

    if (explanation) {
      if (explanationPolicy === "always") {
        explanation.style.display = "block";
      } else if (explanationPolicy === "correct") {
        if (allCorrect) {
          explanation.style.display = "block";
        } else {
          explanation.style.display = "none";
        }
      } else {
        explanation.style.display = "none";
      }
    }

    if (statusEl) {
      statusEl.classList.remove("is-correct", "is-incorrect");
      const fbCorrect = ex.dataset.feedbackCorrect !== undefined ? ex.dataset.feedbackCorrect : "Correct!";
      const fbIncorrect = ex.dataset.feedbackIncorrect !== undefined ? ex.dataset.feedbackIncorrect : "Not quite.";
      if (allCorrect) {
        statusEl.textContent = fbCorrect;
        statusEl.classList.add("is-correct");
      } else {
        statusEl.textContent = fbIncorrect;
        statusEl.classList.add("is-incorrect");
      }
    }
  };

  if (hintBtn && hintPanel) {
    hintBtn.addEventListener("click", () => {
      const isHidden = hintPanel.style.display === "none";
      hintPanel.style.display = isHidden ? "block" : "none";
    });
  }

  if (checkBtn) {
    checkBtn.addEventListener("click", verifyExercise);
  }

  if (resetBtn) {
    resetBtn.addEventListener("click", () => {
      ex.classList.remove("is-locked");
      if (checkBtn) checkBtn.disabled = false;
      if (resetBtn) resetBtn.disabled = false;

      answers.forEach(ans => {
        const input = ans.querySelector(".quarto-exercise-input");
        const feedback = ans.querySelector(".quarto-exercise-feedback");
        input.disabled = false;
        input.checked = false;
        ans.classList.remove("is-selected", "is-correct", "is-incorrect");
        if (feedback) feedback.style.display = "none";
      });

      nestedBlanks.forEach(blank => {
        const input = blank.querySelector(".quarto-exercise-blank-input");
        const feedback = blank.querySelector(".quarto-exercise-blank-feedback");
        const correctSpan = blank.querySelector(".quarto-exercise-blank-correct-text");
        blank.classList.remove("is-correct");
        if (correctSpan) correctSpan.textContent = "";
        input.disabled = false;
        input.value = "";
        input.classList.remove("is-correct", "is-incorrect");
        feedback.textContent = "";
        feedback.style.display = "none";
        adjustInputWidth(input);
      });

      nestedChooses.forEach(choose => {
        const select = choose.querySelector(".quarto-exercise-choose-select");
        const feedback = choose.querySelector(".quarto-exercise-choose-feedback");
        const correctSpan = choose.querySelector(".quarto-exercise-choose-correct-text");
        choose.classList.remove("is-correct");
        if (correctSpan) correctSpan.textContent = "";
        select.disabled = false;
        select.value = "";
        select.classList.remove("is-correct", "is-incorrect");
        feedback.textContent = "";
        feedback.style.display = "none";
      });

      if (explanation) {
        explanation.style.display = "none";
      }

      if (hintPanel) {
        hintPanel.style.display = "none";
      }

      const statusEl = ex.querySelector(".quarto-exercise-status");
      if (statusEl) {
        statusEl.textContent = "";
        statusEl.classList.remove("is-correct", "is-incorrect");
      }

      if (ex.dataset.reshuffleOnReset === "true") {
        shuffleAnswers();
      }
    });
  }
}
