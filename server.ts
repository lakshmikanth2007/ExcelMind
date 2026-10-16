import { spawn } from 'node:child_process';
import process from 'node:process';

// Check if TSX loader is already preloaded via --import tsx or running via tsx CLI
const isTsxPreloaded =
  process.execArgv.some((arg) => arg.includes('tsx')) ||
  process.env.__TSX_BOOTSTRAPPED__ === '1';

if (!isTsxPreloaded) {
  // When executed directly with `node server.ts`, spawn node with `--import tsx`
  // so that TypeScript modules and extensionless imports resolve seamlessly
  process.env.__TSX_BOOTSTRAPPED__ = '1';
  const child = spawn(process.execPath, ['--import', 'tsx', ...process.argv.slice(1)], {
    stdio: 'inherit',
    env: process.env,
  });

  child.on('exit', (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
    } else {
      process.exit(code ?? 0);
    }
  });
} else {
  // TSX loader active: import and start fullstack application
  await import('./server/app.ts');
}
