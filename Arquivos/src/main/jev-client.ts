import { net } from 'electron';
import type { JevRequest } from './jev-questions';
import { t } from '../shared/i18n';

/* The only outbound network call of Focus Guide: POST https://api.typesafe.ai/v1/systemone, made from the main process
   so the renderer CSP keeps connect-src 'self'. It runs only when the user turns on TypeSafe judgments and starts a check. */
const ENDPOINT = 'https://api.typesafe.ai/v1/systemone';
const RETRIES = 3, TIMEOUT_MS = 30000;

export class JevError extends Error { constructor(message: string, readonly status: number | null) { super(message); } }

/* The last requests and answers, so the user can see exactly what left the computer. Runtime only; the API key is never kept here. */
export interface JevLogEntry { at: string; questionSet: string; request: JevRequest; answers?: unknown; error?: string }
const log: JevLogEntry[] = [];
export function jevLog(): JevLogEntry[] { return structuredClone(log); }
function remember(entry: JevLogEntry): void { log.unshift(entry); log.length = Math.min(log.length, 20); }

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/* Returns the answers object. Status 429 and 529 are retried with exponential backoff; every failure is an error. */
export async function askJev(key: string, questionSet: string, request: JevRequest): Promise<Record<string, unknown>> {
  const entry: JevLogEntry = { at: new Date().toISOString(), questionSet, request };
  remember(entry);
  try {
    for (let attempt = 0; ; attempt++) {
      let response: Response;
      try {
        response = await net.fetch(ENDPOINT, { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify(request), signal: AbortSignal.timeout(TIMEOUT_MS) });
      } catch { throw new JevError(t('Focus Guide could not reach TypeSafe. Check the internet connection.'), null); }
      if ((response.status === 429 || response.status === 529) && attempt < RETRIES - 1) { await wait(1000 * 2 ** attempt); continue; }
      if (response.status === 401) throw new JevError(t('TypeSafe rejected the API key. Enter a new key in Settings.'), 401);
      if (response.status === 429 || response.status === 529) throw new JevError(t('TypeSafe is busy. Try again in a few minutes.'), response.status);
      if (!response.ok) throw new JevError(t('TypeSafe rejected the request (status {status}).', { status: response.status }), response.status);
      const body = await response.json() as { answers?: unknown };
      if (!body.answers || typeof body.answers !== 'object') throw new JevError(t('TypeSafe returned an answer that Focus Guide cannot read.'), response.status);
      entry.answers = body.answers;
      return body.answers as Record<string, unknown>;
    }
  } catch (error) { entry.error = error instanceof Error ? error.message : String(error); throw error; }
}
