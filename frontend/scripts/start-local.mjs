import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const next = require.resolve('next/dist/bin/next');
const options = {
  env: { ...process.env, EXAMFORGE_LOCAL_RUN: '1' },
  stdio: 'inherit',
};

for (const args of [['build', '--webpack'], ['start', '--hostname', 'localhost']]) {
  const result = spawnSync(process.execPath, [next, ...args], options);
  if (result.error) console.error(result.error.message);
  if (result.status !== 0) {
    process.exitCode = result.status ?? (result.signal === 'SIGINT' ? 130 : 1);
    break;
  }
}
