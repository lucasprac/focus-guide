/// <reference types="electron-vite/node" />
import type { Worker } from 'node:worker_threads';
import createWorker from './insights-worker?nodeWorker';
import type { ActivitySample, Dataset } from '../shared/types';
import type { InsightOptions } from '../shared/focus-insights';

type Pending = { resolve: (value: unknown) => void; reject: (error: Error) => void };
/** Runs insights.read computations on one worker thread, started on first use. A crashed worker fails its pending requests and is replaced on the next one. */
export class InsightsWorker {
  private worker: Worker | null = null;
  private pending = new Map<number, Pending>();
  private next = 0;
  compute(data: Dataset, activity: ActivitySample[], options: InsightOptions): Promise<unknown> {
    const worker = this.worker ?? this.start(), id = this.next++;
    return new Promise((resolve, reject) => { this.pending.set(id, { resolve, reject }); worker.postMessage({ id, data, activity, options }); });
  }
  stop(): void { const worker = this.worker; this.worker = null; this.fail(new Error('Focus Guide is closing.')); void worker?.terminate(); }
  private start(): Worker {
    const worker = createWorker({});
    worker.on('message', ({ id, ok, value, error }: { id: number; ok: boolean; value?: unknown; error?: string }) => {
      const request = this.pending.get(id); if (!request) return;
      this.pending.delete(id); if (ok) request.resolve(value); else request.reject(new Error(error));
    });
    const lost = (error: Error) => { if (this.worker !== worker) return; this.worker = null; this.fail(error); };
    worker.on('error', lost);
    worker.on('exit', code => lost(new Error(`The insights engine stopped (code ${code}). Try again.`)));
    worker.unref();
    return this.worker = worker;
  }
  private fail(error: Error): void { const requests = [...this.pending.values()]; this.pending.clear(); for (const request of requests) request.reject(error); }
}
