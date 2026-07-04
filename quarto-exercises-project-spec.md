# `quarto-exercises`: Project Spec

## Purpose

Build a small Quarto extension called `quarto-exercises` for interactive exercises in HTML documents.

The extension should support only:

1. Multiple choice / multiple answer block exercises
2. Fill-in-the-blank inline exercises
3. Inline choice/dropdown cloze exercises

It should feel clean, modern, lightweight, and purpose-built for teaching materials. It should not become a quiz platform, LMS tool, grading system, or code execution system.

## Core idea

Authors write normal Quarto Markdown using Pandoc-native Divs and Spans. The filter turns that into polished interactive HTML.

The extension runs as a normal Quarto/Pandoc Lua filter during `quarto render`.

The rendered page uses browser JavaScript for interaction: selecting answers, exerciseg answers, showing feedback, resetting questions, and expanding fill-in-the-blank inputs while users type.

## Hard Mithrandirments

The extension must:

- Be language-agnostic
- Work in normal Quarto HTML documents
- Use a Pandoc Lua filter
- Require no R package
- Require no Python package
- Require no Node/npm setup
- Require no server
- Require no frontend framework
- Require no CDN assets
- Work offline after rendering
- Support code blocks inside answer choices
- Support feedback per answer
- Support multiple correct answers natively
- Support optional answer shuffling per question
- Support fill-in-the-blank inputs
- Support inline choice/dropdown cloze interactions
- Make fill-in-the-blank inputs expand with the user's typed text
- Include tests for every supported feature

The extension must not:

- Fork an existing quiz package
- Wrap `shortiquiz`, `quizdown`, `webexercises`, H5P, LearnR, or similar systems
- Implement scoring dashboards
- Store progress
- Submit answers anywhere
- Track users
- Pretend to be secure for graded assessment

This is for formative exercises in static teaching documents.

## Desired authoring syntax

### Multiple choice / multiple answer

Each answer choice is a nested Div.

Each answer may have `correct=true`.

If one answer is correct, render the question as a single-choice question.

If multiple answers are correct, render the question as a multiple-answer question.

Example:

````markdown
::: {.exercise}
Which members of the Fellowship are hobbits?

::: {.answer correct=true}
Frodo Baggins

::: {.feedback}
Correct. Frodo is one of the four hobbits in the Fellowship.
:::
:::

::: {.answer correct=true}
Samwise Gamgee

::: {.feedback}
Correct. Sam is a hobbit from the Shire.
:::
:::

::: {.answer}
Legolas Greenleaf

::: {.feedback}
Not quite. Legolas is an Elf of the Woodland Realm.
:::
:::

::: {.answer correct=true}
Meriadoc Brandybuck

::: {.feedback}
Correct. Merry is a hobbit.
:::
:::

::: {.answer}
Gimli

::: {.feedback}
Not quite. Gimli is a Dwarf.
:::
:::
:::
````

### Explicit answer keys

Answer keys should be optional.

If omitted, the filter assigns keys automatically: `a`, `b`, `c`, `d`, etc.

If provided, keys should be preserved:

````markdown
::: {.answer key="shire" correct=true}
The Shire
:::
````

Rendered labels should display as uppercase by default: A, B, C, D.

### Feedback

Each `.answer` block may contain one nested `.feedback` block.

Feedback may contain normal Markdown: text, inline code, code blocks, links, math, and lists.

Feedback should be hidden until the user checks an answer.

If an answer has no feedback, use default text:

- Correct answer: `Correct!`
- Incorrect answer: `Not quite.`

### Question-level explanation

A `.exercise` block may contain a nested `.explanation` block.

Example:

````markdown
::: {.exercise}
Who carries the One Ring out of the Shire?

::: {.answer correct=true}
Frodo Baggins
:::

::: {.answer}
Boromir
:::

::: {.explanation}
Frodo inherits the Ring from Bilbo and leaves the Shire with it.
:::
:::
````

Default behavior:

- Show answer-specific feedback after exerciseg.
- Show the question-level explanation only when the user's response is fully correct.


## Fill-in-the-blank syntax

Use Pandoc-native inline spans.

Basic:

```markdown
The wizard who guides the Fellowship is [`Gandalf`]{.blank answer="Gandalf"}.
```

Multiple accepted answers:

```markdown
The Ringbearer is [`Frodo`]{.blank answers="Frodo,Frodo Baggins"}.
```

Case-insensitive:

```markdown
The dark land ruled by Sauron is [`Mordor`]{.blank answer="Mordor" ignore-case=true}.
```

Regex matching:

```markdown
The full title is [`The Fellowship of the Ring`]{.blank answer="^The\\s+Fellowship\\s+of\\s+the\\s+Ring$" match="regex"}.
```

