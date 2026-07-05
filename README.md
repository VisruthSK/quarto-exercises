# quarto-exercises

`quarto-exercises` is a Quarto extension for small interactive practice questions in HTML documents. It turns Pandoc Divs, Spans, and marked code blocks into browser-side exercises.

It is meant for self-practice in static course pages. The rendered HTML contains the answers, so do not use it for exams or graded work.

## Installation

Add the extension to a Quarto project:

```bash
quarto add VisruthSK/quarto-exercises
```

Then enable the filter in a document or project config:

```yaml
filters:
  - quarto-exercises
```

You can override defaults in document metadata:

```yaml
quarto-exercises:
  instant: false
  reveal: true
  lock: false
  reset: true
  shuffle: false
  show-answers: false
```

See [example.qmd](example.qmd) for a complete document.

## Multiple Choice

Write a question as an `.exercise` Div. Each `.answer` Div becomes one choice. Mark the correct answer with `correct=true`.

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

If more than one answer is correct, the extension renders checkboxes instead of radio buttons.

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

::: {.hint}
There are four hobbits in the Fellowship. One of them is Peregrin Took (Pippin), who is not listed here.
:::
:::
```

Use `key` when you want stable answer identifiers in the generated HTML. Without it, the extension assigns `a`, `b`, `c`, and so on.

## Feedback, Hints, and Explanations

An answer can contain one `.feedback` Div. An exercise can contain one `.hint` Div and one `.explanation` Div.

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

The `explanation` option controls when explanations show:

- `correct`: after a correct check
- `after-check`: after any check
- `never`: never in HTML output

## Inline Blanks

Use a `.blank` Span for a text input.

```markdown
The wizard who guides the Fellowship is [`Gandalf`]{.blank answer="Gandalf"}.
```

Multiple accepted answers use a comma-separated `answers` attribute:

```markdown
The Ringbearer is [`Frodo`]{.blank answers="Frodo,Frodo Baggins" ignore-case=true}.
```

Regex matching uses `match="regex"` with `answer`:

```markdown
The full title of the first volume of Lord of the Rings is [`The Fellowship of the Ring`]{.blank answer="^The\s+Fellowship\s+of\s+the\s+Ring$" match="regex" ignore-case=true}.
```

Blank attributes:

- `answer`: one accepted answer
- `answers`: comma-separated accepted answers
- `match`: `exact`, `one-of`, or `regex`
- `ignore-case`: compare without case sensitivity
- `trim`: trim input before checking, default `true`
- `collapse-space`: collapse repeated whitespace before checking, default `false`
- `feedback-correct` and `feedback-incorrect`: override the feedback text

## Inline Choices

Use a `.choose` Span for a dropdown.

```markdown
The One Ring was forged in [Mordor / Gondor / Rohan]{.choose answer="Mordor"}.
```

The extension parses slash-separated text as options. If an option contains a slash, pass the list explicitly:

```markdown
Is this correct? [`yes/no`]{.choose options="yes/no,maybe,unknown" answer="yes/no"}.
```

An `.exercise` can group blanks and choices under one Check and Reset control:

```markdown
::: {.exercise}
The hobbits are saved at the Prancing Pony by [Aragorn / Boromir / Legolas / Gimli]{.choose answer="Aragorn"}, who is also known as [Strider]{.blank answer="Strider"}.

::: {.hint}
What does Sam call him?
:::
:::
```

Choice attributes:

- `answer`: the correct option
- `options`: comma-separated options
- `ignore-case`: compare without case sensitivity
- `shuffle`: shuffle the option order
- `feedback-correct` and `feedback-incorrect`: override the feedback text

## Code Cloze

Use a `.code-cloze` code block when blanks or dropdowns should appear inside highlighted code. Put cloze controls between `{{` and `}}`.

````markdown
```{.code-cloze lang="r"}
x <- {{choose answer="c" options="c,list,data.frame"}}(1, 2, 3, 4, 5)
total <- {{blank answer="sum"}}(x)
cat("Total:", total, "\n")
```
````

The `lang` attribute becomes the syntax-highlighting language.

Wrap the code block in an `.exercise` if it should share controls with the rest of the exercise:

````markdown
::: {.exercise}
```{.code-cloze lang="python"}
numbers = [1, 2, 3, 4, 5]
total = {{choose answer="sum" options="sum,max,min,len"}}(numbers)
print({{blank answer="total"}})
```
:::
````

Standalone `.code-cloze` blocks get their own Check and Reset buttons.

## Options

Global options go under `quarto-exercises` in metadata. Most exercise options can also be set as attributes on a single `.exercise` Div.

These are the defaults used by the extension:

```yaml
quarto-exercises:
  instant: false
  reveal: false
  lock: false
  reset: true
  shuffle: false
  reshuffle-on-reset: false
  show-answers: false
  explanation: correct
  feedback-correct: "Correct!"
  feedback-incorrect: "Not quite."
  ignore-case: false
```

Per-exercise overrides:

```markdown
::: {.exercise shuffle=true instant=true lock=true explanation="after-check"}
Question content here...
:::
```

Exercise attributes:

- `shuffle`: randomize answer choices
- `reshuffle-on-reset`: shuffle again after Reset
- `instant`: check after each change instead of showing a Check button
- `reveal`: reveal correct answers after checking
- `lock`: disable controls after a correct answer
- `reset`: show the Reset button
- `explanation`: `correct`, `after-check`, or `never`
- `feedback-correct` and `feedback-incorrect`: status text for the whole exercise

## Non-HTML Output

For formats such as PDF, DOCX, Typst, and Markdown, the filter removes the interactive controls:

- multiple-choice exercises become lettered lists
- blanks, choices, and code cloze controls become underlines
- `show-answers: true` prints answer keys and explanations

Example answer key:

```markdown
Answer: A, C
```

## Styling

The extension ships its own CSS and supports Quarto light and dark modes. These are the default light-mode CSS variables defined by the extension:

```css
.quarto-exercise {
  --ex-accent: #1a73e8;
  --ex-accent-dark: #4285f4;
  --ex-correct: #137333;
  --ex-incorrect: #c5221f;
  --ex-incorrect-border: #ea4335;
  --ex-muted: #555;
  --ex-muted-dark: #aaa;
  --ex-border-color: #ccc;
  --ex-border-strong: #ced4da;
  --ex-bg: transparent;
  --ex-control-bg: #f8f9fa;
  --ex-control-hover-bg: #e9ecef;
  --ex-control-primary-bg: #e9ecef;
  --ex-control-primary-hover-bg: #dee2e6;
  --ex-border-radius: 4px;
  --ex-focus-ring: 0 0 0 2px rgba(26, 115, 232, 0.3);
  --ex-panel-border: #6c757d;
  --ex-panel-border-dark: #adb5bd;
}
```

## Tests

Run the test suite with:

```bash
pnpm test
```

The test runner uses Node's built-in test module, Quarto render checks, and Playwright browser checks. Install Quarto, project dependencies, and the Playwright Chromium browser before running it.

## Limitations

- The correct answers and feedback are stored in the HTML source.
- Inline blanks or choices inside `.answer` blocks are not supported.
- Regex blanks match after input normalization. By default, leading and trailing whitespace are trimmed before the regex runs; if `collapse-space=true`, repeated whitespace is also collapsed to one space.
- Long text inputs are capped at `380px` and scroll horizontally.
- Put this filter before filters that rewrite the same Divs, Spans, or code blocks.
