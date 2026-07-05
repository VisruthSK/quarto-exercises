## Proposal: add `.code-cloze`

Add a `.code-cloze` fenced-code feature for interactive blanks and dropdowns inside code blocks.

The feature must preserve Quarto/Pandoc syntax highlighting. Do not add custom highlighting. Do not use Prism, Highlight.js, Shiki, CodeMirror, Monaco, or any browser-side highlighter. The code is never executed.

### Authoring syntax

````markdown
::: {.exercise}
Fill in the missing pieces.

```{.code-cloze lang="r"}
rings <- list("Narya", "Nenya", "Vilya")

for(i in {{blank answer="seq_along(rings)"}}) {
  print(rings[[{{blank answer="i"}}]])
}
```
:::
````

Dropdowns inside code should also work:

````markdown
```{.code-cloze lang="r"}
bearer <- {{choose answer="Frodo" options="Frodo,Sam,Bilbo"}}
```
````

### Required behavior

- Render as a normal highlighted code block.
- Preserve whitespace, indentation, line breaks, and syntax highlighting.
- Replace `{{blank ...}}` with inline text inputs.
- Replace `{{choose ...}}` with inline dropdowns.
- Inputs inside code expand as typed.
- Parent `.exercise` Check checks all embedded code controls.
- Parent `.exercise` Reset resets all embedded code controls.
- Standalone `.code-cloze` gets its own Check and Reset controls.
- Non-HTML output renders controls as underscores inside the code block.
- If answer keys are enabled for non-HTML output, list the answers after the block.

### Implementation constraint

Use a placeholder-based approach:

1. Parse `{{blank ...}}` and `{{choose ...}}` inside `.code-cloze`.
2. Replace each control with a stable placeholder token, such as `QEXCLOZE000001`.
3. Emit a normal Pandoc `CodeBlock` containing the placeholder-token code.
4. Store placeholder metadata beside the block.
5. Let Quarto/Pandoc do normal syntax highlighting.
6. In browser JS, replace placeholder text nodes inside the highlighted code with the real inputs/dropdowns.

Placeholder tokens must be long ASCII alphanumeric strings. Avoid punctuation, braces, underscores, quotes, and angle brackets. Check for collisions with user code and regenerate if needed.

### Required tests

- `.code-cloze` renders as a highlighted code block.
- Placeholder tokens are not visible after JS initialization.
- Blank controls inside code check correctly.
- Dropdown controls inside code check correctly.
- Multiple controls in one code block work.
- Parent `.exercise` Check and Reset control embedded code controls.
- Indentation and line breaks survive rendering.
- Syntax highlighting survives rendering.
- Malformed `{{...}}` syntax warns.
- Missing blank answer warns.
- Missing dropdown answer/options warn.
- Non-HTML fallback replaces controls with underscores.
