import { existsSync } from 'node:fs';
import { join } from 'node:path';

// For the command-line scripts, which run outside Nest: read .env if there is
// one. Variables already set in the environment win.
export function loadEnvFile(): void {
  const file = join(process.cwd(), '.env');
  if (existsSync(file)) {
    process.loadEnvFile(file);
  }
}
