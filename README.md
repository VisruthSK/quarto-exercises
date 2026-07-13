# quarto-exercises

`quarto-exercises` is a Quarto extension for small interactive practice questions in Quarto documents built to HTML. 

See the [example](example.qmd) and [reference](reference.qmd) pages for more details on the problem types and options.

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

Multiple accepted answers use a pipe-separated `answers` attribute:

```markdown
The Ringbearer is [`Frodo`]{.blank answers="Frodo|Frodo Baggins" ignore-case=true}.
```

Use `\\|` for a literal pipe inside one answer in Quarto Markdown source:

```markdown
Answer yes or no: [`yes|no`]{.blank answers="yes\\|no|maybe" match="one-of"}.
```

Regex matching uses `match="regex"` with `answer`:

```markdown
The full title of the first volume of Lord of the Rings is [`The Fellowship of the Ring`]{.blank answer="^The\s+Fellowship\s+of\s+the\s+Ring$" match="regex" ignore-case=true}.
```

Blank attributes:

- `answer`: one accepted answer
- `answers`: pipe-separated accepted answers
- `match`: `exact`, `one-of`, or `regex`
- `ignore-case`: compare without case sensitivity
- `trim`: trim input before checking, default `true`
- `collapse-space`: collapse repeated whitespace before checking, default `false`
- `feedback-correct` and `feedback-incorrect`: override the feedback text

## Inline Choices

Use a `.choose` Span for a dropdown.

```markdown
The One Ring was forged in [Mordor|Gondor|Rohan]{.choose answer="Mordor"}.
```

The extension parses pipe-separated text as options. Spaces around `|` are part of the option value, so write compact lists unless the spaces are intentional. Use `\\|` for a literal pipe inside one option in Quarto Markdown source.

```markdown
Is this correct? [`yes/no`]{.choose options="yes/no|maybe|unknown" answer="yes/no"}.
```

An `.exercise` can group blanks and choices under one Check and Reset control:

```markdown
::: {.exercise}
The hobbits are saved at the Prancing Pony by [Aragorn|Boromir|Legolas|Gimli]{.choose answer="Aragorn"}, who is also known as [Strider]{.blank answer="Strider"}.

::: {.hint}
What does Sam call him?
:::
:::
```

Choice attributes:

- `answer`: the correct option
- `options`: pipe-separated options
- `ignore-case`: compare without case sensitivity
- `shuffle`: shuffle the option order
- `feedback-correct` and `feedback-incorrect`: override the feedback text

## Code Cloze

Use a `.code-cloze` code block when blanks or dropdowns should appear inside highlighted code. Put cloze controls between `{{` and `}}`.

````markdown
```{.code-cloze lang="r"}
x <- {{choose answer="c" options="c|list|data.frame"}}(1, 2, 3, 4, 5)
total <- {{blank answer="sum"}}(x)
cat("Total:", total, "\n")
```
````

The `lang` attribute becomes the syntax-highlighting language.

Pipe-delimited `answers` and `options` inside code cloze use the same escape rules, but code cloze markers are parsed from raw code text. Write `\|` there for a literal pipe.

````markdown
```{.code-cloze lang="text"}
response = {{choose answer="yes|no" options="yes\|no|maybe"}}
```
````

Wrap the code block in an `.exercise` if it should share controls with the rest of the exercise:

````markdown
::: {.exercise}
```{.code-cloze lang="python"}
numbers = [1, 2, 3, 4, 5]
total = {{choose answer="sum" options="sum|max|min|len"}}(numbers)
print({{blank answer="total"}})
```
:::
````

Standalone `.code-cloze` blocks get their own Check and Reset buttons.

## Authoring Notes

Use `true` or `false` for boolean attributes.

The filter warns during render for unsupported attributes, missing answers, duplicate answer keys, missing correct choices, invalid boolean values, and malformed code cloze markers. Fix those warnings before publishing.

Do not put `.blank`, `.choose`, or `.code-cloze` controls inside `.answer` blocks. Put them in the exercise stem or in a standalone paragraph instead.

Pipe-delimited fields use backslash escapes. In normal Quarto Markdown source, write `\\|` for a literal pipe and `\\\\` for a literal backslash because Pandoc consumes one backslash before this filter receives the value. Inside `.code-cloze` blocks, write `\|` for a literal pipe and `\\` for a literal backslash because code cloze markers are parsed from raw code text.

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
  explanation: correct
  feedback-correct: "Correct!"
  feedback-incorrect: "Not quite."
  ignore-case: false
  obfuscate-answers: true
  question-boxes: false
  check-page: false
  score: false
  points: 1
