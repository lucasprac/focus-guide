import { net } from 'electron';
import type { JevRequest } from './jev-questions';
import { t } from '../shared/i18n';

/* The only outbound network call of Focus Guide: POST https://api.typesafe.ai/v1/systemone, made from the main process
   so the renderer CSP keeps connect-src 'self'. It runs only when the user turns on TypeSafe judgments and starts a check,
   or turns on the window check, which then runs during focus sessions. */
const ENDPOINT = 'https://api.typesafe.ai/v1/systemone';
const RETRIES = 3, TIMEOUT_MS = 30000;
/* Statuses that mean TypeSafe is busy or briefly unavailable (503 comes back when image processing is down for a moment). */
const BUSY = new Set([429, 503, 529]);

export class JevError extends Error { constructor(message: string, readonly status: number | null) { super(message); } }

/* The last requests and answers, so the user can see exactly what left the computer. Runtime only; the API key is never kept here. */
export interface JevLogEntry { at: string; questionSet: string; request: JevRequest; answers?: unknown; inputTokens?: number; error?: string }
const log: JevLogEntry[] = [];
export function jevLog(): JevLogEntry[] { return structuredClone(log); }
function remember(entry: JevLogEntry): void { log.unshift(entry); log.length = Math.min(log.length, 20); }

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
/* The log keeps the size of an image, not the image: a window capture stays in memory only for its request. */
function logged(request: JevRequest): JevRequest {
  if (!request.assets) return request;
  return { ...request, assets: Object.fromEntries(Object.entries(request.assets).map(([ref, asset]) => [ref, { ...asset, data_base64: t('[{format} image, {size} KB, not kept]', { format: asset.format, size: Math.round(asset.data_base64.length * 3 / 4 / 1024) }) }])) };
}

/* Returns the answers object and the billed input tokens. Status 429, 503 and 529 are retried with exponential backoff; every failure is an error.
   A request with an image needs the images header (TypeSafe marks images as not yet production-ready). */
export async function askJev(key: string, questionSet: string, request: JevRequest): Promise<{ answers: Record<string, unknown>; inputTokens: number | null }> {
  const entry: JevLogEntry = { at: new Date().toISOString(), questionSet, request: logged(request) };
  const headers: Record<string, string> = { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...(request.assets ? { 'TypeSafe-Danger-Zone-Images': 'true' } : {}) };
  remember(entry);
  try {
    for (let attempt = 0; ; attempt++) {
      let response: Response;
      try {
        response = await net.fetch(ENDPOINT, { method: 'POST', headers, body: JSON.stringify(request), signal: AbortSignal.timeout(TIMEOUT_MS) });
      } catch { throw new JevError(t('Focus Guide could not reach TypeSafe. Check the internet connection.'), null); }
      if (BUSY.has(response.status) && attempt < RETRIES - 1) { await wait(1000 * 2 ** attempt); continue; }
      if (response.status === 401) throw new JevError(t('TypeSafe rejected the API key. Enter a new key in Settings.'), 401);
      if (BUSY.has(response.status)) throw new JevError(t('TypeSafe is busy. Try again in a few minutes.'), response.status);
      if (!response.ok) throw new JevError(t('TypeSafe rejected the request (status {status}).', { status: response.status }), response.status);
      const body = await response.json() as { answers?: unknown; usage?: { input_tokens?: unknown } };
      if (!body.answers || typeof body.answers !== 'object') throw new JevError(t('TypeSafe returned an answer that Focus Guide cannot read.'), response.status);
      const inputTokens = typeof body.usage?.input_tokens === 'number' && Number.isSafeInteger(body.usage.input_tokens) ? body.usage.input_tokens : null;
      entry.answers = body.answers; if (inputTokens !== null) entry.inputTokens = inputTokens;
      return { answers: body.answers as Record<string, unknown>, inputTokens };
    }
  } catch (error) { entry.error = error instanceof Error ? error.message : String(error); throw error; }
}
