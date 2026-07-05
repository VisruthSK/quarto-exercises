# `quarto-exercises`

`quarto-exercises` is a Quarto extension that converts Pandoc-native Divs and Spans into interactive HTML exercises. 

Designed for formative practice in static teaching materials, it works offline in the browser with no databases, servers, R/Python packages, Node/npm configuration, or CDNs.

> [!WARNING]
> **Security Note:** The rendered HTML page source embeds all correct answers and feedback. Use this extension for self-practice, not high-stakes grading.

---

## Features

- **Multiple-Choice & Multiple-Answer Questions** (using radio inputs or checkboxes)
- **Inline Fill-in-the-Blanks** with inputs that expand as you type
- **Inline Dropdown Cloze Questions**
- **Action Controls:** Instant or button-based checking, answer revealing, locking upon completion, and option shuffling.
- **Accessible & Responsive:** Keyboard-navigable, screen-reader friendly (using fieldsets and aria-live announcements), and styled using CSS variables.
- **Static Fallbacks:** Static fallbacks (with optional answer keys) for PDF, DOCX, and Typst.

---

## Installation

Add the extension to your Quarto project:

```bash
quarto add VisruthSK/quarto-exercises
```

Add it to your document or project `_quarto.yml` configuration:

```yaml
filters:
  - quarto-exercises
```

---

## Authoring Examples

### 1. Minimal Single-Choice

```markdown
::: {.exercise}
Who carried the One Ring out of the Shire?

::: {.answer correct=true}
Frodo Baggins
:::

::: {.answer}
Boromir
:::
:::
```

### 2. Multiple-Correct with Custom Keys & Shuffling

Marking multiple answers correct turns the radio options into checkboxes.

```markdown
::: {.exercise shuffle=true}
Which members of the Fellowship are hobbits? Select all that apply.

::: {.answer correct=true key="frodo"}
Frodo Baggins
:::

::: {.answer correct=true key="sam"}
Samwise Gamgee
:::

::: {.answer key="legolas"}
Legolas Greenleaf
:::

::: {.answer correct=true key="merry"}
Meriadoc Brandybuck
:::
:::
```

### 3. Per-Answer Feedback & Question Explanation

```markdown
::: {.exercise}
What is the name of the wizard who guides the Fellowship?

::: {.answer correct=true}
Gandalf

::: {.feedback}
Correct! Specifically Gandalf the Grey, who later becomes Gandalf the White.
:::
:::

::: {.answer}
Saruman

::: {.feedback}
Not quite. Saruman resides in Isengard and betrays the Fellowship.
:::
:::

::: {.explanation}
Gandalf is one of the Istari (wizards) sent to Middle-earth to oppose Sauron.
:::
:::
```

### 4. Code Blocks in Choices

```markdown
::: {.exercise}
What does the following Python statement print?

```python
print([x * 2 for x in range(3)])
```

::: {.answer}
`[1, 2, 3]`
:::

::: {.answer correct=true}
`[0, 2, 4]`

::: {.feedback}
Correct! `range(3)` produces `0, 1, 2`, and multiplying each by 2 yields `0, 2, 4`.
:::
:::
:::
```

### 5. Fill-in-the-Blank

Inputs automatically expand horizontally as the user types.

```markdown
The wizard who guides the Fellowship is [`Gandalf`]{.blank answer="Gandalf"}.
```

- **Multiple Accepted Answers:**
  ```markdown
  The Ringbearer is [`Frodo`]{.blank answers="Frodo,Frodo Baggins" ignore-case=true}.
  ```

- **Regex Matching:**
  ```markdown
  The title is [`The Fellowship of the Ring`]{.blank answer="^The\s+Fellowship\s+of\s+the\s+Ring$" match="regex" ignore-case=true}.
  ```

### 6. Inline Choice / Dropdown Cloze

```markdown
The One Ring was forged in [Mordor / Gondor / Rohan]{.choose answer="Mordor"}.
```

