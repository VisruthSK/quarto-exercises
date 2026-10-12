# Changelog

## 0.2.0

- reveal.js output is interactive. Exercises were previously dropped from slides.
- Check, Reset, and Hint buttons use the Quarto theme: Bootstrap button classes in HTML, and the reveal.js theme colors in slides.
- Answers are stored as salted SHA-1 digests. Re-render existing documents to pick up the new format.
- `ignore-case` folds non-ASCII letters at build time, using the JavaScript engine bundled with Quarto.
- Invalid regular expressions fail the build. Without `QUARTO_DENO`, the build warns instead.
- Breaking: the `--ex-button-*` and `--ex-control-primary-*` variables are removed.
- Breaking: the `data-qx-*` and `data-cloze-metadata` attributes are removed.
- Requires Quarto 1.10 or newer. Only 1.10.18 has been tested.