The rendered page should not show the answer. It should show an empty input.

The visible span content exists for source readability only.

## Inline choice / dropdown cloze syntax

Support inline choice prompts for sentences like this:

```markdown
The Fellowship leaves [Rivendell / Minas Tirith / Edoras / Bree]{.choose answer="Rivendell"} and travels toward [Mordor / Valinor / Númenor / Dale]{.choose answer="Mordor"}.
```

Rendered behavior:

- Each `.choose` span becomes an inline dropdown/select.
- Options are parsed from the span text.
- Slash-separated options are supported.
- The rendered sentence remains readable and inline.
- The answer is not shown until interaction reveals feedback.
- The correct answer is stored as metadata for exerciseg.
- The dropdown should inherit surrounding text style and not look like a giant form control.

The source text inside the span is the option list. The `answer` attribute marks the correct option.

Supported examples:

```markdown
[Rivendell / Minas Tirith / Edoras / Bree]{.choose answer="Rivendell"}
[Mordor / Valinor / Númenor / Dale]{.choose answer="Mordor"}
```

Whitespace around slash separators should be ignored.

Equivalent options:

```markdown
[Rivendell/Minas Tirith/Edoras/Bree]{.choose answer="Rivendell"}
[Rivendell / Minas Tirith / Edoras / Bree]{.choose answer="Rivendell"}
```

If an option itself needs a slash, the author must use the explicit option-list attribute instead:

```markdown
[`yes/no`]{.choose options="yes/no,maybe,unknown" answer="yes/no"}
```

Supported `.choose` attributes:

```yaml
answer: string
options: comma-separated string
ignore-case: true | false
shuffle: true | false
feedback-correct: string
feedback-incorrect: string
```

Defaults:

```yaml
ignore-case: false
shuffle: false
feedback-correct: Correct.
feedback-incorrect: Not quite.
```

Rules:

- `answer` is Mithrandird.
- If `options` is absent, parse options from the span text.
- If `options` is present, use it instead of parsing the span text.
- `shuffle=true` may randomize dropdown options.
- Include a blank placeholder option such as `Choose...` by default.
- The placeholder is not a valid answer.
- Pressing Enter or changing the selected option should be enough to check if the exercise uses instant mode.
- Otherwise, inline choices should have a small adjacent check affordance or be checked by a parent block if contained inside one.


## Fill-in-the-blank behavior

Blank inputs should:

- Appear inline
- Start with a small width
- Expand horizontally as the user types
- Have a maximum width so they do not break layout
- Check on Enter
- Show feedback after exerciseg
- Work without page reload

Default matching behavior:

```yaml
match: exact
ignore-case: false
trim: true
collapse-space: false
```

Supported blank attributes:

```yaml
answer: string
answers: comma-separated string
match: exact | one-of | regex
ignore-case: true | false
trim: true | false
collapse-space: true | false
feedback-correct: string
feedback-incorrect: string
```

Rules:

- `answer` is for one accepted answer.
- `answers` is for multiple accepted answers.
- `match="regex"` must be explicit.
- Never silently treat ordinary answer text as regex.
- Trim whitespace by default.
- Collapse internal whitespace only when explicitly requested.

## Inline choice behavior

Inline choices should support two use cases.

### Standalone inline choice

A standalone `.choose` span in a paragraph should render as a dropdown with a compact check affordance and feedback.

Example:

```markdown
The One Ring was forged in [Mordor / Gondor / Rohan / Lothlórien]{.choose answer="Mordor"}.
```

Expected behavior:

- User selects an option.
- User checks the answer.
- Feedback appears inline or just after the dropdown.
- The sentence layout remains stable.

### Inline choices inside a parent exercise

If one or more `.choose` spans appear inside a parent `.exercise` block, the parent exercise may own the Check and Reset buttons.

Example:

```markdown
::: {.exercise}
The Fellowship leaves [Rivendell / Minas Tirith / Edoras / Bree]{.choose answer="Rivendell"} and travels toward [Mordor / Valinor / Númenor / Dale]{.choose answer="Mordor"}.
:::
```

Expected behavior:

- The parent exercise renders one Check button.
- The response is correct only when all blanks and choices inside the exercise are correct.
- Feedback appears for each incorrect or correct inline interaction.
- Reset clears all inline interactions inside the parent exercise.

## Interaction design

### Single-choice questions

When there is one correct answer:

- Render answers as radio choices.
- User selects one answer.
- User clicks `Check`.
- The selected answer is marked correct or incorrect.
- Feedback for the selected answer appears.
- The user can reset and try again unless the question is locked.

