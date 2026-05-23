import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

export const BIN_DIR = dirname(fileURLToPath(import.meta.url));
export const PKG_ROOT = resolve(BIN_DIR, '..');

export function projectDir(env = process.env, cwd = process.cwd()) {
  return env.SOFTWARE_CONTRACT_FORGE_PROJECT || env.INIT_CWD || cwd;
}
