import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

function run(args) {
  const result = spawnSync('quarto', args, {
    cwd: root,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if ((result.status ?? 1) !== 0) process.exit(result.status ?? 1);
}

// Root-level documents → _site/
run(['render', 'example.qmd', 'full-page-check.qmd', '--output-dir', '_site']);

// The fixture owns its filter path and renders beside itself. It is excluded
// from the website project, so test-only content never reaches _site/.
run(['render', 'tests/e2e/fixtures.qmd']);