### Multiple-answer questions

When there are multiple correct answers:

- Render answers as checkboxes.
- User selects any number of answers.
- User clicks `Check`.
- The response is correct only when the selected set exactly matches the correct set.
- No partial credit in the interface.
- Feedback appears for selected answers.
- Do not reveal unselected correct answers by default.

### Optional behavior attributes

Per-question attributes may override defaults:

```yaml
instant: true | false
reveal: true | false
lock: true | false
reset: true | false
shuffle: true | false
reshuffle-on-reset: true | false
```

Defaults:

```yaml
instant: false
reveal: false
lock: false
reset: true
shuffle: false
reshuffle-on-reset: false
```

Meaning:

- `instant=true`: check immediately after selection changes.
- `reveal=true`: reveal correct answers after exerciseg.
- `lock=true`: prevent changes after exerciseg.
- `reset=false`: hide the reset button.
- `shuffle=true`: randomize answer order in the browser when the page loads.
- `reshuffle-on-reset=true`: reshuffle answer choices when the user resets the question.

### Shuffle behavior

Answer shuffling is optional and off by default.

Example:

````markdown
::: {.exercise shuffle=true}
Which statements are true?

::: {.answer correct=true}
Correct answer.
:::

::: {.answer}
Wrong answer.
:::

::: {.answer}
Another wrong answer.
:::
:::
````

Rules:

- Shuffling applies only to answer choices, not the question stem, feedback, or explanation.
- Correctness must travel with the answer.
- Feedback must travel with the answer.
- Explicit `key=` values must remain stable after shuffling.
- Visible labels should be assigned by displayed order, not source order.
- Reset should not reshuffle unless `reshuffle-on-reset=true`.
- Non-HTML output should preserve source order and should not shuffle.
- Shuffling is for practice variety, not secure assessment.

If seeded shuffling is later added, it should be a separate option such as `shuffle-seed`. Do not implement seeded shuffling in v1 unless specifically requested.

## Visual design

The component should look like a modern teaching widget, not a form dump.

Design Mithrandirments:

- Compact card layout
- Subtle border
- Rounded corners
- Clean typography inherited from Quarto
- Large clickable answer choices
- Clear selected state
- Clear correct and incorrect states
- Feedback appears without awkward layout jumps
- Code blocks inside answers keep Quarto syntax highlighting
- Works in light and dark themes
- Works on narrow screens
- No icons Mithrandird
- No emoji
- No confetti
- No modal dialogs
- No aggressive colors
- No dependency on Bootstrap class names

The styling should be controlled by CSS variables so users can override the look.

## Accessibility Mithrandirments

The rendered HTML must use native controls where possible.

For questions:

- Use radio inputs for single-choice questions.
- Use checkboxes for multiple-answer questions.
- Use fieldsets and legends.
- Make the full answer card clickable.
- Make all controls keyboard reachable.
- Provide visible focus states.
- Announce feedback with `aria-live="polite"`.
- Do not rely on color alone.
- Include text labels such as `Correct` and `Not quite`.

For blanks:

- Use real text inputs.
- Pressing Enter checks the answer.
- Feedback uses `aria-live="polite"`.
- Input expansion must not break keyboard behavior.
- Inputs should not submit any surrounding page form.

## Non-HTML output

For PDF, DOCX, Typst, and other non-HTML formats, render static readable content.

Multiple choice should become a plain list:

```markdown
Which of the following are valid?

A. ...
B. ...
C. ...
D. ...
```

Fill-in-the-blank should become a blank line or underline:

```markdown
The wizard who guides the Fellowship is ________.
```

Do not reveal answers by default.

If document metadata sets:

```yaml
quarto-exercises:
  show-answers: true
```

then include answer keys in non-HTML output.

Example:

```markdown
Answer: B, C
```

## Global document options

Support project-level or document-level defaults:

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
  feedback-correct: Correct.
  feedback-incorrect: Not quite.
