# Agent instructions: revise PR #14 answer obfuscation and checking workflow

## Goal

Revise PR #14 so the extension keeps answer obfuscation enabled by default, works with only a standard Quarto installation, and does not expose answers through obvious HTML attributes, global JavaScript variables, or simple console inspection.

The target author workflow is:

```bash
quarto render lesson.qmd
```

That must work after installing only Quarto and this extension. No Node, npm, Python, R, LuaRocks, OpenSSL CLI, or extra setup.

## Hard requirements

1. Remove the `QUARTO_EXERCISES_KEY` workflow entirely.
   - No environment variable requirement.
   - No fallback behavior that still checks for `QUARTO_EXERCISES_KEY`.
   - No docs telling users to set it.
   - No GitHub Actions docs that require it.
   - No backward-compatibility shim for it.

2. Remove the Node render-time dependency.
   - Delete the `pandoc.pipe("node", ...)` path.
   - Delete or stop using `crypto-helper.mjs`.
   - Rendering must not call any external binary.
   - Rendering must work with Quarto plus the extension files only.

3. Keep answer obfuscation enabled by default.
   - The default rendered HTML must not contain plaintext correct-answer metadata.
   - A user should not need to set `obfuscate-answers: true`; that should remain the default.
   - If there is an `obfuscate-answers: false` escape hatch, it can remain, but it is allowed to be a debugging option only.

4. Do not preserve backward compatibility for the current key/encryption design.
   - Remove the current key-based API rather than deprecating it.
   - Keep the public authoring syntax for exercises where possible.
   - Do not keep compatibility with old encrypted payload attributes if that makes the code uglier.

5. Make the client-side answer metadata annoying to reverse engineer.
   - No `data-correct="true"` or equivalent.
   - No plaintext answer list in HTML.
   - No global `window.quartoExercisesKey`.
   - No global answer map.
   - No decrypted answer object stored in DOM nodes, datasets, or long-lived JS state.
   - Console inspection of an exercise element should not directly reveal which option is correct.

6. Be honest in the docs.
   - This is obfuscation, not secure grading.
   - A determined student can still reverse engineer client-side checking.
   - The goal is to prevent casual view-source or quick console inspection from showing answers.

## Recommended implementation

Replace decryptable payloads with salted one-way digests.

The browser does not need to decrypt correct answers. It only needs to decide whether the submitted value matches the expected value. So do not store encrypted answer payloads that later get decrypted in JavaScript. Store salted digests instead.

### Render-time behavior in Lua

For each exercise, generate random-looking opaque IDs and salts at render time.

For multiple-choice answers:

- Assign every option an opaque generated option ID, for example `opt_...`.
- Store that opaque ID on the option input, not the answer text and not a correctness flag.
- Compute a digest for each correct option using a bundled Lua hash implementation.
- Store the set of correct digests on the exercise or controller element.
- Do not store which option generated which correct digest.

Example shape:

```html
<div class="exercise" data-qx-kind="mcq" data-qx-salt="..." data-qx-correct="digest1 digest2">
  <input type="radio" name="..." value="opt_c859...">
  <label>Bilbo</label>
  <input type="radio" name="..." value="opt_17de...">
  <label>Frodo</label>
</div>
```

The option IDs must not be sequential. Do not use `1`, `2`, `3`, or `answer-a`, `answer-b`, etc.

For blanks and dropdowns:

- Canonicalize the expected answer during render.
- Store salted digests of acceptable canonical answers.
- Do not store the accepted answer strings in HTML.
- Store per-question salts.

Canonicalization should match existing behavior: trim whitespace, normalize case when the exercise is configured as case-insensitive, and apply any existing accepted-answer rules.

### Runtime behavior in JavaScript

At check time:

- Read the learner-selected option IDs or learner-entered text.
- Canonicalize learner input the same way Lua canonicalized expected answers.
- Compute the same salted digest in the browser.
- Compare submitted digests against the stored expected digest set.

Do not expose digest helpers or answer state globally. Keep helper functions inside a closure/module. Do not attach answer maps, correct IDs, decrypted payloads, or debug objects to `window`.

A determined student can still read the JS source and reproduce the digest process. That is acceptable. The requirement is that they cannot immediately inspect the DOM or a global JS object and see answers.

## Dependency strategy

Use vendored dependencies only.

Acceptable:

```text
_extensions/quarto-exercises/
  quarto-exercises.lua
  quarto-exercises.js
  quarto-exercises.css
  vendor/
    sha256.lua
    base64.lua
    sha256.js
```

Not acceptable:

```lua
pandoc.pipe("node", ...)
require("openssl")
require("sha2")
```

unless the required module is physically bundled in the extension and loaded by relative path.

Do not use CDN scripts. Do not use npm packages that the user must install. Do not use LuaRocks packages that the user must install.

Prefer a small vendored SHA-256 implementation over hand-written crypto. This extension does not need AES-GCM. It needs one-way answer checks that hide plaintext expected answers.

## Checking workflow

Keep the clean checking model from PR #14:

```yaml
quarto-exercises:
  check-mode: page
  reveal: false
```

