import { spawnSync } from 'node:child_process';

const result = spawnSync('quarto', ['render', 'example.qmd', 'full-page-check.qmd', '--output-dir', '_site'], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: { ...process.env, QUARTO_EXERCISES_KEY: 'playwright-test-key-not-secret' }
});

process.exit(result.status ?? 1);
