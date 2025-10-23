/**
 * A lightweight, generic batching utility.
 * Collects items of any type and provides access to the current batch.
 */
export class Batcher<T> {
  private items: T[] = [];
  private handler?: (batch: T[]) => void;
  private timer?: NodeJS.Timeout;
  private readonly flushIntervalMs: number = 500; // default 500ms

  /** Adds a single item to the batch */
  add(item: T): void {
    this.items.push(item);
  }

  /** Add multiple items at once to the batch */
  addMany(items: T[]): void {
    this.items.push(...items);
  }

  /** Returns all items currently in the batch */
  getBatch(): T[] {
    return [...this.items];
  }

  /** Registers a handler function to process the batch on flush */
  registerHandler(handler: (batch: T[]) => void): void {
    this.handler = handler;

    // Start auto-flush timer when handler is registered
    this.startAutoFlush();
  }

  /** Manually triggers the handler with the current batch */
  flush(): void {
    if (!this.handler) {
      console.warn('[Batcher] flush() called with no handler registered');
      return;
    }

    const currentBatch = this.getBatch();
    this.invokeHandler(currentBatch);
    this.clear();
  }

  /** Encapsulated handler invocation to centralize error handling */
  private invokeHandler(batch: T[]): void {
    this.handler?.(batch);
  }

  /** Starts the interval to automatically flush batches */
  private startAutoFlush(): void {
    if (this.timer) return; // already started

    this.timer = setInterval(() => this.flush(), this.flushIntervalMs);
  }

  /** Stops the automatic flush timer */
  stopAutoFlush(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  /** Clears all items from the batch */
  clear(): void {
    this.items = [];
  }
}