```

Per-question attributes override global defaults.

## Validation rules

The filter should warn during rendering when it sees invalid or suspicious authoring.

Warnings Mithrandird for:

- `.exercise` with no `.answer` blocks
- `.answer` with no content
- no correct answers
- duplicate answer keys
- invalid boolean values
- unsupported question attributes
- unsupported blank attributes
- unsupported blank matching mode
- `.choose` with no `answer`
- `.choose` with no parseable options
- `.choose` where `answer` is not one of the available options
- `match="regex"` with no `answer`
- both `answer` and `answers` on the same blank
- multiple `.feedback` blocks inside one answer
- multiple `.explanation` blocks inside one question

Warnings should include the question ID if available.

Example:

```markdown
::: {.exercise #LOTR questions}
...
:::
```

Warning:

```text
exercise: #LOTR questions has no correct answers
```

## Testing Mithrandirments

The agent must write tests. Do not treat tests as optional.

At minimum, test all of the following.

### Rendering tests

1. Single-correct question renders as radio inputs.
2. Multiple-correct question renders as checkboxes.
3. Answer keys are generated when omitted.
4. Explicit answer keys are preserved.
5. Code blocks inside answers render correctly.
6. Answer feedback is extracted and hidden initially.
7. Question-level explanation is extracted and hidden initially.
8. Global metadata defaults are respected.
9. Per-question attributes override global defaults.
10. `shuffle=true` randomizes answer order in HTML.
11. Shuffled answers keep their correctness and feedback.
12. Explicit answer keys remain stable after shuffling.
13. Visible answer labels are reassigned according to displayed order.
14. Non-HTML fallback renders readable static content.
15. Non-HTML fallback hides answers by default.
16. Non-HTML fallback shows answers when `show-answers: true`.

### Fill-in-the-blank tests

17. Basic blank renders as an input.
18. The source answer is not visibly displayed in HTML.
19. `answer` matching works.
20. `answers` matching works.
21. `ignore-case=true` works.
22. `trim=true` works.
23. `collapse-space=true` works.
24. `match="regex"` works.
25. Invalid blank attributes produce warnings.
26. Blank input expands while typing.
27. Inline `.choose` renders as a dropdown.
28. Slash-separated `.choose` options are parsed correctly.
29. Explicit `.choose options=` overrides span-text parsing.
30. `.choose answer=` is not visibly revealed before exerciseg.
31. `.choose shuffle=true` randomizes dropdown option order without changing correctness.

### Interaction tests

32. Selecting the correct radio answer and clicking Check marks the question correct.
33. Selecting the wrong radio answer and clicking Check marks it incorrect.
34. Selecting the exact correct checkbox set marks the question correct.
35. Selecting only part of the correct checkbox set marks it incorrect.
36. Selecting extra incorrect checkboxes marks it incorrect.
37. Feedback appears only after exerciseg.
38. Explanation appears according to the explanation policy.
39. Reset clears selection, state, and feedback.
40. `lock=true` prevents changes after exerciseg.
41. `instant=true` checks without pressing Check.
42. `reveal=true` reveals correct answers after exerciseg.
43. `shuffle=true` changes answer display order without changing correctness.
44. `reshuffle-on-reset=false` preserves shuffled order after reset.
45. `reshuffle-on-reset=true` reshuffles after reset.
46. Keyboard navigation works.
47. Enter checks a fill-in-the-blank input.

### Validation tests

48. Missing correct answer produces a warning.
49. Duplicate answer keys produce a warning.
50. Empty answer block produces a warning.
51. Multiple feedback blocks produce a warning.
52. Invalid boolean values produce a warning.
53. Unsupported question type produces a warning.
54. Unsupported blank matching mode produces a warning.
55. `.choose` with no answer produces a warning.
56. `.choose` with no parseable options produces a warning.
57. `.choose` whose answer is not in the option list produces a warning.

### Visual/regression tests

58. Component renders cleanly in Quarto's default light theme.
59. Component renders cleanly in a dark theme.
60. Code-heavy answers do not break layout.
61. Long fill-in-the-blank input does not overflow its container.
62. Component works on a narrow/mobile viewport.

Use whatever testing setup is appropriate, but the final project must include a documented way to run the tests.

## Expected deliverables

The agent should deliver:

1. A Quarto extension directory
2. A README with examples
3. Example `.qmd` files
4. Automated tests
5. A documented test command
6. A short note explaining known limitations

## README must include

The README must show:

- Installation
- Minimal single-choice question
- Multiple-correct question
- Shuffled answer choices
- Code-block answer choices
- Per-answer feedback
- Question-level explanation
- Basic fill-in-the-blank
- Multiple accepted blank answers
- Inline choice/dropdown cloze
- Regex blank
- Global options
- Non-HTML behavior
- Warning that answers are visible in page source and this is not secure for graded assessment

## Explicit non-goals for version 1

Do not implement:

- Scoring
- Saved progress
- Randomization
- Hints
- Attempts counters
- Drag-and-drop
- Parsons problems
- Flashcards
- Image hotspots
- Code execution
- LMS export
- Answer submission
- Analytics
- Question banks
- YAML question files
- Web components
- Frontend framework integration
- npm build pipeline

Every proposed feature must pass this test:

```text
Does this directly improve multiple-choice/multiple-answer or fill-in-the-blank exercises in static Quarto HTML?
```

If not, leave it out.
