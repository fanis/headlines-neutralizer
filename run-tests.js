// Quick test runner to see results
import { execSync } from 'child_process';

try {
  const output = execSync('npm test', {
    encoding: 'utf-8',
    stdio: 'pipe',
    cwd: process.cwd()
  });
  console.log(output);
} catch (error) {
  console.log(error.stdout);
  console.log(error.stderr);
  process.exit(error.status);
}
