import { config } from 'dotenv';
import { resolve } from 'node:path';

let hasInitialised = false;

export function initialiseEnv(): void {
  if (hasInitialised) {
    return;
  }

  config({ path: resolve(process.cwd(), '.env') });
  hasInitialised = true;
}