Use custom options lists to bypass text parsing (especially if your choices contain slashes):

```markdown
Is this correct? [`yes/no`]{.choose options="yes/no,maybe,unknown" answer="yes/no"}.
```

To bundle multiple dropdowns/blanks under a single parent submit layout:

```markdown
::: {.exercise}
The Fellowship leaves [Rivendell / Minas Tirith / Edoras]{.choose answer="Rivendell"} and travels toward [Mordor / Valinor / Dale]{.choose answer="Mordor"}.
:::
```

---

## Global and Per-Question Options

Configure options globally in the document frontmatter or override them per-question using attributes:

```yaml
quarto-exercises:
  instant: false               # Check immediately on changes (default: false)
  reveal: false                # Reveal correct answers after checking (default: false)
  lock: false                  # Prevent changes after checking correct (default: false)
  reset: true                  # Show the reset button (default: true)
  shuffle: false               # Randomize choice orders globally (default: false)
  reshuffle-on-reset: false    # Reshuffle choices on reset (default: false)
  show-answers: false          # Show answers in static non-HTML fallbacks (default: false)
  explanation: correct         # Show explanation: 'correct' | 'after-check' | 'never' (default: 'correct')
  feedback-correct: "Correct!" # Default success text
  feedback-incorrect: "Not quite." # Default failure text
```

Override attributes per-question:

```markdown
::: {.exercise shuffle=true instant=true lock=true}
Question content here...
:::
```

---

## Non-HTML Fallback Behavior

For static formats like PDF, DOCX, and Typst, multiple-choice exercises render as lists, and inline blanks or cloze dropdowns render as underlines (`________`).

Setting `show-answers: true` in the metadata appends answer keys and explanations to static outputs:

```markdown
Answer: A, C
```

---

## Styling Customization

Customize the layout and design (which supports light and dark modes) by overriding these CSS variables:

```css
.quarto-exercise {
  --ex-accent: #1a73e8;
  --ex-correct: #137333;
  --ex-incorrect: #c5221f;
  --ex-muted: #555;
  --ex-border-color: #ccc;
  --ex-bg: transparent;
  --ex-control-bg: #f8f9fa;
  --ex-control-hover-bg: #e9ecef;
  --ex-border-radius: 4px;
  --ex-focus-ring: 0 0 0 2px rgba(26, 115, 232, 0.3);
}
```

---

## Running the Automated Tests

To run the full suite of automated unit, rendering, validation, and fallback tests, run:

```bash
pnpm test
```

Alternatively, you can run the test script directly:

```bash
node tests/run.js
```

The test runner uses Node.js's built-in testing modules. Browser visual smoke tests for light and dark mode run through Playwright and write screenshots to `tests/.tmp/visual/`.

---

## Known Limitations

### 1. Security & Client-Side Verification
To run offline without databases or servers, the extension stores all correct answers and feedback in the HTML source.
- **Limitation:** Users can find correct answers by inspecting the page source or DOM attributes (e.g. `data-correct="true"`, `data-answer="..."`).
- **Context:** Use this extension only for self-practice and active learning, not for graded exams.

### 2. Nested Interactive Content within Answer Choices
- **Limitation:** Do not embed inline blanks or dropdowns inside multiple-choice answer blocks. Doing so causes undefined validation bindings.

### 3. Case Insensitivity and Whitespace Normalization for Regex Blanks
- **Limitation:** The extension applies trim and collapse-space rules to user input before evaluating regex. To match exact spaces, disable these by setting `trim=false` and `collapse-space=false` on the blank span.

### 4. Layout Constraints of Expandable Inputs
- **Limitation:** Inputs have a maximum width of `25rem` (`380px`) to prevent layout breakages. Long answers scroll horizontally.

### 5. Multi-Pass Filter Ordering
- **Limitation:** The Lua filter requires metadata to load first. Place this extension in the filters queue before other filters that alter document spans.
