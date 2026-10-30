import { safeStorage } from 'electron';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { atomicWrite } from './backup';
import { askJev, JevError } from './jev-client';
import { REFLECTION_QUESTION_SET, readReflection, reflectionRequest } from './jev-questions';
import { decideDetractor, type JevReflectionGap, type ReflectionText } from '../shared/jev-decisions';
import { t } from '../shared/i18n';

/* The TypeSafe API key is the only stored credential. It is encrypted with Windows (safeStorage) in its own file in the
   data folder, and never reaches settings, datasets, backups, the renderer or the request log. */
const keyFile = (directory: string) => join(directory, 'typesafe-key.bin');
export function jevKeyStored(directory: string): boolean { return existsSync(keyFile(directory)); }
export function saveJevKey(directory: string, key: string): void {
  if (!safeStorage.isEncryptionAvailable()) throw new Error(t('Windows cannot encrypt the API key on this computer, so it was not saved.'));
  atomicWrite(keyFile(directory), safeStorage.encryptString(key).toString('base64'));
}
export function clearJevKey(directory: string): void { rmSync(keyFile(directory), { force: true }); }
function readJevKey(directory: string): string {
  if (!jevKeyStored(directory)) throw new Error(t('Save a TypeSafe API key in Settings first.'));
  return safeStorage.decryptString(Buffer.from(readFileSync(keyFile(directory), 'utf8'), 'base64'));
}

export type ReflectionCandidate = Omit<JevReflectionGap, 'status'> & { text: ReflectionText };

/* One request per session: sessions do not share state, and text from one session must not sway the answers for another.
   A rejected key stops the scan; any other failure is reported on that session only. */
export async function scanReflectionGaps(directory: string, candidates: ReflectionCandidate[]): Promise<JevReflectionGap[]> {
  if (!candidates.length) return [];
  const key = readJevKey(directory), results: JevReflectionGap[] = new Array(candidates.length);
  let next = 0, stopped = false;
  const worker = async () => {
    while (!stopped && next < candidates.length) {
      const index = next++, { text, ...gap } = candidates[index];
      try { results[index] = { ...gap, ...decideDetractor(readReflection(await askJev(key, REFLECTION_QUESTION_SET, reflectionRequest(text)))) }; }
      catch (error) {
        if (error instanceof JevError && error.status === 401) { stopped = true; throw error; }
        results[index] = { ...gap, status: 'error', error: error instanceof Error ? error.message : String(error) };
      }
    }
  };
  await Promise.all([worker(), worker(), worker()]);
  return results;
}