```

Per-exercise overrides:

```markdown
::: {.exercise shuffle=true instant=true lock=true explanation="after-check"}
Question content here...
:::
```

Exercise attributes:

- `shuffle`: Set true to randomize answer choices
- `reshuffle-on-reset`: Set true to shuffle again after Reset
- `instant`: Set true to check after each change instead of showing a Check button
- `reveal`: Set true to reveal correct answers after checking
- `lock`: Set true to disable controls after a correct answer
- `reset`: Set true to show the Reset button
- `explanation`: `correct`, `after-check`, or `never`
- `feedback-correct` and `feedback-incorrect`: status text for the whole exercise
- `question-boxes`: Set true to add a subtle border and padding around each exercise
- `option-columns`: on an `.exercise`, choose any positive number of answer-choice columns; on a `.check-batch`, choose the number of exercise columns
- `check-page`: Set true to check the entire page at once with a single set of Check Page and Reset Page controls

Correct and incorrect choices are indicated with a check or X as well as color. Put a `.feedback` Div inside an `.answer` to show option-specific feedback after the learner checks that option.

```markdown
::: {.exercise question-boxes="true" option-columns="2"}
Which answer is correct?

::: {.answer correct=true}
The correct answer.

::: {.feedback}
Exactly right.
:::
:::
:::
```

By default, every exercise gets its own Check and Reset controls. If you wrap multiple exercises in a `.check-batch` container, they are checked together as a batch using one set of controls. You do not need to configure any special mode to write batches. Set `check-page: true` to check the entire page at once; each `.exercise` still keeps its own options such as `shuffle` and `reveal`.

```markdown
::: {.check-batch}
::: {.exercise shuffle="true"}
Question one.
:::

::: {.exercise reveal="false"}
Question two.
:::
:::
```

## Non-HTML Output

For formats such as PDF, DOCX, Typst, and Markdown, the filter removes the interactive controls:

- multiple-choice exercises become lettered lists
- blanks, choices, and code cloze controls become underlines

## Styling

The extension ships its own CSS and follows Quarto light and dark modes. These are the default light-mode CSS variables:

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

These are the dark-mode overrides:

```css
body.quarto-dark {
  --ex-accent: #8ab4f8;
  --ex-accent-dark: #aecbfa;
  --ex-correct: #81c995;
  --ex-incorrect: #f28b82;
  --ex-incorrect-border: #f28b82;
  --ex-muted: #aaa;
  --ex-muted-dark: #aaa;
  --ex-border-color: #555;
  --ex-border-strong: #666;
  --ex-bg: transparent;
  --ex-control-bg: #2d2e30;
  --ex-control-hover-bg: #3c4043;
  --ex-control-primary-bg: #3c4043;
  --ex-control-primary-hover-bg: #4f5357;
  --ex-focus-ring: 0 0 0 2px rgba(138, 180, 248, 0.4);
  --ex-panel-border: #9aa0a6;
}
```

## Answer Obfuscation

To prevent students from finding correct answers in the generated static HTML source code (via DOM attributes, hidden tags, or inspect elements), the extension supports **static source obfuscation**.

### Configuration

Add the following options to your metadata:

```yaml
quarto-exercises:
  obfuscate-answers: true # defaults to true
```

When `obfuscate-answers` is enabled, you **must** supply a build-time environment variable containing a secret key:

```bash
export QUARTO_EXERCISES_KEY="your-secret-key"
```

If the key is missing or empty, the build will fail with a compilation error. To generate a secure random hex key:

```bash
openssl rand -hex 32
```

### Security & Limitations

> [!WARNING]
> This feature acts as **static source obfuscation**, not server-side secure grading.
>
> - **Client-side Decryption**: The derived key is shipped inside the HTML to support fully offline grading. A determined student with browser DevTools can inspect the runtime JS state or extract the key to decrypt the answers.
> - **Regex Checks**: Regex patterns are also decrypted in the browser, making them weaker and easier to inspect at runtime than finite-answer checks.

## Limitations

- The correct answers and feedback are stored in the HTML source (obfuscated by default).
- Inline blanks or choices inside `.answer` blocks are not supported.
- Regex blanks match after input normalization. By default, leading and trailing whitespace are trimmed before the regex runs; if `collapse-space=true`, repeated whitespace is also collapsed to one space.
- Long text inputs are capped at `380px` and scroll horizontally.
- Put this filter before filters that rewrite the same Divs, Spans, or code blocks.