This should produce one page-level check button and should not reveal unselected correct MCQ answers after checking.

Also keep batch checking:

```markdown
::: {.check-batch}
::: {.exercise}
...
:::

::: {.exercise}
...
:::
:::
```

Batch checking and page checking should not require wrapping the whole page in one `.exercise`. Per-question `.exercise` options such as `shuffle`, `points`, `reveal`, and feedback should continue to work.

## Answer reveal behavior

Default behavior should mimic Canvas-style practice:

- If a learner selects the correct option, mark that selected option correct.
- If a learner selects the wrong option, mark that selected option incorrect.
- Do not highlight the unselected correct option when `reveal: false`.
- Do not fill in or show correct blank/dropdown answers when `reveal: false`.
- Feedback may be shown for the selected answer if that is already supported.

Make sure the docs distinguish these options clearly:

- `reveal`: controls whether checking reveals correct answers in interactive HTML.
- `show-answers`: controls static answer-key rendering for non-HTML or instructor output, if still supported.

Do not use `show-answers` as the HTML check-reveal control.

## Files to change

Expected changes:

- `_extensions/quarto-exercises/quarto-exercises.lua`
  - Remove Node pipe call.
  - Remove env-key logic.
  - Add digest generation using vendored Lua dependency.
  - Emit only opaque option IDs, salts, and digests.

- `_extensions/quarto-exercises/quarto-exercises.js`
  - Remove decryption code.
  - Remove global key usage.
  - Add browser-side digest comparison.
  - Keep answer-check helpers private.

- `_extensions/quarto-exercises/crypto-helper.mjs`
  - Delete it, or leave it unused only temporarily during refactor.
  - It should not ship as an active dependency.

- `_extensions/quarto-exercises/vendor/*`
  - Add vendored Lua hash/base64 dependencies.
  - Add browser-side hash helper if not using built-in browser APIs.

- `README.md`
  - Remove all `QUARTO_EXERCISES_KEY` instructions.
  - Remove Node setup instructions.
  - Document default obfuscation as zero-setup.
  - Add the client-side-security warning.

- Examples
  - Update examples so the recommended Canvas-like setup is clear.
  - Include a page-level checking example.
  - Include a batch-checking example.

## Acceptance tests

Add or manually verify these cases.

### 1. Clean local render

On a machine with Quarto installed and no Node on `PATH`:

```bash
quarto render examples/chapter-3a.qmd --to html
```

Expected:

- Render succeeds.
- No Node error.
- No missing `QUARTO_EXERCISES_KEY` error.
- HTML output contains no plaintext correct-answer metadata.

### 2. Single MCQ page

A page with exactly one MCQ-only `.exercise` should work.

Expected:

- Check button works.
- Correct selected answer is marked correct.
- Wrong selected answer is marked incorrect.
- No unselected correct option is highlighted when `reveal: false`.
- No global key or answer object appears in the console.

### 3. Page-level checking

With:

```yaml
quarto-exercises:
  check-mode: page
  reveal: false
```

Expected:

- Individual exercise check buttons are not rendered.
- One page-level check button is rendered.
- Per-question `shuffle` still works.
- Per-question feedback still works.
- Per-question scoring still works if scoring is enabled.

### 4. Batch checking

With a `.check-batch` wrapper:

Expected:

- One batch check button is rendered for the batch.
- Exercises outside the batch keep their configured behavior.
- Nested `.exercise` options still apply.

### 5. Source inspection

Inspect rendered HTML source.

Expected absent strings/patterns:

```text
data-correct="true"
data-answer="Frodo"
correctAnswers
quartoExercisesKey
QUARTO_EXERCISES_KEY
```

Expected present metadata is only opaque IDs, salts, and digests.

### 6. Console inspection

In the browser console, inspect:

```js
document.querySelector('.exercise')
window
```

Expected:

- No obvious correct-answer flag.
- No global key.
- No global answer map.
- No decrypted answer payload.

It is acceptable if a determined person can reverse engineer the check logic from the bundled JS. That is not the threat model.

## Documentation language to use

Use direct language like this:

```markdown
Answer obfuscation is enabled by default and requires no setup beyond Quarto and this extension. The rendered HTML stores opaque IDs, salts, and digests instead of plaintext correct answers.

This is not secure grading. Because checking happens in the browser, a determined student can reverse engineer the checking logic. The feature is intended to prevent casual answer scraping through view-source, HTML attributes, or obvious console inspection.
```

## Documentation language to avoid

Avoid claims like:

```markdown
Answers are secure.
Students cannot access answers.
Encrypted answers prevent cheating.
This protects graded assessments.
```

Those claims are false for client-side checking.

## Final expected outcome

After the refactor, the extension should have this behavior:

- Authors install Quarto and the extension.
- Authors render normally with `quarto render`.
- Obfuscation is on by default.
- No external runtime is needed.
- No environment secret is needed.
- Correct answers are not visible as plaintext in HTML.
- Correct answers are not exposed through a simple global JS object.
- Page-level and batch-level checking still work.
- Docs clearly state that this is obfuscation, not secure grading.
