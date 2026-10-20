/** Keep user interaction outside the serialized mutation queue. */
export class CommandQueue {
  private tail: Promise<unknown> = Promise.resolve();
  run<T>(action: () => T | Promise<T>): Promise<T> {
    const result = this.tail.then(action);
    this.tail = result.catch(() => {});
    return result;
  }
  async prepared<T, R>(prepare: () => Promise<T>, commit: (value: T) => R | Promise<R>): Promise<R> {
    const value = await prepare();
    return this.run(() => commit(value));
  }
  idle(): Promise<unknown> { return this.tail; }
}

/** One owner drains, persists and closes a collection span before a mutation. */
export class TransitionCoordinator {
  busy = false;
  needsRecovery = false;
  constructor(private timer: { checkpoint(): void }, private collector: { stop(): Promise<void>; flush(final?: boolean): void; reconcile(): void }) {}
  async run<T>(commit: () => T | Promise<T>): Promise<T> {
    this.busy = true;
    this.needsRecovery = true;
    let finalized = false;
    try {
      await this.collector.stop();
      this.timer.checkpoint();
      this.collector.flush(true);
      finalized = true;
      this.needsRecovery = false;
      return await commit();
    } finally {
      this.busy = false;
      if (finalized) this.collector.reconcile();
    }
  }
}
