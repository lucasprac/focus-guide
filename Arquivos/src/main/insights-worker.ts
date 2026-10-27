/* Worker thread of the main process: runs the insights engine, so a long computation never blocks the command queue,
   the 250 ms timer loop or IPC. It receives a snapshot that the main process read in one step and never opens the database. */
import { parentPort } from 'node:worker_threads';
import { focusInsights } from '../shared/focus-insights';
import { loadStats } from '../shared/insight-stats';

const ready = loadStats();
parentPort!.on('message', async ({ id, data, activity, options }) => {
  try { await ready; parentPort!.postMessage({ id, ok: true, value: focusInsights(data, activity, options) }); }
  catch (error) { parentPort!.postMessage({ id, ok: false, error: error instanceof Error ? error.message : 'The insights could not be computed.' }); }
});
