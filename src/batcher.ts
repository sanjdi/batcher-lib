/**
 * A lightweight, generic batching utility.
 * Collects items of any type and provides access to the current batch.
 */
export class Batcher<T> {
  private items: T[] = [];

  /** Adds a single item to the batch */
  add(item: T): void {
    this.items.push(item);
  }

  /** Returns all items currently in the batch */
  getBatch(): T[] {
    return [...this.items];
  }
}
